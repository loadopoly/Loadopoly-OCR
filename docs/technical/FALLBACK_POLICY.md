# Fallback Policy

## Purpose
This policy defines when and how to roll back to a known-good application version.

Current designated fallback baseline:
- **Version:** `v2.20.1`
- **Date set:** 2026-04-20
- **Rationale:** Marked as strong and stable in release documentation and version alignment.

## When To Trigger Fallback
Trigger fallback when one or more conditions are true:
- Production availability is degraded (startup failures, blank screen, repeated crashes, queue deadlock).
- Core workflows fail at a high rate (OCR processing, asset load, checkout, or queue completion).
- Regressions materially impact user trust or data integrity.
- Incident severity is high enough that hotfix risk exceeds rollback risk.

## Decision Criteria
Use this decision model:
1. Confirm issue is reproducible in production or release-candidate environment.
2. Estimate hotfix time and risk.
3. If safe hotfix cannot be validated quickly, fall back to `v2.20.1`.
4. Open incident log and communicate fallback decision to stakeholders.

## Fallback Procedure (Runbook)
1. Identify currently deployed version and deployment target.
2. Switch deployment to artifact/tag for `v2.20.1`.
3. Invalidate CDN/cache where applicable.
4. Verify app loads and key routes are operational.
5. Verify critical flows:
   - OCR upload/process completes.
   - Structured DB and dashboard load correctly.
   - Queue monitor updates and completes jobs.
   - Payments/checkout path responds (if enabled).
6. Publish incident update with fallback completion timestamp.

## Post-Fallback Validation Checklist
- No startup freezes or blank screen on desktop/mobile smoke test.
- Error-rate trend drops to acceptable range.
- Queue backlog stops growing abnormally.
- No new data corruption signals.
- Support channel confirms recovery from user perspective.

## Version Governance
- Only one designated fallback baseline should be active at a time.
- A new fallback baseline can be promoted only after:
  - successful build and benchmark checks,
  - release notes/changelog updates,
  - smoke test completion,
  - explicit team approval.
- When baseline changes, update:
  - `package.json` version,
  - `CHANGELOG.md`,
  - `RELEASE_NOTES.md`,
  - this file.

## Ownership
- Primary owner: release manager on duty.
- Technical approver: engineering lead.
- Communication owner: product/ops lead.

## References
- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `docs/technical/BENCHMARKS.md`
