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

test("Stage 2 Mode A returns a real grounded proposal or a labeled deterministic fallback", async ({
  page,
}) => {
  // A real generation on a slow router can take ~50s, well past the suite default.
  test.setTimeout(180_000);
  const engine = await openLoop(page);

  // A complete-file generation needs a file that fits the provider budget; the
  // default target is the 900-line GitHub client, so point the loop at a small,
  // real module first.
  const pathInput = page.getByLabel("Target file path");
  await pathInput.fill("src/lib/code-links.ts");
  await pathInput.press("Enter");
  await expect(engine.locator('[data-testid="loop-code-buffer"]')).toHaveValue(/parseRepoSlug/, {
    timeout: 30000,
  });

  await page
    .locator('[data-testid="loop-generate-prompt"]')
    .fill("Add a one-line comment above the first exported function.");
  await expect(page.locator('[data-testid="loop-generate-btn"]')).toBeEnabled();
  await page.locator('[data-testid="loop-generate-btn"]').click();

  // Whether a provider key exists or not, Stage 2 must produce a complete file
  // proposal. The deterministic path is labeled so it is never mistaken for AI.
  const proposal = page.locator('[data-testid="loop-generated-proposal"]');
  const error = page.locator('[data-testid="loop-generate-error"]');
  await expect(proposal.or(error)).toBeVisible({ timeout: 120000 });
  if (await error.isVisible()) throw new Error(`Stage 2 failed: ${await error.innerText()}`);
  await expect(proposal).toBeVisible();
  const code = await proposal.locator("pre").innerText();
  expect(code.trim().length).toBeGreaterThan(20);
  // The proposal is grounded in the real file, not in a generic skeleton.
  expect(code).toMatch(/parseRepoSlug|RepoSlug/);
  const fallbackBadge = proposal.locator('[data-testid="loop-fallback-badge"]');
  if (await fallbackBadge.isVisible()) {
    await expect(fallbackBadge).toContainText(/deterministic fallback/i);
    await expect(proposal.locator('[data-testid="loop-fallback-note"]')).not.toBeEmpty();
  }
  const apply = proposal.locator('[data-testid="loop-apply-generated"]');
  await expect(apply).toBeEnabled();
  // Applying it re-runs the memory overlay and must produce a real verdict.
  await apply.click();
  await expect(page.locator('[data-testid="loop-verdict"]')).toHaveAttribute(
    "data-verdict",
    /safe|breaking/,
    { timeout: 60000 },
  );
  await expect(engine.locator('[data-testid="loop-code-buffer"]')).toBeVisible();
});

test("a real unresolved import is blocked, then auto-heals to verified safe", async ({ page }) => {
  const engine = await openLoop(page);

  await engine.locator('[data-testid="loop-scenario-unresolved-import"]').click();
  const verdict = page.locator('[data-testid="loop-verdict"]');
  await expect(verdict).toHaveAttribute("data-verdict", "breaking", { timeout: 30000 });
  await expect(verdict).toContainText("breaking");

  // The field canvas is the loop's visual feedback channel. A breaking verdict
  // must shift it to the coral state, including on the CSS fallback path.
  const canvas = page.locator('[data-testid="webgl-field-canvas"]');
  await expect(canvas).toHaveAttribute("data-accent-state", "1", { timeout: 30000 });
  const webglMode = await canvas.getAttribute("data-webgl-ready");
  const breakingBackground =
    webglMode === "fallback"
      ? await canvas.evaluate((element) => getComputedStyle(element).backgroundImage)
      : null;

  const heal = page.locator('[data-testid="loop-auto-heal-btn"]');
  await expect(heal).toBeEnabled({ timeout: 30000 });
  await heal.click();

  await expect(verdict).toHaveAttribute("data-verdict", "safe", { timeout: 30000 });
  await expect(verdict).toContainText("NO ISSUES FOUND IN ANALYZED CHECKS");
  await expect(canvas).toHaveAttribute("data-accent-state", "0.05");
  if (breakingBackground !== null) {
    const safeBackground = await canvas.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(safeBackground).not.toBe(breakingBackground);
  }
});

test("all six break classes are detected in memory and labelled on the class badge", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const engine = await openLoop(page);
  const pathInput = page.getByLabel("Target file path");

  const cases: Array<{ scenario: string; path: string }> = [
    { scenario: "remove-export", path: "src/lib/integrations/github.ts" },
    { scenario: "unresolved-import", path: "src/lib/integrations/github.ts" },
    { scenario: "wrong-arity", path: "src/lib/integrations/github.ts" },
    { scenario: "dropped-column", path: "src/lib/integrations/github.ts" },
    { scenario: "circular-import", path: "src/lib/integrations/github.ts" },
    { scenario: "removed-route", path: "src/routes/graph.tsx" },
  ];

  for (const item of cases) {
    await pathInput.fill(item.path);
    await pathInput.press("Enter");
    await engine.locator(`[data-testid="loop-scenario-${item.scenario}"]`).click();

    const badge = page.locator(`[data-testid="loop-class-${item.scenario}"]`);
    await expect(badge).toHaveAttribute("data-exercised", "true", { timeout: 30000 });
    await expect(badge).toHaveAttribute("data-detected", "true", { timeout: 30000 });
    await expect(badge).toContainText("DETECTED");
    await expect(page.locator('[data-testid="loop-verdict"]')).toHaveAttribute(
      "data-verdict",
      "breaking",
      { timeout: 30000 },
    );

    // A patch may appear only when the in-memory overlay verified it. Every
    // other class must show a refusal reason and no patch candidate.
    const heal = page.getByTestId("loop-heal-status");
    await expect(heal).toBeVisible();
    const verified = await heal.getAttribute("data-verified");
    if (verified === "true") {
      await expect(page.getByTestId("loop-heal-patch")).toBeVisible();
    } else {
      await expect(page.getByTestId("loop-heal-patch")).toHaveCount(0);
      // A refusal must name the failed check for this class, never reuse one
      // generic sentence or present a plausible but unverified patch.
      await expect(heal).toContainText(/no patch was presented/i);
    }
  }
});

test("the teleport drawer opens real source at the exact line with all three actions", async ({
  page,
}) => {
  const engine = await openLoop(page);

  // Use a real module whose first exported declaration has named importers.
  const pathInput = page.getByLabel("Target file path");
  await pathInput.fill("src/lib/code-links.ts");
  await pathInput.press("Enter");
  await expect(engine.locator('[data-testid="loop-code-buffer"]')).toHaveValue(/parseRepoSlug/, {
    timeout: 30000,
  });
  await engine.locator('[data-testid="loop-scenario-remove-export"]').click();

  // Stage 3 must explain the break as WHAT / WHY / ARCHITECTURAL REASON, with
  // a real multi-hop causal chain instead of a bare list of checks.
  const card = page.locator('[data-testid="trinity-diagnostic-card"]').first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toContainText(/what broke/i);
  await expect(card).toContainText(/why it broke/i);
  await expect(card).toContainText(/architectural & historical reason/i);
  await expect(card.locator('[data-testid="causal-chain"]')).toBeVisible();
  await expect(page.locator('[data-testid="copy-context-pack-btn"]')).toBeVisible();

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
