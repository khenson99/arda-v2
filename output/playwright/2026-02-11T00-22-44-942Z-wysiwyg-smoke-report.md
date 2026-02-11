# Production WYSIWYG Smoke Report

- Deployment: https://arda-v2-peach.vercel.app
- Started: 2026-02-11T00:22:44.943Z
- Finished: 2026-02-11T00:23:13.186Z
- Overall: PASS
- Rollback attempted: true
- Rollback success: true
- Rollback exact HTML match: true
- Rollback text match: true

## Steps
- STARTED: Open bypass URL and establish cookie
- PASSED: Open bypass URL and establish cookie
- STARTED: Login
- PASSED: Login
- STARTED: Navigate to /parts and assert Items page
- PASSED: Navigate to /parts and assert Items page
- STARTED: Open first item row detail panel
- PASSED: Open first item row detail panel
- STARTED: Open Card Editor and verify Item Notes
- PASSED: Open Card Editor and verify Item Notes
- STARTED: Verify WYSIWYG editor render (with one retry path)
- PASSED: Verify WYSIWYG editor render (with one retry path)
- STARTED: Capture original notes state
- PASSED: Capture original notes state
- STARTED: Insert marker and Save notes
- PASSED: Insert marker and Save notes
- STARTED: Reopen and verify marker persistence
- PASSED: Marker persistence check after reopen
- PASSED: Reopen and verify marker persistence
- STARTED: Rollback original content and verify restoration
- PASSED: Rollback original content and verify restoration

## Console
- warnings: 0
- errors: 5
- pageErrors: 0

## Error

- none

## Artifacts
- editorPanel: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-22-44-942Z-editor-panel.png
- afterSaveToast: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-22-44-942Z-after-save-toast.png
- afterRollback: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-22-44-942Z-after-rollback.png