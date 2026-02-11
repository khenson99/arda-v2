# Production WYSIWYG Smoke Report

- Deployment: https://arda-v2-peach.vercel.app
- Started: 2026-02-11T00:20:43.483Z
- Finished: 2026-02-11T00:21:01.866Z
- Overall: FAIL
- Rollback attempted: true
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
- PASSED: Marker persistence check after reopen
- PASSED: Reopen and verify marker persistence
- STARTED: Rollback original content and verify restoration

## Console
- warnings: 0
- errors: 4
- pageErrors: 0

## Error

- Marker still present after rollback save

## Artifacts
- editorPanel: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-20-43-482Z-editor-panel.png
- afterSaveToast: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-20-43-482Z-after-save-toast.png
- failure: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-20-43-482Z-failure.png