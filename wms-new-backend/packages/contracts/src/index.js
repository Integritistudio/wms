'use strict'

const { z } = require('zod')

const Money = z.object({
  amount: z.string().or(z.number()),
  currency: z.string().default('USD'),
})

const Address = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  provinceCode: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
})

const LineItem = z.object({
  id: z.string(),
  sku: z.string().optional().nullable(),
  title: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: Money.optional(),
  variantId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
})

/** Canonical order snapshot — ecommerce connectors emit this shape. */
const CanonicalOrder = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  shopDomain: z.string(),
  externalOrderId: z.string(),
  orderNumber: z.string().optional().nullable(),
  currency: z.string().default('USD'),
  customerEmail: z.string().optional().nullable(),
  shippingAddress: Address.optional().nullable(),
  billingAddress: Address.optional().nullable(),
  lineItems: z.array(LineItem).min(1),
  rawRef: z.string().optional().nullable(),
  createdAt: z.string().datetime().optional(),
})

const CanonicalOrderCancelled = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  shopDomain: z.string(),
  externalOrderId: z.string(),
})

const FulfillmentCreateCommand = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  shopDomain: z.string(),
  externalOrderId: z.string(),
  trackingNumber: z.string().optional().nullable(),
  trackingCompany: z.string().optional().nullable(),
  trackingUrl: z.string().optional().nullable(),
  lineItems: z
    .array(
      z.object({
        externalLineId: z.string().optional(),
        sku: z.string().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
  notifyCustomer: z.boolean().default(true),
})

const InventorySetCommand = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  shopDomain: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  locationExternalId: z.string().optional().nullable(),
  idempotencyKey: z.string(),
})

const InventoryChangedEvent = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  shopDomain: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  locationExternalId: z.string().optional().nullable(),
})

const WmsDispatchCommand = z.object({
  eventId: z.string().uuid(),
  wmsProvider: z.string(),
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderId: z.string().uuid(),
  groupId: z.string().uuid(),
  externalOrderId: z.string(),
  orderNumber: z.string().optional().nullable(),
  shipTo: Address.optional().nullable(),
  lines: z.array(
    z.object({
      sku: z.string(),
      title: z.string().optional(),
      quantity: z.number().int().positive(),
      lineId: z.string().optional(),
    }),
  ),
  wmsConfig: z.record(z.any()).optional().default({}),
})

const WmsShipmentConfirmed = z.object({
  eventId: z.string().uuid(),
  wmsProvider: z.string(),
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  orderId: z.string().uuid(),
  groupId: z.string().uuid(),
  trackingNumber: z.string().optional().nullable(),
  trackingCompany: z.string().optional().nullable(),
  trackingUrl: z.string().optional().nullable(),
  shippedLines: z
    .array(
      z.object({
        sku: z.string().optional(),
        quantity: z.number().int().positive(),
        lineId: z.string().optional(),
      }),
    )
    .optional(),
})

const WmsInventoryUpdated = z.object({
  eventId: z.string().uuid(),
  wmsProvider: z.string(),
  warehouseId: z.string().uuid(),
  sku: z.string(),
  quantity: z.number().int(),
})

const SagaAdvance = z.object({
  eventId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.string(),
  meta: z.record(z.any()).optional(),
})

const TOPICS = {
  ECOMMERCE_ORDER_CREATED: 'ecommerce.order.created',
  ECOMMERCE_ORDER_CANCELLED: 'ecommerce.order.cancelled',
  ECOMMERCE_ORDER_UPDATED: 'ecommerce.order.updated',
  ECOMMERCE_INVENTORY_CHANGED: 'ecommerce.inventory.changed',
  ECOMMERCE_FULFILLMENT_CREATE: 'ecommerce.fulfillment.create',
  ECOMMERCE_INVENTORY_SET: 'ecommerce.inventory.set',
  ECOMMERCE_TRACKING_UPDATE: 'ecommerce.tracking.update',
  WMS_SHIPMENT_DISPATCH: 'wms.shipment.dispatch',
  WMS_INVENTORY_SYNC_REQUEST: 'wms.inventory.sync_request',
  WMS_SHIPMENT_CONFIRMED: 'wms.shipment.confirmed',
  WMS_INVENTORY_UPDATED: 'wms.inventory.updated',
  ORDER_INGESTED: 'orders.ingested',
  ORDER_CANCELLED: 'orders.cancelled',
  FULFILLMENT_ALLOCATED: 'fulfillment.allocated',
  FULFILLMENT_SHIPPED: 'fulfillment.shipped',
  SAGA_ADVANCE: 'saga.advance',
  NOTIFICATION_CREATE: 'notifications.create',
}

const EXCHANGES = {
  EVENTS: 'linker.events',
  ECOMMERCE_COMMANDS: 'linker.ecommerce.commands',
  WMS_COMMANDS: 'linker.wms.commands',
}

module.exports = {
  Money,
  Address,
  LineItem,
  CanonicalOrder,
  CanonicalOrderCancelled,
  FulfillmentCreateCommand,
  InventorySetCommand,
  InventoryChangedEvent,
  WmsDispatchCommand,
  WmsShipmentConfirmed,
  WmsInventoryUpdated,
  SagaAdvance,
  TOPICS,
  EXCHANGES,
}
