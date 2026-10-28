import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TOOLS } from "../src/lib/analysis/tools";

const published = JSON.parse(readFileSync("docs/mcp-tools.json", "utf8")) as {
  toolCount: number;
  tools: typeof TOOLS;
};

describe("published MCP contract", () => {
  test("the committed schema is exactly the executable catalog", () => {
    expect(published.toolCount).toBe(TOOLS.length);
    expect(published.tools).toEqual(TOOLS);
  });

  test("all eleven tools are read-only and carry a complete input schema", () => {
    expect(TOOLS).toHaveLength(11);
    expect(new Set(TOOLS.map((tool) => tool.name)).size).toBe(TOOLS.length);
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z_]+$/);
      expect(tool.title.length).toBeGreaterThan(4);
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).not.toBe(true);
      expect(tool.inputSchema.type).toBe("object");
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      for (const required of (tool.inputSchema as { required?: string[] }).required ?? [])
        expect(properties).toContain(required);
    }
  });

  test("README lists every tool, all eleven, and contains no invisible dashes", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const tool of TOOLS) expect(readme).toContain(tool.name);
    expect(readme).toContain("11 read-only tools");
    expect(readme).toContain("Eleven read-only MCP tools");
    expect(readme).toContain("Eleven MCP tools");
    expect(readme).not.toContain("\u200b");
    expect(readme).not.toContain("\u2014");
  });
});
