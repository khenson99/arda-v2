const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const baseUrl = 'http://127.0.0.1:5174';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = '/Users/kylehenson/arda-v2/output/playwright';
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = {
    initial: path.join(outDir, `${stamp}-kanban-btn-initial.png`),
    afterCreateItem: path.join(outDir, `${stamp}-kanban-btn-after-create-item.png`),
    afterCreateCard: path.join(outDir, `${stamp}-kanban-btn-after-create-card.png`),
    failure: path.join(outDir, `${stamp}-kanban-btn-failure.png`),
    reportJson: path.join(outDir, `${stamp}-kanban-btn-report.json`),
    reportMd: path.join(outDir, `${stamp}-kanban-btn-report.md`),
  };

  const email = `kanban-btn-${Date.now()}@example.com`;
  const password = `ArdaTest!${String(Date.now()).slice(-6)}`;
  const itemCode = `PW-KANBAN-${String(Date.now()).slice(-6)}`;

  const result = {
    timestamp: new Date().toISOString(),
    baseUrl,
    email,
    itemCode,
    status: 'failed',
    steps: [],
    artifacts,
    error: null,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    result.steps.push('Open app');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: artifacts.initial, fullPage: true });

    result.steps.push('Register account');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.getByLabel('First name').fill('Playwright');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByLabel('Company').fill(`Arda Test ${String(Date.now()).slice(-4)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^Create Account$/ }).last().click();

    result.steps.push('Wait for authenticated app shell');
    await page.waitForSelector('text=Items', { timeout: 30000 });

    result.steps.push('Navigate to parts page');
    await page.goto(`${baseUrl}/parts`, { waitUntil: 'networkidle' });
    await page.waitForSelector('button:has-text("Add item")', { timeout: 30000 });

    result.steps.push('Create test item');
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Item code').fill(itemCode);
    await page.getByLabel('Item name').fill(`Playwright Item ${itemCode}`);
    await page.getByLabel('Supplier').fill('Playwright Supplier');
    await page.getByRole('button', { name: 'Create item' }).click();

    await page.waitForSelector(`text=${itemCode}`, { timeout: 30000 });
    await page.screenshot({ path: artifacts.afterCreateItem, fullPage: true });

    result.steps.push('Click quick action: Create card');
    const createCardBtn = page.getByRole('button', { name: new RegExp(`Create card for ${itemCode}`) });
    await createCardBtn.first().click();

    result.steps.push('Verify success feedback');
    const successToast = page.locator('li[data-sonner-toast][data-type="success"], [data-sonner-toast][data-type="success"]');
    await successToast.first().waitFor({ timeout: 30000 });
    const toastText = ((await successToast.first().innerText()) || '').trim();
    result.toastText = toastText;

    if (!/Created card #|Created default loop and first card/i.test(toastText)) {
      throw new Error(`Unexpected success toast text: ${toastText}`);
    }

    await page.screenshot({ path: artifacts.afterCreateCard, fullPage: true });

    result.status = 'passed';
  } catch (error) {
    result.error = {
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
    try {
      await page.screenshot({ path: artifacts.failure, fullPage: true });
    } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  fs.writeFileSync(artifacts.reportJson, JSON.stringify(result, null, 2));
  const lines = [
    '# Create Kanban Card Button Test Report',
    '',
    `- Status: **${result.status.toUpperCase()}**`,
    `- Timestamp: ${result.timestamp}`,
    `- Base URL: ${result.baseUrl}`,
    `- Test Email: ${result.email}`,
    `- Item Code: ${result.itemCode}`,
    result.toastText ? `- Success Toast: ${result.toastText}` : '- Success Toast: (not captured)',
    '',
    '## Steps',
    ...result.steps.map((s) => `- ${s}`),
    '',
    '## Artifacts',
    `- initial: ${artifacts.initial}`,
    `- afterCreateItem: ${artifacts.afterCreateItem}`,
    `- afterCreateCard: ${artifacts.afterCreateCard}`,
    `- failure: ${artifacts.failure}`,
    `- reportJson: ${artifacts.reportJson}`,
    '',
  ];
  if (result.error) {
    lines.push('## Error');
    lines.push(`- message: ${result.error.message}`);
    if (result.error.stack) lines.push('```');
    if (result.error.stack) lines.push(result.error.stack);
    if (result.error.stack) lines.push('```');
  }
  fs.writeFileSync(artifacts.reportMd, lines.join('\n'));

  if (result.status !== 'passed') {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
})();
