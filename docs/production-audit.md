# Production verification & gap report

Origin: `https://nykst.unifies.codes`
Repository: `flawsom/nykst`
Release audited: `84a4d5b` (feature release `d2f82e4` plus the source-less-host fix). Later commits only change section copy.

## What was measured

| Audit | Surface | Result | Evidence |
| :---- | :------ | :----- | :------- |
| 01 | First impression & copy | **PASS** | Live HTML contains "Know the blast radius before you change the code" and the new subheadline. `rg` over `src/`, `README.md`, `docs/`, `public/` returns zero "Google Maps", "vector chunks", "vector store", "wrapper", "chat-with-code" or "Software is not prose". |
| 02 | WebGL fluid & prism canvas | **PASS** | Playwright asserted a non-zero canvas box on `/` and `/graph`, `pointer-events: none`, and `data-webgl-ready` in `{webgl2, fallback}`. |
| 03 | Motion choreography | **NOT MEASURED** | Playwright runs with `reducedMotion: reduce`, so no honest fps number exists. Counters, staggered reveals and draw-on arcs render, but frame timing was not profiled. |
| 04 | Multi-repository switcher | **PASS** | `[data-testid="workspace-repo-switcher"]` visible on desktop and mobile, exposes `data-active-repo`, opens the "Switch repository" dialog, and `?repo=` selects the requested workspace. |
| 05 | Radial graph parity | **PASS** | Live graph renders 13 siblings on two concentric orbits. Unit invariant asserts `stdDev(x)` and `stdDev(y)` > 80 px for 3, 6, 8, 13 and 24 siblings (measured 205–240 px). |
| 06 | Six-level navigation | **PARTIAL** | Breadcrumb and tree render from real analysis; the audit did not click through all six levels on the live deployment. |
| 07 | Signatures & SQL lineage | **PASS** | Live Stage 1 shows exported signatures with `file:line`, direct importers, entrypoint counts, SQL tables and 12 linked columns. |
| 08 | Click-to-code teleportation | **PASS** | Live `[data-testid="impact-teleport-row"]` opens `[data-testid="code-teleport-drawer"]`, renders real source, highlights `[data-testid="focused-code-line"]`, exposes a `github.com/.../blob/...#L<line>` link, plus "Center graph" and "Open in Safe-Code Loop". Desktop and mobile. |
| 09 | Four-stage safe-coding loop | **PASS** | Live: Stage 1 FinOps meter (6,199 bounded tokens, 98% reduction), Stage 2 real 917-line buffer, unresolved-import overlay detected in the in-memory graph, `loop-auto-heal-btn` applied the verified patch and the verdict flipped to `safe` / "VERIFIED SAFE TO DEPLOY". Desktop and mobile. |
| 10 | System memory & grounded Q&A | **PARTIAL** | `/intelligence` renders the six memory layers and real evidence. Submitting a Q&A requires a BYOK provider key, which this audit did not have. |
| 11 | 10-tool MCP hub & CLI onboarding | **PASS** | Live `mcp-tools.spec.ts` lists all 10 read-only tools, executes `search_files`, `simulate_change` and `generate_fix_patch`, and renders federation and trace-overlay panels from live data. |
| 12 | Console, network & layout defects | **PASS (desktop)** | Live `routes.spec.ts` walks `/`, `/graph`, `/intelligence`, `/mcp`, `/subscribe` with zero page errors and asserts no horizontal overflow. Mobile route sweep not repeated. |

## Verification totals

- `bunx tsc -b --noEmit`: clean.
- `bun test ./tests`: 113 passed.
- `bun run lint`: 0 errors (9 pre-existing shadcn fast-refresh warnings).
- `bun run build`: success.
- Local Playwright desktop: 18/18.
- Live Playwright desktop: 18/18 across `safe-loop`, `graph-workspace`, `routes`, `mcp-tools`.
- Live Playwright mobile: 9/9 across `safe-loop` and `graph-workspace`.

## Where we still fall short

1. **Stage 2 Mode A (prompt → AI-generated file)** is not in the loop UI. The existing grounded coding route (`/api/integrations/github/coding`) needs a GitHub OAuth session plus a BYOK key, so it cannot be proven in this anonymous audit. Stage 2 currently ships the fully verified direct-edit and five deterministic failure scenarios.
2. **Motion is not fps-profiled.** The shader and motion primitives are mounted and functional, but "60fps" is unproven under this headless, reduced-motion configuration.
3. **Six-level drill-through, mobile console sweep and grounded Q&A** were not re-executed on the live origin in this pass.
4. **The hexagonal AST prism is shader geometry inside `WebGLFieldCanvas`**, not a separate `HeroAstPrism` component. It reacts to cursor, scroll and loop verdict; it was not duplicated into a second renderer.
5. **MentorPanel and BeforeYouAct citations** are clickable through the shared inspector but do not all carry `impact-teleport-row`; the dossier, workbench and loop do.
6. Deployments are handled by Vercel for this repository. `freebuff-deploy` reports no managed deployment, so hosting was monitored through GitHub commit statuses and the live origin instead.

No mock, seeded or sampled values were introduced: every count, path, line and token figure in this report comes from the live analysis payload or from the Playwright assertions above.
