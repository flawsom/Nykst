import { expect, test, type Page } from "@playwright/test";

/**
 * Six-level navigation: clicking an orbital node must re-center the graph,
 * extend the breadcrumb, and replace the evidence dossier with the new node.
 */

async function openGraph(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("nykst.tour.done", "1"));
  await page.goto("/graph", { waitUntil: "networkidle" });
  await expect(page.locator('svg[data-graph-layout="radial"]')).toBeVisible({ timeout: 30000 });
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.count()) await skip.first().click({ force: true });
  await expect(page.locator("[data-graph-node]").first()).toBeVisible({ timeout: 30000 });
}

async function labelOf(page: Page) {
  return (await page.locator("h1").first().innerText()).trim();
}

test("clicking a node drills two levels and keeps the breadcrumb and dossier in sync", async ({
  page,
}) => {
  await openGraph(page);
  const root = await labelOf(page);
  const crumbBefore = await page.locator("header nav button").count();

  const first = page.locator('[data-graph-node]:not([data-graph-node*="|f:"])').first();
  const firstLabel = ((await first.locator("text").first().textContent()) ?? "").trim();
  await first.locator("text").first().click();

  await expect.poll(async () => labelOf(page), { timeout: 20000 }).not.toBe(root);
  await expect(page.locator("h1").first()).toHaveText(firstLabel);
  await expect
    .poll(async () => page.locator("header nav button").count(), { timeout: 20000 })
    .toBeGreaterThan(crumbBefore);
  await expect(page.locator('[data-testid="node-dossier"]')).toContainText(firstLabel);

  // Second level: wait for the orbit transition to settle, then drill again.
  await page.waitForTimeout(900);
  const crumbAtLevelOne = await page.locator("header nav button").count();
  const child = page.locator('[data-graph-node]:not([data-graph-node*="|f:"])').first();
  const childLabel = ((await child.locator("text").first().textContent()) ?? "").trim();
  await child.locator("text").first().click();

  await expect(page.locator("h1").first()).toHaveText(childLabel, { timeout: 20000 });
  await expect
    .poll(async () => page.locator("header nav button").count(), { timeout: 20000 })
    .toBeGreaterThan(crumbAtLevelOne);
  await expect(page.locator('[data-testid="node-dossier"]')).toContainText(childLabel);
});

test("the loop engine follows the selected file when a citation opens it", async ({ page }) => {
  await openGraph(page);
  await page.locator('[data-testid="safe-code-loop-engine"]').scrollIntoViewIfNeeded();

  const target = page.locator('[data-testid="loop-caller-row"]').first();
  await expect(target).toBeVisible({ timeout: 30000 });
  const path = (await target.innerText()).split(":")[0]!.trim();
  expect(path).toContain("/");

  await target.click();
  const drawer = page.locator('[data-testid="code-teleport-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-testid="focused-code-line"]')).toBeVisible({ timeout: 30000 });

  await drawer.getByRole("button", { name: "Close code inspector" }).click();
  await expect(drawer).toBeHidden();
});
