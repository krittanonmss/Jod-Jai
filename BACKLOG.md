# Jod-Jai Backlog

This backlog is ordered by practical priority. Start from P0 unless the user explicitly asks for a different task.

## P0: Make LINE Summaries Readable

Why now:

- `ดูรายรับรายจ่าย`, `สรุปวันนี้`, and `สรุปเดือนนี้` currently reply as plain text.
- The information is correct, but it is hard to scan in LINE.
- Improving these views gives the biggest UX win without changing core data flow.

Scope:

- Replace plain text responses for `ดูรายรับรายจ่าย`, `สรุปวันนี้`, and `สรุปเดือนนี้` with LINE Flex Messages.
- Keep text fallback through `altText`.
- Keep messages compact and mobile-first.

Suggested first version:

- `ดูรายรับรายจ่าย`: dashboard card with month total, pending draft count, and latest 5 confirmed expenses.
- `สรุปวันนี้`: card with today's total, record count, category rows, and latest 3 records.
- `สรุปเดือนนี้`: card with monthly total, category ranking, average per day, and latest 5 records.
- Add quick actions where useful: `เพิ่มรายการ`, `รายการค้าง`, `สรุปเดือนนี้`.

Acceptance criteria:

- No long plain-text summary blocks for the three commands.
- Amounts are aligned and easy to compare.
- Empty states are short and clear.
- Existing tests pass, and message JSON stays within LINE Flex limits.

## P1: Reduce Manual `#<short_code>` Typing

Why next:

- The current flow works, but asking users to type `#<short_code> ...` feels technical and slow.
- This becomes painful when correcting OCR fields or confirming multiple slips.

Scope:

- Use quick reply buttons for common categories and edit fields.
- When there is exactly one pending draft, let the user answer directly without a `#<short_code>` prefix.
- Add cleaner postback buttons for missing fields such as amount, description, category, confirm, and cancel.
- Add a `รายการล่าสุด` / `แก้รายการล่าสุด` style flow so users do not need to remember codes.
- Add edit/delete flows for already confirmed records, especially `แก้รายการล่าสุด` and `ลบรายการล่าสุด`, with confirmation before destructive changes.
- Shorten dense help/error messages and keep examples concrete.

Acceptance criteria:

- A normal single-slip flow can finish with little or no manual code typing.
- Multi-slip ambiguity still has a clear path.
- Old `#<short_code>` commands continue to work as a fallback.
- Confirmed records can be corrected or deleted without direct database access.

## P1: Add User Data Deletion Command

Why next:

- Users should be able to clear their own history from LINE.
- Manual database deletion is possible today, but it is not friendly or safe enough for regular use.

Scope:

- Add a `ล้างประวัติ` command in LINE.
- Require explicit confirmation before deleting anything, through a confirmation button or `ยืนยันล้างประวัติ`.
- Delete only the requesting user's data by default: drafts/confirmed records, queued events, stored responses, and mutation replay records.
- Keep owner pairing / authorization unless the user explicitly asks to reset the account owner.
- Reply with a clear summary after deletion, including what was deleted and what was kept.

Acceptance criteria:

- One user's delete command cannot delete another user's records.
- Deletion is idempotent and safe to retry.
- Accidental one-message deletion is not possible.

## P1: Export User Data

Why next:

- Retention will eventually delete old records, so users need a way to keep their own copy first.
- Export also makes the system more trustworthy because data is not trapped in the bot.

Scope:

- Add a `ส่งออกข้อมูล` command.
- Export at least confirmed records from the latest 6 months as CSV.
- Include practical columns: occurred date, amount, category, description, recipient, provider, reference, created/confirmed time.
- Consider exporting all available history before automatic retention is enabled.
- Keep the export private to the requesting LINE user.

Acceptance criteria:

- A user can request and receive their own expense data without admin access.
- Export contains enough fields to open in spreadsheet software.
- Users cannot export another user's records.
- Export is available before automatic retention is enabled.

## P1: Automatic 6-Month Data Retention

Why next:

- Old records currently stay in the database forever unless deleted manually.
- A personal expense tracker usually only needs recent history, and retention helps keep Supabase usage small.
- Export should exist before this is enabled so users can keep old records if they want.

Scope:

- Add an automatic retention job that deletes user history older than 6 months.
- Apply retention to confirmed/cancelled/draft records, completed event logs, and mutation replay records.
- Keep owner pairing / authorization data so the account remains usable after old records are removed.
- Make the retention window configurable with an environment variable, defaulting to 6 months.
- Run cleanup through Supabase cron or the existing worker pattern, and make it idempotent.

Acceptance criteria:

- Cleanup can run repeatedly without breaking current data.
- The retention window is configurable.
- Recent records are preserved; records older than the window are removed.
- Tests cover boundary dates and cross-user safety.

## P2: Improve Thai OCR Accuracy

Why later:

- OCR quality matters, but every saved record already requires user confirmation.
- UX improvements reduce the pain of correcting OCR mistakes while OCR work continues.

Scope:

- Add more real slip examples for each supported provider and keep expected parsed fields in tests.
- Improve image preprocessing before Tesseract: crop likely receipt area, upscale, contrast, threshold, and deskew.
- Tune parser rules for common Thai OCR confusions seen in actual slips.
- Prefer structured fields from known slip layout positions where possible, not only full-text regex.
- Consider an optional OCR/vision provider later only if local OCR cannot reach acceptable accuracy.

Acceptance criteria:

- Regression tests cover known OCR mistakes.
- Existing four supported slip formats keep passing.
- Any OCR/vision provider remains optional and does not replace confirmation before saving.

## P2: Remember Merchant and Category Patterns

Why later:

- Many expenses repeat at the same merchants or with similar notes.
- The bot can become easier to use without AI by learning simple user-specific patterns.

Scope:

- Infer category and possibly description from the user's own confirmed history.
- Prefer exact or normalized merchant/recipient matches before fuzzy matching.
- Keep learned suggestions editable and always confirm before saving.
- Avoid global learning across users; patterns should be per LINE user ID.

Acceptance criteria:

- Repeated merchants get better category suggestions over time.
- Suggestions never overwrite explicit user input.
- One user's patterns never affect another user.

## P2: Owner System Status and Quota Checks

Why later:

- The bot depends on LINE, Vercel, Supabase, OCR, and the durable queue.
- If it is shared with friends, the owner needs a simple way to see whether the system is healthy.

Scope:

- Add an owner-only `สถานะระบบ` command.
- Show recent dead jobs, pending queue count, last cleanup time, and database usage where available.
- Add checks for OCR failures and LINE push errors.
- Consider LINE message quota checks if the API/account exposes enough information.

Acceptance criteria:

- Owner can inspect health from LINE without opening Supabase/Vercel dashboards.
- Non-owners cannot view system or quota details.
- Health output is short enough to read in LINE.

## P3: Sharing With Friends

Why later:

- The current system is intentionally owner-only/private.
- Sharing should wait until UX, deletion, and retention are safer.

Scope:

- Add invite codes created by the owner from LINE.
- Add user list and revoke commands.
- Keep records separated by LINE user ID.
- Add quota/rate-limit safeguards before public use.
- Require enough system status/quota visibility before inviting many people.

Acceptance criteria:

- Owner can invite and revoke users without editing environment variables.
- Users cannot see or delete each other's records.
- Usage can be monitored before inviting many people.
