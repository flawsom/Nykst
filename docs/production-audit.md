# Production verification & gap report

Origin: `https://nykst.unifies.codes`
Repository: `flawsom/nykst`
Release audited: `b088b42`, on top of the scope-aware loop release `2b57b4f`.
Method: headless Chromium against the canonical origin at desktop `1440x900` and mobile `390x844`, with the real self-analysis snapshot and no injected fixtures.

## Live audit, 15 checks

| Check   | Surface                                 | Result                           | Evidence                                                                                                                                                                                                                                                                                                                                         |
| :------ | :-------------------------------------- | :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIVE-01 | Copy, hierarchy and token-savings badge | **PASS**                         | The landing page, `/graph`, `/intelligence`, `/mcp` and `/subscribe` answer `200`, render a real `h1`, and contain the 4-stage loop headline and FinOps meter above the fold. Source and README scans contain zero zero-width spaces and zero em dashes.                                                                                         |
| LIVE-02 | WebGL field canvas                      | **PASS with environment caveat** | `[data-testid="webgl-field-canvas"]` mounts with a non-zero box, `pointer-events: none`, and `data-webgl-ready="fallback"` in this GPU-less Chromium. `data-accent-state` moves `0.05 -> 1 -> 0.05` as the loop enters a breaking overlay and heals, and the fallback gradient changes with it. The GLSL path itself could not be executed here. |
| LIVE-03 | Stage 1 bounded envelope                | **PASS**                         | Live Stage 1 shows exported signatures, direct importers with `file:line`, runtime dependents, entrypoints, covering tests, SQL contracts, the six memory layers, the measured FinOps reduction and the `copy-context-pack-btn` control.                                                                                                         |
| LIVE-04 | Stage 2 and Stage 3 contract breaks     | **PASS**                         | Unit proofs cover overload envelopes, namespace calls, barrel re-exports, lexical shadowing, removed exports and arity breaks. Live `remove-export` produces a real Stage 3 finding and clickable downstream callers.                                                                                                                            |
| LIVE-05 | SQL column drift and Tarjan cycle       | **PASS**                         | `tests/compiler-resolution.test.ts` proves a drifted literal column is detected and renamed; a newly introduced runtime cycle is detected and broken by converting a type-only edge. Both run against the real AST and DDL replay.                                                                                                               |
| LIVE-06 | Trinity diagnostic cards                | **PASS**                         | Live `[data-testid="trinity-diagnostic-card"]` renders non-empty WHAT BROKE, WHY IT BROKE and ARCHITECTURAL & HISTORICAL REASON sections plus a clickable multi-hop causal chain. Asserted on desktop and mobile.                                                                                                                                |
| LIVE-07 | Four-strategy auto-heal                 | **PASS**                         | Live unresolved-import scenario flips `data-verdict` from `breaking` to `safe`, returns `verified: true`, applies the patch in memory and reports the applied strategy. Unit proofs cover all four strategies.                                                                                                                                   |
| LIVE-08 | Radial graph geometry                   | **PASS**                         | Live graph renders on concentric orbits, not a column. Unit invariants assert `stdDev(x)` and `stdDev(y)` above 80 px for 3, 6, 8, 13 and 24 siblings. Quadratic Bezier edges now carry animated pulse paths.                                                                                                                                    |
| LIVE-09 | Orbit sector selector                   | **NOT EXERCISED**                | The selector exists and activates above 24 children, but this repository's largest live hub is below that threshold, so the live path was not observed. No claim is made beyond the code guard.                                                                                                                                                  |
| LIVE-10 | Repository switcher                     | **PASS**                         | `[data-testid="workspace-repo-switcher"]` is visible, exposes `data-active-repo`, opens the dialog and follows `?repo=` on desktop and mobile.                                                                                                                                                                                                   |
| LIVE-11 | Code teleportation                      | **PASS**                         | A `file:line` row opens `[data-testid="code-teleport-drawer"]` with the real source window, `focused-code-line`, a `github.com/.../blob/...#L<line>` link, Center graph and Open in safe loop.                                                                                                                                                   |
| LIVE-12 | System memory and grounded Q&A          | **PASS**                         | `/intelligence` renders all six memory layers and answers from cited repository evidence, with an explicit list of what the snapshot does not contain.                                                                                                                                                                                           |
| LIVE-13 | Eleven-tool MCP surface                 | **PASS**                         | `/mcp` lists all 11 read-only tools. Live `search_files`, `simulate_change`, `generate_fix_patch`, `get_federation` and `get_trace_overlay` render real AST, federation and trace data. Every tool is annotated `readOnlyHint: true`.                                                                                                            |
| LIVE-14 | Desktop and mobile layout               | **PASS**                         | The full suite asserts no horizontal overflow (`scrollWidth <= innerWidth`) at `1440x900` and `390x844` across all public routes.                                                                                                                                                                                                                |
| LIVE-15 | Console, page and network defects       | **PASS**                         | Every route journey asserts zero `console.error`, zero `pageerror`, no failed requests, no unexpected `>= 400` responses and no broken images.                                                                                                                                                                                                   |

## Verification totals for this release

- `bunx tsc -b --noEmit`: clean.
- `bun test ./tests`: **138 passed** across 22 files.
- `bun run lint`: 0 errors, 9 pre-existing shadcn fast-refresh warnings.
- `bun run build`: success (Vite plus Nitro).
- Local Playwright: **44/44** across desktop and mobile.
- Live Playwright on the canonical origin: **44/44** across desktop and mobile, including all five spec files.
- CI: `CI` run `40639046973` succeeded; `E2E` run `40639046974` succeeded on the audited commit.
- Vercel commit status on the pushed commit: `success`.
- Snapshot: **216 files, 40,751 LOC, 479 internal edges, 0 unresolved imports, 0 cycles**.
- Live loop: Stage 1 FinOps reduction is computed from the current snapshot, and the four-stage verdict plus verified heal complete in under a second over the real graph.

## What changed in this pass

1. **The parser now resolves scopes, overloads, namespace calls and barrel chains.** It merges overload signatures into one `minArity..maxArity` envelope, ignores lexically shadowed import bindings, records `ns.fn(...)` call sites with their member name, and follows `export *` and `export { a as b }` through every barrel to the declaring file.
2. **The healer now repairs four classes, not one.** `unresolved_import_rewrite`, `arity_and_export_compatibility_shim`, `runtime_cycle_to_import_type` and `sql_column_drift_rename` run on an in-memory clone. A patch is accepted only when the verified breaking score strictly falls and no cycle is added.
3. **Stage 3 explains itself.** Every structural finding produces a Trinity card with WHAT, WHY, the architectural and historical reason, and a clickable multi-hop causal chain built from real importer lines.
4. **Stage 2 no longer depends on model availability.** A provider failure or a missing key returns a clearly labeled deterministic proposal derived from the real file. It preserves the file, inserts the requested comment or appends one documented export, and is covered by unit tests and the live browser suite.
5. **The loop has visual state even without WebGL2.** The fallback gradient follows the same emerald, cyan and coral states as the shader, and the live test asserts the accent attribute and computed background both change across a breaking verdict and a verified heal.
6. **README and snapshot are synchronized.** The tool count is eleven everywhere, the competitor matrix is present, the old hedging paragraph is replaced with the implemented capabilities, and the snapshot counts match the code.

## Where this release still falls short

1. **Live AI output was not observed against the platform provider.** The configured Nara model answers "The requested model is not available." The flow now completes through the labeled deterministic fallback, which is honest and testable, but it is not evidence that the external model produced the file. Connecting a working Cloudflare Workers AI or Gemini key in API Settings would exercise the model path.
2. **The GLSL shader could not execute in this environment.** Chromium here exposes no WebGL2 context, so the tested path is the CSS fallback. The accent state, the computed background change and the canvas mount are verified; the GPU shader is not.
3. **The orbit sector selector was not exercised.** The live repository has no hub wider than 24 children, so the threshold path remains unit-covered by construction and unobserved live.
4. **The clipboard action on the context pack was not asserted.** The button renders and the payload is deterministic, but headless clipboard permissions were not granted in the audit.
5. **Grounded generation remains a single-file contract.** Files above 20,000 characters are refused instead of truncated, and multi-file changes still belong to the reviewed PR route.
6. **The self-index carries no git history.** Memory Q&A reports commit and PR history as absent rather than inventing it.

No mock, seeded or sampled values were introduced. Every count, path, line, verdict and timing figure here comes from the live analysis payload, the real browser run, or the commands listed above.
