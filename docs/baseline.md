# Jod-Jai Baseline — 2026-09-26

This report captures current behavior before Phase 1 changes. It is not a release certification.

## Environment and code snapshot

- Branch: `main`, planning baseline commit `a9b4444`; `plan.txt` and Phase 0 documentation are uncommitted work at capture time.
- Runtime: Node project with Next.js, Supabase, LINE Messaging API, Tesseract/Sharp.
- Product scope: expenses, owner plus invited users, zero paid OCR/hosting budget.
- Raw slips are not stored by the application and are not included in this report.

## Existing verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript completed with no errors. |
| `npm test` | PASS | 2 test files, 0 failures, 0 skips; private example OCR fixtures were available locally. |
| `npm run test:db` | PASS | Executed against configured database inside the test SQL transaction, then rolled back. It verifies some draft/summary, ownership, stale/replay, queue lease, invite, and rate-limit behavior. |
| `npm run build` | PASS | Next.js production build completed successfully. |
| Flow integration | PASS | Real local OCR → draft → detail → edit → stale-confirm rejection → confirm → replay → resized duplicate → private CSV export; temporary test records were removed and no LINE messages were sent. |
| LINE validation script | PASS (limited coverage) | `scripts/validate-line.ts` validated confirmation cards, edit actions, and follow-up questions without sending messages. It is not a full webhook-delivery matrix. |

The current SQL integration test is useful but not a substitute for complete lifecycle coverage. It assumes descriptions are required, reopens confirmed records into drafts, and does not test full webhook delivery, bulk mutation, report boundaries, export pagination, or clear-history races.

## Private OCR inventory and detection-only run

Twenty-four private original images in `/home/krittanon/Downloads/slip` were read locally in paired batches. This was a detection/presence benchmark only: it checked whether the current OCR returned non-empty values, not whether those values equal the visible slip. No raw values appear in this report.

| Provider detected | Images | Amount present | Date/time present | Recipient present | Complete three-field presence |
| --- | ---: | ---: | ---: | ---: | ---: |
| MAKE | 5 | 5/5 | 5/5 | 5/5 | 5/5 |
| Paotang | 9 | 7/9 | 8/9 | 9/9 | 7/9 |
| Bangkok Bank | 4 | 4/4 | 4/4 | 4/4 | 4/4 |
| SCB | 4 | 4/4 | 4/4 | 4/4 | 4/4 |
| Unsupported (Krungthai) | 2 | Not applicable | Not applicable | Not applicable | Not applicable |
| Supported total | 22 | 20/22 | 21/22 | 22/22 | 20/22 |

Observed per-image OCR processing time in this local paired run ranged from approximately 1.5 to 2.4 seconds. This is neither production end-to-end latency nor an accuracy score. It excludes durable queue behavior and user-visible LINE timing, and uses a warmed local language cache.

Two directly inspected examples establish initial ground-truth checks:

- A MAKE 99.00 THB transfer on 25 Sep 2569 at 19:59 with a Thai recipient. This is a regression candidate for the previously reported 99.00-to-9.00 and date/time issues.
- A Bangkok Bank 96.00 THB transfer on 23 Sep 2569 at 17:22 to `COUNTER SERVICE CO., LTD. (7-11 : 14246)`. The Biller ID and references must never replace this payee.
- An SCB 2,000.00 THB transfer on 22 Sep 2569 at 19:40 provides a mixed Thai recipient candidate.
- A Paotang 60 THB goods / 36 THB subsidy / 24 THB paid image is a net-payment candidate. The extraction failed to populate amount/date/time in the detection run and must become a regression case.

The full expected-value manifest is deliberately local and ignored. All 24 original
images were visually inspected and assigned to tuning/held-out groups. Exact canonical
recipient strings remain local because they contain private names. Phase 2 must turn
these into ignored automated expectations after locking the conservative normalization
rule; it must not derive them from OCR output.

## Current risks confirmed by inspection

- `lib/domain.ts` requires a description in `missingField` and `getMissingFields`.
- `jod_change_draft` in the initial schema also rejects confirmation without a description.
- Image acknowledgement in the webhook occurs before queue insertion.
- Text/postbacks run inline while images queue, so per-user ordering must be tested.
- Batch actions call per-draft mutations using a shared event identity; batch idempotency has no direct test.
- Pending records are fetched at 20 while the card carousel displays 10.
- Existing recovery is still exposed despite the new no-recovery decision.
- The existing export route uses one query; large exports are unverified.

## Free-tier evidence to use in Phase 0

As checked on 2026-09-26, official provider pages state:

- Supabase Free: 500 MB database, 5 GB egress plus 5 GB cached egress, 1 GB file storage, 50,000 MAU, and projects pause after one week of inactivity. Source: [Supabase pricing](https://supabase.com/pricing) and [billing guide](https://supabase.com/docs/guides/platform/billing-on-supabase).
- Vercel Hobby: $0 for personal projects; 4 active CPU-hours, 360 GB-hours provisioned memory, and 1 million function invocations included. The current project team reports plan `hobby`. A Hobby account is paused when its included usage is exceeded. Source: [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) and [fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing).
- Vercel Hobby cron is limited to once daily, while the project currently has a daily Vercel cron and an existing Supabase scheduler mechanism for queued jobs. Source: [Vercel Cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- LINE free-message quota is country/plan-specific; use the bot quota endpoint and Thailand OA plan at release time. Messaging API message counting must include acknowledgements, results, retries, and cards. Source: [LINE Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/).

The read-only production database snapshot at capture time was small: `jod_drafts` 184 KiB, `jod_events` 112 KiB, `jod_mutations` 72 KiB, and the other operational tables 48–64 KiB each; 2 confirmed and 12 cancelled drafts, 4 completed events, and a recent maintenance timestamp were present. The Supabase project API reported healthy status in `ap-southeast-1` but did not expose a plan field. The LINE quota endpoint reported 98 of 300 messages used at capture time. Vercel's CLI reported that no billing data was available for the selected range because no active subscription supplied it; that is an unknown usage measurement, not evidence of zero usage. These limits are external policy and may change. No paid upgrade is authorized.

## Phase 0 closure

Phase 0 is complete. It established the feature inventory and traceability matrix, private fixture manifest and split, test side-effect audit, reproducible verification baseline, free-tier evidence, and Phase 1 processing decisions.

Open constraints carried into later phases:

1. Vercel Hobby usage is unavailable from the billing CLI/API in this account context; do not report it as zero. Phase 6 will add application-side metrics and compare them with an authorized dashboard reading when available.
2. LINE's 98/300 snapshot is a point-in-time quota reading, not a per-journey measurement. Phase 1 and Phase 6 must count acknowledgement, result, card, and retry deliveries.
3. The private original slips remain excluded from Git and CI. Phase 2 must add ignored exact-value regression expectations after conservative recipient normalization is defined.

Next phase: Phase 1 — reliable event receipt, ordering, idempotency, durable result delivery, and response timing instrumentation.

## Phase 1 closure

Phase 1 completed on 2026-09-26. `jod_events` now separates receipt, acknowledgement, saved result, and result delivery; all authorized events share per-user FIFO ordering. The worker stores safe timing deltas and error classes only, never image bytes, tokens, or OCR text. LINE validation accepted 14 representative message variants, and the response-repair preview found zero candidates at closure. Database regressions cover duplicate receipt/rate accounting, acknowledgement claim, rate boundary, lease reclaim, stale-lease finalization rejection, and an unrelated user's progress while another user is blocked.
