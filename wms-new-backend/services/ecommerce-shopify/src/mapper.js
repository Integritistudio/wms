'use strict'

/**
 * Map Shopify Admin order JSON → @linker/contracts CanonicalOrder fields.
 * Edit this file for custom Shopify metafield / line shaping.
 */
const crypto = require('crypto')
const { newEventId } = require('@linker/common')

function mapShopifyOrder(shopDomain, payload) {
  const lines = (payload.line_items || []).map((li) => ({
    id: String(li.id || li.admin_graphql_api_id || crypto.randomUUID()),
    sku: li.sku || null,
    title: li.title || li.name,
    quantity: Number(li.quantity || 1),
    variantId: li.variant_id ? String(li.variant_id) : null,
    productId: li.product_id ? String(li.product_id) : null,
  }))
  return {
    eventId: newEventId(),
    provider: 'shopify',
    shopDomain,
    externalOrderId: String(payload.id || payload.admin_graphql_api_id),
    orderNumber: payload.name || payload.order_number ? String(payload.name || payload.order_number) : null,
    currency: payload.currency || 'USD',
    customerEmail: payload.email || payload.contact_email || null,
    shippingAddress: payload.shipping_address || null,
    billingAddress: payload.billing_address || null,
    lineItems: lines.length ? lines : [{ id: '1', sku: 'UNKNOWN', title: 'Item', quantity: 1 }],
  }
}

module.exports = { mapShopifyOrder }
