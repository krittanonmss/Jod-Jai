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
| EVT-02 | 1 | Image then immediate answer | Answer binds to the correct newly-created draft | All authorized events now use the FIFO per-user queue; end-to-end event ordering test remains | PARTIAL |
| EVT-03 | 1 | Queue acceptance failure | No durable-success acknowledgement before acceptance | Image acknowledgement is claimed only after atomic durable receipt; SQL regression verifies pending acknowledgement state | PASS (DB) |
| EVT-04 | 1 | Commit then delivery failure | One saved expense after retry; no repeat mutation | Partial saved-response design exists; fault test missing | PENDING |
| EVT-05 | 1 | Invalid Flex | Plain-text fallback without a new mutation | Flex incident fixed in a9b4444; fallback test missing | PENDING |
| EVT-06 | 1 | Persisted invalid response | Targeted response regeneration works | One prior incident manually repaired | PENDING |
| EVT-07 | 1 | Rate-limit boundary | Intentional Thai notice, duplicate delivery does not overcount | Atomic receipt/rate SQL regression covers first limit notice and duplicate non-consumption; remote delivery behavior remains to test | PARTIAL |
| EVT-08 | 1 | Expired job lease | Reclaim works and stale worker cannot finish newer lease | Existing lease-reclaim regression plus lease-token conditional writes; acknowledgement reclaim added | PARTIAL |
| EVT-09 | 1 | Reply timeout/unknown acceptance | Outcome recorded and no unsafe duplicate promise | No test | PENDING |
| EVT-10 | 1/6 | Unauthorized/revoked user | No mutation or private disclosure | DB owner/member checks and smoke denied-user check | PARTIAL |
| OCR-01 | 2 | MAKE amount/date/time/recipient | Exact values match visual ground truth | 5 private candidates; values not all ground-truthed | PENDING |
| OCR-02 | 2 | Bangkok Bank essential fields | Exact values and recipient excludes Biller ID/reference | 4 private candidates; one visually verified | PENDING |
| OCR-03 | 2 | SCB mixed-script recipient/date/time | Exact values and destination-name selection | 4 private candidates; one visually verified | PENDING |
| OCR-04 | 2 | Paotang amount/date/time/recipient | Exact values and net subsidy preserved | 9 private candidates; one extraction failure | PENDING |
| OCR-05 | 2 | Unsupported bank/image | Clear correction guidance, no invented record | 2 Krungthai images detect as unsupported | PARTIAL |
| OCR-06 | 2 | OCR performance | Provider-level warm/cold measurements and samples | Local detection-only run recorded in baseline | BASELINE |
| EXP-01 | 3 | Complete slip with no note | Review/confirm works without description | Current TypeScript and SQL reject it | BASELINE FAILURE |
| EXP-02 | 3 | Missing essential data | Only missing amount/date/payee is requested | Current description may be requested | BASELINE FAILURE |
| EXP-03 | 3 | Manual unspecified recipient | Valid confirmation without invented payee/description | No test | PENDING |
| EXP-04 | 3 | Legacy optional-field draft | No dead end from old edit field | No test | PENDING |
| EXP-05 | 3 | Stale/concurrent actions | No overwrite or double total | Existing stale/replay DB test | PARTIAL |
| EXP-06 | 3 | Bulk 1/2/10/21+ | Per-record idempotency and truthful partial result | Known event-key risk; no batch test | PENDING |
| EXP-07 | 3 | Pending selection/pagination | Every draft reachable; displayed selection is stable | Query is capped at 20, carousel at 10 | BASELINE RISK |
| EXP-08 | 3/6 | Delete/clear race | No resurrection from older queued work | No test | PENDING |
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
| `node --import tsx scripts/validate-line.ts` | Remote LINE schema validation, no chat send | PASS for existing review/edit/question coverage; full matrix still pending Phase 1 |
| `npm run build` | Local production build | PASS |

## Completion rule

Update this matrix with concrete evidence: command, fixture ID/sample count, timestamp, and relevant result. Do not convert a `PARTIAL` or `PENDING` row to `PASS` because a neighboring test passes.
