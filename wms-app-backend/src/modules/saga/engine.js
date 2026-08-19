const Saga = require("./model");
const logger = require("../../config/logger");

const TRANSITIONS = {
  RECEIVED: ["ALLOCATED", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  ALLOCATED: ["940_GENERATED", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  "940_GENERATED": ["SENT_TO_3PL", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  SENT_TO_3PL: ["ACCEPTED", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  ACCEPTED: ["945_RECEIVED", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  "945_RECEIVED": ["FULFILLED", "ON_HOLD", "EXCEPTION", "CANCELLED"],
  FULFILLED: ["EXCEPTION"],
  ON_HOLD: ["RECEIVED", "ALLOCATED", "EXCEPTION", "CANCELLED"],
  EXCEPTION: ["RECEIVED", "CANCELLED"],
  CANCELLED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

async function create({ orderId, shopId, metadata }) {
  return Saga.create({
    orderId,
    shopId,
    state: "RECEIVED",
    steps: [],
    metadata: metadata || {},
  });
}

async function getByOrderId(orderId) {
  return Saga.findOne({ orderId }).sort({ createdAt: -1 });
}

async function advance(orderId, newState, stepName) {
  const saga = await getByOrderId(orderId);
  if (!saga) {
    logger.warn({ orderId: orderId.toString() }, "No saga found for order");
    return null;
  }

  if (!canTransition(saga.state, newState)) {
    logger.warn(
      { orderId: orderId.toString(), from: saga.state, to: newState },
      "Illegal saga state transition"
    );
    throw new Error(`Illegal transition from ${saga.state} to ${newState}`);
  }

  if (stepName) {
    const existingStep = saga.steps.find((s) => s.name === stepName && s.status === "running");
    if (existingStep) {
      existingStep.status = "completed";
      existingStep.completedAt = new Date();
    }
  }

  saga.state = newState;
  saga.currentStep = stepName || saga.currentStep;
  await saga.save();
  return saga;
}

async function startStep(orderId, stepName) {
  const saga = await getByOrderId(orderId);
  if (!saga) return null;

  saga.steps.push({
    name: stepName,
    status: "running",
    startedAt: new Date(),
  });
  saga.currentStep = stepName;
  await saga.save();
  return saga;
}

async function failStep(orderId, stepName, error) {
  const saga = await getByOrderId(orderId);
  if (!saga) return null;

  const step = saga.steps.find((s) => s.name === stepName && s.status === "running");
  if (step) {
    step.status = "failed";
    step.error = error || "";
    step.completedAt = new Date();
  }

  saga.state = "EXCEPTION";
  await saga.save();
  return saga;
}

async function compensate(orderId, stepName, action) {
  const saga = await getByOrderId(orderId);
  if (!saga) return null;

  const step = saga.steps.find((s) => s.name === stepName);
  if (step) step.status = "compensated";

  saga.compensations.push(action);
  await saga.save();
  return saga;
}

module.exports = {
  create,
  getByOrderId,
  advance,
  startStep,
  failStep,
  compensate,
  canTransition,
};
