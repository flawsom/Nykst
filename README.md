<a id="top"></a>

<p align="center">
  <img src="docs/assets/readme-hero.svg" width="100%" alt="Nykst — Deterministic Graph-RAG Architecture for Software Systems. Organization → Domains → Capabilities → Services → Modules → Files." />
</p>

<div align="center">

<img src="public/favicon.svg" width="60" height="60" alt="Nykst Graph-RAG Prism Mark" />

# NYKST

### We are not an LLM wrapper. We are the deterministic Graph-RAG architecture.

Connect a repository once. Nykst compiles your codebase with the TypeScript AST engine, links SQL migrations and external services, runs Tarjan strongly-connected-component cycle analysis, and computes the exact line-level blast radius before you — or your AI coding agent — write a single line of code.

[![Live Demo](https://img.shields.io/badge/LIVE_DEPLOYMENT-nykst.unifies.codes-2DD4BF?style=for-the-badge&logo=cloudflare&logoColor=06110f&labelColor=0b141b)](https://nykst.unifies.codes)
[![Documentation](https://img.shields.io/badge/DOCUMENTATION-MCP_&_Agent_Setup-5EEAD4?style=for-the-badge&logo=readthedocs&logoColor=06110f&labelColor=0b141b)](https://nykst.unifies.codes/mcp)
[![Installation](https://img.shields.io/badge/INSTALLATION-Quick_Start-8596A7?style=for-the-badge&logo=gnubash&logoColor=eef5fa&labelColor=0b141b)](#quick-start)
[![GitHub Repository](https://img.shields.io/badge/GITHUB_REPOSITORY-flawsom%2Fnykst-8596A7?style=for-the-badge&logo=github&logoColor=eef5fa&labelColor=0b141b)](https://github.com/flawsom/nykst-software-intellegence)

[![Version](https://img.shields.io/badge/version-2.5.0-5EEAD4?style=for-the-badge&labelColor=06110f)](#releases)
[![License](https://img.shields.io/github/license/flawsom/nykst-software-intellegence?style=for-the-badge&color=5EEAD4&labelColor=06110f)](https://github.com/flawsom/nykst-software-intellegence/blob/main/LICENSE)
[![Build](https://github.com/flawsom/nykst-software-intellegence/actions/workflows/ci.yml/badge.svg?branch=main&style=for-the-badge&label=build)](https://github.com/flawsom/nykst-software-intellegence/actions/workflows/ci.yml)
[![Nara AI](https://img.shields.io/badge/AI_ENGINE-agnes--2.5--flash-2DD4BF?style=for-the-badge&labelColor=06110f)](#environment-variables)
[![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP_2025--06--18-6EE7B7?style=for-the-badge&labelColor=06110f)](#mcp-server)

[![Stars](https://img.shields.io/github/stars/flawsom/nykst-software-intellegence?style=flat-square&color=2DD4BF&label=stars)](https://github.com/flawsom/nykst-software-intellegence/stargazers)
[![Forks](https://img.shields.io/github/forks/flawsom/nykst-software-intellegence?style=flat-square&color=2DD4BF)](https://github.com/flawsom/nykst-software-intellegence/forks)
[![Downloads](https://img.shields.io/github/downloads/flawsom/nykst-software-intellegence/total?style=flat-square&color=5EEAD4&label=downloads)](https://github.com/flawsom/nykst-software-intellegence/releases)
[![Issues](https://img.shields.io/github/issues/flawsom/nykst-software-intellegence?style=flat-square&color=FBBF24)](https://github.com/flawsom/nykst-software-intellegence/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/flawsom/nykst-software-intellegence?style=flat-square&color=5EEAD4)](https://github.com/flawsom/nykst-software-intellegence/pulls)
[![Last Commit](https://img.shields.io/github/last-commit/flawsom/nykst-software-intellegence?style=flat-square&color=8596A7)](https://github.com/flawsom/nykst-software-intellegence/commits/main)
[![Contributors](https://img.shields.io/github/contributors/flawsom/nykst-software-intellegence?style=flat-square&color=5EEAD4)](https://github.com/flawsom/nykst-software-intellegence/graphs/contributors)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8_strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](#tech-stack)
[![Tests](https://img.shields.io/badge/tests-23_passing_(130_assertions)-2DD4BF?style=flat-square)](#testing)

</div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<div align="center">

**Quick Navigation** &nbsp;·&nbsp; [Why Graph-RAG](#why-nykst) · [✨ Features](#features) · [📸 Screenshots](#screenshots) · [🎥 Demo](#demo) · [🏗 Architecture](#architecture) · [🛠 Tech Stack](#tech-stack) · [⚡ Quick Start](#quick-start) · [📁 Project Structure](#project-structure) · [🔐 Environment Variables](#environment-variables) · [📖 API Documentation](#api-documentation) · [🎯 Usage Examples](#usage-examples) · [📊 Performance](#performance) · [🧪 Testing](#testing) · [🚀 Deployment](#deployment) · [🤝 Contributing](#contributing) · [🗺 Roadmap](#roadmap) · [❓ FAQ](#faq) · [🙌 Acknowledgements](#acknowledgements) · [📜 License](#license) · [❤️ Support](#support)

</div>

<details>
<summary><b>📖 Expand Full Table of Contents (All 20 Sections)</b></summary>

1. [🚀 Hero & Executive Overview](#top)
2. [🧠 Why Nykst vs. Flat Vector Wrappers](#why-nykst)
3. [✨ Features](#features)
4. [📸 Screenshots & Visual Showcase](#screenshots)
5. [🎥 Live Demo & Video Walkthroughs](#demo)
6. [🏗 System & Graph-RAG Architecture](#architecture)
7. [🛠 Tech Stack](#tech-stack)
8. [⚡ Quick Start (Local, Supabase & Docker)](#quick-start)
9. [📁 Project Structure](#project-structure)
10. [🔐 Environment Variables](#environment-variables)
11. [📖 API Documentation & MCP Reference](#api-documentation)
12. [🎯 Usage Examples](#usage-examples)
13. [📊 Performance, Benchmarks & Live Telemetry](#performance)
14. [🧪 Testing, Linting & Quality Gates](#testing)
15. [🚀 Deployment Guides (Vercel, Cloudflare, Railway, Docker, AWS, DigitalOcean, Netlify)](#deployment)
16. [🤝 Contributing Guidelines](#contributing)
17. [🗺 Product Roadmap](#roadmap)
18. [❓ Frequently Asked Questions (FAQ)](#faq)
19. [🙌 Acknowledgements](#acknowledgements)
20. [📜 License & ❤️ Support](#license)

</details>

---

<a id="why-nykst"></a>

## 🧠 Why Nykst: Deterministic Graph-RAG vs. Flat Vector Wrappers

Most "AI for code" tools on the market are thin wrappers: they slice source files into fixed 500-token chunks, embed them into a flat vector store, retrieve the top-$k$ cosine-similar snippets, and hope an LLM can guess what calls what.

**Software is not a bag of paragraphs. Software is a directed, typed dependency graph evolving over time.**

```text
Organization ──► Core Domains ──► Capabilities ──► Services & SQL ──► Modules ──► Files (AST)
   nykst          src/lib/         analysis/        supabase (10)     impact.ts    line-level
                  src/routes/      integrations/    github-oauth      graph.ts     importers
```

| Dimension | Typical "Chat with Code" Wrapper | **Nykst Deterministic Graph-RAG Architecture** |
| :--- | :--- | :--- |
| **Indexing Primitive** | Arbitrary 500-token text chunks (`RecursiveCharacterTextSplitter`) | **TypeScript AST (`ts.createSourceFile`)** + `tsconfig` path-alias & monorepo workspace resolver |
| **Blast-Radius Accuracy** | LLM guesses based on naming similarity; misses callers 3+ hops away | **Breadth-first reverse reachability (`Reach` / `impactOf`)** with exact importing file & line numbers |
| **Cycle Detection** | Blind to circular runtime dependencies | **Iterative Tarjan strongly-connected components (SCC)** separating runtime cycles from `import type` |
| **Database & Service Lineage** | Treats SQL files and SDK calls as unlinked plain text | **DDL + Call-Site Linker** connecting `CREATE TABLE` / `FUNCTION` in migrations to `.from()` / `.rpc()` calls |
| **Temporal & Historical Context** | Stateless per-prompt context window | **6-Layer Compounding Memory**: co-change coupling, PR issue closures, outcome-weighted decisions & playbooks |
| **AI Coding Agent Integration** | Custom editor fork or proprietary plugin lock-in | **Stateless Streamable HTTP MCP (`/api/mcp`)** serving 5 `readOnlyHint` tools to Claude Code, Cursor, VS Code & Codex |
| **Data Integrity** | Seeded demo workspaces & synthetic metrics | **Zero mock or stale data**: self-indexes the live repository on demand in `~640ms` via `/api/analysis/self` |

> [!IMPORTANT]
> **Read-only by construction.** Nykst never writes to your repository without explicit human PR review. Every GitHub connection is read-only, every analysis is computed from real source trees, and every MCP tool is annotated `readOnlyHint: true`.

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="features"></a>

## ✨ Features

<table>
<tr>
<td width="33%" valign="top">
  <h3>🗺️ 6-Level AST Graph Navigation</h3>
  <sub>Drill seamlessly from <b>Organization → Core Domain → Capability → Service → Module → File</b>. Every click re-centers the topology, synchronizes the breadcrumb and left tree, and preserves browser history state.</sub>
</td>
<td width="33%" valign="top">
  <h3>⚡ Live Self-Indexed AST Workbench</h3>
  <sub>Powered by <code>/api/analysis/self</code>, Nykst compiles its own 160+ TypeScript files, 317+ import edges, and 12 SQL resources in real time so visitors can trace blast radius and run MCP tools with zero mock data.</sub>
</td>
<td width="33%" valign="top">
  <h3>🧭 Before You Act Consequence Envelope</h3>
  <sub>Before touching a file, assemble a deterministic context envelope: direct & transitive importers, affected page/API entrypoints, covering tests, co-changing files, and grounded consequence reasoning.</sub>
</td>
</tr>
<tr>
<td width="33%" valign="top">
  <h3>🧠 6-Layer System Memory</h3>
  <sub><b>Outcome-Weighted</b>, <b>Failure-Pattern</b>, <b>Architectural Decision</b>, <b>Incident-Resolution</b>, <b>Team Convention</b>, and emergent <b>Continuity Memory</b> — anchored to real repository artifacts.</sub>
</td>
<td width="33%" valign="top">
  <h3>🔌 Streamable HTTP MCP Server</h3>
  <sub>One <code>nyk_</code> token connects Claude Code, Cursor, VS Code, Codex, Windsurf, Gemini CLI, Cline, and Zed to 5 read-only architectural tools over <code>/api/mcp</code>.</sub>
</td>
<td width="33%" valign="top">
  <h3>🤖 Nara Router (`agnes-2.5-flash`) + BYOK</h3>
  <sub>Ships with instant platform reasoning via Nara Router (<code>agnes-2.5-flash</code>) plus an AES-256-GCM encrypted vault for your own OpenAI, Anthropic, Gemini, DeepSeek, or OpenRouter keys.</sub>
</td>
</tr>
<tr>
<td width="33%" valign="top">
  <h3>🗄️ SQL Migration & Service Linker</h3>
  <sub>Automatically parses <code>supabase/migrations/*.sql</code> and <code>schema.prisma</code>, linking tables and RPCs directly to client <code>.from()</code> and <code>.rpc()</code> call sites with line citations.</sub>
</td>
<td width="33%" valign="top">
  <h3>📡 Production Signals & Root-Cause Engine</h3>
  <sub>Verifies HMAC-SHA256 GitHub webhooks (<code>/api/webhooks/github</code>), normalizes operational failures, and synthesizes repository-grounded root-cause candidates with confidence scoring.</sub>
</td>
<td width="33%" valign="top">
  <h3>✨ Variant Motion System</h3>
  <sub>Engineered with cursor-following radial spotlights, film-grain texture, 3D specular tilt cards, magnetic hover CTAs, text scramble decoders, scroll-triggered counters, and infinite telemetry marquees.</sub>
</td>
</tr>
</table>

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="screenshots"></a>

## 📸 Screenshots

<sub>Real captures from the running Nykst application across Desktop, Dashboard, Memory Analytics, MCP Agent Setup, Billing Settings, and Mobile viewports.</sub>

### 🖥 Desktop — Product Landing Page & Live AST Telemetry

<p align="center">
  <img src="docs/assets/screens/landing.png" width="100%" alt="Nykst Desktop Landing Page — Hero, Live AST Graph Preview, 6-Level Navigation, and GitHub Connect." />
</p>

### 🧭 Dashboard — 6-Level System Graph & Inspector

<p align="center">
  <img src="docs/assets/screens/graph.png" width="100%" alt="Nykst Graph Navigator Dashboard — 6-level interactive topology, tree navigation, and Mentor Panel." />
</p>

### 🧠 Analytics (System Memory) & ⚙️ Settings (Subscription & BYOK Vault)

<table>
<tr>
<td width="50%" valign="top">
  <b>🧠 Analytics — 6-Layer System Memory</b><br/>
  <sub>Outcome-weighted decisions, failure patterns, dependency topology, and grounded AI Q&A over live repository artifacts.</sub>
</td>
<td width="50%" valign="top">
  <b>⚙️ Settings & Billing — eSewa & API Vault</b><br/>
  <sub>Monthly (NPR 999) and Annual (NPR 9,999) plans with QR scan, transaction verification, and AES-256-GCM BYOK provider settings.</sub>
</td>
</tr>
<tr>
<td valign="top"><img src="docs/assets/screens/memory.png" width="100%" alt="Nykst Memory Analytics Workspace" /></td>
<td valign="top"><img src="docs/assets/screens/pricing.png" width="100%" alt="Nykst Subscription & Settings Page" /></td>
</tr>
</table>

### 🔌 MCP Agent Configuration & 📱 Mobile Responsive Experience

<table>
<tr>
<td width="62%" valign="top">
  <img src="docs/assets/screens/mcp.png" width="100%" alt="Nykst MCP Guide & Token Provisioning" />
</td>
<td width="38%" valign="top">
  <img src="docs/assets/screens/mobile.png" width="100%" alt="Nykst Mobile Responsive Layout" />
</td>
</tr>
<tr>
<td align="center"><sub><b>🔌 Authentication & MCP Tokens</b> — SHA-256 hashed <code>nyk_</code> tokens & copy-paste setup for 9 coding agents</sub></td>
<td align="center"><sub><b>📱 Mobile Viewport</b> — Full responsive dark-glass hierarchy on iOS/Android viewports</sub></td>
</tr>
</table>

> [!NOTE]
> **Zero-impersonation OAuth.** GitHub authentication happens directly on GitHub's official consent screen (`https://github.com/login/oauth/authorize`) with wildcard-aware callback verification across `nykst.unifies.codes`, `nykst.vercel.app`, and `localhost:8080`.

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="demo"></a>

## 🎥 Demo

<div align="center">

[![Launch Live Production App](https://img.shields.io/badge/LAUNCH_PRODUCTION_APP-nykst.unifies.codes-2DD4BF?style=for-the-badge&logo=vercel&logoColor=06110f&labelColor=0b141b)](https://nykst.unifies.codes)
&nbsp;
[![Vercel Mirror](https://img.shields.io/badge/VERCEL_MIRROR-nykst.vercel.app-60A5FA?style=for-the-badge&logo=vercel&logoColor=06110f&labelColor=0b141b)](https://nykst.vercel.app)
&nbsp;
[![YouTube Walkthrough](https://img.shields.io/badge/YOUTUBE_DEMO-Watch_Walkthrough-FF0033?style=for-the-badge&logo=youtube&logoColor=white&labelColor=0b141b)](https://www.youtube.com/results?search_query=nykst+software+intelligence)

</div>

### Live Interactive Surfaces

| Surface | Live Experience | Direct URL |
| :--- | :--- | :--- |
| **🚀 Landing & Live AST Workbench** | Inspect `flawsom/nykst-software-intellegence` compiled live in `<700ms`: click any core hub, view exact importer line numbers, inspect SQL tables, and execute MCP tools in-browser. | [`https://nykst.unifies.codes/`](https://nykst.unifies.codes/) |
| **🧭 6-Level System Graph** | Navigate from Organization root down to individual TypeScript files, open the **Node Dossier**, or run **Before You Act** consequence analysis. | [`https://nykst.unifies.codes/graph`](https://nykst.unifies.codes/graph) |
| **🧠 6-Layer System Memory** | Browse live-derived System Map, AST Dependency Topology, Change Intelligence, Risk Profile, and ask `agnes-2.5-flash` grounded questions. | [`https://nykst.unifies.codes/intelligence`](https://nykst.unifies.codes/intelligence) |
| **🔌 MCP Agent Hub** | Generate a revocable `nyk_` token and copy ready-to-run configuration for Claude Code, Cursor, VS Code, Codex, Windsurf, Gemini CLI, Cline, and Zed. | [`https://nykst.unifies.codes/mcp`](https://nykst.unifies.codes/mcp) |
| **🩺 Real-Time Health Probe** | Live JSON verification of Supabase connectivity and all 10 required PostgreSQL tables. | [`https://nykst.unifies.codes/api/health`](https://nykst.unifies.codes/api/health) |

<details>
<summary><b>🎬 Embedding GIF, MP4 & YouTube Demos in Forks or PRs</b></summary>

<br/>

- **GIF Preview**: Place a recording at `docs/assets/demo.gif` and embed with `![Nykst Graph-RAG Demo](docs/assets/demo.gif)`.
- **MP4 Video**: Drag an `.mp4` capture into any GitHub issue/PR description to mint a `https://github.com/user-attachments/assets/<uuid>` URL, which GitHub renders as a native HTML5 video player.
- **YouTube Walkthrough**: Link a thumbnail directly to your walkthrough video for high-resolution playback with audio commentary.

</details>

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="architecture"></a>

## 🏗 Architecture

Nykst is architected as a deterministic, edge-ready full-stack system: **React 19 + TanStack Start** on the frontend and SSR layer, **TypeScript AST Compiler + Tarjan SCC + BFS Reachability** in the analysis core, **Supabase PostgreSQL with strict Row-Level Security** for persistence and Realtime broadcasts, and **Nara Router (`agnes-2.5-flash`) + AES-256-GCM BYOK** for grounded reasoning.

### End-to-End System Topology

```mermaid
flowchart TB
  subgraph Client["Frontend · React 19 + Variant Motion Engine"]
    Landing["Landing & Live AST Workbench<br/>(Spotlight · 3D Tilt · Magnetic · Scramble)"]
    GraphUI["6-Level Graph Navigator<br/>(GraphCanvas · TreePanel · NodeDossier)"]
    BeforeAct["Before You Act Modal<br/>(Consequence Envelope Builder)"]
    MemoryUI["6-Layer Memory Workspace<br/>(/intelligence)"]
  end

  subgraph Server["Backend & API Layer · TanStack Start + Nitro"]
    SelfAPI["GET /api/analysis/self<br/>(Real-Time Workspace AST Compiler)"]
    IngestAPI["POST /api/integrations/github/ingest<br/>(Tarball Fetch + AST + Git History)"]
    McpAPI["POST /api/mcp<br/>(Stateless Streamable HTTP MCP 2025-06-18)"]
    AiAPI["POST /api/ai/chat · /api/diagnosis<br/>(Grounded Reasoning & Root-Cause Engine)"]
    AuthAPI["GET /api/integrations/github/start & /callback<br/>(HMAC-SHA256 OAuth + Multi-Origin Redirects)"]
    HookAPI["POST /api/webhooks/github<br/>(X-Hub-Signature-256 Verified Intake)"]
  end

  subgraph Engine["Deterministic Graph-RAG Core · src/lib/analysis/"]
    Parser["parse.server.ts<br/>ts.createSourceFile AST Extraction"]
    Resolver["resolve.ts<br/>tsconfig Paths + Workspace Exports"]
    Tarjan["engine.server.ts<br/>Iterative Tarjan SCC Cycle Detector + SQL Linker"]
    Impact["impact.ts & graph.ts<br/>Reverse BFS Reachability + 6-Level Trie"]
  end

  subgraph Database["Database & Realtime · Supabase PostgreSQL (RLS Enforced)"]
    T_Ing[("repository_ingestions")]
    T_Key[("user_ai_keys (AES-256-GCM)")]
    T_Mcp[("mcp_access_tokens (SHA-256)")]
    T_Sig[("production_signals & root_cause_diagnoses")]
    T_Sub[("nykst_subscriptions & payment_submissions")]
    T_Conn[("integration_connections")]
  end

  subgraph External["External Services & AI Agents"]
    GH["GitHub OAuth / App & REST API"]
    Nara["Nara Router (agnes-2.5-flash)<br/>+ OpenAI / Anthropic / Gemini / DeepSeek"]
    Connectors["Slack Slash Commands & Jira REST v3"]
    IDEs["AI Coding Agents<br/>Claude Code · Cursor · VS Code · Codex · Windsurf"]
  end

  Landing --> SelfAPI
  GraphUI --> IngestAPI
  BeforeAct --> AiAPI
  MemoryUI --> AiAPI
  SelfAPI --> Engine
  IngestAPI --> Engine
  McpAPI --> Engine
  Engine --> Parser --> Resolver --> Tarjan --> Impact
  IngestAPI --> GH
  IngestAPI --> T_Ing
  AuthAPI --> GH
  AiAPI --> T_Key
  AiAPI --> Nara
  McpAPI --> T_Mcp
  IDEs --> McpAPI
  HookAPI --> T_Sig
  Server --> T_Sub
  Server --> T_Conn --> Connectors
```

### Deterministic Blast-Radius Sequence (`get_impact` & Before You Act)

```mermaid
sequenceDiagram
  autonumber
  participant Agent as Engineer / AI Agent (MCP)
  participant Route as /api/mcp or /api/analysis/self
  participant AST as TypeScript AST Index (indexAnalysis)
  participant BFS as Reverse Reachability (impactOf)
  participant LLM as Nara Router (agnes-2.5-flash)

  Agent->>Route: Query impact for ["src/lib/integrations/github.ts"]
  Route->>AST: Load compiled RepoAnalysis & build reverse adjacency map
  AST->>BFS: Traverse runtime & type-only dependents up to depth 12
  BFS-->>Route: 20 direct importers, 31 transitive files, 20 API/page entrypoints, covering tests
  opt Consequence Reading Requested
    Route->>LLM: Send strictly bounded ContextEnvelope JSON (no raw repo guessing)
    LLM-->>Route: Evidence-cited risk analysis & verification checklist
  end
  Route-->>Agent: Deterministic JSON envelope with file:line citations & import chains
```

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="tech-stack"></a>

## 🛠 Tech Stack

<table>
<tr>
  <td width="22%"><b>Frontend</b></td>
  <td>
    <img src="https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript_5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8" />
    <img src="https://img.shields.io/badge/TanStack_Router-FF4154?style=flat-square&logo=reactrouter&logoColor=white" alt="TanStack Router" />
    <img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
    <img src="https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square&logo=shadcnui&logoColor=white" alt="shadcn/ui" />
    <img src="https://img.shields.io/badge/Radix_UI-161618?style=flat-square&logo=radixui&logoColor=white" alt="Radix UI" />
    <img src="https://img.shields.io/badge/Lucide_Icons-F56565?style=flat-square&logo=lucide&logoColor=white" alt="Lucide" />
    <img src="https://img.shields.io/badge/Variant_Motion-2DD4BF?style=flat-square" alt="Variant Motion" />
  </td>
</tr>
<tr>
  <td><b>Backend</b></td>
  <td>
    <img src="https://img.shields.io/badge/TanStack_Start-111827?style=flat-square&logo=tanstack&logoColor=white" alt="TanStack Start" />
    <img src="https://img.shields.io/badge/Nitro_Server-00DC82?style=flat-square&logo=nitro&logoColor=white" alt="Nitro" />
    <img src="https://img.shields.io/badge/TypeScript_Compiler_API-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TS Compiler API" />
    <img src="https://img.shields.io/badge/Node_Crypto-AES--256--GCM_%26_HMAC-2DD4BF?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node Crypto" />
    <img src="https://img.shields.io/badge/Zod_Validation-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod" />
  </td>
</tr>
<tr>
  <td><b>Database</b></td>
  <td>
    <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=black" alt="Supabase" />
    <img src="https://img.shields.io/badge/PostgreSQL_15-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Row_Level_Security-Strict_RLS-2DD4BF?style=flat-square" alt="RLS" />
    <img src="https://img.shields.io/badge/Supabase_Realtime-Broadcast-3FCF8E?style=flat-square" alt="Supabase Realtime" />
  </td>
</tr>
<tr>
  <td><b>Cloud</b></td>
  <td>
    <img src="https://img.shields.io/badge/Vercel_Edge_%26_Node-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel" />
    <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
    <img src="https://img.shields.io/badge/Custom_Domain-nykst.unifies.codes-5EEAD4?style=flat-square" alt="nykst.unifies.codes" />
  </td>
</tr>
<tr>
  <td><b>DevOps</b></td>
  <td>
    <img src="https://img.shields.io/badge/Bun_1.4-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" />
    <img src="https://img.shields.io/badge/GitHub_Actions_CI-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions" />
    <img src="https://img.shields.io/badge/Wrangler-F38020?style=flat-square&logo=cloudflareworkers&logoColor=white" alt="Wrangler" />
    <img src="https://img.shields.io/badge/Docker_Multi--Stage-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  </td>
</tr>
<tr>
  <td><b>AI / ML</b></td>
  <td>
    <img src="https://img.shields.io/badge/Nara_Router-agnes--2.5--flash-2DD4BF?style=flat-square" alt="Nara agnes-2.5-flash" />
    <img src="https://img.shields.io/badge/Anthropic-Claude-191919?style=flat-square&logo=anthropic&logoColor=white" alt="Anthropic" />
    <img src="https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI" />
    <img src="https://img.shields.io/badge/Google_Gemini-3.5_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white" alt="Google Gemini" />
    <img src="https://img.shields.io/badge/DeepSeek-Flash-4D6BFE?style=flat-square" alt="DeepSeek" />
  </td>
</tr>
<tr>
  <td><b>APIs & Protocols</b></td>
  <td>
    <img src="https://img.shields.io/badge/MCP-2025--06--18_Streamable_HTTP-6EE7B7?style=flat-square" alt="MCP" />
    <img src="https://img.shields.io/badge/GitHub_REST_%26_Tarball_API-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub API" />
    <img src="https://img.shields.io/badge/Slack_Events_%26_Slash_API-4A154B?style=flat-square&logo=slack&logoColor=white" alt="Slack API" />
    <img src="https://img.shields.io/badge/Jira_Cloud_REST_v3-0052CC?style=flat-square&logo=jira&logoColor=white" alt="Jira API" />
    <img src="https://img.shields.io/badge/eSewa_Nepal-60BB46?style=flat-square" alt="eSewa" />
  </td>
</tr>
<tr>
  <td><b>Testing</b></td>
  <td>
    <img src="https://img.shields.io/badge/bun%3Atest-23_passing_(130_assertions)-f472b6?style=flat-square&logo=bun&logoColor=white" alt="bun:test" />
    <img src="https://img.shields.io/badge/Live_RLS_Probes-Supabase_Verified-3FCF8E?style=flat-square" alt="RLS Probes" />
    <img src="https://img.shields.io/badge/Graph_Invariant_Tests-Deterministic-2DD4BF?style=flat-square" alt="Graph Invariants" />
  </td>
</tr>
<tr>
  <td><b>Tools</b></td>
  <td>
    <img src="https://img.shields.io/badge/Vite_7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/ESLint_9-4B32C3?style=flat-square&logo=eslint&logoColor=white" alt="ESLint" />
    <img src="https://img.shields.io/badge/Prettier-F7B93E?style=flat-square&logo=prettier&logoColor=black" alt="Prettier" />
    <img src="https://img.shields.io/badge/analyze--local_CLI-8596A7?style=flat-square" alt="CLI" />
  </td>
</tr>
</table>

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="quick-start"></a>

## ⚡ Quick Start

### 1. Prerequisites

| Tool | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **[Bun](https://bun.sh)** | `>= 1.2.0` | Package manager, TypeScript runner, and `bun:test` execution |
| **Node.js** | `>= 20.0.0` | Runtime compatibility for Vite/Nitro builds |
| **Supabase Project** | Free or Pro tier | PostgreSQL persistence, RLS policies, and Realtime channels |
| **GitHub OAuth App** | Standard OAuth or App | Read-only repository discovery and tarball ingestion |

### 2. Installation

```bash
git clone https://github.com/flawsom/nykst-software-intellegence.git
cd nykst-software-intellegence
bun install
```

### 3. Environment Variables

Create `.env.local` in the repository root (never committed to Git):

```bash
# 1. Supabase (Server + Browser)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# 2. GitHub OAuth / App (Supports nykst.unifies.codes, nykst.vercel.app & localhost:8080)
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...

# 3. BYOK Vault Encryption Key (32+ chars for AES-256-GCM)
NYKST_BYOK_SECRET=...

# 4. Nara Router Platform AI (Default: agnes-2.5-flash)
NYKST_AI_API_KEY=...
NYKST_AI_BASE_URL=https://router.bynara.id/v1
NYKST_AI_MODEL=agnes-2.5-flash
```

### 4. Provision the Database Schema

Apply `supabase/schema.sql` in the Supabase SQL Editor (idempotent, safe to re-run), then verify with the live readiness probe:

```bash
curl -s http://localhost:8080/api/health | jq
```

### 5. Running Locally

```bash
# Start the local development server on port 8080
bun run dev

# In a second terminal: run strict typechecking and the test suite
bunx tsc -b --noEmit
bun test ./tests
```

### 6. Docker Setup

<a id="docker"></a>

```dockerfile
# Dockerfile
FROM oven/bun:1.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/.output ./.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
```

```bash
docker build -t nykst:latest .
docker run -d --name nykst -p 8080:8080 --env-file .env.local nykst:latest
```

### 7. Production Deployment One-Liner

```bash
# Build and deploy to Cloudflare Workers or Vercel
bun run build && npx wrangler deploy
```

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="project-structure"></a>

## 📁 Project Structure

```text
nykst-software-intellegence/
├── public/
│   ├── favicon.svg                    # Bespoke hexagonal Graph-RAG prism favicon
│   ├── logo.svg                       # Full executive NYKST wordmark SVG
│   └── esewa-qr.jpg                   # Nepal eSewa subscription QR code
├── docs/assets/
│   ├── readme-hero.svg                # High-definition README hero banner with live AST stats
│   ├── divider.svg                    # Gradient section divider
│   └── screens/                       # Real Playwright captures (landing, graph, memory, mcp, pricing, mobile)
├── src/
│   ├── components/
│   │   ├── brand/NykstLogo.tsx        # Reusable executive SVG logo & wordmark components
│   │   ├── motion/VariantMotion.tsx   # Spotlight, Magnetic, TiltCard, ScrambleText, AnimatedCounter, Marquee
│   │   ├── graph/
│   │   │   ├── LiveGraphRagExplorer.tsx # Interactive AST blast-radius workbench, SQL inspector & MCP runner
│   │   │   ├── LandingGraphPreview.tsx  # Live-wired radial domain graph preview
│   │   │   ├── GraphCanvas.tsx        # 6-level interactive software graph canvas
│   │   │   ├── BeforeYouAct.tsx       # Consequence envelope builder & AI risk reader
│   │   │   ├── NodeDossier.tsx        # Deep file/service evidence dossier
│   │   │   ├── MentorPanel.tsx        # Grounded architectural Q&A panel
│   │   │   └── ApiSettings.tsx        # Nara Router & BYOK encrypted provider modal
│   │   ├── mcp/                       # Token generator & per-agent setup blocks
│   │   └── ui/                        # Radix + Tailwind CSS 4 primitives
│   ├── lib/
│   │   ├── analysis/
│   │   │   ├── engine.server.ts       # TypeScript AST compiler, SQL DDL parser & Tarjan SCC cycle detector
│   │   │   ├── parse.server.ts        # ts.createSourceFile AST walker (imports, exports, calls, URLs, env)
│   │   │   ├── resolve.ts             # tsconfig path alias & monorepo workspace package resolver
│   │   │   ├── impact.ts              # Reverse BFS reachability & temporal co-change calculator
│   │   │   ├── graph.ts               # 6-level hierarchical graph builder
│   │   │   ├── context.ts             # Evidence-only briefing serializer for LLMs & MCP
│   │   │   └── tools.ts               # 5 read-only MCP tool implementations
│   │   ├── integrations/github.ts     # OAuth, multi-origin redirect matcher, tarball ingest & PR creator
│   │   ├── connectors/                # Slack slash-command & Jira issue correlators
│   │   ├── byok.server.ts             # AES-256-GCM key vault & Nara Router (agnes-2.5-flash) client
│   │   └── mcp.server.ts              # Streamable HTTP JSON-RPC 2.0 MCP server
│   └── routes/
│       ├── index.tsx                  # Flagship landing page with Variant motion & live AST workbench
│       ├── graph.tsx                  # 6-level navigator (connected repo or live self-indexed fallback)
│       ├── intelligence.tsx           # 6-layer system memory workspace
│       ├── mcp.tsx                    # Interactive MCP setup guide for 9 coding agents
│       ├── subscribe.tsx              # eSewa subscription flow
│       ├── api.analysis.self.ts       # Real-time workspace AST compiler & MCP tool preview endpoint
│       ├── api.health.ts              # Live Supabase & 10-table readiness probe
│       └── api.*                      # Typed server endpoints (GitHub, AI, MCP, Diagnosis, Webhooks)
├── supabase/
│   ├── schema.sql                     # Consolidated idempotent PostgreSQL + RLS schema
│   └── migrations/                    # 15 chronological SQL migrations
├── scripts/analyze-local.ts           # Standalone CLI to run the AST engine against any local folder
└── tests/                             # bun:test suites (schema RLS, graph invariants, Slack/Jira connectors)
```

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="environment-variables"></a>

## 🔐 Environment Variables

| Variable | Required | Scope | Default / Format | Description |
| :--- | :---: | :--- | :--- | :--- |
| `SUPABASE_URL` | ✅ | Server | `https://<ref>.supabase.co` | Primary Supabase project URL for server-side operations. |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Server | `sb_publishable_...` | Publishable anon key for RLS-scoped reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server | `eyJ...` | Service-role key used exclusively by server routes to write snapshots, keys, and tokens. |
| `VITE_SUPABASE_URL` | ✅ | Client | `https://<ref>.supabase.co` | Exposed to the browser bundle for Supabase Realtime subscriptions. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Client | `sb_publishable_...` | Browser publishable key (protected by strict PostgreSQL RLS). |
| `GITHUB_CLIENT_ID` | ✅ | Server | `Ov23li...` or `Iv...` | GitHub OAuth App or GitHub App client ID. |
| `GITHUB_CLIENT_SECRET` | ✅ | Server | 40-char hex | GitHub client secret (also signs HMAC-SHA256 OAuth state cookies). `CLIENT_SECRET` alias supported. |
| `GITHUB_REDIRECT_URI` | — | Server | Auto-matched per host | Optional override. By default, Nykst dynamically matches `https://nykst.unifies.codes/api/integrations/github/callback`, `https://nykst.vercel.app/api/integrations/github/callback`, and `http://localhost:8080/api/integrations/github/callback` (including wildcard preview subdomains). |
| `GITHUB_WEBHOOK_SECRET` | ✅ | Server | Random string | Verifies `X-Hub-Signature-256` on `/api/webhooks/github`. |
| `NYKST_BYOK_SECRET` | ✅ | Server | 32+ char secret | Derives the 256-bit AES-GCM key used to encrypt user API keys at rest. |
| `NYKST_AI_API_KEY` | — | Server | `nara_...` / `sk-...` | Platform AI router key so first-time users get live answers immediately. |
| `NYKST_AI_BASE_URL` | — | Server | `https://router.bynara.id/v1` | OpenAI-compatible router base URL (HTTPS required). |
| `NYKST_AI_MODEL` | — | Server | `agnes-2.5-flash` | Platform model identifier. Defaults to `agnes-2.5-flash`. |
| `GEMINI_API_KEY` | — | Server | `AIza...` | Optional secondary platform fallback (`gemini-3.5-flash-lite`). |
| `SLACK_CLIENT_ID` / `SECRET` | — | Server | Slack App credentials | Enables Slack OAuth and `/nykst` slash commands. |
| `JIRA_CLIENT_ID` / `SECRET` | — | Server | Atlassian OAuth 2.0 | Enables Jira issue correlation against graph nodes. |
| `NYKST_ADMIN_GITHUB_ID` | — | Server | Numeric GitHub ID | Grants access to `/admin/payments` for manual eSewa approval. |

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="api-documentation"></a>

## 📖 API Documentation

- **Production Base URL**: `https://nykst.unifies.codes` (Mirror: `https://nykst.vercel.app`)
- **Local Base URL**: `http://localhost:8080`
- **Authentication**:
  - Browser & API routes: `HttpOnly; Secure; SameSite=Lax` cookie (`nykst_github_token`) set after `/api/integrations/github/callback`.
  - MCP Server (`/api/mcp`): `Authorization: Bearer nyk_<48-hex-chars>` (SHA-256 hashed in `mcp_access_tokens`).

### Core Endpoints Summary

| Method | Path | Auth | Purpose |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/health` | Public | Live readiness probe verifying Supabase connectivity and all 10 schema tables. |
| `GET` | `/api/analysis/self` | Public | Runs `analyzeRepository()` over the live workspace; supports `?path=`, `?tool=`, `?query=`, `?refresh=1`. |
| `GET` | `/api/integrations/github/start` | Public | Generates HMAC-SHA256 state and `302` redirects to GitHub OAuth with host-matched `redirect_uri`. |
| `GET` | `/api/integrations/github/callback` | Public | Verifies OAuth state, exchanges code for token, and sets `nykst_github_token`. |
| `POST` | `/api/integrations/github/ingest` | GitHub | Downloads repository tarball, runs TypeScript AST + history engine, stores snapshot, and broadcasts Realtime event. |
| `GET` | `/api/integrations/github/latest` | GitHub | Returns the user's newest stored `repository_ingestions` snapshot and Realtime topic. |
| `POST` | `/api/ai/chat` | Public / BYOK | Grounded architectural Q&A (`mode: "navigator" \| "code"`) using personal BYOK or `agnes-2.5-flash`. |
| `GET`/`POST`/`DELETE` | `/api/ai/key` | Public / GitHub | Inspect active AI provider status, test & save encrypted BYOK key, or delete stored key. |
| `POST` | `/api/mcp` | `Bearer nyk_...` | Stateless Streamable HTTP Model Context Protocol server (`2025-06-18`). |
| `POST` | `/api/diagnosis` | GitHub | Synthesizes root-cause candidates linking a `production_signals` record to the repository AST. |

### Example 1: Live Self-Indexed Blast-Radius & MCP Query (`GET /api/analysis/self`)

**Request:**

```bash
curl -s "https://nykst.unifies.codes/api/analysis/self?path=src/lib/integrations/github.ts&tool=get_impact" | jq '{
  repository,
  stats,
  target: .selectedTarget.path,
  blastLevel: .selectedTarget.briefing.impact.level,
  directImporters: (.selectedTarget.briefing.impact.direct_importers | length),
  entrypointsHit: (.selectedTarget.briefing.impact.entrypoints | length)
}'
```

**Response (`200 OK`):**

```json
{
  "repository": "flawsom/nykst-software-intellegence",
  "stats": {
    "treeFiles": 213,
    "sourceFiles": 160,
    "analyzedFiles": 160,
    "internalEdges": 317,
    "externalPackages": 52,
    "unresolvedImports": 0,
    "skippedFiles": 1,
    "loc": 24566,
    "durationMs": 638
  },
  "target": "src/lib/integrations/github.ts",
  "blastLevel": "High",
  "directImporters": 20,
  "entrypointsHit": 20
}
```

### Example 2: Grounded Architectural Chat with Nara `agnes-2.5-flash` (`POST /api/ai/chat`)

**Request:**

```bash
curl -s -X POST "https://nykst.unifies.codes/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What breaks if I modify src/lib/byok.server.ts?",
    "context": "Direct dependents: api.ai.chat.ts, api.ai.key.ts, api.diagnosis.ts, store.server.ts",
    "mode": "navigator"
  }' | jq
```

**Response (`200 OK`):**

```json
{
  "answer": "Modifying `src/lib/byok.server.ts` directly impacts AI chat completion (`api.ai.chat.ts`), BYOK key management (`api.ai.key.ts`), root-cause diagnosis (`api.diagnosis.ts`), and Slack/Jira token encryption (`store.server.ts`). Verify AES-256-GCM key derivation and `platformKey()` fallback before deploying.",
  "provider": "custom",
  "platformFallback": true
}
```

<a id="mcp-server"></a>

### Example 3: Model Context Protocol (`POST /api/mcp`)

```bash
curl -s -X POST "https://nykst.unifies.codes/api/mcp" \
  -H "Authorization: Bearer nyk_your_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_impact",
      "arguments": { "paths": ["src/lib/analysis/engine.server.ts"] }
    }
  }' | jq
```

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="usage-examples"></a>

## 🎯 Usage Examples

### 1. Wire Nykst into Claude Code, Cursor, or VS Code in 60 Seconds

```bash
# Claude Code — add Nykst globally so every repository gets blast-radius checks
claude mcp add --transport http --scope user nykst \
  https://nykst.unifies.codes/api/mcp \
  --header "Authorization: Bearer $NYKST_TOKEN"
```

```json
// .cursor/mcp.json or .vscode/mcp.json
{
  "mcpServers": {
    "nykst": {
      "url": "https://nykst.unifies.codes/api/mcp",
      "headers": {
        "Authorization": "Bearer nyk_your_token_here"
      }
    }
  }
}
```

### 2. Enforce Pre-Edit Impact Checks in `CLAUDE.md` / `.cursorrules`

Add this block to your repository's agent instructions so coding agents never edit blind:

```markdown
## Nykst Architectural Guardrails
Before editing any existing file, database migration, or environment variable:
1. Call `get_impact` with the target file paths to inspect all direct/transitive importers, affected routes/APIs, and covering tests.
2. When modifying a database table, external SDK, or env var, call `find_usages` first and update every call site in the same change.
3. Run the covering tests returned by `get_impact` before concluding your turn.
```

### 3. Run the Standalone AST Compiler CLI in CI

```bash
# Analyze any local directory and emit the full deterministic graph JSON
bun scripts/analyze-local.ts . --json /tmp/nykst-ast.json
```

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="performance"></a>

## 📊 Performance

Every benchmark below is measured directly against this repository (`flawsom/nykst-software-intellegence`) on Bun 1.4.2. Nothing is extrapolated or synthetic.

| Benchmark / Metric | Measured Value | Verification Command |
| :--- | :--- | :--- |
| **Live Workspace AST Compile Time** | **`638 ms`** (warm) · **`1,374 ms`** (cold) | `curl -s http://localhost:8080/api/analysis/self \| jq .stats` |
| **Analyzed Source Tree** | **`160` TypeScript/TSX files** (`24,566` LOC) | `curl -s http://localhost:8080/api/analysis/self \| jq .stats` |
| **Resolved Internal Import Edges** | **`317` edges · `0` unresolved imports** | `curl -s http://localhost:8080/api/analysis/self \| jq .stats` |
| **Circular Runtime Dependencies** | **`0` cycles** (Tarjan SCC verified) | `curl -s http://localhost:8080/api/analysis/self \| jq .cycles` |
| **SQL & Service Extraction** | **`12` SQL/data resources · `9` external services** | `curl -s http://localhost:8080/api/analysis/self \| jq '.resources \| length'` |
| **Health Probe Latency (`/api/health`)** | **`~180 ms`** (10 parallel PostgreSQL table probes) | `curl -w "%{time_total}s\n" -s -o /dev/null http://localhost:8080/api/health` |
| **Test Suite Execution** | **`1.52 s`** (`23` tests, `130` `expect()` assertions) | `bun test ./tests` |
| **Desktop Lighthouse Target** | **98 Performance · 100 Accessibility · 100 Best Practices · 100 SEO** | `npx lighthouse https://nykst.unifies.codes --preset=desktop` |

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="testing"></a>

## 🧪 Testing

Nykst enforces strict compile-time and runtime verification across schema security, graph determinism, and third-party connectors.

```bash
# 1. Run the complete unit + live Supabase RLS test suite
bun test ./tests

# 2. Generate line & branch coverage report
bun test --coverage ./tests

# 3. Run strict TypeScript project-reference typecheck (zero errors tolerated)
bunx tsc -b --noEmit

# 4. Run ESLint across all source files
bun run lint

# 5. Format codebase with Prettier
bun run format
```

### What the Automated Suite Verifies (`23 Pass / 0 Fail / 130 Assertions`)

- **`tests/schema.test.ts`**: Asserts that `supabase/schema.sql` creates every table and column in `src/integrations/supabase/types.ts`, enables Row-Level Security on 100% of tables, revokes `anon`/`authenticated` read access on private tables, and verifies live against Supabase that anonymous requests are rejected.
- **`tests/repository-graph.test.ts`**: Asserts that every graph node ID is globally unique, every file leaf carries its exact repository path once, sibling labels never collide, and `childrenOf()` never fabricates synthetic children.
- **`tests/connectors.test.ts`**: Verifies Slack `v0` HMAC-SHA256 timestamp signature validation, replay rejection, ticket-to-file path resolution, `/nykst impact` formatting, and Atlassian Document Format round-tripping.

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="deployment"></a>

## 🚀 Deployment

Nykst supports multi-origin GitHub OAuth callbacks out of the box (`https://nykst.unifies.codes/api/integrations/github/callback`, `https://nykst.vercel.app/api/integrations/github/callback`, wildcard preview domains, and `http://localhost:8080/api/integrations/github/callback`).

<details open>
<summary><b>1. Vercel (Primary Production & Custom Domain <code>nykst.unifies.codes</code>)</b></summary>

<br/>

```bash
bunx vercel link
bunx vercel env add SUPABASE_SERVICE_ROLE_KEY production
bunx vercel env add GITHUB_CLIENT_SECRET production
bunx vercel env add NYKST_BYOK_SECRET production
bunx vercel env add NYKST_AI_API_KEY production
bunx vercel --prod
```

</details>

<details>
<summary><b>2. Cloudflare Workers (Edge Deployment via Wrangler)</b></summary>

<br/>

```bash
bun run build
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put NYKST_BYOK_SECRET
npx wrangler secret put NYKST_AI_API_KEY
npx wrangler deploy
```

</details>

<details>
<summary><b>3. Netlify</b></summary>

<br/>

- **Build command**: `bun run build`
- **Publish directory**: `.output/public`
- **Functions directory**: `.output/server`
- Configure environment variables in **Site configuration → Environment variables**.

</details>

<details>
<summary><b>4. Railway</b></summary>

<br/>

1. Create a new project from `flawsom/nykst-software-intellegence`.
2. Set build command to `bun install && bun run build` and start command to `node .output/server/index.mjs`.
3. Add the variables from [🔐 Environment Variables](#environment-variables) in the Railway Variables tab.

</details>

<details>
<summary><b>5. Docker (Self-Hosted Container)</b></summary>

<br/>

Use the multi-stage `Dockerfile` in [⚡ Quick Start](#docker) to build a minimal Alpine image running `.output/server/index.mjs` on port `8080`.

</details>

<details>
<summary><b>6. AWS (ECS Fargate / App Runner)</b></summary>

<br/>

1. Build and push the Docker image to Amazon ECR.
2. Deploy an **AWS App Runner** service on port `8080` with secrets injected from **AWS Secrets Manager**.
3. Attach your custom domain via Route 53 and register `/api/integrations/github/callback` on your GitHub OAuth App.

</details>

<details>
<summary><b>7. DigitalOcean App Platform</b></summary>

<br/>

1. Connect your GitHub repository in **DigitalOcean App Platform**.
2. Set build command to `bun run build` and run command to `node .output/server/index.mjs` (HTTP port `8080`).
3. Mark secret environment variables as `ENCRYPTED`.

</details>

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="contributing"></a>

## 🤝 Contributing

We welcome contributions that sharpen the AST analysis engine, expand language support, or improve the 6-level graph navigation experience.

### Branch & Commit Conventions

- **Branch naming**: `feat/<scope>`, `fix/<scope>`, `perf/<scope>`, `docs/<scope>`, `test/<scope>`
- **Commit format**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(analysis): resolve tsconfig project references`, `fix(oauth): honor x-forwarded-host on custom domains`)
- **Author attribution**: Commits must carry only the human contributor's name and email — never add automated bot footers or third-party AI co-author trailers.

### Pull Request Process

1. Fork `flawsom/nykst-software-intellegence` and create your feature branch from `main`.
2. Add or update unit tests in `tests/` for any new analysis or connector logic.
3. Ensure `bunx tsc -b --noEmit` and `bun test ./tests` pass with zero warnings.
4. Open a Pull Request with a clear summary of the architectural evidence and blast radius of your change.

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="roadmap"></a>

## 🗺 Roadmap

### Completed Milestones

- [x] Deterministic TypeScript/JavaScript AST compiler (`ts.createSourceFile`) with `tsconfig` alias & workspace resolution
- [x] Iterative Tarjan strongly-connected-components (SCC) runtime cycle detector
- [x] SQL migration (`CREATE TABLE` / `FUNCTION`) and Prisma model linker to client `.from()` / `.rpc()` call sites
- [x] 6-level hierarchical software graph (`Organization → Domain → Capability → Service → Module → File`)
- [x] Live self-indexed AST workbench (`/api/analysis/self`) with zero mock data
- [x] **Before You Act** deterministic consequence envelope builder
- [x] 6-layer System Memory workspace (`/intelligence`)
- [x] Streamable HTTP Model Context Protocol server (`/api/mcp`) with 5 `readOnlyHint` tools
- [x] Nara Router (`agnes-2.5-flash`) platform integration + AES-256-GCM BYOK key vault
- [x] Multi-origin GitHub OAuth & App support (`nykst.unifies.codes`, `nykst.vercel.app`, `localhost:8080`)
- [x] Variant Motion System (Spotlight, Film Grain, 3D Tilt, Magnetic CTAs, Scramble Text, Animated Counters, Infinite Marquee)
- [x] Slack slash-command (`/nykst`) and Jira Cloud issue correlation connectors
- [x] Nepal eSewa subscription workflow with admin verification queue

### Upcoming Milestones

- [ ] Tree-sitter multi-language AST adapters for Python, Go, and Rust repositories
- [ ] Incremental commit-delta graph patching on `push` webhooks without full tarball re-download
- [ ] Cross-repository microservice federation (linking OpenAPI/gRPC contracts across multiple repos)
- [ ] OpenTelemetry runtime trace overlay on top of static AST edges
- [ ] GitHub Pull Request bot that posts automatic **Before You Act** blast-radius comments on every PR

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="faq"></a>

## ❓ FAQ

<details>
<summary><b>1. How is Nykst different from Cursor's codebase indexing, Sourcegraph Cody, or Greptile?</b></summary>

<br/>

Most tools focus on **code generation or chat over chunked embeddings**. Nykst is an **architectural navigation and consequence-verification system**. Instead of guessing which chunks relate to your question, Nykst compiles the AST, builds the exact reverse-reachability graph, links SQL tables and external services, and exposes that deterministic graph to both humans (via the 6-level visual navigator) and AI agents (via `/api/mcp`).

</details>

<details>
<summary><b>2. Does Nykst use any mock, synthetic, or seeded data?</b></summary>

<br/>

**Never.** Every metric, file count, import edge, SQL table, and blast-radius chain shown in Nykst is computed live from real code. Even before you connect your own GitHub account, `/api/analysis/self` runs the TypeScript AST compiler directly over Nykst's own repository on the server so every number you see is 100% real and verifiable.

</details>

<details>
<summary><b>3. Which AI model powers Nykst out of the box?</b></summary>

<br/>

Nykst is configured out of the box with **Nara Router (`agnes-2.5-flash`)** over `https://router.bynara.id/v1` for low-latency grounded architectural reasoning. Users can also connect their own OpenAI, Anthropic, Google Gemini, DeepSeek, or custom OpenAI-compatible API keys in **Connect API**, encrypted at rest with AES-256-GCM.

</details>

<details>
<summary><b>4. Does Nykst require write permissions to my GitHub repositories?</b></summary>

<br/>

No. Nykst operates read-only for repository mapping, blast-radius computation, memory synthesis, and MCP serving. Your source code stays in your GitHub account, and only derived structural metadata is stored in Supabase behind Row-Level Security.

</details>

<details>
<summary><b>5. Which redirect URIs are supported for GitHub OAuth?</b></summary>

<br/>

Nykst automatically detects the incoming `X-Forwarded-Host` / origin and supports:
- `https://nykst.unifies.codes/api/integrations/github/callback` (including `*.unifies.codes`)
- `https://nykst.vercel.app/api/integrations/github/callback` (including `nykst*.vercel.app` preview deployments)
- `http://localhost:8080/api/integrations/github/callback`

</details>

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="acknowledgements"></a>

## 🙌 Acknowledgements

- **[TypeScript Compiler team](https://www.typescriptlang.org/)** for the fast, rock-solid AST parser API (`ts.createSourceFile`) that powers our deterministic dependency engine.
- **[TanStack](https://tanstack.com/)** for TanStack Start and TanStack Router.
- **[Supabase](https://supabase.com/)** for PostgreSQL, Row-Level Security, and Realtime broadcast channels.
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** for standardizing how AI coding agents query external architectural intelligence.
- **[Variant Community](https://variant.com/community)** for inspiring the interactive motion language across the web experience.

<div align="right"><a href="#top">↑ Back to top</a></div>

<div align="center">
  <img src="docs/assets/divider.svg" width="100%" alt="" />
</div>

<a id="license"></a>

## 📜 License

Released under the **[MIT License](LICENSE)**. Copyright © 2026 **Nykst**.

---

<a id="support"></a>

## ❤️ Support

If Nykst helps your team or your AI agents navigate complex software systems without breaking production, please support the project:

<div align="center">

[![GitHub Star](https://img.shields.io/badge/STAR_ON_GITHUB-flawsom%2Fnykst-2DD4BF?style=for-the-badge&logo=github&logoColor=06110f&labelColor=0b141b)](https://github.com/flawsom/nykst-software-intellegence/stargazers)
[![GitHub Sponsors](https://img.shields.io/badge/SPONSOR-GitHub_Sponsors-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white&labelColor=0b141b)](https://github.com/sponsors/flawsom)
[![Buy Me a Coffee](https://img.shields.io/badge/BUY_ME_A_COFFEE-nykstsoftint-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=0b141b&labelColor=0b141b)](https://www.buymeacoffee.com/nykstsoftint)
[![Contact Email](https://img.shields.io/badge/EMAIL-nykstsoftint%40gmail.com-60A5FA?style=for-the-badge&logo=gmail&logoColor=white&labelColor=0b141b)](mailto:nykstsoftint@gmail.com)

</div>

<a id="releases"></a>

<p align="center">
  <sub>Built with precision by <a href="https://github.com/flawsom"><b>@flawsom</b></a> · <a href="https://nykst.unifies.codes">nykst.unifies.codes</a> · <a href="#top">↑ Back to top</a></sub>
</p>
