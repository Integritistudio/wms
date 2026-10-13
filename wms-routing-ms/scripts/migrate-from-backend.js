require("dotenv").config();
const mongoose = require("mongoose");

const canonical = (value) => JSON.stringify(value, (_key, item) => {
  if (item && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date) && !item._bsontype) {
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  }
  return item;
});

async function migrate(source, target, { apply = false } = {}) {
  const plans = [];
  for (const name of ["routing_configs", "routing_rules"]) {
    const documents = await source.collection(name).find({}).toArray();
    const Model = target.model(name, require(name === "routing_rules" ? "../src/ruleModel" : "../src/configModel").schema, name);
    // Validate the whole source before writing any document.
    for (const doc of documents) {
      await new Model(doc).validate();
      if (!await source.collection("companies").findOne({ _id: doc.companyId })) throw new Error(`Orphan tenant in ${name}`);
      for (const field of name === "routing_rules" ? ["warehouseId"] : ["defaultWarehouseId", "fallbackWarehouseId"]) {
        if (doc[field] && !await source.collection("warehouses").findOne({ _id: doc[field], companyId: doc.companyId })) {
          throw new Error(`Invalid tenant warehouse reference in ${name}`);
        }
      }
      const existing = await target.collection(name).findOne({ _id: doc._id });
      if (existing && canonical(existing) !== canonical(doc)) throw new Error(`Destination conflict in ${name}; refusing to overwrite`);
      if (name === "routing_configs") {
        const other = await target.collection(name).findOne({ companyId: doc.companyId });
        if (other && String(other._id) !== String(doc._id)) throw new Error("Destination already has a different tenant config");
      }
    }
    plans.push({ name, Model, documents });
  }
  if (apply) {
    for (const { name, Model, documents } of plans) {
      await Model.init();
      for (const doc of documents) await target.collection(name).updateOne(
        { _id: doc._id, companyId: doc.companyId }, { $setOnInsert: doc }, { upsert: true });
      for (const doc of documents) {
        const stored = await target.collection(name).findOne({ _id: doc._id, companyId: doc.companyId });
        if (canonical(stored) !== canonical(doc)) throw new Error(`Verification failed in ${name}`);
      }
    }
  }
  return Object.fromEntries(plans.map(({ name, documents }) => [name, documents.length]));
}

async function main() {
  if (!process.env.SOURCE_MONGODB_URI || !process.env.MONGODB_URI) throw new Error("Source and target URI required");
  const source = await mongoose.createConnection(process.env.SOURCE_MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
  let target;
  try {
    target = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
    if (source.host === target.host && source.port === target.port && source.name === target.name) throw new Error("Source and target must be different databases");
    const apply = process.argv.includes("--apply");
    console.log(JSON.stringify({ mode: apply ? "applied-and-verified" : "dry-run", counts: await migrate(source, target, { apply }) }));
  } finally { await source.close(); if (target) await target.close(); }
}

if (require.main === module) main().catch(() => { console.error("Migration failed; validate source references and destination conflicts. No source data is changed."); process.exitCode = 1; });
module.exports = { migrate };
