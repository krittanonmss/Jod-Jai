# Jod-Jai Backlog

## UX: make the LINE flow easier

Current pain points:

- Users often have to type `#<short_code> ...` to answer or edit a pending slip.
- Bot messages are too dense and can feel technical.
- The flow should guide the user with buttons, quick replies, and shorter prompts wherever possible.

Ideas to improve:

- Use quick reply buttons for common categories and edit fields.
- When there is only one pending draft, let the user answer directly without a `#<short_code>` prefix.
- Add postback buttons for common missing fields, such as amount, description, category, and confirm/cancel.
- Make confirmation text shorter and move details into a cleaner Flex Message layout.
- Add a `รายการล่าสุด` / `แก้รายการล่าสุด` style flow so users do not need to remember codes.
- Reduce wording in error/help messages and keep examples concrete.

## UX: make overview and summaries easier to read

Current pain points:

- `ดูรายรับรายจ่าย` currently replies as plain text, which is hard to scan in LINE.
- `สรุปวันนี้` and `สรุปเดือนนี้` show totals, but the structure is too flat and not visual enough.
- Users should understand total spend, number of records, top categories, and recent records at a glance.

Ideas to improve:

- Use LINE Flex Messages instead of plain text for `ดูรายรับรายจ่าย`, `สรุปวันนี้`, and `สรุปเดือนนี้`.
- Show a compact dashboard card: total expense, record count, pending count, and last updated time.
- For summaries, group rows by category with aligned amounts and percentages where useful.
- For recent records, show a small list with date, category, description, and amount; keep each row short.
- Add quick actions under the summary, such as `เพิ่มรายการ`, `รายการค้าง`, and `สรุปเดือนนี้`.
- Consider a simple web dashboard later for richer tables/charts, while LINE remains the quick daily interface.

Possible first version:

- `ดูรายรับรายจ่าย`: Flex card with 3 sections: month total, pending drafts, latest 5 confirmed expenses.
- `สรุปวันนี้`: Flex card with today's total, category rows, and latest 3 records.
- `สรุปเดือนนี้`: Flex card with monthly total, category ranking, average per day, and latest 5 records.

## OCR: improve Thai text accuracy

Current pain points:

- Thai OCR still misreads some characters and merchant/note text.
- Slip layouts are supported, but noisy images, compression, small fonts, and mixed Thai/English text can still produce wrong text.

Ideas to improve:

- Add more real slip examples for each supported provider and keep expected parsed fields in tests.
- Improve image preprocessing before Tesseract: crop likely receipt area, upscale, contrast, threshold, and deskew.
- Tune parser rules for common Thai OCR confusions seen in actual slips.
- Prefer structured fields from known slip layout positions where possible, not only full-text regex.
- Keep asking for user confirmation before saving because OCR will never be perfect.
- Consider an optional OCR/vision provider later only if local OCR cannot reach acceptable accuracy.

## Privacy: user data deletion

Current gap:

- There is no LINE command for a user to clear their own history yet.
- Data can be deleted manually in Supabase, but that is not friendly or safe enough for regular use.

Ideas to improve:

- Add a `ล้างประวัติ` command in LINE.
- Require an explicit confirmation step, such as a confirmation button or `ยืนยันล้างประวัติ`, before deleting anything.
- Delete only the requesting user's data by default: drafts/confirmed records, queued events, stored responses, and mutation replay records.
- Keep owner pairing / authorization unless the user explicitly asks to reset the account owner.
- Reply with a clear summary after deletion, including what was deleted and what was kept.
- Add tests that prove one user's delete command cannot delete another user's records.

## Privacy: automatic data retention

Current gap:

- Old records stay in the database forever unless deleted manually.
- This is unnecessary for a personal expense tracker if the user only needs recent history.

Ideas to improve:

- Add an automatic retention job that deletes user history older than 6 months.
- Apply retention to confirmed/cancelled/draft records, completed event logs, and mutation replay records.
- Keep owner pairing / authorization data so the account remains usable after old records are removed.
- Make the retention window configurable with an environment variable, defaulting to 6 months.
- Run the cleanup through Supabase cron or the existing worker pattern, and make it idempotent.
- Consider warning/export options before enabling this for multi-user use.
