import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  extractMemoryRecords,
  searchMemory,
  type EvidenceSource,
} from "../src/lib/memory/evidence";

const adr = `# Use Postgres for graph snapshots

Status: Accepted

We store every analyzed snapshot in Postgres so graph reads stay transactional.

## Consequences

Snapshot writes stay atomic and the API never rebuilds a graph from a cache.`;

const readme = `# Nykst

The architecture is compiled, not guessed.

\`\`\`mermaid
flowchart TD
  UI[Web app] --> API[Analysis API]
  API --> DB{Postgres}
  API -->|reads| AST[TypeScript AST]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant API as Analysis API
  U->>API: request blast radius
  API-->>U: evidence envelope
\`\`\`

![Graph explorer](docs/assets/graph.png)
![Graph explorer](docs/assets/graph.png)
<img src="docs/assets/mobile.webp" alt="Mobile graph" />
![Not an image](notes.txt)`;

const migration = `create table public.users (
  id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists avatar_url text;

create or replace function public.touch_users()
returns trigger
language plpgsql
as $$ begin return new; end $$;`;

function sources(): EvidenceSource[] {
  return [
    { path: "docs/adr/0001-postgres-snapshots.md", text: adr },
    { path: "README.md", text: readme },
    { path: "supabase/migrations/0001_users.sql", text: migration },
  ];
}

describe("evidence memory", () => {
  test("extracts an ADR title, status, summary and citations", () => {
    const records = extractMemoryRecords(sources());
    const record = records.find((item) => item.kind === "adr");
    expect(record).toBeDefined();
    expect(record!.id).toBe("adr:docs/adr/0001-postgres-snapshots.md");
    expect(record!.title).toBe("Use Postgres for graph snapshots");
    expect(record!.status).toBe("accepted");
    expect(record!.summary).toContain("transactional");
    expect(record!.summary).not.toContain("Status:");
    expect(record!.citations).toContainEqual({
      path: "docs/adr/0001-postgres-snapshots.md",
      line: 1,
    });
    expect(record!.citations).toContainEqual({
      path: "docs/adr/0001-postgres-snapshots.md",
      line: 3,
    });
    expect(record!.entities).toContainEqual({ kind: "status", value: "accepted" });
    expect(record!.checksum).toHaveLength(64);
  });

  test("extracts flowchart nodes and edges from Mermaid", () => {
    const records = extractMemoryRecords(sources());
    const diagrams = records.filter((item) => item.kind === "diagram");
    expect(diagrams).toHaveLength(2);

    const flowchart = diagrams.find((item) => item.tags.includes("flowchart"));
    expect(flowchart).toBeDefined();
    expect(flowchart!.media?.type).toBe("mermaid");
    expect(flowchart!.entities).toContainEqual({ kind: "node", value: "UI Web app" });
    expect(flowchart!.entities).toContainEqual({
      kind: "edge",
      value: "UI -> API",
    });
    expect(flowchart!.summary).toContain("4 node(s)");
    expect(flowchart!.summary).toContain("3 edge(s)");
  });

  test("extracts sequence participants and messages", () => {
    const records = extractMemoryRecords(sources());
    const sequence = records.find((item) => item.tags.includes("sequence"));
    expect(sequence).toBeDefined();
    expect(sequence!.entities).toContainEqual({ kind: "node", value: "U User" });
    expect(sequence!.entities).toContainEqual({
      kind: "message",
      value: "U -> API: request blast radius",
    });
    expect(sequence!.summary).toContain("2 message(s)");
  });

  test("extracts tables, columns and functions from a migration", () => {
    const records = extractMemoryRecords(sources());
    const record = records.find((item) => item.kind === "migration");
    expect(record).toBeDefined();
    expect(record!.id).toBe("migration:supabase/migrations/0001_users.sql");
    expect(record!.entities).toContainEqual({ kind: "table", value: "users" });
    expect(record!.entities).toContainEqual({ kind: "column", value: "users.id" });
    expect(record!.entities).toContainEqual({ kind: "column", value: "users.email" });
    expect(record!.entities).toContainEqual({ kind: "column", value: "users.avatar_url" });
    expect(record!.entities).toContainEqual({ kind: "operation", value: "rpc:touch_users" });
    expect(record!.summary).toContain("1 table definition(s)");
    expect(record!.summary).toContain("1 alter-table column change(s)");
  });

  test("deduplicates repeated image references by path", () => {
    const records = extractMemoryRecords(sources());
    const images = records.filter((item) => item.kind === "image");
    expect(images.map((item) => item.id).sort()).toEqual([
      "image:docs/assets/graph.png",
      "image:docs/assets/mobile.webp",
    ]);
    const graph = images.find((item) => item.id === "image:docs/assets/graph.png");
    expect(graph!.citations).toHaveLength(2);
    expect(graph!.media).toEqual({
      type: "image",
      path: "docs/assets/graph.png",
      alt: "Graph explorer",
      format: "png",
    });
    const mobile = images.find((item) => item.id === "image:docs/assets/mobile.webp");
    expect(mobile!.media?.alt).toBe("Mobile graph");
  });

  test("checksums are stable across extractions", () => {
    const first = extractMemoryRecords(sources());
    const second = extractMemoryRecords(sources());
    expect(first.map((item) => [item.id, item.checksum])).toEqual(
      second.map((item) => [item.id, item.checksum]),
    );
    const diagram = first.find((item) => item.kind === "diagram")!;
    expect(diagram.checksum).toBe(
      createHash("sha256").update(`${diagram.tags[1]}\n${diagram.text}`).digest("hex"),
    );
  });

  test("search is case-insensitive and honors the kind filter", () => {
    const records = extractMemoryRecords(sources());
    expect(searchMemory(records, "POSTGRES").map((item) => item.kind)).toContain("adr");
    expect(searchMemory(records, "postgres", "migration")).toEqual([]);
    expect(searchMemory(records, "graph explorer", "image")).toHaveLength(1);
    expect(searchMemory(records, "invoice")).toEqual([]);
  });

  test("never invents a record for a non-document file", () => {
    const records = extractMemoryRecords([{ path: "src/index.ts", text: "export const x = 1;" }]);
    expect(records).toEqual([]);
  });
});
