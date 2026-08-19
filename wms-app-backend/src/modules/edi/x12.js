function pad(value, length, fill = " ") {
  return String(value ?? "").slice(0, length).padEnd(length, fill);
}

function padNumber(value, length) {
  return String(value ?? "0").replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function nowParts(date = new Date()) {
  const y = date.getUTCFullYear().toString().slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return {
    date6: `${y}${m}${d}`,
    date8: `${date.getUTCFullYear()}${m}${d}`,
    time: `${hh}${mm}`,
  };
}

function join(segments) {
  return `${segments.join("~\n")}~\n`;
}

function envelope({ mapping, transactionSet, controlNumber = 1, extra }) {
  const clock = nowParts();
  const control = padNumber(controlNumber, 9);
  const stControl = padNumber(controlNumber, 4);
  const sender = pad(mapping.senderId || "WMSLINKER", 15);
  const receiver = pad(mapping.receiverId || "WAREHOUSE", 15);
  const gsCode = transactionSet === "945" ? "SW" : "OW";

  const segments = [
    `ISA*00*${pad("", 10)}*00*${pad("", 10)}*ZZ*${sender}*ZZ*${receiver}*${clock.date6}*${clock.time}*U*00401*${control}*0*P*>`,
    `GS*${gsCode}*${(mapping.senderId || "WMSLINKER").slice(0, 15)}*${(mapping.receiverId || "WAREHOUSE").slice(0, 15)}*${clock.date8}*${clock.time}*${controlNumber}*X*004010`,
    `ST*${transactionSet}*${stControl}`,
    ...extra,
  ];

  const stCount = segments.length - 2 + 1;
  segments.push(`SE*${stCount}*${stControl}`);
  segments.push(`GE*1*${controlNumber}`);
  segments.push(`IEA*1*${control}`);
  return join(segments);
}

function build940({ mapping, order, controlNumber = 1 }) {
  const shipping = order.shippingAddress || {};
  const lines = order.lineItems || [];
  const extra = [
    `W05*N*${order.orderNumber || order.shopifyOrderId}*${order.shopifyOrderId}`,
    `N1*ST*${shipping.name || order.customerName || "Customer"}`,
    `N3*${shipping.address1 || "ADDRESS"}`,
    `N4*${shipping.city || ""}*${shipping.provinceCode || ""}*${shipping.zip || ""}*${shipping.countryCode || "US"}`,
    `N1*SF*${mapping.receiverId || "WAREHOUSE"}`,
  ];

  lines.forEach((item, index) => {
    extra.push(`LX*${index + 1}`);
    extra.push(`W01*${item.quantity || 1}*EA*${item.wmsSku || item.sku || item.variantId || "SKU"}***VN*${item.sku || "SKU"}`);
  });

  return envelope({ mapping, transactionSet: "940", controlNumber, extra });
}

function build945({ mapping, order, trackingNumber, carrier, controlNumber = 1 }) {
  const shipping = order.shippingAddress || {};
  const lines = order.lineItems || [];
  const extra = [
    `W06*N*${order.orderNumber || order.shopifyOrderId}*${trackingNumber || order.shopifyOrderId}`,
    `N1*ST*${shipping.name || order.customerName || "Customer"}`,
    `N3*${shipping.address1 || "ADDRESS"}`,
    `N4*${shipping.city || ""}*${shipping.provinceCode || ""}*${shipping.zip || ""}*${shipping.countryCode || "US"}`,
  ];

  lines.forEach((item, index) => {
    extra.push(`LX*${index + 1}`);
    extra.push(`W12*${item.quantity || 1}*EA*${item.sku || "SKU"}***${item.sku || "SKU"}`);
  });

  extra.push(`W27*B*${carrier || "UPS"}*CC***${trackingNumber || ""}`);
  extra.push(`MAN*GM*${trackingNumber || ""}`);

  return envelope({ mapping, transactionSet: "945", controlNumber, extra });
}

function parseSegments(body) {
  return String(body || "")
    .replace(/\r/g, "")
    .split("~")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("*"));
}

function parse945(body) {
  const rows = parseSegments(body);
  const parsed = {
    shipmentId: "",
    trackingNumber: "",
    carrier: "",
    quantities: [],
  };

  for (const cells of rows) {
    const type = cells[0];
    if (type === "W06" || type === "BSN") {
      parsed.shipmentId = cells[3] || cells[2] || parsed.shipmentId;
    }
    if (type === "MAN") {
      parsed.trackingNumber = cells[2] || cells[3] || parsed.trackingNumber;
    }
    if (type === "W27") {
      parsed.carrier = cells[2] || cells[3] || parsed.carrier;
      parsed.trackingNumber = parsed.trackingNumber || cells[6] || cells[5] || "";
    }
    if (type === "TD5") {
      parsed.carrier = cells[3] || cells[5] || parsed.carrier;
      parsed.trackingNumber = parsed.trackingNumber || cells[5] || "";
    }
    if (type === "W12") {
      parsed.quantities.push({
        sku: cells[6] || cells[5] || cells[3] || "",
        quantity: Number(cells[1] || cells[2] || cells[3] || 0),
      });
    }
  }

  return parsed;
}

function parseKeyValue(body) {
  const text = String(body || "");
  const pick = (label) => {
    const match = text.match(new RegExp(`${label}\\s*[:=]\\s*(.+)`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    shipmentId: pick("SHIPMENT") || pick("ORDER"),
    trackingNumber: pick("TRACKING") || pick("TRACKING_NUMBER"),
    carrier: pick("CARRIER") || pick("COMPANY"),
    quantities: [],
  };
}

function parseShipment(body) {
  const text = String(body || "").trim();
  if (!text) {
    return { shipmentId: "", trackingNumber: "", carrier: "", quantities: [] };
  }

  if (text.startsWith("{")) {
    const json = JSON.parse(text);
    return {
      shipmentId: String(json.shipmentId || json.orderNumber || ""),
      trackingNumber: String(json.trackingNumber || json.tracking || json.number || ""),
      carrier: String(json.carrier || json.company || ""),
      quantities: Array.isArray(json.quantities) ? json.quantities : [],
    };
  }

  if (text.includes("~") || /^ISA\*/m.test(text)) {
    return parse945(text);
  }

  return parseKeyValue(text);
}

module.exports = {
  build940,
  build945,
  parse945,
  parseShipment,
};
