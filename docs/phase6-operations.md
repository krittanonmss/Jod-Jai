# Phase 6 operations and capacity

Evidence captured on 2026-09-26 (Asia/Bangkok). This runbook is for the expense-only release and does not promise paid backup, PITR, or unlimited service.

## Measured operating envelope

- Supabase project reported `ACTIVE_HEALTHY`; database size was 14,437,523 bytes (2.9% of the 500 MB read-only threshold), with 18 drafts, 35 events, 10 mutation receipts, and no invited active members.
- Vercel account reported the `hobby` plan. The application has four dynamic routes, one daily cron, and OCR pilot p95 of 2.244 seconds. The worker's 300-second ceiling and per-user FIFO avoid concurrent OCR for one user.
- LINE's account API reported a hard monthly push quota of 300 and usage of 136 (45.3%). Reply messages are used for the immediate image acknowledgement when possible; durable results use one push request containing up to five message objects.
- Intake is limited to 30 webhook events per user per minute. LINE 429/quota errors remain queued with five-minute backoff rather than silently dropping a saved result. The owner status command distinguishes normal, processing, delayed, and dead work.

Current provider references: Supabase Free becomes read-only at 500 MB and includes 5 GB uncached plus 5 GB cached egress; Vercel Hobby includes 4 active CPU-hours, 360 GB-hours memory, and one million function invocations; Hobby cron is daily; LINE counts a push request per recipient rather than per message object. Account API readings override generic marketing limits for this OA.

At current measured scale, database capacity is not the binding constraint. LINE's account-specific 300 push-message quota is binding. Do not invite additional users when projected pushes would exceed the remaining quota. Check `สถานะระบบ` and `node scripts/manage.mjs capacity` before expanding access.

## Retention contract

| Data | Horizon/trigger |
| --- | --- |
| Live ledger and old drafts | `RETENTION_MONTHS`, default 6, allowed 1–120 |
| Explicitly deleted rows | 7 days, inaccessible immediately; no restore feature |
| Completed/dead events | 30 days |
| Mutation receipts | 30 days, covering supported LINE retry/redelivery operations |
| Export links | 10 minutes; expired tokens removed by cleanup |
| Used/expired invites | Expiry, or 7 days after use |
| Rate counters | 1 day |

Preview cleanup without deleting anything:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" "https://jod-jai.vercel.app/api/jobs/run?dry_run=1"
```

Run cleanup through the maintained command only after checking the preview:

```sh
npm run maintenance
```

Never shorten `RETENTION_MONTHS` without presenting the dry-run count and offering users a current export. Cleanup predicates are identical in preview and execution.

## Failure handling

- Busy/delayed queue: inspect oldest age with `สถานะระบบ`; the retry scheduler wakes pending work each minute through Supabase. Do not run duplicate workers manually unless the scheduler is confirmed unavailable.
- Dead event: inspect only the safe error class in owner status/logs. Fix credentials or payload rendering first, then use `npm run repair:responses` in preview mode. It regenerates delivery presentation without replaying the business mutation.
- LINE invalid payload: the worker stores and sends the text fallback. Authentication/configuration errors become dead rather than retrying indefinitely.
- LINE timeout: preserve the stable retry key. Do not send an ad-hoc replacement because remote acceptance is uncertain.
- LINE quota: saved results remain pending with backoff. Stop onboarding, wait for quota reset, then allow the worker to deliver; do not rerun mutations.
- Database trouble: verify Supabase status and `npm run setup:check`; do not clear queues as remediation.
- Delivery unavailable inside LINE: use Vercel deployment/runtime logs, `npm run setup:check`, `node scripts/manage.mjs capacity`, and the protected maintenance dry-run endpoint.

## Release and rollback

Before a risky release, users can request a stable-snapshot CSV export. Export pages use a `(occurred_at,id)` cursor and reconcile to the snapshot count/total. New confirmations are outside the snapshot; an edit/delete of a selected row, clear-history, or member revocation invalidates the token instead of returning a mixed-version CSV. Revocation atomically fences queued work. A stale worker rechecks authorization before delivery and removes artifacts proven to come from an event cleared while it ran.

Rollback is an application redeploy to the prior commit. Database migrations are additive and must not be edited or rolled back destructively. Migration 015 remains compatible with the prior application: old export tokens still exist, while only the new route calls the new RPCs. If the new export path fails, redeploy the prior app and do not delete ledger data. There is no promise to restore deliberate deletions and no private diagnostic archive.

## Phase 6 verification

- Unit/OCR tests, typecheck, and production build: pass.
- Database migration 015 and transactional integration suite: pass; fixtures rolled back.
- Export regression: 0/1 rows in unit/flow coverage, cursor boundary in SQL, and 1,001+ semantics via two RPC pages at the exact 1,000 boundary. SQL snapshot count/total reconciliation and cross-user exclusion pass.
- Real local OCR-to-private-CSV flow: pass; temporary records removed, no LINE messages sent.
- LINE schema validation: 14 variants pass, no messages sent.
- Production deployment `jod-ith4ycnbg-krittanon.vercel.app` reached READY and aliases `jod-jai.vercel.app`. Smoke passed for health, signed/unsigned webhook behavior, protected worker/maintenance, guarded export, and DB-backed authorization.
- Production cleanup dry-run passed without deletion: 0 ledger, event, mutation, export, soft-deleted, or rate-counter rows eligible; 1 expired invite eligible under the next scheduled cleanup.

Provider references:

- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/storage/serving/bandwidth
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://developers.line.biz/en/tips/2026/05/28/how-to-count-messages/
