const env = require("../../config/env");
const logger = require("../../config/logger");

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(query) {
  const token = env.mapboxToken;
  if (!token || !query || !String(query).trim()) {
    return null;
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(String(query).trim())}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status }, "Mapbox geocode failed");
      return null;
    }
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature?.center) return null;
    const [lng, lat] = feature.center;
    const postcode =
      (feature.context || []).find((c) => String(c.id || "").startsWith("postcode"))?.text ||
      (feature.properties && feature.properties.postcode) ||
      "";
    return {
      lat,
      lng,
      placeName: feature.place_name || "",
      zip: String(postcode || "").trim(),
    };
  } catch (error) {
    logger.warn({ err: error }, "Mapbox geocode error");
    return null;
  }
}

function buildShipQuery(order) {
  const addr = order.shippingAddress || {};
  const parts = [
    addr.address1 || addr.address || "",
    addr.city || "",
    addr.provinceCode || addr.province || "",
    addr.zip || "",
    addr.countryCode || addr.country || "",
  ].filter(Boolean);
  return parts.join(", ");
}

function normalizeZipToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

function zipMatchesPrefixes(zip, prefixes = []) {
  const z = normalizeZipToken(zip);
  if (!z) return false;
  const zDigits = z.replace(/\D/g, "");
  const z5 = zDigits.slice(0, 5);
  return (prefixes || []).some((p) => {
    const prefix = normalizeZipToken(p);
    if (!prefix) return false;
    const pDigits = prefix.replace(/\D/g, "");
    const p5 = pDigits.slice(0, 5);
    if (z.startsWith(prefix) || prefix.startsWith(z)) return true;
    if (z5 && p5 && (z5 === p5 || z5.startsWith(p5) || p5.startsWith(z5))) return true;
    return false;
  });
}

module.exports = {
  geocode,
  haversineKm,
  buildShipQuery,
  zipMatchesPrefixes,
};
