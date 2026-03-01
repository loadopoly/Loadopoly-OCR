# Mobile Queue View Testing Documentation

## Scope
This document validates the mobile Processing Queue panel behavior in `src/App.tsx` and `src/components/QueueMonitor.tsx` after layout and scroll fixes.

### Target regressions
1. Left edge clipping in the panel (content cut off).
2. Inability to horizontally inspect long log lines.
3. Inability to scroll down to content below `Reset Local`.
4. Scroll interference from bottom mobile navigation/safe-area.

## Changes Under Test
- `src/App.tsx`
  - Queue panel overlay uses explicit mobile bounds (`left-2 right-2`) with desktop override (`sm:w-96`).
  - Panel uses mobile viewport-aware max height: `max-h-[calc(100dvh-140px)]`.
  - Panel body uses touch-safe vertical scrolling and safe-area padding:
    - `min-h-0`
    - `overflow-y-auto`
    - `overscroll-contain`
    - `touch-pan-y`
    - `pb-[calc(env(safe-area-inset-bottom,0px)+88px)]`
- `src/components/QueueMonitor.tsx`
  - Header/buttons wrap safely on mobile without width overflow.
  - Job filter row can wrap within container (`w-full sm:w-auto`).
  - Progress column reduced on mobile (`w-12 sm:w-16`).

## Terminal Validation Run
Executed in workspace root:

```bash
npm run typecheck
npm run lint
npm run build
```

### Result
- `typecheck`: PASS
- `lint`: PASS
- `build`: PASS
- Note: Vite chunk-size warnings remain non-blocking and unrelated to this UI fix.

## Manual Mobile Test Plan (Android Chrome)
Use a hard refresh before each run to avoid stale JS/CSS.

### Pre-conditions
- Login with a test user.
- Ensure there are pending/failed jobs to populate queue cards and lists.
- Keep bottom mobile quick-nav visible (default app state).

### Test Case MQ-01: Panel horizontal fit
1. Open app on Android.
2. Tap queue button (`PENDING`) in top bar.
3. Observe panel edges.

Expected:
- Panel remains fully inside viewport.
- No left-side clipping of `Processing Queue` title or cards.
- No phantom horizontal page drift caused by panel width.

### Test Case MQ-02: Vertical panel scrolling
1. With queue panel open, swipe upward inside panel body.
2. Scroll past queue cards to bottom action section.
3. Verify content below `Reset Local` is reachable when present.

Expected:
- Smooth vertical scroll in panel body.
- Bottom controls are reachable; no dead stop above bottom nav.

### Test Case MQ-03: Debug log horizontal inspection
1. In queue panel header, tap `LOG`.
2. Add or wait for a long log line.
3. Swipe horizontally inside the log container.

Expected:
- Log area scrolls horizontally for long lines.
- Panel/page does not horizontally drift.

### Test Case MQ-04: Cross-tab consistency
Repeat MQ-01/MQ-02 from each tab:
- Dashboard
- Database
- Batch
- Curator
- Settings

Expected:
- Same panel bounds and scroll behavior in every tab.

### Test Case MQ-05: Orientation and viewport
1. Test portrait first.
2. Rotate to landscape and reopen panel.

Expected:
- Panel remains bounded in both orientations.
- Scroll still works and no clipping appears.

## Troubleshooting Checklist
If issue still appears on device:
1. Force close browser tab/app.
2. Open a new tab/session.
3. Clear site data for the app domain.
4. Confirm latest deploy includes the commit containing these class changes.
5. Re-run MQ-01 to MQ-03.

## Acceptance Criteria
Fix is accepted only if all are true:
- No left clipping in panel at any tested tab.
- Panel body scrolls to bottom on Android.
- Log area supports horizontal inspection without page drift.
- Build/lint/typecheck remain green.
