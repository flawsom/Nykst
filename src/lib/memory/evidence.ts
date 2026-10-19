import { createHash } from "node:crypto";
import type { MemoryCitation, MemoryEntity, MemoryKind, MemoryRecord } from "../analysis/types";

/**
 * Evidence-backed memory. Every record is extracted from real text that was present in
 * the repository, keeps file and line citations, and is checksummed so a stale claim is
 * detectable. Nothing here paraphrases with a model or invents evidence.
 */

export interface EvidenceSource {
  path: string;
  text: string;
}

const MAX_TEXT = 4000;
const MAX_SUMMARY = 400;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function bound(value: string, length = MAX_TEXT) {
  const clean = value.replace(/\r\n/g, "\n").trim();
  return clean.length > length ? `${clean.slice(0, length)}\n[truncated]` : clean;
}

function summaryText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY);
}

function lineNumbers(text: string) {
  const starts: number[] = [0];
  for (let index = 0; index < text.length; index += 1)
    if (text[index] === "\n") starts.push(index + 1);
  return (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

type AdrStatus = NonNullable<MemoryRecord["status"]>;

function normalizeStatus(value: string): AdrStatus {
  const text = value.toLowerCase();
  if (/\bsuperseded\b/.test(text)) return "superseded";
  if (/\bamended\b/.test(text)) return "amended";
  if (/\baccepted\b|\bapproved\b/.test(text)) return "accepted";
  if (/\brejected\b|\bdeclined\b/.test(text)) return "rejected";
  if (/\bproposed\b|\bdraft\b/.test(text)) return "proposed";
  return "unknown";
}

function isAdrPath(path: string) {
  return (
    /\.md$/i.test(path) &&
    (/(^|\/)(adr|adrs|decisions)\//i.test(path) || /(^|\/)(adr|decision)[-_]/i.test(path))
  );
}

function titleFromPath(path: string) {
  const name = path.split("/").pop() ?? path;
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || name
  );
}

function adrRecord(source: EvidenceSource): MemoryRecord {
  const lines = source.text.split(/\r?\n/);
  let title = titleFromPath(source.path);
  let titleLine: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^#\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1]) {
      title = match[1].trim();
      titleLine = index + 1;
      break;
    }
  }

  let status: AdrStatus = "unknown";
  let statusLine: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const inline = /^\s*(?:[-*]\s*)?(?:\*\*)?status(?:\*\*)?\s*[:-]\s*(.+?)\s*$/i.exec(line);
    if (inline?.[1]) {
      status = normalizeStatus(inline[1]);
      statusLine = index + 1;
      break;
    }
  }
  if (status === "unknown") {
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (!/^#{1,6}\s+status\s*$/i.test(lines[index] ?? "")) continue;
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 6); cursor += 1) {
        const value = (lines[cursor] ?? "").trim();
        if (!value) continue;
        status = normalizeStatus(value);
        statusLine = cursor + 1;
        break;
      }
      break;
    }
  }

  let summary = "";
  const start = (titleLine ?? 0) as number;
  for (let index = start; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (!line || line.startsWith("#")) continue;
    if (
      /^(?:[-*]\s*)?(?:status|date|deciders|supersedes|superseded by|context|decision|consequences)\s*:/i.test(
        line,
      )
    )
      continue;
    const paragraph: string[] = [];
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const next = (lines[cursor] ?? "").trim();
      if (!next || next.startsWith("#")) break;
      paragraph.push(next);
    }
    summary = summaryText(paragraph.join(" "));
    break;
  }

  const citations: MemoryCitation[] = [
    { path: source.path, ...(titleLine ? { line: titleLine } : {}) },
  ];
  if (statusLine) citations.push({ path: source.path, line: statusLine });
  const entities: MemoryEntity[] = [{ kind: "decision", value: title }];
  if (status !== "unknown") entities.push({ kind: "status", value: status });
  if (summary) entities.push({ kind: "decision", value: summary });

  return {
    id: `adr:${source.path}`,
    kind: "adr",
    title,
    summary: summary || `Architecture decision record with status ${status}.`,
    text: bound(source.text),
    citations,
    checksum: checksum(bound(source.text)),
    tags: ["adr", status],
    entities,
    status,
  };
}

interface MermaidBlock {
  content: string;
  fenceLine: number;
}

function mermaidBlocks(text: string): MermaidBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MermaidBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*```mermaid\s*$/i.test(lines[index] ?? "")) continue;
    const start = index + 1;
    let end = start;
    while (end < lines.length && !/^\s*```\s*$/.test(lines[end] ?? "")) end += 1;
    blocks.push({ content: lines.slice(start, end).join("\n"), fenceLine: start });
    index = end;
  }
  return blocks;
}

function mermaidRecord(source: EvidenceSource, block: MermaidBlock, index: number): MemoryRecord {
  const content = block.content.trim();
  const first = content.split(/\n/, 1)[0]?.trim() ?? "";
  const type = /^sequenceDiagram\b/i.test(first)
    ? "sequence"
    : /^(flowchart|graph)\b/i.test(first)
      ? "flowchart"
      : (first.split(/\s+/)[0] || "diagram").replace(/[^a-z0-9]/gi, "").toLowerCase();

  const entities: MemoryEntity[] = [];
  const seen = new Set<string>();
  const add = (kind: MemoryEntity["kind"], value: string) => {
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ kind, value });
  };

  if (type === "sequence") {
    for (const line of content.split("\n")) {
      const participant = /^\s*(?:participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+?))?\s*$/i.exec(
        line,
      );
      if (participant?.[1]) {
        add("node", participant[2] ? `${participant[1]} ${participant[2]}` : participant[1]);
        continue;
      }
      const message =
        /^\s*([A-Za-z0-9_]+)\s*(?:->>|-->>|->|-->|-\)|--\))\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/.exec(
          line,
        );
      if (message?.[1] && message[2] && message[3])
        add("message", `${message[1]} -> ${message[2]}: ${message[3]}`);
    }
  } else {
    for (const line of content.split("\n")) {
      for (const match of line.matchAll(
        /\b([A-Za-z0-9_]+)\s*(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})/g,
      )) {
        const id = match[1]!;
        const label = (match[2] ?? match[3] ?? match[4] ?? "").trim();
        add("node", label ? `${id} ${label}` : id);
      }
      for (const match of line.matchAll(
        /([A-Za-z0-9_]+)(?:\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}))?\s*(-->|---|-.->|==>|--x|--o)\s*(?:\|([^|]*)\|\s*)?([A-Za-z0-9_]+)/g,
      )) {
        const from = match[1]!;
        const to = match[4]!;
        const label = (match[3] ?? "").trim();
        add("edge", `${from} -> ${to}${label ? ` (${label})` : ""}`);
      }
    }
  }

  const nodes = entities.filter((entity) => entity.kind === "node").length;
  const edges = entities.filter((entity) => entity.kind === "edge").length;
  const messages = entities.filter((entity) => entity.kind === "message").length;
  const summary =
    type === "sequence"
      ? `Sequence diagram with ${nodes} participant(s) and ${messages} message(s).`
      : `Flowchart with ${nodes} node(s) and ${edges} edge(s).`;

  return {
    id: `diagram:${source.path}:${block.fenceLine}`,
    kind: "diagram",
    title: `${titleFromPath(source.path)} diagram ${index + 1}`,
    summary,
    text: bound(content),
    citations: [{ path: source.path, line: block.fenceLine }],
    checksum: checksum(`${type}\n${content}`),
    tags: ["mermaid", type],
    entities,
    media: { type: "mermaid" },
  };
}

function sqlMasked(text: string) {
  return text.replace(/--[^\n]*/g, (match) => " ".repeat(match.length));
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function matchingParen(text: string, open: number) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function migrationRecord(source: EvidenceSource): MemoryRecord {
  const masked = sqlMasked(source.text);
  const lineOf = lineNumbers(source.text);
  const entities: MemoryEntity[] = [];
  const citations: MemoryCitation[] = [];
  const seen = new Set<string>();
  const add = (kind: MemoryEntity["kind"], value: string, line?: number) => {
    const key = `${kind}:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ kind, value });
    }
    if (line && !citations.some((item) => item.line === line))
      citations.push({ path: source.path, line });
  };

  const tablePattern =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let tableMatch: RegExpExecArray | null;
  let tableCount = 0;
  while ((tableMatch = tablePattern.exec(masked))) {
    const table = tableMatch[1]!.toLowerCase();
    tableCount += 1;
    const start = tablePattern.lastIndex - 1;
    const end = matchingParen(masked, start);
    const body = end === -1 ? "" : masked.slice(start + 1, end);
    add("table", table, lineOf(tableMatch.index));
    for (const part of splitTopLevel(body)) {
      const column = /^\s*"?([a-z_][a-z0-9_]*)"?\s+([a-z][a-z0-9_.[\] ]*)/i.exec(part);
      if (!column?.[1]) continue;
      if (/^(constraint|primary|unique|foreign|check|key|exclude)$/i.test(column[1])) continue;
      add("column", `${table}.${column[1].toLowerCase()}`, lineOf(tableMatch.index));
    }
  }

  const alterPattern =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s+([^;]+);/gi;
  let alterMatch: RegExpExecArray | null;
  let alterCount = 0;
  while ((alterMatch = alterPattern.exec(masked))) {
    const table = alterMatch[1]!.toLowerCase();
    const action = alterMatch[2]!;
    const line = lineOf(alterMatch.index);
    add("table", table, line);
    const added = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/i.exec(action);
    if (added?.[1]) {
      add("column", `${table}.${added[1].toLowerCase()}`, line);
      alterCount += 1;
    }
    const dropped = /drop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/i.exec(action);
    if (dropped?.[1]) {
      add("column", `${table}.${dropped[1].toLowerCase()}`, line);
      alterCount += 1;
    }
    const renamed = /rename\s+column\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/i.exec(
      action,
    );
    if (renamed?.[1] && renamed[2]) {
      add("column", `${table}.${renamed[1].toLowerCase()}`, line);
      add("column", `${table}.${renamed[2].toLowerCase()}`, line);
      alterCount += 1;
    }
  }

  const functionPattern =
    /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  let functionMatch: RegExpExecArray | null;
  let functionCount = 0;
  while ((functionMatch = functionPattern.exec(masked))) {
    functionCount += 1;
    add("operation", `rpc:${functionMatch[1]!.toLowerCase()}`, lineOf(functionMatch.index));
  }

  const columns = entities.filter((entity) => entity.kind === "column").length;
  const functions = entities.filter((entity) => entity.kind === "operation").length;
  const summary = `Migration with ${tableCount} table definition(s), ${columns} column reference(s) and ${functionCount} function definition(s).${
    alterCount ? ` Includes ${alterCount} alter-table column change(s).` : ""
  }`;

  return {
    id: `migration:${source.path}`,
    kind: "migration",
    title: titleFromPath(source.path),
    summary,
    text: bound(source.text),
    citations: citations.length ? citations : [{ path: source.path, line: 1 }],
    checksum: checksum(bound(source.text)),
    tags: ["sql", "migration"],
    entities,
  };
}

interface ImageReference {
  path: string;
  alt: string;
  line: number;
}

function imageReferences(source: EvidenceSource): ImageReference[] {
  const references: ImageReference[] = [];
  const lines = source.text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const match of line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = (match[2] ?? "").split(/[?#]/, 1)[0] ?? "";
      if (IMAGE_EXTENSIONS.has(raw.split(".").pop()?.toLowerCase() ?? ""))
        references.push({ path: raw, alt: (match[1] ?? "").trim(), line: index + 1 });
    }
    for (const match of line.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
      const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
      const clean = src.split(/[?#]/, 1)[0] ?? "";
      if (IMAGE_EXTENSIONS.has(clean.split(".").pop()?.toLowerCase() ?? ""))
        references.push({ path: clean, alt: alt.trim(), line: index + 1 });
    }
  }
  return references;
}

function buildRecords(sources: EvidenceSource[]) {
  const records = new Map<string, MemoryRecord>();
  const images = new Map<string, { alt: string; citations: MemoryCitation[] }>();

  for (const source of sources) {
    if (isAdrPath(source.path)) {
      const record = adrRecord(source);
      records.set(record.id, record);
    }
    if (/\.md$/i.test(source.path)) {
      mermaidBlocks(source.text).forEach((block, index) => {
        const record = mermaidRecord(source, block, index);
        records.set(record.id, record);
      });
      for (const reference of imageReferences(source)) {
        const key = `image:${reference.path}`;
        const entry = images.get(key) ?? { alt: "", citations: [] };
        if (!entry.alt && reference.alt) entry.alt = reference.alt;
        if (
          !entry.citations.some((item) => item.path === source.path && item.line === reference.line)
        )
          entry.citations.push({ path: source.path, line: reference.line });
        images.set(key, entry);
      }
    }
    if (/\.sql$/i.test(source.path)) {
      const record = migrationRecord(source);
      records.set(record.id, record);
    }
  }

  for (const [id, entry] of images) {
    const path = id.slice("image:".length);
    const format = path.split(".").pop()?.toLowerCase() ?? "";
    records.set(id, {
      id,
      kind: "image",
      title: entry.alt || (path.split("/").pop() ?? path),
      summary: "Image evidence pointer with its source markup. Pixel content is not interpreted.",
      text: bound(`![${entry.alt}](${path})`),
      citations: entry.citations.sort(
        (a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0),
      ),
      checksum: checksum(`${entry.alt}\n${path}`),
      tags: ["image", format],
      entities: [
        { kind: "image", value: path },
        ...(entry.alt ? [{ kind: "image" as const, value: entry.alt }] : []),
      ],
      media: { type: "image", path, ...(entry.alt ? { alt: entry.alt } : {}), format },
    });
  }

  return [...records.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
}

/** Extracts deterministic memory records from files already read by the analyzer. */
export function extractMemoryRecords(sources: EvidenceSource[]): MemoryRecord[] {
  return buildRecords(sources);
}

/** Case-insensitive search over extracted evidence, with an optional kind filter. */
export function searchMemory(
  records: MemoryRecord[],
  query: string,
  kind?: MemoryKind,
): MemoryRecord[] {
  const needle = query.trim().toLowerCase();
  return records
    .filter((record) => !kind || record.kind === kind)
    .filter((record) => {
      if (!needle) return true;
      const haystack = [
        record.title,
        record.summary,
        record.text,
        ...record.tags,
        ...record.entities.map((entity) => entity.value),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
    .slice(0, 50);
}
