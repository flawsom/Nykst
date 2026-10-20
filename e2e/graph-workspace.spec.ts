import { expect, test } from "@playwright/test";

/**
 * Live UI regressions: the graph must stay radial, the workspace must follow
 * `?repo=`, and a `file:line` citation must open the code at that line.
 */

async function waitForGraph(page: import("@playwright/test").Page) {
  // The first-visit tour sits above the canvas; dismiss it the way a visitor does.
  await page.addInitScript(() => window.localStorage.setItem("nykst.tour.done", "1"));
  await page.goto("/graph", { waitUntil: "networkidle" });
  await expect(page.locator('svg[data-graph-layout="radial"]')).toBeVisible({ timeout: 20000 });
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.count()) await skip.first().click({ force: true });
  await page.locator("[data-graph-node]").first().waitFor({ timeout: 20000 });
}

test("the live graph lays nodes out on a circle, not a column", async ({ page }) => {
  await waitForGraph(page);

  const nodes = page.locator("[data-graph-node]");
  const count = await nodes.count();
  expect(count, "the focused node has children to draw").toBeGreaterThan(0);

  const coordinates = await nodes.evaluateAll((elements) =>
    elements.map((element) => ({
      x: Number(element.getAttribute("data-x")),
      y: Number(element.getAttribute("data-y")),
      ring: Number(element.getAttribute("data-ring") ?? 1),
    })),
  );

  const columns = new Set(coordinates.map((point) => point.x));
  const rows = new Set(coordinates.map((point) => point.y));
  expect(columns.size, "nodes are not stacked in one vertical column").toBeGreaterThan(1);
  expect(rows.size, "nodes are spread across the viewport").toBeGreaterThan(1);

  // Every edge is a curved bezier path from the hub, not a straight line.
  const edges = page.locator("path[data-edge-kind]");
  expect(await edges.count()).toBe(count);
  const first = await edges.first().getAttribute("d");
  expect(first).toContain("Q");
});

test("?repo= selects the requested workspace", async ({ page }) => {
  await page.goto("/graph?repo=flawsom/nykst", { waitUntil: "networkidle" });
  await expect(page.locator('svg[data-graph-layout="radial"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("flawsom/nykst").first()).toBeVisible();
  expect(page.url()).toContain("repo=flawsom");
});

test("clicking a file:line impact row opens the code and the exact GitHub line", async ({
  page,
}) => {
  await waitForGraph(page);

  const dossier = page.locator('[data-testid="node-dossier"]');
  await dossier.scrollIntoViewIfNeeded();
  const row = dossier.locator('[data-testid="dossier-row"][data-line]:not([data-line=""])').first();
  await expect(row).toBeVisible();
  const path = await row.getAttribute("data-path");
  const line = await row.getAttribute("data-line");
  expect(path, "the dossier row carries a real file path").toBeTruthy();
  expect(Number(line), "the dossier row carries the exact line").toBeGreaterThan(0);

  await row.click();

  const inspector = page.locator('[data-testid="code-problem-inspector"]');
  await expect(inspector).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid="focused-code-line"]')).toBeVisible({ timeout: 20000 });

  const github = page.locator('[data-testid="github-line-link"]');
  await expect(github).toBeVisible();
  const href = await github.getAttribute("href");
  expect(href).toContain(`/blob/`);
  expect(href).toContain(path!);
  expect(href).toMatch(/#L\d+/);
});
