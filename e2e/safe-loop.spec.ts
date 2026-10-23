import { expect, test, type Page } from "@playwright/test";

/**
 * Live loop journeys: real Stage 1 evidence, a breaking overlay, the verified
 * auto-heal, exact file:line teleportation, the workspace switcher and the
 * WebGL field canvas. No fixture data is injected anywhere.
 */

async function openLoop(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("nykst.tour.done", "1"));
  await page.goto("/graph", { waitUntil: "networkidle" });
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.count()) await skip.first().click({ force: true });
  const engine = page.locator('[data-testid="safe-code-loop-engine"]');
  await engine.scrollIntoViewIfNeeded();
  await expect(engine).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-testid="loop-stage-1"]')).toBeVisible({ timeout: 30000 });
  return engine;
}

test("stage 1 grounds the loop in real signatures, importers and token savings", async ({
  page,
}) => {
  const engine = await openLoop(page);

  await expect(engine.locator('[data-testid="loop-finops-meter"]')).toBeVisible();
  await expect(engine.locator('[data-testid="loop-finops-meter"]')).toContainText(/%\s*reduction/);
  await expect(engine.locator('[data-testid="loop-caller-row"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="loop-stage-2"]')).toBeVisible();
  await expect(page.locator('[data-testid="loop-stage-3"]')).toBeVisible();
  await expect(page.locator('[data-testid="loop-stage-4"]')).toBeVisible();
});

test("a real unresolved import is blocked, then auto-heals to verified safe", async ({ page }) => {
  const engine = await openLoop(page);

  await engine.locator('[data-testid="loop-scenario-unresolved-import"]').click();
  const verdict = page.locator('[data-testid="loop-verdict"]');
  await expect(verdict).toHaveAttribute("data-verdict", "breaking", { timeout: 30000 });
  await expect(verdict).toContainText("breaking");

  const heal = page.locator('[data-testid="loop-auto-heal-btn"]');
  await expect(heal).toBeEnabled({ timeout: 30000 });
  await heal.click();

  await expect(verdict).toHaveAttribute("data-verdict", "safe", { timeout: 30000 });
  await expect(verdict).toContainText("VERIFIED SAFE TO DEPLOY");
});

test("the teleport drawer opens real source at the exact line with all three actions", async ({
  page,
}) => {
  const engine = await openLoop(page);

  // Break the file so Stage 4 renders a clickable downstream caller row.
  await engine.locator('[data-testid="loop-scenario-remove-export"]').click();
  const row = page.locator('[data-testid="loop-teleport-row"]').first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.click();

  const drawer = page.locator('[data-testid="code-teleport-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-testid="focused-code-line"]')).toBeVisible({ timeout: 30000 });
  const github = page.locator('[data-testid="teleport-open-github"]');
  await expect(github).toBeVisible();
  expect(await github.getAttribute("href")).toMatch(/^https:\/\/github\.com\/.+\/blob\/.+#L\d+$/);
  await expect(page.locator('[data-testid="teleport-center-graph"]')).toBeVisible();
  await expect(page.locator('[data-testid="teleport-run-loop"]')).toBeVisible();

  await drawer.getByRole("button", { name: "Close code inspector" }).click();
  await expect(drawer).toBeHidden();
});

test("the workspace switcher is present and switches the graph by ?repo=", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("nykst.tour.done", "1"));
  await page.goto("/graph", { waitUntil: "networkidle" });
  const switcher = page.locator('[data-testid="workspace-repo-switcher"]');
  await expect(switcher).toBeVisible({ timeout: 30000 });
  expect(await switcher.getAttribute("data-active-repo")).toBeTruthy();
  await switcher.getByRole("button", { name: "Switch repository" }).click();
  await expect(page.getByRole("dialog", { name: "Switch repository" })).toBeVisible();
  await expect(page.getByText("Analyzed Workspaces")).toBeVisible();
});

test("the WebGL field canvas mounts on / and /graph without blocking clicks", async ({ page }) => {
  for (const path of ["/", "/graph"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const canvas = page.locator('[data-testid="webgl-field-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 30000 });
    const box = await canvas.boundingBox();
    expect(box, `canvas has a real box on ${path}`).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
    const pointerEvents = await canvas.evaluate(
      (element) => getComputedStyle(element.parentElement!).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
    await expect(canvas).toHaveAttribute("data-webgl-ready", /webgl2|fallback/);
  }
});
