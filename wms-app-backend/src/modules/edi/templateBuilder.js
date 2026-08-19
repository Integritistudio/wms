const x12 = require("./x12");

const SHOPIFY_PATHS = [
  "order.orderNumber",
  "order.shopifyOrderId",
  "order.customerName",
  "order.email",
  "shipping.name",
  "shipping.address1",
  "shipping.address2",
  "shipping.city",
  "shipping.provinceCode",
  "shipping.zip",
  "shipping.countryCode",
  "shipping.phone",
  "lineItem.sku",
  "lineItem.title",
  "lineItem.quantity",
  "lineItem.variantId",
];

function getPathValue(path, order, lineItem) {
  const shipping = order.shippingAddress || {};
  const map = {
    "order.orderNumber": order.orderNumber || order.shopifyOrderId || "",
    "order.shopifyOrderId": order.shopifyOrderId || "",
    "order.customerName": order.customerName || "",
    "order.email": order.email || "",
    "shipping.name": shipping.name || "",
    "shipping.address1": shipping.address1 || "",
    "shipping.address2": shipping.address2 || "",
    "shipping.city": shipping.city || "",
    "shipping.provinceCode": shipping.provinceCode || "",
    "shipping.zip": shipping.zip || "",
    "shipping.countryCode": shipping.countryCode || "",
    "shipping.phone": shipping.phone || "",
    "lineItem.sku": lineItem?.sku || "",
    "lineItem.title": lineItem?.title || "",
    "lineItem.quantity": String(lineItem?.quantity || ""),
    "lineItem.variantId": lineItem?.variantId || "",
  };
  return map[path] !== undefined ? map[path] : "";
}

function evaluateCondition(condition, order, lineItem) {
  const actual = getPathValue(condition.field, order, lineItem);
  const expected = condition.value || "";
  switch (condition.operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "not_contains": return !actual.includes(expected);
    case "starts_with": return actual.startsWith(expected);
    case "ends_with": return actual.endsWith(expected);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "is_empty": return actual === "";
    case "is_not_empty": return actual !== "";
    default: return true;
  }
}

function evaluateGroup(group, order, lineItem) {
  if (!group || !group.conditions || group.conditions.length === 0) return true;
  const results = group.conditions.map((c) => evaluateCondition(c, order, lineItem));
  return group.logic === "or" ? results.some(Boolean) : results.every(Boolean);
}

function resolveValue(field, order, lineItem) {
  if (field.source === "static") return field.staticValue || "";

  if (field.source === "conditional") {
    const rules = field.conditionalValues || [];
    for (const rule of rules) {
      if (rule.when && evaluateGroup(rule.when, order, lineItem)) {
        return rule.then || "";
      }
    }
    return field.fallbackValue || "";
  }

  return getPathValue(field.shopifyPath || "", order, lineItem);
}

function shouldIncludeField(field, order, lineItem) {
  if (!field.includeCondition || !field.includeCondition.conditions || field.includeCondition.conditions.length === 0) {
    return true;
  }
  return evaluateGroup(field.includeCondition, order, lineItem);
}

function hasLineItemFields(fields) {
  return fields.some((f) => {
    if (f.source === "shopify" && (f.shopifyPath || "").startsWith("lineItem.")) return true;
    if (f.includeCondition?.conditions?.some((c) => (c.field || "").startsWith("lineItem."))) return true;
    if (f.conditionalValues?.some((cv) => cv.when?.conditions?.some((c) => (c.field || "").startsWith("lineItem.")))) return true;
    return false;
  });
}

function escapeCsv(value, delimiter) {
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(template, order) {
  const { fields, csvDelimiter: delim = ",", csvHeaders } = template;
  const sorted = [...fields].sort((a, b) => a.position - b.position);
  const lines = order.lineItems || [];
  const rows = [];

  if (csvHeaders) {
    rows.push(sorted.map((f) => escapeCsv(f.outputLabel, delim)).join(delim));
  }

  if (hasLineItemFields(sorted) && lines.length > 0) {
    for (const lineItem of lines) {
      const row = sorted.map((f) => {
        if (!shouldIncludeField(f, order, lineItem)) return escapeCsv("", delim);
        return escapeCsv(resolveValue(f, order, lineItem), delim);
      });
      rows.push(row.join(delim));
    }
  } else {
    const row = sorted.map((f) => {
      if (!shouldIncludeField(f, order, null)) return escapeCsv("", delim);
      return escapeCsv(resolveValue(f, order, lines[0] || null), delim);
    });
    rows.push(row.join(delim));
  }

  return rows.join("\n") + "\n";
}

function buildX12FromTemplate(template, order, controlNumber) {
  const { fields, x12Config } = template;
  const sorted = [...fields].sort((a, b) => a.position - b.position);
  const lines = order.lineItems || [];
  const shipping = order.shippingAddress || {};

  const extra = [];

  const orderFields = sorted.filter((f) => !(f.source === "shopify" && (f.shopifyPath || "").startsWith("lineItem.")));
  const lineFields = sorted.filter((f) => f.source === "shopify" && (f.shopifyPath || "").startsWith("lineItem."));

  extra.push(`W05*N*${order.orderNumber || order.shopifyOrderId}*${order.shopifyOrderId}`);
  extra.push(`N1*ST*${shipping.name || order.customerName || "Customer"}`);
  extra.push(`N3*${shipping.address1 || "ADDRESS"}`);
  extra.push(`N4*${shipping.city || ""}*${shipping.provinceCode || ""}*${shipping.zip || ""}*${shipping.countryCode || "US"}`);
  extra.push(`N1*SF*${x12Config?.receiverId || "WAREHOUSE"}`);

  for (const field of orderFields) {
    if (!shouldIncludeField(field, order, null)) continue;
    const val = resolveValue(field, order, null);
    if (val) extra.push(`REF*${field.outputLabel || "ZZ"}*${val}`);
  }

  lines.forEach((item, idx) => {
    extra.push(`LX*${idx + 1}`);
    extra.push(`W01*${item.quantity || 1}*EA*${item.sku || item.variantId || "SKU"}***VN*${item.sku || "SKU"}`);
    for (const field of lineFields) {
      if (!shouldIncludeField(field, order, item)) continue;
      const val = resolveValue(field, order, item);
      if (val) extra.push(`REF*${field.outputLabel || "ZZ"}*${val}`);
    }
  });

  const mapping = {
    senderId: x12Config?.senderId || "WMSLINKER",
    receiverId: x12Config?.receiverId || "WAREHOUSE",
  };

  return x12.build940 ? buildX12Envelope(mapping, extra, controlNumber) : extra.join("~\n") + "~\n";
}

function buildX12Envelope(mapping, extra, controlNumber = 1) {
  const x12Mod = require("./x12");
  const pad = (v, l, f = " ") => String(v ?? "").slice(0, l).padEnd(l, f);
  const padNum = (v, l) => String(v ?? "0").replace(/\D/g, "").padStart(l, "0").slice(-l);

  const now = new Date();
  const y = now.getUTCFullYear().toString().slice(-2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const date6 = `${y}${m}${d}`;
  const date8 = `${now.getUTCFullYear()}${m}${d}`;
  const time = `${hh}${mm}`;
  const control = padNum(controlNumber, 9);
  const stControl = padNum(controlNumber, 4);
  const sender = pad(mapping.senderId, 15);
  const receiver = pad(mapping.receiverId, 15);

  const segments = [
    `ISA*00*${pad("", 10)}*00*${pad("", 10)}*ZZ*${sender}*ZZ*${receiver}*${date6}*${time}*U*00401*${control}*0*P*>`,
    `GS*OW*${mapping.senderId.slice(0, 15)}*${mapping.receiverId.slice(0, 15)}*${date8}*${time}*${controlNumber}*X*004010`,
    `ST*940*${stControl}`,
    ...extra,
  ];

  const stCount = segments.length - 2 + 1;
  segments.push(`SE*${stCount}*${stControl}`);
  segments.push(`GE*1*${controlNumber}`);
  segments.push(`IEA*1*${control}`);
  return segments.join("~\n") + "~\n";
}

function buildFromTemplate(template, order, controlNumber = 1) {
  if (template.format === "csv") {
    return buildCsv(template, order);
  }
  return buildX12FromTemplate(template, order, controlNumber);
}

const OPERATORS = [
  { id: "equals", label: "equals" },
  { id: "not_equals", label: "does not equal" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "does not contain" },
  { id: "starts_with", label: "starts with" },
  { id: "ends_with", label: "ends with" },
  { id: "greater_than", label: "greater than" },
  { id: "less_than", label: "less than" },
  { id: "is_empty", label: "is empty" },
  { id: "is_not_empty", label: "is not empty" },
];

module.exports = {
  buildFromTemplate,
  SHOPIFY_PATHS,
  OPERATORS,
  resolveValue,
};
