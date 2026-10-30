import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * These are copy contracts, not style preferences.
 *
 * A customer may see the AI service they already pay for, but never the
 * internal version name, never a key suffix, and never an unexplained
 * third party endpoint. The MCP sandbox must say which project it runs on
 * before a visitor presses Run.
 */
const source = (path: string) => readFileSync(path, "utf8");
const api = source("src/components/graph/ApiSettings.tsx");
const providers = source("src/lib/byok.server.ts");
const mcp = source("src/routes/mcp.tsx");
const landingMcp = source("src/components/graph/LiveGraphRagExplorer.tsx");
const tokens = source("src/components/mcp/TokenPanel.tsx");
/** JSX wraps sentences across lines; compare prose with whitespace collapsed. */
const prose = (text: string) => text.replace(/\s+/g, " ");

describe("AI settings copy", () => {
  test("no model name or key suffix is rendered", () => {
    expect(api).not.toContain("{item.model}");
    expect(api).not.toContain("{selected.model}");
    expect(api).not.toContain("ends in");
    expect(api).not.toContain("status.last4");
    expect(api).not.toContain("(status.model");
  });

  test("another service explains where requests go instead of pre-filling a router", () => {
    expect(api).not.toContain("router.bynara.id");
    expect(api).not.toContain("agnes-2.5-flash");
    expect(providers).not.toContain("router.bynara.id");
    expect(providers).not.toContain("agnes-2.5-flash");
    expect(prose(api)).toContain("Enter the web address of the service you use");
    expect(prose(api)).toContain("Nykst sends your question to that address only");
  });

  test("removing a key asks first and reports the result", () => {
    expect(api).toContain("Yes, remove the key");
    expect(api).toContain("Key removed");
    expect(api).not.toContain("onClick={remove}");
  });

  test("the dialog is rendered above the page, not inside a header stacking context", () => {
    expect(api).toContain("createPortal");
    expect(api).toContain("document.body");
  });
});

describe("first-screen language", () => {
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const screens = {
    landing: source("src/routes/index.tsx"),
    graph: source("src/routes/graph.tsx"),
    preview: source("src/components/graph/LandingGraphPreview.tsx"),
    workbench: source("src/components/graph/LiveGraphRagExplorer.tsx"),
    canvas: source("src/components/graph/GraphCanvas.tsx"),
    brand: source("src/components/brand/NykstLogo.tsx"),
  };

  test("plain words come before compiler terms", () => {
    for (const [name, text] of Object.entries(screens)) {
      const visible = stripComments(text);
      for (const term of ["Graph-RAG", "GraphRAG", "AST", "source files", "import edges", "LOC"]) {
        expect({ name, term, present: visible.includes(term) }).toEqual({
          name,
          term,
          present: false,
        });
      }
    }
  });
});

describe("MCP sandbox copy", () => {
  test("states that the sandbox is the example project before it runs", () => {
    expect(prose(mcp)).toContain("This sandbox runs on the Nykst example project only");
    expect(prose(mcp)).toContain("never on your repository");
  });

  test("no buffer jargon is shown to a customer", () => {
    expect(mcp).not.toContain("In-Memory Overlay Buffer");
    expect(mcp).not.toContain("Machine-Verified Remediation Buffer");
    expect(mcp).not.toContain("overlay →");
    expect(mcp).toContain("Nothing is written to your project");
    expect(landingMcp).not.toContain("In-Memory Overlay Buffer");
    expect(landingMcp).not.toContain("Machine-Verified Remediation Buffer");
    expect(landingMcp).toContain("Nothing is written to your project");
  });
});

describe("billing copy", () => {
  const subscribe = source("src/routes/subscribe.tsx");

  test("does not expose internal gate names or payment secrets", () => {
    expect(subscribe).not.toContain("M2-09");
    expect(subscribe).not.toContain("RAZORPAY_KEY_SECRET");
    expect(subscribe).not.toContain("No payment is taken on this page");
    expect(subscribe).toContain("Checkout is not open yet");
    expect(subscribe).toContain("7-day");
  });
});

describe("MCP key panel copy", () => {
  test("deleting a key asks first and reports success", () => {
    expect(tokens).toContain("Yes, delete");
    expect(tokens).toContain("Key deleted");
    expect(tokens).toContain("Create a new key");
  });
});

describe("map freshness and cap labels", () => {
  const graph = source("src/routes/graph.tsx");

  test("states the saved date and a current, updating or stale label", () => {
    expect(graph).toContain("graph-freshness-label");
    expect(prose(graph)).toContain("Saved map from");
    expect(graph).toContain('"Stale"');
    expect(graph).toContain('"Updating"');
    expect(graph).toContain('"Current"');
    expect(graph).not.toContain("Live repository intelligence");
  });

  test("names the rebuilt action and never says Re-analyze", () => {
    expect(prose(graph)).toContain("Re-check this project now");
    expect(graph).not.toContain("Re-analyze");
  });

  test("warns when the stored links are a capped list", () => {
    expect(graph).toContain("graph-edge-cap");
    expect(prose(graph)).toContain("links between files");
    expect(prose(graph)).toContain("What this map does not include");
  });
});

describe("dossier count labels", () => {
  const dossier = source("src/components/graph/NodeDossier.tsx");

  test("says how many rows are shown and how many exist in total", () => {
    expect(prose(dossier)).toContain("matching shown");
    expect(dossier).toContain("{section.rowKind} in total");
    expect(prose(dossier)).toContain("different");
    expect(dossier).not.toContain("Evidence dossier");
  });

  test("the display cap says what is missing and offers the full list", () => {
    expect(prose(dossier)).toContain("more findings not shown");
    expect(prose(dossier)).toContain("Press Show all to read them");
  });

  test("an empty section offers a rebuild action inside the dossier", () => {
    expect(dossier).toContain("dossier-recheck");
    expect(prose(dossier)).toContain("No proof found for this item yet");
  });
});
