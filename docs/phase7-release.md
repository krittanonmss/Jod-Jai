# Phase 7 release evidence

Status on 2026-09-26: automated acceptance, compatibility, capacity, and exact-commit production deployment pass. Genuine LINE journey acceptance and the bounded pilot remain open; they are not replaced by synthetic webhook or Flex validation.

## Release candidate

- Source commit: `ba35b04` (`Complete Phase 6 operations and data controls`)
- Deployment: `jod-99bst93p2-krittanon.vercel.app`
- Production aliases: `jod-jai.vercel.app`, `jod-jai-krittanon.vercel.app`
- State: READY
- Database migrations: 001–016 applied with immutable checksums

## Automated acceptance

| Check | Result |
| --- | --- |
| `npm test` | PASS, 2 test files, 0 failures/skips |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, 4 dynamic routes |
| `npm run test:db` | PASS, transaction rolled back; includes event/replay/access/report/delete/retention and 1,001-row export cases |
| `scripts/test-flow.ts` | PASS, real local OCR through private CSV; temporary records removed; no LINE send |
| `scripts/validate-line.ts` | PASS, 14 message variants accepted by LINE validation; no LINE send |
| `npm run repair:responses` | PASS preview, 0 candidates |
| Production smoke | PASS: homepage, health, signatures, protected endpoints, guarded export, authorization |
| Cleanup preview | PASS without deletion; one expired invite eligible, all other counts zero |

The first remote sequence encountered one transient `fetch failed` at database-test startup. An immediate rerun passed in full. It did not reach a mutation and left no fixture data.

## Performance and capacity

- Warm text application processing: 30 samples, median 67.2 ms, p95 130.6 ms, max 1,017.8 ms. This includes the Supabase replay lookup and excludes LINE network delivery.
- OCR acceptance fixtures: 24 available private images, measured separately by provider. MAKE 5 samples (p95 1,917 ms), Paotang 9 (1,875 ms), Bangkok Bank 4 (1,839 ms), SCB 4 (2,260 ms), unsupported Krungthai 2 (1,599 ms). The requested 10 unique images/provider are not available, so no stronger population p95 claim is made.
- Real production processing records: 35 mixed events, median 3,647 ms and p95 10,531.7 ms from claim to completion. These are not labeled by event kind after payload minimization, so they are reported as mixed and not used to hide provider differences.
- Current account readings after benchmarks: Supabase 15,453,331 bytes, Vercel Hobby, LINE 136/300, 0 active invited members.

## Migration and rollback rehearsal

- Reapplying the migration runner made no changes and accepted every stored checksum.
- Transactional tests exercise the old `jod_cleanup_old_data` RPC and current v2 cleanup, showing the additive schema retains the previous application contract.
- Existing export columns remain; new snapshot columns have defaults. Existing event/response columns and delivery RPCs were not removed.
- Response-repair preview found no queued legacy response requiring rewrite.
- Application rollback target is commit `f99549c`; the additive database schema remains in place. Redeploying the prior app is the rollback—never reverse migrations or clear queues/history. Migration 016's trigger may conservatively invalidate a short-lived export after a ledger edit, which is compatible with the previous route.

## Production pilot evidence

Privacy-safe aggregates show 35 real events from one user, all delivered, no dead jobs, and two live confirmed expenses. The observed event interval was only about 12 minutes on 2026-09-26 Bangkok time. This proves real delivery occurred but does not satisfy the suggested 3–7 day bounded pilot or prove every required journey/rendering was accepted by a user.

The following must be performed in the real LINE client and recorded before Phase 7 can be marked DONE:

1. Invite flow (if a second scoped account is available): invite, join, revoke, and confirm access denial. If no second account is in scope, record that limitation explicitly.
2. Send a slip with a missing essential field, correct it, review, confirm, and open the updated report.
3. Send a complete slip without optional detail and confirm that review appears directly.
4. Add a manual expense, edit it, export CSV, delete it with confirmation, and verify the report total changes.
5. Create multiple drafts, open page 2, select one by number/code, run a batch action, and verify the reported success count.
6. Confirm on a real phone that long Thai text, buttons, empty states, and totals do not overflow.
7. Continue normal scoped use for the agreed pilot window/journey count; then capture only aggregate counts, queue/dead state, quota, and acceptance outcome.

Do not paste private names, amounts, slip images, user IDs, or export links into release evidence.
