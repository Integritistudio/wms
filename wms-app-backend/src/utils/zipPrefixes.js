const { httpError } = require("./httpError");

function normalizeZipPrefixes(value) {
  const values = Array.isArray(value) ? value : [value ?? ""];
  const prefixes = values.flatMap((item) => String(item).split(","));
  if (prefixes.some((prefix) => /[^A-Za-z0-9 ]/.test(prefix))) {
    throw httpError(400, "ZIP prefixes may only contain letters, numbers and spaces, separated by commas.");
  }
  return prefixes.map((prefix) => prefix.trim()).filter(Boolean);
}

module.exports = { normalizeZipPrefixes };
