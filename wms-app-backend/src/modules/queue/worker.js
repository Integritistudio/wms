const Job = require("./model");
const logger = require("../../config/logger");

let running = false;
let timer = null;

async function processNext(handler) {
  const now = new Date();

  const job = await Job.findOneAndUpdate(
    {
      status: "pending",
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
    },
    {
      $set: { status: "processing", lockedUntil: new Date(Date.now() + 60000) },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true }
  );

  if (!job) return false;

  try {
    await handler(job);
    job.status = "completed";
    job.lockedUntil = null;
    job.lastError = "";
    await job.save();
  } catch (error) {
    logger.error({ err: error, jobId: job._id.toString(), topic: job.topic }, "Job processing failed");
    job.status = job.attempts >= 3 ? "failed" : "pending";
    job.lastError = error.message || String(error);
    job.lockedUntil = job.attempts >= 3 ? null : new Date(Date.now() + job.attempts * 5000);
    await job.save();
  }

  return true;
}

function start(handler, intervalMs = 1000) {
  if (running) return;
  running = true;
  logger.info("Job queue worker started");

  async function tick() {
    if (!running) return;
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

async function enqueue({ groupId, topic, eventId }) {
  return Job.create({ groupId, topic, eventId });
}

module.exports = { start, stop, enqueue, processNext };
