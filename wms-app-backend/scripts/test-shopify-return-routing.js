const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
function fixture() {
  const mutations = [];
  const mocks = {
    "../shops": { isProcessable: () => true, shopifyGraphql: async (_, query, variables) => {
      if (query.includes("returnableFulfillmentLines")) return { order: { fulfillments: [{ fulfillmentLineItems: { nodes: [{ id: "fulfillment-line", quantity: 1, lineItem: { id: "gid://shopify/LineItem/1", sku: "SKU-A" } }] } }] } };
      if (query.includes("mutation orderCancel")) { mutations.push("orderCancel"); return { orderCancel: { job: { id: "job" }, orderCancelUserErrors: [], userErrors: [] } }; }
      assert.ok(variables.returnInput.returnLineItems.every(line => line.returnReasonNote));
      mutations.push("returnCreate"); return { returnCreate: { return: { id: "return", status: "OPEN" }, userErrors: [] } };
    } },
    "../logs": { logOrderTransition: async () => {} }, "../../config/logger": { warn() {} },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/modules/shopify/returns.js"), "utf8");
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(name => mocks[name], module, module.exports);
  return { service: module.exports, mutations, rma: { _id: "rma", companyId: "company", lines: [{ orderLineId: "1", sku: "SKU-A", quantity: 1 }], save: async () => {} } };
}
test("a full return of shipped items opens a Shopify return instead of cancelling the fulfilled order", async () => {
  const f = fixture();
  const result = await f.service.syncReturnOpened({ shop: {}, order: { _id: "order", shopifyOrderId: "123", source: "shopify", lineItems: [{ shippedQty: 1 }] }, returnDoc: f.rma, isFullReturn: true });
  assert.equal(result.ok, true);
  assert.deepEqual(f.mutations, ["returnCreate"]);
  assert.equal(f.rma.metadata.shopifyReturnId, "return");
});
test("a full unshipped return still uses order cancellation", async () => {
  const f = fixture();
  const result = await f.service.syncReturnOpened({ shop: {}, order: { _id: "order", shopifyOrderId: "123", source: "shopify", lineItems: [{ shippedQty: 0 }] }, returnDoc: f.rma, isFullReturn: true });
  assert.equal(result.ok, true);
  assert.deepEqual(f.mutations, ["orderCancel"]);
});
