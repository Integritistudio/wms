const mongoose = require("mongoose");
const Shop = require("../shops/model");
const Order = require("../orders/model");
const Warehouse = require("./warehouseModel");
const Shipment = require("../fulfillment/shipmentModel");
const Return = require("../fulfillment/returnModel");
const FailedOrder = require("../orders/failedOrderModel");

const IN_TRANSIT_SHIPMENT = ["in_transit", "out_for_delivery", "labeled"];
const OPEN_RETURN = ["requested", "authorized", "in_transit", "received", "inspected"];

function parseRange(query = {}) {
  const days = Math.min(365, Math.max(1, Number.parseInt(query.days, 10) || 30));
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to, days };
}

function oid(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function bucketCounts(rows, key = "_id") {
  return (rows || []).map((row) => ({
    key: row[key] == null || row[key] === "" ? "unknown" : String(row[key]),
    count: row.count || 0,
  }));
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function fillDays(from, to, series) {
  const map = new Map(series.map((s) => [s.date, s.count]));
  const out = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = dayKey(cursor);
    out.push({ date: key, count: map.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Company analytics aggregates for dashboard charts.
 */
async function getCompanyAnalytics(companyId, { from, to, days, warehouseIds = null } = {}) {
  const range = from && to ? { from: new Date(from), to: new Date(to), days } : parseRange({ days });
  const companyOid = oid(companyId);
  if (!companyOid) {
    return emptyPayload(range);
  }

  const shops = await Shop.find({ companyId: companyOid }).select("_id shopDomain").lean();
  const shopIds = shops.map((s) => s._id);
  if (!shopIds.length) {
    const warehouses = await Warehouse.find({ companyId: companyOid, isActive: true }).lean();
    return {
      ...emptyPayload(range),
      warehouses: warehouses.map(whPublic),
    };
  }

  const orderMatch = {
    shopId: { $in: shopIds },
    createdAt: { $gte: range.from, $lte: range.to },
  };
  const scopedWarehouseIds = Array.isArray(warehouseIds) && warehouseIds.length
    ? warehouseIds.map(oid).filter(Boolean)
    : null;
  if (scopedWarehouseIds) {
    orderMatch.warehouseId = { $in: scopedWarehouseIds };
  }

  const orderWithWarehouseMatch = scopedWarehouseIds
    ? { ...orderMatch }
    : { ...orderMatch, warehouseId: { $ne: null } };

  const shipmentMatch = {
    companyId: companyOid,
    createdAt: { $gte: range.from, $lte: range.to },
  };
  if (scopedWarehouseIds) {
    shipmentMatch.warehouseId = { $in: scopedWarehouseIds };
  }

  const returnMatch = {
    companyId: companyOid,
    isDeleted: { $ne: true },
    createdAt: { $gte: range.from, $lte: range.to },
  };
  if (scopedWarehouseIds) {
    returnMatch.warehouseId = { $in: scopedWarehouseIds };
  }

  const dlqMatch = {
    companyId: companyOid,
    resolution: null,
  };
  if (scopedWarehouseIds) {
    dlqMatch.warehouseId = { $in: scopedWarehouseIds };
  }

  const [
    ordersByStatus,
    ordersByDay,
    ordersByWarehouse,
    shipmentsByStatus,
    carriers,
    channels,
    sftpStatuses,
    returnsByStatus,
    returnsByWarehouse,
    inTransitCount,
    openReturnCount,
    dlqCount,
    warehouses,
    destinationCountries,
    destinationRegions,
  ] = await Promise.all([
    Order.aggregate([{ $match: orderMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: orderWithWarehouseMatch },
      { $group: { _id: "$warehouseId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Shipment.aggregate([{ $match: shipmentMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Shipment.aggregate([
      { $match: { ...shipmentMatch, carrier: { $nin: [null, ""] } } },
      { $group: { _id: "$carrier", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: { $ifNull: ["$channel", "shopify"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Order.aggregate([{ $match: orderMatch }, { $group: { _id: "$sftpStatus", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Return.aggregate([{ $match: returnMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Return.aggregate([
      { $match: { ...returnMatch, warehouseId: { $ne: null } } },
      { $group: { _id: "$warehouseId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Shipment.countDocuments({
      ...shipmentMatch,
      status: { $in: IN_TRANSIT_SHIPMENT },
    }),
    Return.countDocuments({
      ...returnMatch,
      status: { $in: OPEN_RETURN },
    }),
    FailedOrder.countDocuments(dlqMatch),
    Warehouse.find({
      companyId: companyOid,
      ...(scopedWarehouseIds ? { _id: { $in: scopedWarehouseIds } } : {}),
    }).lean(),
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: {
            $ifNull: [
              "$shippingAddress.country",
              { $ifNull: ["$shippingAddress.countryCode", "$shippingAddress.country_code"] },
            ],
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: {
            $ifNull: [
              "$shippingAddress.province",
              { $ifNull: ["$shippingAddress.provinceCode", { $ifNull: ["$shippingAddress.state", "$shippingAddress.city"] }] },
            ],
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
  ]);

  const whById = new Map(warehouses.map((w) => [String(w._id), w]));
  const orderCountByWh = new Map(ordersByWarehouse.map((r) => [String(r._id), r.count]));
  const returnCountByWh = new Map(returnsByWarehouse.map((r) => [String(r._id), r.count]));

  const warehouseOrderRank = ordersByWarehouse.map((row, index) => {
    const wh = whById.get(String(row._id));
    return {
      rank: index + 1,
      warehouseId: String(row._id),
      name: wh?.name || "Unknown warehouse",
      code: wh?.code || "",
      orderCount: row.count,
      latitude: wh?.latitude ?? null,
      longitude: wh?.longitude ?? null,
    };
  });

  const warehouseReturnRank = returnsByWarehouse.map((row, index) => {
    const wh = whById.get(String(row._id));
    return {
      rank: index + 1,
      warehouseId: String(row._id),
      name: wh?.name || "Unknown warehouse",
      code: wh?.code || "",
      returnCount: row.count,
      latitude: wh?.latitude ?? null,
      longitude: wh?.longitude ?? null,
    };
  });

  const statusMap = Object.fromEntries(ordersByStatus.map((r) => [r._id, r.count]));
  const totalOrders = ordersByStatus.reduce((sum, r) => sum + r.count, 0);
  const unassignedOrders = await Order.countDocuments({
    ...orderMatch,
    $or: [{ warehouseId: null }, { warehouseId: { $exists: false } }],
  });

  const mapPoints = warehouses
    .filter((w) => w.latitude != null && w.longitude != null)
    .map((w) => ({
      id: String(w._id),
      name: w.name,
      code: w.code || "",
      latitude: w.latitude,
      longitude: w.longitude,
      geoPlaceName: w.geoPlaceName || w.address || "",
      orderCount: orderCountByWh.get(String(w._id)) || 0,
      returnCount: returnCountByWh.get(String(w._id)) || 0,
      isActive: w.isActive !== false,
    }));

  const funnel = [
    { stage: "Received", count: totalOrders },
    {
      stage: "940 ready",
      count:
        (statusMap["940_ready"] || 0) +
        (statusMap["945_received"] || 0) +
        (statusMap["partially_fulfilled"] || 0) +
        (statusMap["fulfilled"] || 0) +
        (statusMap["partially_returned"] || 0) +
        (statusMap["returned"] || 0),
    },
    {
      stage: "Shipped / 945",
      count:
        (statusMap["945_received"] || 0) +
        (statusMap["partially_fulfilled"] || 0) +
        (statusMap["fulfilled"] || 0) +
        (statusMap["partially_returned"] || 0) +
        (statusMap["returned"] || 0),
    },
    { stage: "Fulfilled", count: statusMap["fulfilled"] || 0 },
    {
      stage: "Returned",
      count: (statusMap["returned"] || 0) + (statusMap["partially_returned"] || 0),
    },
  ];

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days || Math.max(1, Math.round((range.to - range.from) / (24 * 60 * 60 * 1000))),
    },
    summary: {
      totalOrders,
      fulfilled: statusMap["fulfilled"] || 0,
      partiallyFulfilled: statusMap["partially_fulfilled"] || 0,
      returned: statusMap["returned"] || 0,
      partiallyReturned: statusMap["partially_returned"] || 0,
      inTransit: inTransitCount,
      onHold: statusMap["on_hold"] || 0,
      errors: statusMap["error"] || 0,
      cancelled: statusMap["cancelled"] || 0,
      unassigned: unassignedOrders,
      openReturns: openReturnCount,
      totalReturns: returnsByStatus.reduce((s, r) => s + r.count, 0),
      failedDlq: dlqCount,
      warehouseCount: warehouses.length,
      shopCount: shops.length,
    },
    ordersByStatus: bucketCounts(ordersByStatus),
    ordersByDay: fillDays(
      range.from,
      range.to,
      ordersByDay.map((r) => ({ date: r._id, count: r.count }))
    ),
    shipmentsByStatus: bucketCounts(shipmentsByStatus),
    returnsByStatus: bucketCounts(returnsByStatus),
    sftpByStatus: bucketCounts(sftpStatuses),
    topCarriers: bucketCounts(carriers),
    channelMix: bucketCounts(channels),
    warehouseOrderRank,
    warehouseReturnRank,
    fulfillmentFunnel: funnel,
    destinations: {
      countries: bucketCounts(destinationCountries),
      regions: bucketCounts(destinationRegions),
    },
    map: {
      warehouses: mapPoints,
    },
    warehouses: warehouses.map(whPublic),
    shops: shops.map((s) => ({ id: String(s._id), shopDomain: s.shopDomain })),
  };
}

function whPublic(w) {
  return {
    id: String(w._id),
    name: w.name,
    code: w.code || "",
    latitude: w.latitude ?? null,
    longitude: w.longitude ?? null,
    isActive: w.isActive !== false,
  };
}

function emptyPayload(range) {
  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days || 30,
    },
    summary: {
      totalOrders: 0,
      fulfilled: 0,
      partiallyFulfilled: 0,
      returned: 0,
      partiallyReturned: 0,
      inTransit: 0,
      onHold: 0,
      errors: 0,
      cancelled: 0,
      unassigned: 0,
      openReturns: 0,
      totalReturns: 0,
      failedDlq: 0,
      warehouseCount: 0,
      shopCount: 0,
    },
    ordersByStatus: [],
    ordersByDay: fillDays(range.from, range.to, []),
    shipmentsByStatus: [],
    returnsByStatus: [],
    sftpByStatus: [],
    topCarriers: [],
    channelMix: [],
    warehouseOrderRank: [],
    warehouseReturnRank: [],
    fulfillmentFunnel: [
      { stage: "Received", count: 0 },
      { stage: "940 ready", count: 0 },
      { stage: "Shipped / 945", count: 0 },
      { stage: "Fulfilled", count: 0 },
      { stage: "Returned", count: 0 },
    ],
    destinations: { countries: [], regions: [] },
    map: { warehouses: [] },
    warehouses: [],
    shops: [],
  };
}

module.exports = {
  getCompanyAnalytics,
  parseRange,
};
