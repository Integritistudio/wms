# Orders & Shipments retest - 11 November 2026

Reviewed all 68 cases supplied in the attachment. This report is a local verification record, not a demo-dev end-to-end sign-off.

## Execution limits

- Browser access host unavailable. Native Chrome access approval timed out; no browser interactions or live tenant mutations were completed.
- No deployment was made. No live Shopify fulfillment, delivery, return, audit service, database, S3 download or warehouse assignment was exercised.
- Tests use service dependency doubles, generated EDI fixtures, actual React server rendering, route validation and selected actual UI handlers/effects. They do not replace browser, database or external-service testing.
- Historical bad tracking, shipments, financial records and demo orders were not changed.

## Findings fixed in this review

- Rapid store/warehouse filter changes now derive each URL update from the latest router search state.
- The list and detail order badge share status labels; shipment/routing state is shown separately.
- Audit log lookup now gets company ID from the owning shop instead of a nonexistent order field.
- Return reason is required; duplicate active returns are rejected; a recorded shipment is required before creating a return.
- Uploaded 945 files distinguish W06 date from shipment ID, read N9 CN tracking and standard W12 quantities, and validate SKUs and quantities before shipping. Partial-path files receive an explicit split-allocation error rather than silently shipping the entire path.
- Unsupported file extensions and empty files are rejected; wildcard accept attributes removed. Generated sample 945 uses the corrected layout and its default UPS tracking has the supported length.

## Repeatable checks

From `wms-app-backend`: `npm.cmd run test:orders` runs eight local suites (including the frontend fixture suite, which needs frontend dependencies installed).

From `wms-admin-dash`: `npm.cmd run build` and `node node_modules/typescript/bin/tsc --noEmit --pretty false`.

All eight local suites passed. Frontend production build and TypeScript check passed. Changed backend JavaScript syntax checks and `git diff --check` passed.

## Case-by-case result

Every row still needs a deployed browser/integration retest for final QA acceptance. ?Local checks passed? refers only to the evidence named below; it is not the old sheet?s Pass/Fail status.

| Case | Title | Local result | Evidence / remaining verification |
| --- | --- | --- | --- |
| TC-001 | Orders list loads with KPI cards and table | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-002 | KPI cards match status tab counts | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-003 | Tab counts add up to total | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-005 | Received tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-006 | Allocated tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-007 | Partial tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-008 | Fulfilled tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-009 | Return tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-010 | In transit tab filter | Local checks passed; live pending | Transit-filter suite: terminal/returned paths excluded; shop/warehouse scope and pagination checked. |
| TC-011 | On hold tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-012 | Error tab filter | Local checks passed; live pending | List fixture tests: total, exclusive status counts and KPI totals; UI state reviewed. |
| TC-014 | Invalid status in URL | Local checks passed; live pending | Frontend route validation: invalid status falls back to All. |
| TC-015 | Search by exact order number | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-016 | Search by partial order number | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-017 | Search by customer name | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-018 | Search is case-insensitive | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-019 | Search trims leading/trailing spaces | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-020 | Search with Shopify-style '#' prefix | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-021 | Search with no match | Local checks passed; live pending | Frontend rendering: active search uses No matching orders; cleared search uses No orders yet. |
| TC-022 | Search by SKU | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-023 | XSS payload in search | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-024 | Regex / NoSQL injection in search | Local checks passed; live pending | Search suite: exact/partial/name/SKU, case, whitespace, hash prefix and literal injection payloads checked. |
| TC-025 | Search persisted on Back navigation / URL | Local checks passed; live pending | Route/reducer tests retain q through URL updates; actual browser Back pending. |
| TC-026 | Filter by warehouse | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-027 | Filter by Unassigned warehouse | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-028 | Filter by store | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-029 | Store / warehouse+C26+C28 | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-030 | Filters+B29 | Local checks passed; live pending | Rapid sequential filter-handler test preserves latest store + warehouse + status + query. Request-id stale-response guard reviewed; real response timing pending. |
| TC-031 | Clear button resets all filters | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-032 | Filter combined with status tab | Local checks passed; live pending | List service fixtures and frontend URL handlers check intersections, unassigned, scope and clearing. |
| TC-033 | Sort by Order ascending/descending | Local checks passed; live pending | Sorting suite: ascending/descending across pages, numeric order numbers, status, displayed carrier fallback, scope and tie-breaks. aria-sort reviewed. |
| TC-034 | Sort applies across all pages | Local checks passed; live pending | Sorting suite: ascending/descending across pages, numeric order numbers, status, displayed carrier fallback, scope and tie-breaks. aria-sort reviewed. |
| TC-035 | Sort by Status / Carrier | Local checks passed; live pending | Sorting suite: ascending/descending across pages, numeric order numbers, status, displayed carrier fallback, scope and tie-breaks. aria-sort reviewed. |
| TC-036 | Next / Previous page | Local checks passed; live pending | List pagination fixtures and rendered controls: 25/50 rows, ranges and disabled Next/Previous boundaries. |
| TC-037 | Rows per page 50 / 25 | Local checks passed; live pending | List pagination fixtures and rendered controls: 25/50 rows, ranges and disabled Next/Previous boundaries. |
| TC-038 | Page number in URL | Local checks passed; live pending | Route page validation plus pagination callback tests preserve page=2. Actual browser reload pending. |
| TC-039 | Refresh orders button | Reviewed; live pending | Refresh handler reviewed: load + four KPI requests; filter/sort state retained. Live network count pending. |
| TC-040 | Open order detail from list | Local checks passed; live pending | Detail rendered with fixtures: journey, manifest, financials, live log and dates. |
| TC-041 | Invalid / non-existent order ID | Reviewed; live pending | Missing-order catch and Back link reviewed; live invalid-ID routes not executed. |
| TC-042 | Status label consistent list vs detail | Local checks passed; live pending | Shared orderStatusLabel used in list and detail badge. Rendered Error and Fulfilled checked; shipment/routing state separately labelled. |
| TC-043 | Error reason shown & logged | Local checks passed; live pending | Backend QA: audit lookup uses owning shop company; saved errors visible; duplicate snapshot event suppressed. Allocation failure event writes reviewed. |
| TC-044 | Financials are consistent | Source data pending | Rendered financial fixtures: Shopify discount counted once and recorded mismatch flagged. Actual 1047 amounts require source-data verification; no amounts fabricated. |
| TC-045 | Refresh button on detail | Local checks passed; live pending | Effect-level check: embedded fulfillment panel makes zero additional requests; standalone panel fetches once. |
| TC-046 | Action buttons disabled in correct states | Local checks passed; live pending | Rendered shipping locks plus backend service rejection of error/unassigned orders; whitespace tracking validation checked. |
| TC-047 | Ship with empty tracking | Local checks passed; live pending | Rendered tracking input is required. Native browser validation/no-request behavior pending. |
| TC-048 | Ship with whitespace-only tracking on ERROR order | Local checks passed; live pending | Rendered shipping locks plus backend service rejection of error/unassigned orders; whitespace tracking validation checked. |
| TC-049 | Ship with HTML / special characters (XSS) | Local checks passed; live pending | Tracking validator rejects HTML, whitespace and short tracking; common UPS/FedEx/USPS/DHL formats checked. Historical invalid tracking was not rewritten. |
| TC-050 | Order status after manual Ship | Local checks passed; live pending | Manual service fixture creates legacy fulfillment path and dispatches through shipment creation; rendered labeled shipment appears in manifest and is not Delivered. |
| TC-051 | Carrier field pre-filled value | Local checks passed; live pending | Rendered carrier input is blank even when order contains a carrier; both shipping forms reviewed. |
| TC-052 | Tracking number format validation | Local checks passed; live pending | Tracking validator rejects HTML, whitespace and short tracking; common UPS/FedEx/USPS/DHL formats checked. Historical invalid tracking was not rewritten. |
| TC-053 | Ship disabled after return created | Local checks passed; live pending | Rendered return-state/explicit return locks and backend return rejection checks. Live return sequence pending. |
| TC-054 | Save warehouse assignment | Live 503 investigation pending | Assignment handler reviewed: inline error + toast; reload persisted server state after failure. Actual demo-dev 503 cause not reproduced. |
| TC-055 | Save disabled until selection changes | Reviewed; live pending | Save disabled condition reviewed against selected and persisted warehouse. Browser interaction pending. |
| TC-056 | Create return without reason | Local checks passed; live pending | Backend rejects empty/whitespace return reason; frontend validates before confirmation and submission. |
| TC-057 | Prevent duplicate return | Local checks passed; live pending | Backend QA rejects duplicate active return; branch-aware UI eligibility reviewed. |
| TC-058 | Create return enabled only after shipment | Local checks passed; live pending | Backend requires recorded non-pending shipment; frontend Create return eligibility now uses shipments rather than fulfilled label alone. |
| TC-059 | Mark Returned from shipment manifest | Reviewed; live pending | Returned status parsing and shipment-to-return code reviewed; actual RMA/Shopify transition pending. |
| TC-060 | Upload invalid 945 (plain text) | Local checks passed; live pending | Parser negative checks plus empty-file/type checks reviewed in upload hook and multipart reader. Real multipart request pending. |
| TC-061 | Upload empty 945 file | Local checks passed; live pending | Parser negative checks plus empty-file/type checks reviewed in upload hook and multipart reader. Real multipart request pending. |
| TC-062 | Upload valid X12 945 | Local checks passed; live pending | 945 fixtures: W06 date separated, N9 CN wins over package id, W12 shipped quantities read; unknown/oversized/partial-path quantities rejected before shipping. |
| TC-063 | File type restriction | Local checks passed; live pending | Rendered accept list restricts edi/txt/json; client and company upload handler enforce filename/empty checks. |
| TC-064 | Download 940 / Sample 945 | Download integration pending | Generated 940 and sample 945 contents/round-trip checked. Browser downloads and stored-file/S3 link delivery not executed. |
| TC-065 | Mark In transit | Reviewed; live pending | Transit/delivery status parsing checked; status-change confirmation placement reviewed. Actual endpoint, event logging and Shopify sync pending. |
| TC-066 | Skip stage (Transit -> Delivered) | Reviewed; live pending | Transit/delivery status parsing checked; status-change confirmation placement reviewed. Actual endpoint, event logging and Shopify sync pending. |
| TC-067 | Confirmation for irreversible actions | Local checks passed; live pending | Ship cancellation handler check proves zero API submissions. Confirmation placement for manifest status changes and Create return reviewed; native dialog UI pending. |
| TC-068 | List shipment dots | Local checks passed; live pending | Rendered shipment dots contain no buttons; fulfillment alone does not imply delivery. |
| TC-076 | Date format includes year | Local checks passed; live pending | Rendered placed/log dates contain year; embedded ISO timestamp converted to readable local time. |
| TC-077 | Feedback after actions | Local checks passed; live pending | Ship handler checks success, API failure and Shopify partial-failure feedback. Toast moved outside operations; assignment inline feedback reviewed; visual visibility pending. |

## Reference used for EDI corrections

- [X12 4010 W06](https://www.stedi.com/edi/x12-004010/segment/W06): element 03 is shipment date; element 04 is shipment ID.
- [X12 4010 W12](https://www.stedi.com/edi/x12-004010/segment/W12): shipped quantity in element 03 and qualified product identifiers.
- [X12 4010 N9](https://www.stedi.com/edi/x12-004010/segment/N9): qualified reference identification.

## Remaining release checks

1. Deploy frontend and backend together, then run all 68 cases in the authenticated demo-dev tenant.
2. Inspect order 1047 source financials; the UI flags inconsistent data but does not manufacture a balancing subtotal or total.
3. Reproduce assignment of Test to 1109 and inspect backend/downstream logs for the 503. The updated UI reports failure and reloads persisted assignment state.
4. Verify real 940/Sample 945 download delivery, shipment creation, carrier/status events, audit log retrieval and Shopify sync using disposable test orders.
