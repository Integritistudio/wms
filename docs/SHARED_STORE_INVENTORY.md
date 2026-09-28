# Company stores and shared warehouse stock

In the company portal, open **Stores & Warehouses → Company stores**. Add a
Shopify domain, select any number of company warehouses, save, and install the
Shopify app. Each store has its own warehouse selection; a warehouse can supply
multiple stores. Company users with warehouse-management permission can use the
API; the existing warehouse page is restricted to company roots.

The available quantity of a SKU is the sum of `quantityAvailable` across the
store's active, connected warehouses. Reservations are already deducted from
that field. Stock is not copied or divided between stores. For example, X linked
to W1=3 and W2=7 publishes 10; Y linked to W2 publishes 7. Reserving two units in
W2 updates X to 8 and Y to 5.

Each store publishes its pool once, to its selected Shopify inventory location.
If Shopify has exactly one active online-fulfillment location, initialization
selects it automatically. Otherwise the company selects a location after
installation. Previously WMS-managed locations are cleared when moving the
pool. Unmanaged Shopify locations are not changed; any stock held there is
outside this integration's pool.

New company stores use `warehouseIds`. An empty array explicitly disconnects
all warehouses and publishes zero for catalog SKUs. A missing WMS SKU also
publishes zero. Existing stores without this field retain legacy mapping behavior
until configured or initialized; legacy mappings sharing a Shopify location now
sum instead of overwriting each other. The single `warehouseId` field remains
for older displays and is not the authority for pooled stores.

Orders from pooled stores reserve stock automatically on receipt, including when
legacy routing was configured for suggestions only. Ranking and partial-order
policy still apply. Automatic and manual allocation are limited to the store's
connected active warehouses. Shared-store allocations reject failed atomic
reservations and release successful reservations from that failed attempt.

Changes enqueue inventory work. A company-level queue lease serializes queued
pool updates across workers; expired jobs are reclaimed, active leases get a
heartbeat, and inventory failures retry up to eight times with exponential
backoff. Store initialization records errors for the company UI. A one-minute
repair scheduler queues pending stores and refreshes successful pools at least
every five minutes when the queue and Shopify are available. This also repairs
missed asynchronous stock-update scheduling. External Shopify synchronization
is eventually consistent, not a cross-store checkout transaction.

## Verification

Run `node --test scripts/verify-shared-store-inventory.js` from
`wms-app-backend`. Tests use the real aggregation, outbound, configuration,
allocation, and queue services with offline boundaries; they do not touch live
stores or MongoDB.

Before deployment, test with two development stores and two warehouses:

1. Link X to both warehouses and Y to W2; verify per-SKU totals.
2. Place an order that reserves W2 stock; verify both stores decrease.
3. Remove W2 from X, then remove all warehouses; verify reduced totals and zero.
4. Change the Shopify target location; verify the former WMS location is zero.
5. Stop a worker mid-job and temporarily reject Shopify API calls; verify recovery
   and visible sync errors, then restore access and verify convergence.
