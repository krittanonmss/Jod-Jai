# Jod-Jai Release Checklist

Use this checklist only when a phase has implemented application changes. It does not authorize production mutation by itself.

## Before implementation review

- [ ] Scope and decision IDs are named in the work item.
- [ ] Current worktree checked; unrelated user changes identified.
- [ ] Acceptance cases and expected DB/message effects written.
- [ ] Required fixtures/data are isolated and private values remain untracked.
- [ ] Relevant current tests/scripts and their external side effects reviewed.

## Before migration/deploy

- [ ] New migration is additive and has not modified an already-applied migration.
- [ ] Migration/data change was rehearsed on isolated data with count/total invariants.
- [ ] Old and new app compatibility/pending-job behavior is understood.
- [ ] Exact diff reviewed; no private fixture, `.env`, token, or `.deploy` artifact staged.
- [ ] Relevant unit/integration/LINE validation checks pass; skips are reported.
- [ ] Rollback path and affected records/feature boundary are written.

## After deploy

- [ ] Deployment is READY and production alias is correct.
- [ ] Health, signed webhook, protected worker/maintenance, and guarded export smoke checks pass.
- [ ] Changed LINE cards validate and changed user journey is tested with scoped data.
- [ ] Queue/dead-job state is checked without exposing user payloads.
- [ ] Commit, migration, deployment, evidence, limitations, and next phase are recorded.

## Immediate containment triggers

- [ ] Wrong total, duplicate ledger record, cross-user disclosure, data loss, or a broken main journey: stop the affected path, preserve evidence, and use scoped rollback/repair.
- [ ] Do not reset all queues, erase history, or run maintenance as generic remediation.
