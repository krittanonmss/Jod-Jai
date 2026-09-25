# Jod-Jai Architecture Decisions

## ADR-001: Expense-first product boundary

Status: accepted, 2026-09-26.

The current release records expenses only. Income, net cash flow, balances, and own-account transfers are deferred until Phase 8. Product labels must not promise income support. Existing aliases may remain for compatibility while the visible overview label changes to expense-only wording.

## ADR-002: Three essential fields

Status: accepted, 2026-09-26.

An image expense is confirmable when it has a positive amount, valid Bangkok transaction timestamp, and meaningful recipient. Description, category, note, reference, subsidy, and fee remain optional. Manual expenses may explicitly use an unspecified recipient. This decision must be implemented consistently in message flow, TypeScript validation, database RPC validation, migrations for legacy drafts, reporting labels, and tests.

## ADR-003: Free and local-first OCR

Status: accepted, 2026-09-26.

Use Tesseract and custom preprocessing/parsing hosted inside the current application. Do not send real slips to an external OCR service or add a paid dependency. Evaluate external/free alternatives only after measured local results, documented data handling and quota limits, and a new user decision.

## ADR-004: Financial amount policy

Status: accepted, 2026-09-26.

Store money as integer satang. The primary expense is the transfer/paid amount, not amount plus fee. Keep existing fee fields as optional information and do not rewrite old values. Paotang uses actual out-of-pocket amount after subsidy.

## ADR-005: Deliberate deletion is not recoverable

Status: accepted, 2026-09-26.

Single delete and clear-history require explicit confirmation. There will be no user-facing restore/recover feature. This does not justify broad deletion of current soft-deleted data or replay metadata. Phase 3 defines safe retirement/migration of the existing recovery behavior; Phase 6 defines bounded operational retention.

## ADR-006: Free-tier operation requires measured backpressure

Status: accepted constraint, 2026-09-26.

The system must operate without paid Supabase or Vercel plans. It stores no source slip images. Before retention/capacity changes, measure database, logs, OCR function use, and LINE messages against dated official limits. If approaching limits, report and apply an intentional backpressure/retention policy rather than silently paying or deleting ledger data.

## ADR-007: Business effect and LINE delivery are distinct

Status: accepted design direction for Phase 1, 2026-09-26.

The application needs separate durable states for event acceptance, business effect, and outbound delivery. Delivery retries must not repeat mutations. A reply timeout may have been accepted by LINE, so the system cannot promise exactly-once visible delivery. Phase 1 will specify persistence and recovery using existing tables where possible.

Phase 1 implementation rules:

- Deduplicate a logical event before rate accounting and business processing.
- Persist an event receipt before claiming an image acknowledgement.
- Process image and mutation events in strict per-user order. A read-only command may run inline only when no earlier accepted event for that user can change its meaning.
- Persist the business result before retrying its final delivery; a retry delivers the saved result rather than rerunning the mutation.
- Keep acknowledgement, final-result, and fallback deliveries in separate durable slots with stable identities.
- Treat delivery timeouts as uncertain: LINE may have accepted the message, so exactly-once visible delivery is not promised.

## ADR-008: Private fixture hygiene

Status: accepted, 2026-09-26.

Raw slips, expected field values, and filename-to-fixture mappings remain local under `private-fixtures/`, which is ignored by Git and excluded from deploy. Tracked documentation uses anonymous fixture IDs and aggregate results only.
