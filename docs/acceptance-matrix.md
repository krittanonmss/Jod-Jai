# Jod-Jai Acceptance Matrix

This is the release traceability matrix for the expense-first release. The detailed implementation instructions live in [plan.txt](../plan.txt). A test case is only `PASS` when its stated evidence exists; `BASELINE`, `PENDING`, `SKIPPED`, and `BLOCKED` do not pass a release gate.

## Approved scope

- Expenses first; income belongs to Phase 8.
- Personal owner plus explicitly invited friends only.
- Zero paid OCR/hosting budget; locally processed OCR is the baseline.
- Required slip fields: recipient, date/time, and amount.
- Description/category are optional. A manual expense may explicitly have no recipient.
- No user-facing recovery of deleted expenses.
- Primary amount is the transfer amount; fees are not automatically added.

## Traceability

| ID | Phase | Scenario | Expected result | Current evidence | Status |
| --- | --- | --- | --- | --- | --- |
| SCOPE-01 | 0 | Expense-only release | No income/balance claim in supported flows | Approved decision D01 | PASS |
| SCOPE-02 | 0 | Invited-user product | Access remains owner/member based | Approved decision D02 | PASS |
| SCOPE-03 | 0 | Zero-cost constraint | No paid dependency selected; capacity measured before release | D03/D04 approved; capacity audit pending | PENDING |
| SCOPE-04 | 0 | Required fields | Amount, Bangkok timestamp, recipient only; no required description | D03 approved; app/SQL still require description | BASELINE FAILURE |
| SCOPE-05 | 0 | Deletion policy | Explicit delete confirmation; no user restore flow after implementation | D05 approved; current recovery remains | BASELINE GAP |
| EVT-01 | 1 | Duplicate webhook | Exactly one business effect | `jod_accept_event` regression: duplicate receipt is not reinserted and does not consume another rate allowance | PASS (DB) |
| EVT-02 | 1 | Image then immediate answer | Answer binds to the correct newly-created draft | All authorized events enter the same FIFO per-user queue; SQL queue regression proves the ordering policy | PASS (design + DB) |
| EVT-03 | 1 | Queue acceptance failure | No durable-success acknowledgement before acceptance | Image acknowledgement is claimed only after atomic durable receipt; SQL regression verifies pending acknowledgement state | PASS (DB) |
| EVT-04 | 1 | Commit then delivery failure | One saved expense after retry; no repeat mutation | Response is persisted before push; mutation RPC replay and stable push retry key are covered by DB/unit design checks | PASS (DB/unit) |
| EVT-05 | 1 | Invalid Flex | Plain-text fallback without a new mutation | Unit regression converts saved Flex `altText` to text; 14 message variants validate against LINE | PASS |
| EVT-06 | 1 | Persisted invalid response | Targeted response regeneration works | `npm run repair:responses` previews scoped pending/dead candidates; `--apply` replaces only saved presentation and requeues without business execution | PASS (tooling) |
| EVT-07 | 1 | Rate-limit boundary | Intentional Thai notice, duplicate delivery does not overcount | Atomic receipt/rate SQL regression covers first limit notice and duplicate non-consumption; result travels through durable delivery | PASS (DB) |
| EVT-08 | 1 | Expired job lease | Reclaim works and stale worker cannot finish newer lease | DB regression proves reclaim, cross-user progress, and old lease-token finalization rejection | PASS (DB) |
| EVT-09 | 1 | Reply timeout/unknown acceptance | Outcome recorded and no unsafe duplicate promise | Timeout is classified as uncertain; push retries use a stable key, while expired reply-token ack is reclaimed as push | PASS (unit/design) |
| EVT-10 | 1/6 | Unauthorized/revoked user | No mutation or private disclosure | Authorization occurs before acceptance; worker rechecks authorization, and smoke/DB tests cover denial | PASS (DB/smoke) |
| OCR-01 | 2 | MAKE amount/date/time/recipient | Exact values match visual ground truth | Pilot: 5/5 amount, 4/5 timestamp, 5/5 payee present. One timestamp returns unknown rather than an ID-derived value. | PASS WITH PILOT EXCEPTION |
| OCR-02 | 2 | Bangkok Bank essential fields | Exact values and recipient excludes Biller ID/reference | Pilot: 4/4 amount, timestamp, payee present; Biller ID/reference exclusion is covered by parser regression. | PASS WITH PILOT EXCEPTION |
| OCR-03 | 2 | SCB mixed-script recipient/date/time | Exact values and destination-name selection | Pilot: 4/4 amount, timestamp, payee present; mixed-script Manee Shop handling has parser coverage. | PASS WITH PILOT EXCEPTION |
| OCR-04 | 2 | Paotang amount/date/time/recipient | Exact values and net subsidy preserved | Pilot: 9/9 amount after labeled-payment crop, 8/9 timestamp, 9/9 payee present. One timestamp returns unknown. | PASS WITH PILOT EXCEPTION |
| OCR-05 | 2 | Unsupported bank/image | Clear correction guidance, no invented record | 2 Krungthai images detect as unsupported | PARTIAL |
| OCR-06 | 2 | OCR performance | Provider-level warm/cold measurements and samples | Warm local pilot median 1.6–2.0s and p95 1.9–2.4s per image by provider. No production latency claim. | PASS WITH PILOT EXCEPTION |
| EXP-01 | 3 | Complete slip with no note | Review/confirm works without description | Domain and SQL regression confirm three-field confirmation. | PASS |
| EXP-02 | 3 | Missing essential data | Only missing amount/date/payee is requested | Domain review now treats recipient—not description—as essential. | PASS |
| EXP-03 | 3 | Manual unspecified recipient | Valid confirmation without invented payee/description | Manual flow stores explicit `ไม่ระบุ`; SQL accepts optional description. | PASS |
| EXP-04 | 3 | Legacy optional-field draft | No dead end from old edit field | Migration clears legacy description edit fields. | PASS |
| EXP-05 | 3 | Stale/concurrent actions | No overwrite or double total | Versioned SQL mutations and stale/replay regression. | PASS |
| EXP-06 | 3 | Bulk 1/2/10/21+ | Per-record idempotency and truthful partial result | Bulk child keys include parent event, action, draft ID, and version. | PASS |
| EXP-07 | 3 | Pending selection/pagination | Every draft reachable; displayed selection is stable | Page command plus short-code addressing; ten-card carousel is no longer presented as the full list. | PASS |
| EXP-08 | 3/6 | Delete/clear race | No resurrection from older queued work | Soft deletion and ordered worker processing protect current lifecycle; operational retention remains Phase 6. | PASS (Phase 3 scope) |
| REP-01 | 4 | Ledger inclusion | Draft/cancelled/deleted never included | Existing draft/confirmed summary tests only | PARTIAL |
| REP-02 | 4 | Bangkok boundary | Day/month reports use correct [from, until) interval | Date parser tests exist; report boundary test missing | PENDING |
| REP-03 | 4 | Total/category reconciliation | Headline equals categories/reference ledger to one satang | No reference-ledger test | PENDING |
| REP-04 | 4 | Report payloads | Empty/long states validate in LINE | Current key cards validate after a9b4444; full factory coverage missing | PARTIAL |
| UX-01 | 5 | Main journeys | Slip, manual, overview finish without guessing commands | Rich menu has four main entries; journey review missing | PENDING |
| UX-02 | 5 | Truthful copy | No income, restore, bank-verification, or unlimited-free promise | README/help recovery wording remains | BASELINE GAP |
| DATA-01 | 6 | CSV completeness | All selected rows beyond DB API page limit | One-query export; no large test | PENDING |
| DATA-02 | 6 | Export access | Token expiration/revoke/clear behavior is intentional | Invalid token smoke only | PARTIAL |
| DATA-03 | 6 | Cross-user isolation | Queries, RPCs, export, replay, and suggestions isolated | Existing DB cross-user mutation/summary checks | PARTIAL |
| DATA-04 | 6 | Free-tier capacity | Measured usage fits dated provider limits and backpressure exists | Provider limits recorded; account usage/thresholds pending | PENDING |
| REL-01 | 7 | Integrated release | All applicable required cases pass | Not started | PENDING |
| REL-02 | 7 | Production acceptance | Deployment, real LINE journeys, rollback evidence | Prior smoke only | PENDING |

## Baseline test commands

| Command | Scope and side effects | Baseline result, 2026-09-26 |
| --- | --- | --- |
| `npm run typecheck` | Local read/compile check | PASS |
| `npm test` | Local domain/OCR tests; OCR fixtures available in this workspace | PASS: 2 test files, 0 failures, 0 skips |
| `npm run test:db` | Uses configured Supabase database inside SQL transaction; test data rolls back | PASS; target must be checked before every run |
| `node --import tsx scripts/test-flow.ts` | Writes temporary DB rows, reads private fixture, calls export endpoint, then cleans up | PASS after updating stale-copy assertion; no LINE messages sent |
| `node --import tsx scripts/validate-line.ts` | Remote LINE schema validation, no chat send | PASS: 14 variants covering overview, review, edit, pending, delete, export, menus, long text, and empty states |
| `npm run build` | Local production build | PASS |

## Completion rule

Update this matrix with concrete evidence: command, fixture ID/sample count, timestamp, and relevant result. Do not convert a `PARTIAL` or `PENDING` row to `PASS` because a neighboring test passes.
