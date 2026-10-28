import { expect, test } from "@playwright/test";

/**
 * End-to-end verification of the 11 read-only MCP tools, the in-memory
 * `simulate_change` overlay, and the `generate_fix_patch` machine-verified
 * remediation diff, exercised both on `/mcp` and on the live workbench (`/`).
 */

test("MCP tools page lists all 11 tools, runs search_files with real data, executes simulate_change overlay, and verifies generate_fix_patch remediation", async ({
  page,
}) => {
  await page.goto("/mcp", { waitUntil: "networkidle" });

  // Verify the page header and all 11 MCP tool triggers exist
  await expect(page.locator("h1")).toContainText("Use Nykst inside your AI coding agent");

  const toolNames = [
    "get_impact",
    "find_usages",
    "get_architecture",
    "search_files",
    "list_repositories",
    "search_memory",
    "get_federation",
    "get_trace_overlay",
    "simulate_change",
    "generate_fix_patch",
    "run_safe_code_loop",
  ];
  for (const name of toolNames) {
    await expect(page.getByTestId(`mcp-page-tool-${name}`)).toBeVisible();
  }

  // 1. Interact with `search_files` and verify real, non-mocked repository output
  const queryInput = page.getByTestId("mcp-page-query-input");
  await queryInput.fill("analyzeRepository");
  await page.getByTestId("mcp-page-tool-search_files").click();

  const outputPre = page.getByTestId("mcp-page-output");
  await expect(outputPre).toContainText('"repository": "flawsom/nykst"', { timeout: 15000 });
  await expect(outputPre).toContainText("src/lib/analysis/engine.server.ts");
  await expect(outputPre).toContainText("analyzeRepository");

  const searchJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    repository?: string;
    results?: Array<{ path: string; exports: string[]; signatures?: string[] }>;
  };
  expect(searchJson.repository).toBe("flawsom/nykst");
  expect(Array.isArray(searchJson.results)).toBe(true);
  expect(searchJson.results!.some((r) => r.path === "src/lib/analysis/engine.server.ts")).toBe(
    true,
  );

  // 2. Switch to `simulate_change`, verify the in-memory overlay UI appears, and run it
  await page.getByTestId("mcp-page-tool-simulate_change").click();

  const overlayPanel = page.getByTestId("mcp-page-simulate-overlay");
  await expect(overlayPanel).toBeVisible();
  await expect(overlayPanel).toContainText("In-Memory Overlay Buffer");

  const textarea = page.getByTestId("mcp-page-simulate-textarea");
  await expect(textarea).toBeVisible();
  await textarea.fill(
    `import { brokenSymbol } from "./missing-simulated-target";\nexport const checkOverlay = brokenSymbol;\n`,
  );

  await page.getByTestId("mcp-page-run-overlay").click();

  await expect(outputPre).toContainText('"persisted": false', { timeout: 15000 });
  await expect(outputPre).toContainText("./missing-simulated-target");

  const simJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    overlay?: { kind: string; persisted: boolean; changed: string[] };
    new_unresolved_imports?: Array<{ path: string; specifier: string }>;
    before?: { files: number };
    after?: { files: number; unresolved: number };
  };
  expect(simJson.overlay?.kind).toBe("in-memory");
  expect(simJson.overlay?.persisted).toBe(false);
  expect(simJson.before?.files).toBeGreaterThan(80);
  expect(
    simJson.new_unresolved_imports?.some((u) => u.specifier === "./missing-simulated-target"),
  ).toBe(true);

  // 3. Activate `generate_fix_patch` and verify machine-verified remediation diff output
  await textarea.fill(
    `import { parseRepoSlug } from "./wrong-folder/code-links";\nexport const remediated = parseRepoSlug;\n`,
  );
  await page.getByTestId("mcp-page-tool-generate_fix_patch").click();

  await expect(overlayPanel).toContainText("Machine-Verified Remediation Buffer");
  await expect(outputPre).toContainText('"remediation": "machine-verified"', { timeout: 15000 });
  await expect(outputPre).toContainText('"verified": true');
  await expect(outputPre).toContainText("Machine-verified remediation");
  await expect(outputPre).toContainText("--- a/src/lib/integrations/github.ts");
  await expect(outputPre).toContainText("+++ b/src/lib/integrations/github.ts");

  const fixJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    verified?: boolean;
    remediation?: string;
    patch?: string;
    verification?: {
      unresolved_before: number;
      unresolved_after: number;
      applied_in_memory: boolean;
      persisted: boolean;
    };
    candidates?: Array<{ specifier: string; target: string; replacement: string }>;
  };
  expect(fixJson.verified).toBe(true);
  expect(fixJson.remediation).toBe("machine-verified");
  expect(fixJson.patch).toContain('-import { parseRepoSlug } from "./wrong-folder/code-links";');
  expect(fixJson.patch).toContain('+import { parseRepoSlug } from "../code-links";');
  expect(fixJson.verification?.unresolved_before).toBe(1);
  expect(fixJson.verification?.unresolved_after).toBe(0);
  expect(fixJson.verification?.applied_in_memory).toBe(true);
  expect(fixJson.verification?.persisted).toBe(false);
  expect(fixJson.candidates?.[0]?.target).toBe("src/lib/code-links.ts");

  // 4. `get_trace_overlay`: OTLP spans resolved onto the live compiled graph, with a visual overlay
  await page.getByTestId("mcp-page-tool-get_trace_overlay").click();

  const tracePanel = page.getByTestId("mcp-page-trace-overlay");
  await expect(tracePanel).toBeVisible({ timeout: 20000 });
  await expect(tracePanel).toContainText("OTLP Runtime Trace Overlay");
  await expect(tracePanel).toContainText("100% coverage");
  await expect(tracePanel).toContainText("src/lib/integrations/github.ts");
  await expect(tracePanel).toContainText("Observed files");
  await expect(tracePanel).toContainText("Observed call edges");
  await expect(tracePanel).toContainText("static");

  await expect(outputPre).toContainText('"coverage": 1', { timeout: 20000 });
  const traceJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    repository?: string;
    commit?: string;
    spans: number;
    matchedSpans: number;
    coverage: number;
    files: Array<{ path: string; p95Ms: number; errors: number; staticDependents: number }>;
    edges: Array<{ from: string; to: string; calls: number; p95Ms: number; static: boolean }>;
    unmatchedFiles?: Array<{ filePath: string; spans: number }>;
  };
  expect(traceJson.repository).toBe("flawsom/nykst");
  expect(traceJson.commit).toMatch(/^(live-workspace|self-snapshot)$/);
  expect(traceJson.spans).toBeGreaterThanOrEqual(2);
  expect(traceJson.matchedSpans).toBe(traceJson.spans);
  expect(traceJson.coverage).toBe(1);
  const tracedRoot = traceJson.files.find((file) => file.path === "src/lib/integrations/github.ts");
  expect(tracedRoot).toBeDefined();
  expect(tracedRoot!.p95Ms).toBeGreaterThan(0);
  expect(tracedRoot!.staticDependents).toBeGreaterThan(0);
  expect(traceJson.edges.length).toBeGreaterThanOrEqual(1);
  expect(traceJson.edges.every((edge) => edge.from === "src/lib/integrations/github.ts")).toBe(
    true,
  );
  expect(traceJson.edges.every((edge) => edge.static)).toBe(true);
  expect(traceJson.edges.every((edge) => edge.calls > 0 && edge.p95Ms > 0)).toBe(true);
  expect(traceJson.unmatchedFiles ?? []).toEqual([]);

  // 5. `get_federation`: real consumer call sites bound to the repository's published contract
  await page.getByTestId("mcp-page-tool-get_federation").click();

  const federationPanel = page.getByTestId("mcp-page-federation");
  await expect(federationPanel).toBeVisible({ timeout: 20000 });
  await expect(federationPanel).toContainText("Cross-Repository Contract Federation");
  await expect(federationPanel).toContainText("4 operations");
  await expect(federationPanel).toContainText("federated edges");
  await expect(federationPanel).toContainText("callMcpTool");
  await expect(federationPanel).toContainText("src/components/graph/ConnectAiTools.tsx:43");
  await expect(federationPanel).toContainText("openapi");

  await expect(outputPre).toContainText('"operations": 4', { timeout: 20000 });
  const federationJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    repositories: Array<{ repository: string; analyzed_at: string }>;
    operations: number;
    services: number;
    edges: Array<{
      fromPath: string;
      line: number;
      toRepository: string;
      operationId: string;
      protocol: string;
      matchedBy: string;
    }>;
    unmatchedEndpoints?: number;
    limitations: string[];
  };
  expect(federationJson.repositories.map((repo) => repo.repository)).toEqual(["flawsom/nykst"]);
  expect(Date.parse(federationJson.repositories[0]!.analyzed_at)).not.toBeNaN();
  expect(federationJson.operations).toBe(4);
  expect(federationJson.services).toBe(0);
  expect(federationJson.edges.length).toBeGreaterThanOrEqual(3);
  const mcpEdge = federationJson.edges.find(
    (edge) =>
      edge.operationId === "callMcpTool" &&
      edge.fromPath === "src/components/graph/ConnectAiTools.tsx",
  );
  expect(mcpEdge).toBeDefined();
  expect(mcpEdge!.line).toBe(43);
  expect(mcpEdge!.toRepository).toBe("flawsom/nykst");
  expect(mcpEdge!.protocol).toBe("openapi");
  expect(mcpEdge!.matchedBy).toBe("exact");
  expect(federationJson.edges.some((edge) => edge.operationId === "getSelfAnalysis")).toBe(true);
  expect(federationJson.edges.some((edge) => edge.operationId === "getHealth")).toBe(true);
  expect(federationJson.unmatchedEndpoints).toBeGreaterThan(0);
  expect(federationJson.limitations.join(" ")).not.toContain("No OpenAPI or gRPC contracts");
});

test("Landing 11-Tool MCP Runner executes search_files, simulate_change overlay, and generate_fix_patch with real AST data", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const mcpTab = page.getByTestId("workbench-tab-mcp");
  await mcpTab.scrollIntoViewIfNeeded();
  await mcpTab.click();

  // Confirm tool buttons are rendered in the workbench
  await expect(page.getByTestId("mcp-tool-search_files")).toBeVisible();
  await expect(page.getByTestId("mcp-tool-simulate_change")).toBeVisible();
  await expect(page.getByTestId("mcp-tool-generate_fix_patch")).toBeVisible();
  await expect(page.getByTestId("mcp-tool-run_safe_code_loop")).toBeVisible();

  // Run `search_files` with a real symbol query
  const queryInput = page.getByTestId("mcp-query-input");
  await queryInput.fill("radialLayout");
  await page.getByTestId("mcp-tool-search_files").click();

  const outputPre = page.getByTestId("mcp-output-pre");
  await expect(outputPre).toContainText("src/lib/graph-layout.ts", { timeout: 15000 });
  await expect(outputPre).toContainText("radialLayout");

  // Select `simulate_change` and confirm the overlay buffer panel and execution
  await page.getByTestId("mcp-tool-simulate_change").click();
  const overlayPanel = page.getByTestId("mcp-simulate-overlay-panel");
  await expect(overlayPanel).toBeVisible();
  await expect(overlayPanel).toContainText("In-Memory Overlay Buffer");

  const simTextarea = page.getByTestId("mcp-simulate-textarea");
  await simTextarea.fill(
    `import { unresolvable } from "./non-existent-overlay-dep";\nexport const overlayTest = unresolvable;\n`,
  );
  await page.getByTestId("mcp-run-overlay-button").click();

  await expect(outputPre).toContainText("./non-existent-overlay-dep", { timeout: 15000 });
  await expect(outputPre).toContainText('"persisted": false');

  // Switch to `generate_fix_patch` and confirm machine-verified remediation diff generation
  await simTextarea.fill(
    `import { parseRepoSlug } from "./broken-path/code-links";\nexport const fixedSymbol = parseRepoSlug;\n`,
  );
  await page.getByTestId("mcp-tool-generate_fix_patch").click();

  await expect(overlayPanel).toContainText("Machine-Verified Remediation Buffer");
  await expect(outputPre).toContainText('"remediation": "machine-verified"', { timeout: 15000 });
  await expect(outputPre).toContainText('"verified": true');
  await expect(outputPre).toContainText("Machine-verified remediation");
  await expect(outputPre).toContainText('"replacement": "../code-links"');

  const landingFixJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    verified?: boolean;
    remediation?: string;
    patch?: string;
  };
  expect(landingFixJson.verified).toBe(true);
  expect(landingFixJson.remediation).toBe("machine-verified");
  expect(landingFixJson.patch).toContain('+import { parseRepoSlug } from "../code-links";');

  // Run `get_trace_overlay` and confirm the OTLP overlay resolves real files and edges
  await page.getByTestId("mcp-tool-get_trace_overlay").click();
  const tracePanel = page.getByTestId("mcp-trace-overlay-panel");
  await expect(tracePanel).toBeVisible({ timeout: 20000 });
  await expect(tracePanel).toContainText("OTLP Runtime Trace Overlay");
  await expect(tracePanel).toContainText("100% coverage");
  await expect(tracePanel).toContainText("Observed call edges");
  await expect(tracePanel).toContainText("static");

  await expect(outputPre).toContainText('"coverage": 1', { timeout: 20000 });
  const landingTraceJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    repository?: string;
    spans: number;
    matchedSpans: number;
    files: Array<{ path: string; p95Ms: number; staticDependents: number }>;
    edges: Array<{ from: string; static: boolean }>;
  };
  expect(landingTraceJson.repository).toBe("flawsom/nykst");
  expect(landingTraceJson.spans).toBeGreaterThanOrEqual(2);
  expect(landingTraceJson.matchedSpans).toBe(landingTraceJson.spans);
  expect(landingTraceJson.files.map((file) => file.path)).toContain(
    "src/lib/integrations/github.ts",
  );
  expect(landingTraceJson.files.every((file) => file.p95Ms > 0)).toBe(true);
  expect(landingTraceJson.edges.length).toBeGreaterThanOrEqual(1);
  expect(landingTraceJson.edges.every((edge) => edge.static)).toBe(true);

  // Run `get_federation` and confirm real contract edges plus the federation panel
  await page.getByTestId("mcp-tool-get_federation").click();
  const federationPanel = page.getByTestId("mcp-federation-panel");
  await expect(federationPanel).toBeVisible({ timeout: 20000 });
  await expect(federationPanel).toContainText("Cross-Repository Contract Federation");
  await expect(federationPanel).toContainText("4 operations");
  await expect(federationPanel).toContainText("callMcpTool");
  await expect(federationPanel).toContainText("openapi");

  await expect(outputPre).toContainText('"operations": 4', { timeout: 20000 });
  const landingFederationJson = JSON.parse((await outputPre.textContent()) ?? "{}") as {
    repositories: Array<{ repository: string }>;
    operations: number;
    edges: Array<{ fromPath: string; operationId: string; matchedBy: string }>;
  };
  expect(landingFederationJson.repositories.map((repo) => repo.repository)).toEqual([
    "flawsom/nykst",
  ]);
  expect(landingFederationJson.edges.length).toBeGreaterThanOrEqual(3);
  expect(landingFederationJson.edges.every((edge) => edge.matchedBy === "exact")).toBe(true);
  expect(landingFederationJson.edges.some((edge) => edge.operationId === "callMcpTool")).toBe(true);
});
