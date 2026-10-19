import { expect, test, type Page } from "@playwright/test";

type VisitResult = {
  status: number | null;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

const routes = [
  { path: "/", name: "landing" },
  { path: "/graph", name: "graph" },
  { path: "/intelligence", name: "memory" },
  { path: "/mcp", name: "mcp" },
  { path: "/subscribe", name: "subscribe" },
];

async function visit(page: Page, path: string): Promise<VisitResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("requestfailed", (request) => {
    if (request.url().includes("favicon")) return;
    failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
  });

  const response = await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  return {
    status: response?.status() ?? null,
    consoleErrors,
    pageErrors,
    failedRequests,
  };
}

for (const route of routes) {
  test(`${route.name} page renders without errors`, async ({ page }) => {
    const result = await visit(page, route.path);

    expect(result.status, `${route.path} should answer with 200`).toBe(200);
    expect(result.failedRequests, "no failed network requests").toEqual([]);
    expect(result.pageErrors, "no uncaught page errors").toEqual([]);

    // Signed-out probes of /api/ai/key and /api/integrations/github/organizations
    // answer 401 by design, so only those console errors are tolerated.
    const unexpected = result.consoleErrors.filter((line) => !line.includes("401"));
    expect(unexpected, "no unexpected console errors").toEqual([]);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("h1").first()).toBeVisible();

    const textLength = await page.evaluate(() => document.body.innerText.length);
    expect(textLength, "page has real content").toBeGreaterThan(200);

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const images = Array.from(document.images);
      return {
        overflow: root.scrollWidth - root.clientWidth,
        brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length,
        missingAlt: images.filter((image) => !image.alt.trim()).length,
      };
    });

    expect(layout.overflow, "no horizontal overflow").toBeLessThanOrEqual(1);
    expect(layout.brokenImages, "no broken images").toBe(0);
    expect(layout.missingAlt, "every image has alt text").toBe(0);
  });
}

test("health endpoint answers with JSON", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
});

test("hosted self-analysis reports the public repository", async ({ request }) => {
  const response = await request.get("/api/analysis/self");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.repository).toBe("flawsom/nykst");
  expect(body.stats.analyzedFiles).toBeGreaterThan(80);
  expect(Array.isArray(body.cycles)).toBe(true);
  expect(body.cycles.length).toBe(0);
  expect(body.domains.length).toBeGreaterThan(4);
  expect(body.resources.length).toBeGreaterThan(0);
  expect(body.selectedTarget.briefing.impact).toBeTruthy();
});
