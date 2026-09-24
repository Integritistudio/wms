const shops = require("../shops");
const logger = require("../../config/logger");

/**
 * List active Shopify locations for a shop.
 */
async function listLocations(shop) {
  const data = await shops.shopifyGraphql(
    shop,
    `query {
      locations(first: 50, includeInactive: false) {
        nodes { id name isActive fulfillsOnlineOrders }
      }
    }`
  );
  return (data.locations?.nodes || []).filter((n) => n?.id);
}

/**
 * Set absolute available quantity at a Shopify location.
 */
async function setQuantity({ shop, inventoryItemId, locationGid, quantity, reason = "correction" }) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const result = await shops.shopifyGraphql(
    shop,
    `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        userErrors { field message code }
      }
    }`,
    {
      input: {
        name: "available",
        reason,
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId,
            locationId: locationGid,
            quantity: qty,
          },
        ],
      },
    }
  );

  const errors = result.inventorySetQuantities?.userErrors || [];
  if (errors.length) {
    const msg = errors.map((e) => e.message).join("; ");
    const err = new Error(msg || "inventorySetQuantities failed");
    err.userErrors = errors;
    throw err;
  }
  return { quantity: qty };
}

/**
 * Ensure inventory item is stocked at location, then set qty.
 */
async function activateAndSet({ shop, inventoryItemId, locationGid, quantity }) {
  try {
    return await setQuantity({ shop, inventoryItemId, locationGid, quantity });
  } catch (error) {
    const text = String(error.message || "");
    if (!/not stocked|not activated|inventory item is not|location/i.test(text)) {
      throw error;
    }
    logger.info(
      { inventoryItemId, locationGid },
      "Activating inventory item at Shopify location before set"
    );
    const act = await shops.shopifyGraphql(
      shop,
      `mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) {
          userErrors { field message }
        }
      }`,
      {
        inventoryItemId,
        locationId: locationGid,
        available: Math.max(0, Math.floor(Number(quantity) || 0)),
      }
    );
    const actErrors = act.inventoryActivate?.userErrors || [];
    if (actErrors.length) {
      throw new Error(actErrors.map((e) => e.message).join("; "));
    }
    return { quantity: Math.max(0, Math.floor(Number(quantity) || 0)), activated: true };
  }
}

/**
 * Update variant inventoryPolicy (CONTINUE | DENY).
 */
async function setContinueSelling({ shop, variantId, productId, continueSelling }) {
  const policy = continueSelling ? "CONTINUE" : "DENY";
  let resolvedProductId = productId;

  if (!resolvedProductId) {
    const lookup = await shops.shopifyGraphql(
      shop,
      `query ($id: ID!) {
        productVariant(id: $id) {
          id
          product { id }
        }
      }`,
      { id: variantId }
    );
    resolvedProductId = lookup.productVariant?.product?.id || "";
  }

  if (!resolvedProductId) {
    throw new Error("Could not resolve Shopify product id for variant");
  }

  const result = await shops.shopifyGraphql(
    shop,
    `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id inventoryPolicy }
        userErrors { field message }
      }
    }`,
    {
      productId: resolvedProductId,
      variants: [{ id: variantId, inventoryPolicy: policy }],
    }
  );
  const errors = result.productVariantsBulkUpdate?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  return { inventoryPolicy: policy, productId: resolvedProductId };
}

/**
 * Page through products/variants for catalog sync.
 */
async function fetchAllVariants(shop, { maxPages = 40 } = {}) {
  const variants = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await shops.shopifyGraphql(
      shop,
      `query ($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            title
            variants(first: 100) {
              nodes {
                id
                sku
                inventoryPolicy
                inventoryItem { id tracked }
              }
            }
          }
        }
      }`,
      { cursor }
    );
    const products = data.products?.nodes || [];
    for (const product of products) {
      for (const v of product.variants?.nodes || []) {
        const sku = String(v.sku || "").trim();
        if (!sku) continue;
        variants.push({
          sku,
          variantId: v.id,
          inventoryItemId: v.inventoryItem?.id || "",
          tracked: Boolean(v.inventoryItem?.tracked),
          inventoryPolicy: v.inventoryPolicy || "DENY",
          productTitle: product.title || "",
          productId: product.id || "",
        });
      }
    }
    if (!data.products?.pageInfo?.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return variants;
}

module.exports = {
  listLocations,
  setQuantity,
  activateAndSet,
  setContinueSelling,
  fetchAllVariants,
};
