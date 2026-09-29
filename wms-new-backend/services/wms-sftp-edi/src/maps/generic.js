'use strict'

/** Partner-specific EDI map stub — copy this file to maps/<key>.js and customize. */
function build940(cmd) {
  const lines = (cmd.lines || [])
    .map((l, i) => `W01*${l.quantity}*EA*${l.sku || 'SKU'}*LN${i + 1}~`)
    .join('\n')
  return [
    `ST*940*0001~`,
    `W05*N*${cmd.orderNumber || cmd.externalOrderId}~~`,
    lines,
    `SE*${2 + (cmd.lines || []).length}*0001~`,
  ].join('\n')
}

module.exports = { build940 }
