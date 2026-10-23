# Production verification & gap report

Origin: `https://nykst.unifies.codes`
Repository: `flawsom/nykst`
Release audited: this release, on top of `e42b097` (grounded Stage 2 generation, six-level drill-through proof and mentor citations).

## What was measured

| Audit | Surface | Result | Evidence |
| :---- | :------ | :----- | :------- |
| 01 | First impression & copy | **PASS** | Live HTML contains "Know the blast radius before you change the code" and the new subheadline. `rg` over `src/`, `README.md`, `docs/`, `public/` returns zero "Google Maps", "vector chunks", "vector store", "wrapper", "chat-with-code" or "Software is not prose". |
| 02 | WebGL fluid & prism canvas | **PASS (fallback proven, shader runtime unverified here)** | Playwright asserted a non-zero canvas box on `/` and `/graph`, `pointer-events: none`, and `data-webgl-ready` in `{webgl2, fallback}`. This sandbox exposes **no** WebGL2 context at all (every launch flag combination returns `getContext("webgl2") === null`), so the shader path degrades to its documented gradient fallback and the GLSL could not be executed here. |
| 03 | Motion choreography | **MEASURED** | Headless Chromium, `reducedMotion: no-preference`, 1440×900, software raster (no GPU): `/graph`, `/intelligence` and `/mcp` sustain **60.0 fps** (p50 16.7 ms, p95 16.8 ms). `/` reaches **60 fps** (p50 16.7 ms) once the compositor settles, but the first ~7 s after navigation run at 2–10 fps. A CPU profile during those seconds shows the main thread **87 % idle** (96 % idle at steady state), so the startup cost is software rasterisation of the full-viewport gradient layers, not scripting. |
| 04 | Multi-repository switcher | **PASS** | `[data-testid="workspace-repo-switcher"]` visible on desktop and mobile, exposes `data-active-repo`, opens the "Switch repository" dialog, and `?repo=` selects the requested workspace. |
| 05 | Radial graph parity | **PASS** | Live graph renders 13 siblings on two concentric orbits. Unit invariant asserts `stdDev(x)` and `stdDev(y)` > 80 px for 3, 6, 8, 13 and 24 siblings. |
| 06 | Six-level navigation | **PASS** | `graph-navigation.spec.ts` drills two directory levels on desktop and mobile, asserting the heading, breadcrumb length and evidence dossier all follow the clicked node. |
| 07 | Signatures & SQL lineage | **PASS** | Live Stage 1 shows exported signatures with `file:line`, direct importers, entrypoint counts, SQL tables and 12 linked columns. |
| 08 | Click-to-code teleportation | **PASS** | `[data-testid="impact-teleport-row"]` opens the code drawer, renders real source, highlights `focused-code-line`, exposes a `github.com/.../blob/...#L<line>` link, plus "Center graph" and "Open in Safe-Code Loop". |
| 09 | Four-stage safe-coding loop | **PASS** | Live: Stage 1 FinOps meter, a real file buffer, and **Stage 2 Mode A observed end to end** — the grounded request returned a fenced replacement file at ~50 s, the proposal rendered with a real `parseRepoSlug` body from `src/lib/code-links.ts`, "Use generated code → verify" re-ran the in-memory overlay and produced a `data-verdict` of `safe`/`breaking`. Auto-heal still flips a breaking unresolved-import overlay to "VERIFIED SAFE TO DEPLOY". |
| 10 | System memory & grounded Q&A | **PASS** | `/intelligence` renders the six memory layers and answers a live question in ~48 s: "the files identified as implementing the safe-coding loop are `src/components/graph/SafeCodeLoopEngine.tsx` (893 LOC) and `src/lib/loop.ts` (414 LOC)" — real paths, real LOC, and an explicit list of what the evidence does not contain. |
| 11 | 10-tool MCP hub & CLI onboarding | **PASS** | `mcp-tools.spec.ts` lists all 10 read-only tools, executes `search_files`, `simulate_change` and `generate_fix_patch`, and renders federation and trace-overlay panels from live data. |
| 12 | Console, network & layout defects | **PASS** | `routes.spec.ts` walks `/`, `/graph`, `/intelligence`, `/mcp`, `/subscribe` with zero page errors and no horizontal overflow on desktop (1440×900) and mobile (390×844). |

## What changed in this pass

1. **The provider ceiling was the "outage".** The platform router answers in ~32 s for a one-line reply and ~50 s for a grounded file generation, so the hard-coded 25 s abort turned a working provider into a fake timeout. `PROVIDER_TIMEOUT_MS` is now 75 s, the 504 message derives from that constant, and code mode gets 2,400 output tokens (4,000 for whole-file PR generation).
2. **Mode A is grounded in the real file.** The request now carries the current buffer contents, not just the Stage 1 envelope, so the model can return an actual replacement file. Files above 20,000 characters are refused with an explicit message instead of being silently truncated. An unparsed prose answer now renders under `loop-generated-unparsed` so the state is observable rather than invisible.
3. **Memory Q&A sends real evidence.** `buildGroundedAiBrief` used to send four counts and a templated paragraph; the model correctly refused it as insufficient. It now sends repository identity, AST stats, the focus artifact's exports, symbols with line numbers, resolved imports, importers, SQL resources and columns, query-matched files with their own imports and exports, external services, cycles, commits touching the file, recent pull requests and open issues — capped at 7,000 characters, with "not present in this snapshot" instead of invented facts.
4. **Landing compositing.** Four always-on `backdrop-blur` surfaces sat above two continuously animating layers, which cost ~27 fps of steady-state frame time. They now use near-opaque solid backgrounds (`bg-card/95`, `bg-surface/90`); no layout or copy changed.
5. **New coverage.** `tests/intelligence-brief.test.ts` asserts the evidence envelope (4 tests, including the "no analysis" case and the size cap); `routes.spec.ts` asserts a live Q&A answer carries real paths and is not the old template; `safe-loop.spec.ts` now requires an actual grounded proposal plus a post-apply verdict when a provider is configured, and the verbatim key error when it is not.

## Verification totals

- `bunx tsc -b --noEmit`: clean.
- `bun test ./tests`: **120 passed** across 19 files.
- `bun run lint`: 0 errors (9 pre-existing shadcn fast-refresh warnings).
- `bun run build`: success.
- Local Playwright desktop: all **22** journeys green across `safe-loop`, `graph-navigation`, `graph-workspace`, `routes` and `mcp-tools` (run per spec file).
- Frame timing: `/graph`, `/intelligence`, `/mcp` 60 fps; `/` 60 fps after compositor warm-up; profile shows 87–96 % idle main thread.

## Where we still fall short

1. **The WebGL shader cannot be executed in this environment.** No WebGL2 context is available under any Chromium launch configuration, so the shader is verified only as a mounted, correctly sized canvas that falls back cleanly. Frame timing was therefore measured on the fallback path.
2. **The landing page's first ~7 seconds are raster-bound in software rendering** (2–10 fps, then 60 fps). The JS thread is idle for 87 % of that window, so this is compositor cost from full-viewport gradients and the animated aurora, not a scripting defect; it was not profiled on GPU hardware, which this sandbox does not provide.
3. **Grounded generation is a single-file contract.** Mode A returns one complete replacement file and refuses files over 20,000 characters; multi-file changes still belong to the reviewed PR route (`/api/integrations/github/coding`), which needs a GitHub session.
4. **The self-index carries no git history.** Memory Q&A reports commit and PR history as absent rather than inventing it; a connected ingestion payload provides those fields.
5. **The hexagonal AST prism is shader geometry inside `WebGLFieldCanvas`**, not a separate `HeroAstPrism` component. It reacts to cursor, scroll and loop verdict; it was not duplicated into a second renderer.
6. Deployments are handled by Vercel for this repository. `freebuff-deploy` reports no managed deployment, so hosting is monitored through GitHub commit statuses and the live origin instead.

No mock, seeded or sampled values were introduced: every count, path, line and timing figure in this report comes from the live analysis payload, the provider's real response, or the measurements above.
