# WMS order routing microservice

Standalone Fastify service with its own MongoDB database. It owns routing configs, rules, ordering, rule diagnostics, and routing decisions. It is not connected to `wms-app-backend`; the main backend continues to use its original local routing implementation. No backend configuration, routes, or smoke scripts have been changed.

The evaluator preserves the existing numeric, text, SKU, shipping, customer, inventory, AND/OR, stock-gate, ZIP-prefix, Mapbox-distance, default, and fallback logic, including its current SKU matching semantics. Auto assignment, auto SFTP delivery, and partial shipment policies are preserved as config fields for a future caller to consume. When integrating later, use the same Mapbox token as the backend to preserve distance routing.

## Run

Requires Node 22+ and MongoDB. From this directory:

```sh
npm ci
cp .env.example .env
# Set ROUTING_MS_SECRET to a random secret of at least 32 characters.
# Configure MONGODB_URI and MAPBOX_TOKEN.
npm start
```

Alternatively, `docker compose up --build -d` starts the API and a private persistent MongoDB. Copy and configure `.env` first. MongoDB is not exposed on the host. The API defaults to port 8723; `/health` is liveness and `/ready` checks database readiness.

## Optional integration later

The service can run independently now. An unwired backend adapter is saved in [integration/backend/routing](integration/backend/routing). Nothing in the main backend imports it. See [integration/README.md](integration/README.md) for the future wiring steps; setting environment variables alone does not connect the existing backend.

Use TLS or a private network between a future caller and the service. Do not expose the signing secret to browsers or tenant users.

## Tenant isolation and data boundary

A trusted caller must derive the company ID from the authenticated company member. Service requests are HMAC-SHA256 signed over method, full request path, tenant ID, timestamp, and exact body bytes. Requests expire after 60 seconds; clocks must be synchronized. A future backend integration will act as the trusted issuer for all tenants. The service is not a public end-user API.

Every config/rule read and mutation includes the signed tenant ID. Caller-supplied company IDs and IDs in mutation data cannot override ownership. Cross-tenant update, delete, reorder, warehouse defaults, order snapshots, and inventory snapshots are rejected. No mutable global tenant context or cross-request inventory cache is used.

Warehouse and inventory data are supplied by the caller. When integrating the backend, each decision must send a fresh snapshot containing only that tenant's warehouses and relevant inventory SKUs. Resolve snapshots must further restrict warehouses to the order's store connections and active warehouses. The saved optional adapter excludes warehouse credentials. The service validates snapshot ownership before evaluation. Inventory is advisory for routing; a future integration must keep final reservations atomic in fulfillment against live stock. This preserves the pre-existing check-then-reserve behavior without duplicating inventory in another database.

Rule administration can use inactive tenant warehouses, matching the original API. The test endpoint evaluates tenant rules and uses active warehouses for address ranking, matching the original diagnostics. Deleted or foreign warehouse references never become routing targets.

## Service API

All paths below have prefix `/v1/routing` and require `x-routing-tenant`, `x-routing-timestamp`, and `x-routing-signature`:

| Method/path | Body | Response |
| --- | --- | --- |
| GET `/config` | none | Original config object/defaults |
| PUT `/config` | `{data, snapshot}` | Saved config |
| GET `/rules` | none | Rules by priority then creation time |
| POST `/rules` | `{data, snapshot}` | Created rule (201) |
| PUT `/rules/:id` | `{data, snapshot}` | Updated rule |
| DELETE `/rules/:id` | none | `{deleted: true}` |
| POST `/rules/reorder` | `{orderedIds}` | Sorted rules |
| POST `/resolve` | `{order, snapshot}` | Original decision object or `null` |
| POST `/test` | `{order, snapshot}` | `{result, evaluations, metrics, config}` |

`snapshot` is `{warehouses: [...], inventory: [...]}`. IDs retain the original MongoDB ObjectId values serialized as strings. Each warehouse has `_id` and `companyId`; each inventory row has `warehouseId` and `companyId`. Readiness errors are 503, authorization errors 401, tenant snapshot violations 403, and tenant-scoped missing rules 404.

## Optional migration when integrating later

1. Stop backend API instances and background consumers that change routing settings/rules. Take a database backup.
2. Configure `SOURCE_MONGODB_URI` with the full authenticated backend URI and `MONGODB_URI` with a different, empty routing database. For Docker, run the migration in the API container so `mongo` resolves.
3. Run `npm run migrate` for validation only, then `npm run migrate -- --apply` to copy and verify.
4. The migration retains `_id`, `companyId`, warehouse references, priorities, timestamps, conditions, and all config fields. It validates tenant/warehouse references, refuses conflicting destination data, and can safely resume an interrupted copy. Source data is never changed or deleted.
5. Complete the optional adapter wiring, start the routing API, confirm `/ready`, and restart backend instances/consumers. Exercise routing config, rule editing, test routing, and order allocation before restoring traffic.

Do not edit routing settings during copying or use a destination database containing newly created defaults. An orphan or foreign warehouse reference in legacy data must be repaired before migration. Keep the source backup for rollback; reverting the backend code also requires deciding how to retain any rules changed after cutover.

## Tests

`npm test` runs routing parity, signed API, MongoDB persistence, concurrent tenant isolation, migration, and checks of the saved optional adapter. Integration tests use an ephemeral MongoDB and never connect to `.env` databases. MongoMemoryServer may download its test binary on the first run.

The parity tests read the original backend evaluator only as a reference; they do not change or connect the backend. Adapter tests load the files under this service's `integration` directory in an isolated test context.
