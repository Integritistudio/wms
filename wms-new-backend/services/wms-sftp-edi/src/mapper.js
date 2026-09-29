'use strict'

/**
 * EDI map plugins — add maps/<key>.js and set warehouse wmsConfig.mappingKey.
 */
function build940(cmd, mappingKey = 'generic') {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const custom = require(`./maps/${mappingKey}`)
    if (typeof custom.build940 === 'function') return custom.build940(cmd)
  } catch {
    /* fall through to generic */
  }
  const lines = (cmd.lines || [])
    .map((l, i) => `W01*${l.quantity}*EA*${l.sku || 'SKU'}*LN${i + 1}~`)
    .join('\n')
  return [
    `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *${mappingKey}*U*00401*000000001*0*P*>~`,
    `GS*OW*SENDER*RECEIVER*20260101*1200*1*X*004010~`,
    `ST*940*0001~`,
    `W05*N*${cmd.orderNumber || cmd.externalOrderId}~~`,
    lines,
    `SE*${3 + (cmd.lines || []).length}*0001~`,
    `GE*1*1~`,
    `IEA*1*000000001~`,
  ].join('\n')
}

module.exports = { build940 }
