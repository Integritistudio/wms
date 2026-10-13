# Optional backend integration

These files are saved for later integration only. The main backend is unchanged and continues running local routing. Starting this service does not connect it to the backend.

When ready to integrate:

1. Stop routing settings/rule writes and run the optional migration described in the service README.
2. Copy `backend/routing/client.js`, `service.js`, `metadata.js`, and `inventoryService.js` into `wms-app-backend/src/modules/routing`. This replaces its routing service with the HTTP adapter while keeping stock mutation in the backend.
3. Add these entries to the backend's environment schema in `src/config/env.js`:

```js
ROUTING_MS_BASE_URL: z.string().optional().default("http://127.0.0.1:8723"),
ROUTING_MS_SECRET: z.string().optional().default(""),
ROUTING_MS_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
```

4. Add these fields to its exported environment object:

```js
routingMsBaseUrl: String(parsed.ROUTING_MS_BASE_URL || "").replace(/\/+$/, ""),
routingMsSecret: String(parsed.ROUTING_MS_SECRET || "").trim(),
routingMsTimeoutMs: parsed.ROUTING_MS_TIMEOUT_MS,
```

5. Set the service URL and matching signing secret in the backend environment, start this service, confirm `/ready`, and restart backend instances and consumers.
6. Adapt backend smoke fixtures to write configs and rules through the routing adapter rather than the old local model files. Verify routing and order allocation before restoring traffic.

The adapter derives tenant scope from the company ID passed by the authenticated backend routes, filters snapshots by tenant and store connections, and never sends warehouse credentials. Missing or unavailable service configuration returns an error; the optional adapter has no local routing fallback.

These integration steps have not been applied. No live data has been migrated.
