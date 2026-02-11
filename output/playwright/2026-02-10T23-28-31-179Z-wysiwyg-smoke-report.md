# Production WYSIWYG Smoke Report

- Deployment: https://arda-v2-peach.vercel.app
- Started: 2026-02-10T23:28:31.179Z
- Finished: 2026-02-10T23:28:33.904Z
- Overall: FAIL
- Rollback attempted: false
- Rollback success: false
- Rollback exact HTML match: false
- Rollback text match: false

## Steps
- STARTED: Open bypass URL and establish cookie
- PASSED: Open bypass URL and establish cookie
- STARTED: Login

## Console
- warnings: 0
- errors: 0
- pageErrors: 0

## Error

- locator.click: Error: strict mode violation: getByRole('button', { name: 'Sign In' }) resolved to 2 elements:
    1) <button type="button" class="rounded-md px-3 py-2 text-sm font-medium transition-colors bg-background text-foreground shadow">Sign In</button> aka getByRole('button', { name: 'Sign In' }).first()
    2) <button type="submit" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-[hsl(var(--arda-orange-hover))] h-10 px-4 py-2 w-full">Sign In</button> aka locator('form').getByRole('button', { name: 'Sign In' })

Call log:
[2m  - waiting for getByRole('button', { name: 'Sign In' })[22m


## Artifacts
- failure: /Users/kylehenson/arda-v2/output/playwright/2026-02-10T23-28-31-179Z-failure.png