'use strict'

/**
 * Map canonical WMS dispatch → ModernWMS payload.
 * Edit this file when ModernWMS field names differ per tenant.
 */
function buildDispatchLines(cmd) {
  return {
    warehouseId: cmd.wmsConfig?.mwmsWarehouseId,
    externalNo: cmd.externalOrderId,
    orderNumber: cmd.orderNumber,
    shipTo: cmd.shipTo,
    lines: (cmd.lines || []).map((l) => ({
      sku: l.sku,
      qty: l.quantity,
      title: l.title,
    })),
  }
}

module.exports = { buildDispatchLines }
