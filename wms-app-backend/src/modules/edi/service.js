const crypto = require("crypto");
const EdiMapping = require("./mappingModel");
const EdiDocument = require("./documentModel");
const x12 = require("./x12");
const templateBuilder = require("./templateBuilder");
const files = require("../files");
const logger = require("../../config/logger");
const { httpError } = require("../../utils/httpError");

async function seedGenericMapping() {
  const existing = await EdiMapping.findOne({ key: "generic" });
  if (existing) {
    return existing;
  }

  const mapping = await EdiMapping.create({
    key: "generic",
    name: "Generic X12 940/945",
    version: "004010",
    senderId: "WMSLINKER",
    receiverId: "WAREHOUSE",
    config: {
      documentTypes: ["940", "945"],
    },
  });

  logger.info("Seeded generic EDI mapping");
  return mapping;
}

async function getMapping(key = "generic") {
  const mapping = await EdiMapping.findOne({ key });
  if (mapping) {
    return mapping;
  }
  return seedGenericMapping();
}

async function create940({ order, shop, password, warehouseId }) {
  const controlNumber = Date.now() % 999999;
  const mapping = await getMapping(shop.mappingKey || "generic");
  let body;

  if (warehouseId) {
    const WarehouseTemplate = require("../companies/warehouseTemplateModel");
    const template = await WarehouseTemplate.findOne({ warehouseId });
    if (template) {
      const orderData = order.toEdiPayload ? order.toEdiPayload() : order;
      body = templateBuilder.buildFromTemplate(template, orderData, controlNumber);
    }
  }

  if (!body) {
    body = x12.build940({
      mapping,
      order: order.toEdiPayload ? order.toEdiPayload() : order,
      controlNumber,
    });
  }

  const fileName = `940-${order.orderNumber || order.shopifyOrderId}.edi`;
  const fileHash = crypto.createHash("sha256").update(body).digest("hex");
  const document = await EdiDocument.create({
    orderId: order._id,
    shopId: shop._id,
    type: "940",
    mappingKey: mapping.key || "generic",
    body,
    fileHash,
    status: "generated",
  });

  const link = await files.storeAndLink({
    body,
    fileName,
    contentType: "text/plain",
    password,
    orderId: order._id,
    documentId: document._id,
  });

  document.fileLinkId = link.id;
  document.storageKey = fileName;
  document.status = "stored";
  await document.save();

  return { document: document.toPublic(), link, body, fileName };
}

async function getLatest940(orderId) {
  const document = await EdiDocument.findOne({ orderId, type: "940" }).sort({ createdAt: -1 });
  if (!document?.body) {
    return null;
  }

  return {
    body: document.body,
    fileName: document.storageKey || `940-${orderId}.edi`,
  };
}

async function ingest945({ order, shop, body, fileName = "945.edi" }) {
  const parsed = x12.parseShipment(body);
  if (!parsed.trackingNumber && !parsed.shipmentId) {
    throw httpError(400, "945 is missing tracking or shipment identification");
  }

  const mapping = await getMapping(shop.mappingKey || "generic");
  const document = await EdiDocument.create({
    orderId: order._id,
    shopId: shop._id,
    type: "945",
    mappingKey: mapping.key,
    body: String(body),
    parsed,
    status: "parsed",
  });

  await files.storeAndLink({
    body: String(body),
    fileName,
    orderId: order._id,
    documentId: document._id,
  });

  return { document: document.toPublic(), parsed };
}

function sample945({ order, trackingNumber, carrier, status, lines }) {
  return x12.build945({
    mapping: {
      senderId: "WAREHOUSE",
      receiverId: "WMSLINKER",
    },
    order: order.toEdiPayload ? order.toEdiPayload() : order,
    trackingNumber,
    carrier,
    status,
    lines,
    controlNumber: Date.now() % 999999,
  });
}

async function listForOrder(orderId) {
  const docs = await EdiDocument.find({ orderId }).sort({ createdAt: -1 });
  return docs.map((doc) => doc.toPublic());
}

module.exports = {
  seedGenericMapping,
  getMapping,
  create940,
  getLatest940,
  ingest945,
  sample945,
  listForOrder,
};
