import { defineConfig, devices } from "@playwright/test";

// Point the same suite at a deployed origin with E2E_BASE_URL=https://nykst.unifies.codes.
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // The Nitro build in .output is the real server; `vite preview` expects the
        // TanStack Start dev build layout and fails on it.
        command: "PORT=4174 HOST=127.0.0.1 node .output/server/index.mjs",
        url: "http://127.0.0.1:4174",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
