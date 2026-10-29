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

test("a file click agrees across header, breadcrumb, dossier, mentor and reload", async ({
  page,
}) => {
  await openGraph(page);
  await page.getByTestId("graph-view-list").click();

  // Walk down until this level contains a real file row.
  let fileRow = page.locator('[data-testid="graph-node-row"][data-expandable="false"]').first();
  for (let depth = 0; depth < 4 && (await fileRow.count()) === 0; depth += 1) {
    const next = page.locator('[data-testid="graph-node-row"][data-expandable="true"]').first();
    await expect(next).toBeVisible({ timeout: 20000 });
    await next.click();
    await page.waitForTimeout(500);
    fileRow = page.locator('[data-testid="graph-node-row"][data-expandable="false"]').first();
  }
  await expect(fileRow).toBeVisible({ timeout: 20000 });
  const label = (await fileRow.locator("[data-node-label]").innerText()).trim();
  await fileRow.click();

  await expect(page.locator("h1").first()).toHaveText(label);
  await expect(page.getByTestId("graph-selected-file")).toHaveText(label);
  await expect(page.getByTestId("graph-selected-path")).toBeVisible();
  await expect(page.locator('[data-testid="node-dossier"]')).toContainText(label);
  await expect(page.locator('[data-testid="graph-node-list"]')).toHaveAttribute(
    "data-selected-id",
    /.+/,
  );
  expect(new URL(page.url()).searchParams.get("file")).toContain("/");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toHaveText(label, { timeout: 30000 });
  await expect(page.getByTestId("graph-selected-file")).toHaveText(label);
});

test("ten file clicks in a row keep header, breadcrumb, dossier, mentor and URL on the full path", async ({
  page,
}) => {
  await openGraph(page);
  await page.getByTestId("graph-view-list").click();

  // src/routes holds far more than ten real file rows, all directly visible at
  // this level, so the same list stays in place while files are selected.
  const routesRow = page
    .locator('[data-testid="graph-node-row"]')
    .filter({ hasText: "src/routes" })
    .first();
  await expect(routesRow).toBeVisible({ timeout: 20000 });
  await routesRow.click();

  const rows = page.locator('[data-testid="graph-node-row"][data-expandable="false"]');
  await expect(rows.nth(9)).toBeVisible({ timeout: 20000 });

  for (let index = 0; index < 10; index += 1) {
    const row = rows.nth(index);
    const label = (await row.locator("[data-node-label]").innerText()).trim();
    await row.click();

    const filePath = new URL(page.url()).searchParams.get("file");
    expect(filePath, `click ${index + 1} writes the full path to the URL`).toContain(
      `src/routes/${label}`,
    );
    await expect(page.locator("h1").first()).toHaveText(label);
    await expect(page.getByTestId("graph-selected-file")).toHaveText(label);
    await expect(page.getByTestId("graph-selected-path")).toContainText(filePath!);
    await expect(page.locator('[data-testid="node-dossier"]')).toContainText(label);
    await expect(page.getByTestId("mentor-panel")).toHaveAttribute("data-node-path", filePath!);
  }
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
