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
