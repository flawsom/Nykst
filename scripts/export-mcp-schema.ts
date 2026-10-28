/**
 * Writes the published MCP tool schema from the executable catalog.
 *
 *   bun run mcp:schema
 *
 * The tests compare `docs/mcp-tools.json` with `TOOLS`, so the published
 * inputs can never drift from what `/api/mcp` actually accepts.
 */
import { writeFileSync } from "node:fs";
import { TOOLS } from "../src/lib/analysis/tools";

const schema = {
  server: {
    name: "nykst",
    transport: "streamable-http",
    endpoint: "/api/mcp",
    readOnly: true,
  },
  generatedFrom: "src/lib/analysis/tools.ts",
  toolCount: TOOLS.length,
  tools: TOOLS,
};

writeFileSync("docs/mcp-tools.json", `${JSON.stringify(schema, null, 2)}\n`);

console.log(JSON.stringify({ out: "docs/mcp-tools.json", tools: TOOLS.length }, null, 2));
