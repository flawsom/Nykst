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
    // answer 401 by design, and the readiness probe answers 503 when Supabase is
    // not provisioned (CI): those are expected, not page errors.
    const expectedFailureCodes = ["401", "503"];
    const unexpected = result.consoleErrors.filter(
      (line) => !expectedFailureCodes.some((code) => line.includes(code)),
    );
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
  // A provisioned environment answers 200; an unprovisioned one (CI) answers
  // 503 with the same measured report. Both are the documented readiness contract.
  expect([200, 503]).toContain(response.status());
  expect(response.headers()["content-type"]).toContain("application/json");

  const body = await response.json();
  expect(body).toBeTruthy();
  expect(typeof body).toBe("object");
  expect(typeof body.status).toBe("string");
  expect(typeof body.configured).toBe("boolean");
  expect(typeof body.reachable).toBe("boolean");
  expect(Array.isArray(body.missing)).toBe(true);
  // The status code and the reported readiness must agree.
  expect(body.status === "ok").toBe(response.status() === 200);
});

test("memory Q&A answers from real repository evidence", async ({ page }) => {
  // A grounded answer on a slow router takes ~50s; the evidence fallback is instant.
  test.setTimeout(180_000);
  await page.goto("/intelligence", { waitUntil: "networkidle" });
  const input = page.locator('[data-testid="memory-ask-input"]');
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill("Which files implement the safe-coding loop, and what do they import?");
  await page.locator('[data-testid="memory-ask-btn"]').click();

  const result = page.locator('[data-testid="memory-ask-result"]');
  await expect(result).toBeVisible({ timeout: 150000 });
  const text = await result.innerText();
  expect(text.length, "the answer carries a real payload").toBeGreaterThan(200);
  // Either a provider answer or the verbatim fallback, but always real paths from the snapshot.
  expect(text).toMatch(/src\/|supabase\/|e2e\//);
  expect(text.toLowerCase()).not.toContain("grounded in the latest repository snapshot");
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
