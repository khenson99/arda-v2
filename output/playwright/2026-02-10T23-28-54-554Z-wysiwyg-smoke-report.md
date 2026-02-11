# Production WYSIWYG Smoke Report

- Deployment: https://arda-v2-peach.vercel.app
- Started: 2026-02-10T23:28:54.555Z
- Finished: 2026-02-10T23:28:58.952Z
- Overall: FAIL
- Rollback attempted: false
- Rollback success: false
- Rollback exact HTML match: false
- Rollback text match: false

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

## Console
- warnings: 0
- errors: 3
- pageErrors: 0

## Error

- Marker did not persist after save/reopen

## Artifacts
- editorPanel: /Users/kylehenson/arda-v2/output/playwright/2026-02-10T23-28-54-554Z-editor-panel.png
- afterSaveToast: /Users/kylehenson/arda-v2/output/playwright/2026-02-10T23-28-54-554Z-after-save-toast.png
- failure: /Users/kylehenson/arda-v2/output/playwright/2026-02-10T23-28-54-554Z-failure.png