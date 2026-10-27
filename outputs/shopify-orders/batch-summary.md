# Shopify QA batch

Batch: WMS-QA-20261022-50. Shopify orders: 50; Linker orders: 50.

All orders are actual Shopify test orders. Hold, skip and validation-error cases are deliberate QA actions. Refund/exchange labels represent return workflow examples; no real customer funds are charged or refunded.

| Order | Scenario | Shopify | Linker | Fulfillment groups | Return | Shopify return |
|---|---|---|---|---|---|---|
| [WMS-QA-20261022-50-01](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967337042170) | fulfilled_pilot | FULFILLED | fulfilled | shipped |  |  |
| [WMS-QA-20261022-50-02](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967340187898) | received | UNFULFILLED | received |  |  |  |
| [WMS-QA-20261022-50-03](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967340286202) | received | UNFULFILLED | received |  |  |  |
| [WMS-QA-20261022-50-04](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967340318970) | received | UNFULFILLED | received |  |  |  |
| [WMS-QA-20261022-50-05](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967340384506) | 940_ready | UNFULFILLED | 940_ready | allocated |  |  |
| [WMS-QA-20261022-50-06](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967340515578) | 940_ready | UNFULFILLED | 940_ready | allocated |  |  |
| [WMS-QA-20261022-50-07](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967342874874) | 940_ready | UNFULFILLED | 940_ready | allocated |  |  |
| [WMS-QA-20261022-50-08](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967343300858) | 940_ready | UNFULFILLED | 940_ready | allocated |  |  |
| [WMS-QA-20261022-50-09](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967343857914) | 945_received | UNFULFILLED | 945_received | shipped |  |  |
| [WMS-QA-20261022-50-10](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967344120058) | 945_received | UNFULFILLED | 945_received | shipped |  |  |
| [WMS-QA-20261022-50-11](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967344578810) | partially_fulfilled | PARTIALLY_FULFILLED | partially_fulfilled | allocated, shipped |  |  |
| [WMS-QA-20261022-50-12](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967345070330) | partially_fulfilled | PARTIALLY_FULFILLED | partially_fulfilled | allocated, shipped |  |  |
| [WMS-QA-20261022-50-13](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967345430778) | partially_fulfilled | PARTIALLY_FULFILLED | partially_fulfilled | allocated, shipped |  |  |
| [WMS-QA-20261022-50-14](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967345725690) | fulfilled | FULFILLED | fulfilled | shipped |  |  |
| [WMS-QA-20261022-50-15](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967346217210) | fulfilled | FULFILLED | fulfilled | shipped |  |  |
| [WMS-QA-20261022-50-16](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967346708730) | fulfilled | FULFILLED | fulfilled | shipped |  |  |
| [WMS-QA-20261022-50-17](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967347003642) | fulfilled | FULFILLED | fulfilled | shipped |  |  |
| [WMS-QA-20261022-50-18](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967347560698) | cancelled | CANCELLED | cancelled |  |  |  |
| [WMS-QA-20261022-50-19](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967347953914) | cancelled | CANCELLED | cancelled |  |  |  |
| [WMS-QA-20261022-50-20](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967348314362) | cancelled | CANCELLED | cancelled |  |  |  |
| [WMS-QA-20261022-50-21](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967348740346) | ignored | UNFULFILLED | ignored |  |  |  |
| [WMS-QA-20261022-50-22](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967349199098) | ignored | UNFULFILLED | ignored |  |  |  |
| [WMS-QA-20261022-50-23](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967349657850) | error | UNFULFILLED | error | allocated |  |  |
| [WMS-QA-20261022-50-24](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967350116602) | error | UNFULFILLED | error | allocated |  |  |
| [WMS-QA-20261022-50-25](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967350542586) | error | UNFULFILLED | error | allocated |  |  |
| [WMS-QA-20261022-50-26](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967351263482) | on_hold | UNFULFILLED | on_hold | on_hold |  |  |
| [WMS-QA-20261022-50-27](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967351755002) | on_hold | UNFULFILLED | on_hold | on_hold |  |  |
| [WMS-QA-20261022-50-28](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967352344826) | on_hold | UNFULFILLED | on_hold | on_hold |  |  |
| [WMS-QA-20261022-50-29](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967353000186) | picking | UNFULFILLED | 940_ready | picking |  |  |
| [WMS-QA-20261022-50-30](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967353393402) | picking | UNFULFILLED | 940_ready | picking |  |  |
| [WMS-QA-20261022-50-31](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967353950458) | picked | UNFULFILLED | 940_ready | picked |  |  |
| [WMS-QA-20261022-50-32](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967354573050) | picked | UNFULFILLED | 940_ready | picked |  |  |
| [WMS-QA-20261022-50-33](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967354835194) | packing | UNFULFILLED | 940_ready | packing |  |  |
| [WMS-QA-20261022-50-34](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967355097338) | packing | UNFULFILLED | 940_ready | packing |  |  |
| [WMS-QA-20261022-50-35](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967355588858) | packed | UNFULFILLED | 940_ready | packed |  |  |
| [WMS-QA-20261022-50-36](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967356244218) | packed | UNFULFILLED | 940_ready | packed |  |  |
| [WMS-QA-20261022-50-37](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967356670202) | return_requested | FULFILLED | partially_returned | shipped | requested | OPEN |
| [WMS-QA-20261022-50-38](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967357063418) | return_authorized | FULFILLED | partially_returned | shipped | authorized | OPEN |
| [WMS-QA-20261022-50-39](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967357784314) | return_in_transit | FULFILLED | partially_returned | shipped | in_transit | OPEN |
| [WMS-QA-20261022-50-40](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967358111994) | return_received | FULFILLED | partially_returned | shipped | received | OPEN |
| [WMS-QA-20261022-50-41](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967358931194) | return_inspected | FULFILLED | partially_returned | shipped | inspected | OPEN |
| [WMS-QA-20261022-50-42](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967359258874) | return_restocked | FULFILLED | returned | shipped | restocked | CLOSED |
| [WMS-QA-20261022-50-43](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967359881466) | return_refurbished | FULFILLED | partially_returned | shipped | refurbished | CLOSED |
| [WMS-QA-20261022-50-44](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967360340218) | return_damaged | FULFILLED | partially_returned | shipped | damaged | CLOSED |
| [WMS-QA-20261022-50-45](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967360602362) | return_quarantined | FULFILLED | partially_returned | shipped | quarantined | CLOSED |
| [WMS-QA-20261022-50-46](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967360995578) | return_disposed | FULFILLED | partially_returned | shipped | disposed | CLOSED |
| [WMS-QA-20261022-50-47](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967361454330) | return_scrapped | FULFILLED | partially_returned | shipped | disposed | CLOSED |
| [WMS-QA-20261022-50-48](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967361716474) | return_refunded | FULFILLED | returned | shipped | refunded | CLOSED |
| [WMS-QA-20261022-50-49](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967362109690) | return_exchanged | FULFILLED | returned | shipped | exchanged | CLOSED |
| [WMS-QA-20261022-50-50](https://admin.shopify.com/store/wms-dev-bcd2dcrd/orders/18967362437370) | return_cancelled | FULFILLED | fulfilled | shipped | cancelled | CANCELED |
