import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Captures the product screens used by the README gallery.
 *
 *   bun run build && bun run screens          # build, serve .output, capture
 *   BASE=https://nykst.unifies.codes bun run screens
 *
 * When BASE is omitted the script starts the built Nitro server on port 4175,
 * captures every view, then shuts the server down.
 */

const outDir = path.resolve("docs/assets/screens");
const localPort = 4175;
const localBase = `http://127.0.0.1:${localPort}`;
const base = process.env.BASE?.replace(/\/$/, "") || localBase;

const desktopShots = [
  ["/", "landing.png"],
  ["/graph", "graph.png"],
  ["/intelligence", "memory.png"],
  ["/subscribe", "pricing.png"],
  ["/mcp", "mcp.png"],
];

const mobileShots = [
  ["/", "mobile.png"],
  ["/graph", "mobile-graph.png"],
  ["/mcp", "mobile-mcp.png"],
];

fs.mkdirSync(outDir, { recursive: true });

let server = null;

async function waitForServer(url, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still binding; try again.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`server did not become ready at ${url}`);
}

async function startLocalServer() {
  server = spawn("node", [".output/server/index.mjs"], {
    env: { ...process.env, PORT: String(localPort), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(localBase);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failed = false;

async function capture(viewport, isMobile, shots) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  for (const [route, file] of shots) {
    const target = `${base}${route}`;
    try {
      const response = await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
      if (!response || response.status() >= 400) {
        throw new Error(`HTTP ${response ? response.status() : "no response"}`);
      }
      await page.waitForTimeout(1400);
      const output = path.join(outDir, file);
      await page.screenshot({ path: output, fullPage: false });
      console.log(`${file} ${fs.statSync(output).size} bytes from ${target}`);
    } catch (error) {
      failed = true;
      console.error(`${file} failed from ${target}: ${error instanceof Error ? error.message : error}`);
    }
  }

  await context.close();
}

try {
  if (!process.env.BASE) await startLocalServer();
  await capture({ width: 1440, height: 900 }, false, desktopShots);
  await capture({ width: 390, height: 844 }, true, mobileShots);
} finally {
  await browser.close();
  if (server) server.kill("SIGTERM");
}

if (failed) process.exit(1);
