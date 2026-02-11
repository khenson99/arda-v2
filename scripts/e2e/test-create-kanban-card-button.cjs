#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "output", "playwright");
const DEFAULT_BASE_URL = process.env.KANBAN_TEST_BASE_URL || "http://127.0.0.1:4173/parts";
const BASE_ORIGIN = new URL(DEFAULT_BASE_URL).origin;

const WAIT_TIMEOUT_MS = 45_000;

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000);
    socket.once("connect", () => onDone(true));
    socket.once("error", () => onDone(false));
    socket.once("timeout", () => onDone(false));
    socket.connect(port, host);
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // server not up yet
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function parsePort(inputUrl) {
  const parsed = new URL(inputUrl);
  if (parsed.port) return Number(parsed.port);
  return parsed.protocol === "https:" ? 443 : 80;
}

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    },
    body: JSON.stringify(payload),
  });
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const stamp = nowStamp();
  const itemCode = `PW-KANBAN-${String(Date.now()).slice(-6)}`;
  const itemEId = "item-1";
  const port = parsePort(DEFAULT_BASE_URL);
  const host = new URL(DEFAULT_BASE_URL).hostname;

  const artifacts = {
    initial: path.join(OUTPUT_DIR, `${stamp}-kanban-btn-e2e-initial.png`),
    afterClick: path.join(OUTPUT_DIR, `${stamp}-kanban-btn-e2e-after-click.png`),
    failure: path.join(OUTPUT_DIR, `${stamp}-kanban-btn-e2e-failure.png`),
    reportJson: path.join(OUTPUT_DIR, `${stamp}-kanban-btn-e2e-report.json`),
    reportMd: path.join(OUTPUT_DIR, `${stamp}-kanban-btn-e2e-report.md`),
  };

  const state = {
    loopPagesRequested: [],
    loopPatchCalls: 0,
    itemUpdateFallbackCalls: 0,
    apiRequests: [],
  };

  const result = {
    timestamp: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    status: "failed",
    steps: [],
    itemCode,
    toastText: null,
    state,
    artifacts,
    error: null,
  };

  let previewProcess = null;
  const previewAlreadyRunning = await isPortOpen(port, host);

  try {
    if (!previewAlreadyRunning) {
      result.steps.push("Build web app");
      if (process.env.KANBAN_TEST_SKIP_BUILD !== "1") {
        await runCommand("npm", ["run", "build", "--workspace=@arda/web"]);
      }

      result.steps.push("Start web preview server");
      previewProcess = spawn(
        "npm",
        [
          "run",
          "preview",
          "--workspace=@arda/web",
          "--",
          "--host",
          host,
          "--port",
          String(port),
        ],
        {
          cwd: REPO_ROOT,
          env: process.env,
          stdio: "ignore",
          detached: false,
        },
      );
    } else {
      result.steps.push("Reuse existing preview server");
    }

    result.steps.push("Wait for preview server");
    await waitForHttp(BASE_ORIGIN, WAIT_TIMEOUT_MS);

    const session = {
      tokens: { accessToken: "mock-access-token", refreshToken: "mock-refresh-token" },
      user: {
        id: "user-1",
        email: "mock@example.com",
        firstName: "Mock",
        lastName: "User",
        role: "tenant_admin",
        tenantId: "tenant-1",
        tenantName: "Mock Tenant",
      },
    };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    page.on("requestfailed", (req) => {
      state.apiRequests.push({
        kind: "requestfailed",
        method: req.method(),
        url: req.url(),
        error: req.failure()?.errorText || null,
      });
    });
    page.on("pageerror", (err) => {
      state.apiRequests.push({ kind: "pageerror", message: err.message });
    });

    await page.addInitScript((storedSession) => {
      window.localStorage.setItem("arda.web.session.v1", JSON.stringify(storedSession));
    }, session);

    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      const pathname = url.pathname;

      state.apiRequests.push({ kind: "api", method, pathname, search: url.search });

      if (method === "OPTIONS") {
        return route.fulfill({ status: 204, body: "" });
      }

      if (pathname.endsWith("/api/auth/me") && method === "GET") {
        return json(route, {
          id: "user-1",
          email: "mock@example.com",
          firstName: "Mock",
          lastName: "User",
          role: "tenant_admin",
          tenantId: "tenant-1",
          tenantName: "Mock Tenant",
        });
      }

      if (pathname.endsWith("/api/orders/queue/summary") && method === "GET") {
        return json(route, {
          success: true,
          data: { totalAwaitingOrders: 0, oldestCardAgeHours: 0, byLoopType: {} },
        });
      }

      if (pathname.endsWith("/api/orders/queue") && method === "GET") {
        return json(route, { success: true, data: { procurement: [], production: [], transfer: [] } });
      }

      if (pathname.endsWith("/api/orders/order/query") && method === "POST") {
        return json(route, { totalCount: 0, results: [] });
      }

      if (pathname.endsWith("/api/items/item/query") && method === "POST") {
        return json(route, {
          totalCount: 1,
          results: [
            {
              rId: itemEId,
              retired: false,
              asOf: { recorded: Date.now(), effective: Date.now() },
              payload: {
                eId: itemEId,
                externalGuid: itemCode,
                name: `Mock Item ${itemCode}`,
                orderMechanism: "purchase",
                location: "A1",
                minQty: 10,
                minQtyUnit: "each",
                orderQty: 20,
                orderQtyUnit: "each",
                primarySupplier: "Mock Supplier",
                primarySupplierLink: null,
                imageUrl: null,
                notes: null,
              },
            },
          ],
        });
      }

      if (pathname.endsWith("/api/notifications/unread-count") && method === "GET") {
        return json(route, { count: 0 });
      }

      if (pathname.endsWith("/api/notifications") && method === "GET") {
        return json(route, { data: [] });
      }

      if (pathname.endsWith("/api/kanban/loops") && method === "GET") {
        const pageNum = Number(url.searchParams.get("page") || "1");
        state.loopPagesRequested.push(pageNum);

        if (pageNum === 1) {
          return json(route, {
            data: [
              {
                id: "loop-other",
                partId: "other-part",
                loopType: "procurement",
                numberOfCards: 1,
                minQuantity: 10,
                orderQuantity: 20,
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                facilityId: "facility-1",
                tenantId: "tenant-1",
              },
            ],
            pagination: { page: 1, pageSize: 100, total: 2, totalPages: 2 },
          });
        }

        return json(route, {
          data: [
            {
              id: "loop-target",
              partId: itemCode,
              loopType: "procurement",
              numberOfCards: 1,
              minQuantity: 10,
              orderQuantity: 20,
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              facilityId: "facility-1",
              tenantId: "tenant-1",
            },
          ],
          pagination: { page: 2, pageSize: 100, total: 2, totalPages: 2 },
        });
      }

      if (pathname.endsWith("/api/kanban/loops/loop-target/parameters") && method === "PATCH") {
        state.loopPatchCalls += 1;
        return json(route, {
          id: "loop-target",
          partId: itemCode,
          loopType: "procurement",
          numberOfCards: 2,
          minQuantity: 10,
          orderQuantity: 20,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          facilityId: "facility-1",
          tenantId: "tenant-1",
        });
      }

      if (pathname.includes("/api/items/item/") && method === "PUT") {
        state.itemUpdateFallbackCalls += 1;
        return json(route, {});
      }

      return json(route, {});
    });

    try {
      result.steps.push("Open items page");
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "networkidle" });
      await page.waitForSelector(`text=${itemCode}`, { timeout: WAIT_TIMEOUT_MS });
      await page.screenshot({ path: artifacts.initial, fullPage: true });

      result.steps.push("Click quick action create-card button");
      const createCardBtn = page.getByRole("button", {
        name: new RegExp(`Create card for ${itemCode}`),
      });
      await createCardBtn.first().click();

      result.steps.push("Validate toast and request behavior");
      const successToast = page
        .locator("[data-sonner-toast][data-type=\"success\"]")
        .filter({ hasText: /Created card #|Created default loop and first card/i });
      await successToast.first().waitFor({ timeout: WAIT_TIMEOUT_MS });
      result.toastText = ((await successToast.first().innerText()) || "").trim();

      const sortedPages = [...state.loopPagesRequested].sort((a, b) => a - b);
      if (
        sortedPages.length < 2 ||
        sortedPages[0] !== 1 ||
        sortedPages[1] !== 2
      ) {
        throw new Error(
          `Expected paged loop lookup [1,2], got ${JSON.stringify(state.loopPagesRequested)}`,
        );
      }

      if (state.loopPatchCalls !== 1) {
        throw new Error(`Expected one loop patch call, got ${state.loopPatchCalls}`);
      }

      if (state.itemUpdateFallbackCalls !== 0) {
        throw new Error(
          `Expected zero item update fallback calls, got ${state.itemUpdateFallbackCalls}`,
        );
      }

      await page.screenshot({ path: artifacts.afterClick, fullPage: true });
      result.status = "passed";
    } catch (error) {
      result.error = {
        message: error?.message || String(error),
        stack: error?.stack || null,
      };
      await page.screenshot({ path: artifacts.failure, fullPage: true }).catch(() => {});
    } finally {
      await context.close();
      await browser.close();
    }
  } catch (error) {
    result.error = {
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
  } finally {
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill("SIGTERM");
    }
  }

  fs.writeFileSync(artifacts.reportJson, JSON.stringify(result, null, 2));
  const markdown = [
    "# Create Kanban Card Button E2E",
    "",
    `- Status: **${result.status.toUpperCase()}**`,
    `- Base URL: ${result.baseUrl}`,
    `- Item Code: ${result.itemCode}`,
    `- Toast: ${result.toastText || "(none)"}`,
    `- Loop pages requested: ${JSON.stringify(result.state.loopPagesRequested)}`,
    `- Loop patch calls: ${result.state.loopPatchCalls}`,
    `- Item update fallback calls: ${result.state.itemUpdateFallbackCalls}`,
    "",
    "## Artifacts",
    `- initial: ${artifacts.initial}`,
    `- afterClick: ${artifacts.afterClick}`,
    `- failure: ${artifacts.failure}`,
    `- reportJson: ${artifacts.reportJson}`,
    "",
  ];
  if (result.error?.message) {
    markdown.push("## Error", `- message: ${result.error.message}`);
  }
  fs.writeFileSync(artifacts.reportMd, markdown.join("\n"));

  if (result.status !== "passed") {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
