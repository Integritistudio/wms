# WMS Linker — Progress

## Architecture

| Layer | Stack | Port |
|-------|-------|------|
| Backend API | Fastify 5, MongoDB Atlas | 3000 |
| Admin Dashboard | TanStack Start (Vite + React 19) | 5173 |
| Shopify App | OAuth connector (`wms-app/`) | — |

---

## What's Built

### 1. Multi-tenant Companies

- Platform admin creates companies (name, root email, phone, notes).
- Invite email or copy-paste URL to set password.
- Company statuses: `invited → active → disabled`.
- One company → many Shopify stores + many warehouses.
- Shops without a `companyId` appear as "unassigned" on the platform console.

### 2. Company Members & Auth

- `company_members` collection with roles: **root | member | warehouse**.
- Warehouse users must be assigned ≥1 warehouse; they only see orders for those warehouses.
- Invite, resend invite, forgot password, reset password flows.
- JWT audience `company` with `{ sub, companyId, role, email, name, warehouseIds }`.
- Legacy tokens (`sub = companyId`, no role) treated as root.

### 3. Warehouses

- A company can have **multiple warehouses**.
- Each warehouse can optionally reference a **named SFTP connection** (`sftpConnectionId`).
- Multiple warehouses can share the same SFTP connection, or each can use its own.
- Fields: name, code, address, sftpConnectionId, isActive.

### 4. SFTP Connections

- Stored in `sftp_connections` collection (per company).
- Fields: name, enabled, host, port, username, passwordEncrypted (AES-256-GCM), remotePath.
- CRUD: create, update, test connection.
- Migration: existing company-level `sftp` config is auto-migrated to a "Default" connection and attached to all warehouses on first access.

### 5. Order Pipeline

1. Shopify webhook → persist in `webhook_events` (deduped by `X-Shopify-Webhook-Id`) → process.
2. `orders/create` → canonical order + X12 940 + file link. **SFTP does NOT auto-push on ingest.**
3. A company user **assigns a warehouse** to the order (`PATCH /company/orders/:id/warehouse`).
4. On assignment: if warehouse has an enabled SFTP connection → 940 is uploaded automatically.
5. "Send 940" button retries SFTP delivery for already-assigned orders.
6. `orders/cancelled` marks order cancelled.
7. Unknown/disabled shops → 200 ignore.

### 6. 945 Shipment Closure

- File upload (X12, JSON, or `TRACKING:` text) or tracking+carrier form.
- Shopify `fulfillmentCreate` runs only if shop is installed and order is not demo.
- Sample 945 download for testing.

### 7. Demo / Simulation

- Platform can simulate an order on any shop (demo source).
- Local 940→945 loop without Shopify fulfillment for uninstalled shops.

### 8. Webhook Event Store

- All Shopify webhooks persisted before processing.
- Replay from shop detail page.
- Topics: `orders/create`, `orders/cancelled`, `app/uninstalled`, GDPR compliance.

### 9. File Links

- 940 files stored (Cloudflare R2 or local disk fallback).
- Password-protected download links (optional).
- Email link to recipient (optional SMTP).

### 10. Platform Console

- Secret path (`/$consolePath`, default `c-7f3k91qx`).
- Companies list, create, detail.
- Attach Shopify stores with optional warehouse assignment.
- Add warehouses, manage uploaders, simulate orders, replay webhooks.

### 11. Shopify App Integration

- Fastify OAuth flow + HMAC verification.
- `shopify.app.toml` with Cloudflare tunnel URL.
- Fulfillment via `fulfillmentCreate` (not V2).

---

## UI (Dashboard)

### Professional Sidebar Layout

- **AppShell** component: dark sidebar, orange accent (`#ff5a1f`), avatar, sign-out.
- Responsive: collapses behind hamburger on mobile.
- Applied to company portal, platform console, and warehouse uploader.

### Auth Screens

- **AuthLayout** + **AuthScreen**: split-panel (dark branded left, warm form right).
- Consistent across all login, invite, forgot, and reset pages.
- Fonts: Fraunces (display) + Plus Jakarta Sans (body).

### Company Portal (`/account`)

| Tab | Description |
|-----|-------------|
| Orders | Assign warehouse via dropdown, see SFTP status, ship, upload 945 |
| Users | Invite members/warehouse users, resend invite, password reset |
| Warehouses | Add warehouse with SFTP picker, change SFTP per warehouse inline |
| SFTP | Create/edit/test named connections |

### Platform Console (`/$consolePath`)

- Companies table with Open link.
- Company detail: root access, warehouses, stores (enable/disable, orders link).
- Shop detail: demo order, uploaders, orders table, webhook events + replay.

### Warehouse Uploader (`/u`)

- Orders table with ship/upload actions.
- Only sees orders assigned to their warehouse(s).

---

## Key Backend Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/platform/auth/login` | — | Platform admin login |
| POST | `/company/auth/login` | — | Company user login |
| POST | `/company/auth/forgot-password` | — | Forgot password |
| POST | `/company/auth/reset-password` | — | Reset password |
| GET | `/company/me` | company | Session info |
| GET | `/company/orders` | company | List orders (role-scoped) |
| PATCH | `/company/orders/:id/warehouse` | company (non-warehouse) | Assign warehouse + SFTP push |
| POST | `/company/orders/:id/ship` | company | Record shipment |
| POST | `/company/orders/:id/945` | company | Upload 945 file |
| POST | `/company/warehouses` | company root | Add warehouse |
| PATCH | `/company/warehouses/:id` | company root | Update warehouse |
| GET | `/company/sftp-connections` | company root | List SFTP connections |
| POST | `/company/sftp-connections` | company root | Create SFTP connection |
| PATCH | `/company/sftp-connections/:id` | company root | Update SFTP connection |
| POST | `/company/sftp-connections/:id/test` | company root | Test SFTP connection |
| POST | `/platform/companies` | platform | Create company |
| POST | `/platform/companies/:id/shops` | platform | Attach store |
| POST | `/platform/companies/:id/warehouses` | platform | Add warehouse |

---

## Data Model Summary

```
Company
 ├── CompanyMember[] (root | member | warehouse)
 ├── Warehouse[] (each has optional sftpConnectionId)
 ├── SftpConnection[] (named, shared across warehouses)
 └── Shop[] (Shopify stores, each assigned to a warehouse)

Order
 ├── shopId
 ├── warehouseId (user-assigned)
 ├── status: received → 940_ready → 945_received → fulfilled
 ├── sftpStatus: skipped | sent | failed
 └── fileLink (940 download)
```

---

## Local Development

```bash
# Backend
cd wms-app-backend
npm run dev          # port 3000, nodemon

# Dashboard
cd wms-admin-dash
npm run dev          # port 5173, Vite

# URLs
http://localhost:5173/account/login        # Company login
http://localhost:5173/c-7f3k91qx/login    # Platform login
http://localhost:5173/u/login              # Uploader login
```

---

## What's NOT Built Yet (from vision.md)

- AWS infrastructure (EventBridge, SQS, Step Functions, Redis)
- Inventory allocation / split-move logic
- Inventory CAS (compare-and-swap)
- Multi-region / Plus architecture
- Rate limiting beyond basic login throttle
- Audit trail / activity log
- Billing / usage metering
- Customer-facing tracking page
