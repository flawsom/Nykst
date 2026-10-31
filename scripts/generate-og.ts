import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Stats = {
  sourceFiles: number;
  internalEdges: number;
  loc: number;
  generatedAt: string;
  domains: Array<{ domain: string; files: number; edgesIn: number }>;
};

const root = path.resolve(import.meta.dir, "..");
const stats = JSON.parse(
  await readFile(path.join(root, "src/lib/analysis/self-snapshot-stats.json"), "utf8"),
) as Stats;

const domains = stats.domains
  .filter((domain) => domain.domain !== "src")
  .sort((a, b) => b.files - a.files)
  .slice(0, 5);
const largest = Math.max(...domains.map((domain) => domain.files), 1);

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    background: #06110c;
    color: #f2ede3;
    font-family: "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  .frame {
    position: relative;
    width: 1200px;
    height: 630px;
    padding: 46px 54px 40px;
    background-image:
      linear-gradient(to right, rgba(199,185,155,0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(199,185,155,0.05) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  .frame::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 78% 45%, rgba(163, 28, 27, 0.14), transparent 46%);
    pointer-events: none;
  }
  .top { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 13px; }
  .word { font-size: 17px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; }
  .tag { font-family: monospace; font-size: 10px; letter-spacing: 0.2em; color: #a8b2a8; text-transform: uppercase; }
  .main { position: relative; z-index: 1; display: grid; grid-template-columns: 1.12fr 0.88fr; gap: 54px; margin-top: 62px; }
  .eyebrow { display: inline-block; padding-left: 10px; border-left: 2px solid #a31c1b; font-family: monospace; font-size: 11px; letter-spacing: 0.24em; color: #a8b2a8; text-transform: uppercase; }
  h1 { margin: 15px 0 0; font-size: 58px; line-height: 1.02; letter-spacing: -0.035em; font-weight: 700; max-width: 630px; }
  .lede { margin: 22px 0 0; font-size: 18px; line-height: 1.5; color: #d8d4c9; max-width: 560px; }
  .meta { margin-top: 35px; display: flex; align-items: center; gap: 12px; font-family: monospace; font-size: 11px; color: #a8b2a8; letter-spacing: 0.03em; }
  .dot { width: 6px; height: 6px; border-radius: 99px; background: #a31c1b; }
  .panel {
    position: relative;
    align-self: end;
    border: 1px solid #183328;
    border-radius: 16px;
    background: rgba(11, 25, 18, 0.94);
    padding: 22px 22px 18px;
    box-shadow: 0 28px 80px -30px rgba(0,0,0,0.85);
  }
  .panel-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 14px; border-bottom: 1px solid #183328; }
  .panel-title { font-family: monospace; font-size: 10px; letter-spacing: 0.18em; color: #a8b2a8; text-transform: uppercase; }
  .panel-sub { font-family: monospace; font-size: 9px; color: #a8b2a8; }
  .row { padding: 13px 0 12px; border-bottom: 1px solid #183328; }
  .row:last-child { border-bottom: 0; padding-bottom: 4px; }
  .row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .path { font-family: monospace; font-size: 12px; color: #f2ede3; letter-spacing: -0.01em; }
  .count { font-family: monospace; font-size: 10px; color: #a8b2a8; white-space: nowrap; }
  .track { height: 3px; margin-top: 8px; background: #10231b; border-radius: 99px; overflow: hidden; }
  .fill { height: 100%; background: #8fa99a; border-radius: 99px; }
  .foot { position: absolute; z-index: 1; left: 54px; right: 54px; bottom: 30px; display: flex; justify-content: space-between; padding-top: 16px; border-top: 1px solid #183328; font-family: monospace; font-size: 10px; letter-spacing: 0.06em; color: #a8b2a8; }
  .foot b { color: #f2ede3; font-weight: 500; }
</style>
</head>
<body>
  <div class="frame">
    <div class="top">
      <div class="brand">
        <svg width="38" height="38" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#030906" stroke="#183328" stroke-width="1.8"/>
          <path d="M19,44 L19,20 L45,44 L45,20" fill="none" stroke="#f2ede3" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="19" cy="20" r="3.2" fill="#c7b99b"/>
          <circle cx="45" cy="44" r="3.2" fill="#a31c1b"/>
          <circle cx="19" cy="44" r="2.4" fill="#a31c1b"/>
          <circle cx="45" cy="20" r="2.4" fill="#741514"/>
        </svg>
        <span class="word">Nykst</span>
      </div>
      <span class="tag">Read-only system map</span>
    </div>

    <div class="main">
      <div>
        <div class="eyebrow">Know the blast radius</div>
        <h1>See what your next change will touch.</h1>
        <p class="lede">One map of how your repository fits together, with a file and line behind every answer.</p>
        <div class="meta"><span class="dot"></span> ${stats.sourceFiles} files mapped &nbsp; / &nbsp; ${stats.internalEdges} import edges &nbsp; / &nbsp; ${stats.loc.toLocaleString("en-US")} lines</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">This repository</span>
          <span class="panel-sub">real snapshot</span>
        </div>
        ${domains
          .map(
            (domain) => `<div class="row">
          <div class="row-top">
            <span class="path">${domain.domain}/</span>
            <span class="count">${domain.files} files${domain.edgesIn > 0 ? ` · ${domain.edgesIn} in` : ""}</span>
          </div>
          <div class="track"><div class="fill" style="width:${Math.max(6, Math.round((domain.files / largest) * 100))}%"></div></div>
        </div>`,
          )
          .join("")}
      </div>
    </div>

    <div class="foot">
      <span><b>nykst.unifies.codes</b> &nbsp; / &nbsp; built in India</span>
      <span>Generated ${stats.generatedAt.slice(0, 10)} from this repository</span>
    </div>
  </div>
</body>
</html>`;

const executablePath =
  process.env.CHROMIUM_PATH ??
  "/home/daytona/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: path.join(root, "public/og-image.png"), type: "png" });
await browser.close();
console.log(
  `Wrote public/og-image.png from ${stats.sourceFiles} files and ${stats.internalEdges} edges.`,
);
