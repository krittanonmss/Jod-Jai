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
- Shorten dense help/error messages and keep examples concrete.

Acceptance criteria:

- A normal single-slip flow can finish with little or no manual code typing.
- Multi-slip ambiguity still has a clear path.
- Old `#<short_code>` commands continue to work as a fallback.

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

## P1: Automatic 6-Month Data Retention

Why next:

- Old records currently stay in the database forever unless deleted manually.
- A personal expense tracker usually only needs recent history, and retention helps keep Supabase usage small.

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

## P3: Sharing With Friends

Why later:

- The current system is intentionally owner-only/private.
- Sharing should wait until UX, deletion, and retention are safer.

Scope:

- Add invite codes created by the owner from LINE.
- Add user list and revoke commands.
- Keep records separated by LINE user ID.
- Add quota/rate-limit safeguards before public use.

Acceptance criteria:

- Owner can invite and revoke users without editing environment variables.
- Users cannot see or delete each other's records.
- Usage can be monitored before inviting many people.
