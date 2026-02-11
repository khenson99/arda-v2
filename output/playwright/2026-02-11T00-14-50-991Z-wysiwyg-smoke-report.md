# Production WYSIWYG Smoke Report

- Deployment: https://arda-v2-peach.vercel.app
- Started: 2026-02-11T00:14:50.991Z
- Finished: 2026-02-11T00:15:14.519Z
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

## Console
- warnings: 0
- errors: 4
- pageErrors: 0

## Error

- locator.waitFor: Timeout 20000ms exceeded.
Call log:
[2m  - waiting for getByText('Notes saved.').first() to be visible[22m


## Artifacts
- editorPanel: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-14-50-991Z-editor-panel.png
- failure: /Users/kylehenson/arda-v2/output/playwright/2026-02-11T00-14-50-991Z-failure.png