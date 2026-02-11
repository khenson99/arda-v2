const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = '/Users/kylehenson/arda-v2/output/playwright';
  const baseUrl = 'http://localhost:5173';
  const email = `kanban-debug-${Date.now()}@example.com`;
  const password = `ArdaTest!${String(Date.now()).slice(-6)}`;

  const report = {
    stamp,
    baseUrl,
    email,
    status: 'running',
    apiResponses: [],
    requestFailures: [],
    pageErrors: [],
    consoleErrors: [],
    dom: {},
    artifacts: {},
    error: null,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    report.apiResponses.push({
      url,
      status: res.status(),
      ok: res.ok(),
      method: res.request().method(),
    });
  });

  page.on('requestfailed', (req) => {
    report.requestFailures.push({
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText || null,
    });
  });

  page.on('pageerror', (err) => {
    report.pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push(msg.text());
    }
  });

  const initialPath = path.join(outDir, `${stamp}-debug-initial.png`);
  const partsPath = path.join(outDir, `${stamp}-debug-parts.png`);
  const reportPath = path.join(outDir, `${stamp}-debug-parts-report.json`);

  report.artifacts.initial = initialPath;
  report.artifacts.parts = partsPath;
  report.artifacts.report = reportPath;

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: initialPath, fullPage: true });

    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.getByLabel('First name').fill('Playwright');
    await page.getByLabel('Last name').fill('Tester');
    await page.getByLabel('Company').fill(`Arda Test ${String(Date.now()).slice(-4)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^Create Account$/ }).last().click();

    await page.waitForSelector('text=Items', { timeout: 30000 });
    await page.goto(`${baseUrl}/parts`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);

    await page.screenshot({ path: partsPath, fullPage: true });

    const dom = await page.evaluate(() => {
      const errorBanner = document.querySelector('[role="alert"], .error, [data-error]');
      const addItemButton = Array.from(document.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Add item')
      );
      const floatingPlus = Array.from(document.querySelectorAll('button')).find((b) =>
        (b.textContent || '').trim() === '+'
      );
      const createCardButtons = Array.from(document.querySelectorAll('button[aria-label^="Create card for "]')).length;
      const skeletonCount = document.querySelectorAll('[class*="skeleton"], .animate-pulse').length;
      const bodyText = document.body.innerText.slice(0, 2000);
      return {
        title: document.title,
        url: location.href,
        errorBannerText: errorBanner ? errorBanner.textContent : null,
        hasAddItemButton: Boolean(addItemButton),
        hasFloatingPlus: Boolean(floatingPlus),
        createCardButtons,
        skeletonCount,
        bodyText,
      };
    });

    report.dom = dom;
    report.status = 'ok';
  } catch (err) {
    report.status = 'failed';
    report.error = {
      message: err?.message || String(err),
      stack: err?.stack || null,
    };
  } finally {
    await context.close();
    await browser.close();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  if (report.status !== 'ok') {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
})();
