const Job = require("./model");
const logger = require("../../config/logger");
const { isConnected } = require("../../db/connect");
const Lease = require("./leaseModel");
const { randomUUID } = require("crypto");

let running = false;
let timer = null;

async function processNext(handler) {
  const now = new Date();
  const owner = randomUUID();
  // A crashed worker must not strand processing jobs forever.
  await Job.updateMany({ status: "processing", lockedUntil: { $lt: now } }, { $set: { status: "pending", lockOwner: "" } });

  // Groups that already have a processing job — skip to preserve per-order order
  const busyGroups = await Job.distinct("groupId", { status: "processing" });

  const filter = {
    status: "pending",
    $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
  };
  if (busyGroups.length) {
    filter.groupId = { $nin: busyGroups };
  }

  const job = await Job.findOneAndUpdate(
    filter,
    {
      $set: { status: "processing", lockOwner: owner, lockedUntil: new Date(Date.now() + 60000) },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!job) return false;

  // The busy-group query is only an optimization. This atomic lease serializes
  // aggregate writes from different warehouse jobs across worker processes.
  try {
    await Lease.findOneAndUpdate({ _id: job.groupId, lockedUntil: { $lte: now } },
      { $set: { owner, lockedUntil: new Date(Date.now() + 60000) } }, { upsert: true, new: true });
  } catch (error) {
    await Job.updateOne({ _id: job._id, lockOwner: owner }, { $set: { status: "pending", lockedUntil: new Date(Date.now() + 1000), lockOwner: "" }, $inc: { attempts: -1 } });
    if (error.code !== 11000) throw error;
    return false;
  }
  const heartbeat = setInterval(() => {
    const lockedUntil = new Date(Date.now() + 60000);
    Promise.all([
      Lease.updateOne({ _id: job.groupId, owner }, { $set: { lockedUntil } }),
      Job.updateOne({ _id: job._id, lockOwner: owner, status: "processing" }, { $set: { lockedUntil } }),
    ]).catch((error) => logger.error({ err: error }, "Queue heartbeat failed"));
  }, 15000);
  heartbeat.unref();

  try {
    await handler(job);
    await Job.updateOne({ _id: job._id, lockOwner: owner }, { $set: { status: "completed", lockedUntil: null, lastError: "", lockOwner: "" } });
  } catch (error) {
    logger.error({ err: error, jobId: job._id.toString(), topic: job.topic }, "Job processing failed");
    const maxAttempts = String(job.topic).startsWith("inventory") ? 8 : 3;
    const failed = job.attempts >= maxAttempts;
    await Job.updateOne({ _id: job._id, lockOwner: owner }, { $set: {
      status: failed ? "failed" : "pending", lastError: error.message || String(error), lockOwner: "",
      lockedUntil: failed ? null : new Date(Date.now() + Math.min(300000, 5000 * 2 ** (job.attempts - 1))),
    } });
  } finally {
    clearInterval(heartbeat);
    await Lease.deleteOne({ _id: job.groupId, owner });
  }

  return true;
}

function start(handler, intervalMs = 1000) {
  if (running) return;
  running = true;
  logger.info("Job queue worker started");

  async function tick() {
    if (!running) return;
    if (!isConnected()) {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    try {
      const processed = await processNext(handler);
      if (processed) {
        setImmediate(() => tick());
        return;
      }
    } catch (error) {
      logger.error({ err: error }, "Worker tick error");
    }
    timer = setTimeout(tick, intervalMs);
  }

  tick();
}

function stop() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info("Job queue worker stopped");
}

async function enqueue({ groupId, topic, eventId, storeId }) {
  return Job.create({ groupId, topic, eventId, storeId });
}

module.exports = { start, stop, enqueue, processNext };
