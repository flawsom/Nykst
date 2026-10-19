import type { AnalyzedFile, ColumnRef, DataResource, SqlColumn, SqlColumnEvent } from "./types";

/**
 * Deterministic, dependency-free SQL DDL reader.
 *
 * It understands the subset Nykst can prove: CREATE TABLE columns, ALTER TABLE
 * ADD/DROP/RENAME/ALTER COLUMN. It never guesses a migration order beyond the
 * repository path and line, and it reports only columns that a literal client
 * call actually names.
 */

export interface SqlResourceDefinition {
  kind: "table" | "rpc";
  name: string;
  path: string;
  line: number;
}

export interface ParsedSql {
  resources: SqlResourceDefinition[];
  events: SqlColumnEvent[];
}

const CONSTRAINT_START = /^(constraint|primary|unique|foreign|check|exclude|like|period)\b/i;
const TYPE_STOP =
  /\b(not\s+null|null|default|primary\s+key|references|unique|check|generated|collate|constraint|identity)\b/i;

function lineAt(text: string, index: number) {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1)
    if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function stripComments(text: string) {
  return text
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

/** Finds the `)` that closes the `(` at `open`, ignoring quoted text. */
function closingParen(text: string, open: number) {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Splits a column/action list on commas that are not inside types or strings. */
function splitTopLevel(text: string) {
  const parts: { text: string; offset: number }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push({ text: text.slice(start, index), offset: start });
      start = index + 1;
    }
  }
  parts.push({ text: text.slice(start), offset: start });
  return parts;
}

function identifier(raw: string) {
  const last = raw.split(".").pop() ?? raw;
  return last.replace(/^"|"$/g, "").toLowerCase();
}

function columnIdentifier(raw: string) {
  return raw.replace(/^"|"$/g, "").toLowerCase();
}

function typeOf(rest: string) {
  const stop = rest.search(TYPE_STOP);
  const type = (stop === -1 ? rest : rest.slice(0, stop)).trim().replace(/\s+/g, " ");
  return type || "unknown";
}

function nullableOf(rest: string) {
  return !/\bnot\s+null\b/i.test(rest) && !/\bprimary\s+key\b/i.test(rest);
}

function addColumnEvent(
  events: SqlColumnEvent[],
  path: string,
  sql: string,
  table: string,
  segment: string,
  index: number,
  op: "create" | "add",
) {
  if (CONSTRAINT_START.test(segment.trim())) return;
  const match = /^\s*(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+([\s\S]+)$/i.exec(segment);
  if (!match) return;
  const column = columnIdentifier(match[1] ?? match[2]!);
  const rest = match[3]!;
  events.push({
    table,
    column,
    op,
    path,
    line: lineAt(sql, index),
    type: typeOf(rest),
    nullable: nullableOf(rest),
  });
}

/** Parses DDL from one SQL file. Comments are ignored, never interpreted as DDL. */
export function parseSqlSchema(path: string, sql: string): ParsedSql {
  const clean = stripComments(sql);
  const resources: SqlResourceDefinition[] = [];
  const events: SqlColumnEvent[] = [];

  const createTable =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[a-z_][\w$]*"?\.)?"?[a-z_][\w$]*"?)\s*\(/gi;
  for (const match of clean.matchAll(createTable)) {
    const table = identifier(match[1]!);
    const open = (match.index ?? 0) + match[0].lastIndexOf("(");
    const close = closingParen(clean, open);
    if (close === -1) continue;
    resources.push({ kind: "table", name: table, path, line: lineAt(clean, match.index ?? 0) });
    const body = clean.slice(open + 1, close);
    for (const part of splitTopLevel(body))
      addColumnEvent(events, path, clean, table, part.text, open + 1 + part.offset, "create");
  }

  const createFunction =
    /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  for (const match of clean.matchAll(createFunction))
    resources.push({
      kind: "rpc",
      name: match[1]!.toLowerCase(),
      path,
      line: lineAt(clean, match.index ?? 0),
    });

  const alterTable =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:"?[a-z_][\w$]*"?\.)?"?[a-z_][\w$]*"?)\s+([\s\S]*?)(?:;|$)/gi;
  for (const match of clean.matchAll(alterTable)) {
    const table = identifier(match[1]!);
    const body = match[2]!;
    const bodyStart = (match.index ?? 0) + match[0].indexOf(body);
    for (const action of splitTopLevel(body)) {
      const text = action.text.trim();
      const at = bodyStart + action.offset;
      if (/^(constraint|primary|unique|foreign|check|exclude)\b/i.test(text)) continue;
      const add =
        /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+([\s\S]+)$/i.exec(
          text,
        );
      if (add) {
        events.push({
          table,
          column: columnIdentifier(add[1] ?? add[2]!),
          op: "add",
          path,
          line: lineAt(clean, at),
          type: typeOf(add[3]!),
          nullable: nullableOf(add[3]!),
        });
        continue;
      }
      const drop =
        /^drop\s+(?:column\s+)?(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))(?:\s|$)/i.exec(
          text,
        );
      if (drop) {
        events.push({
          table,
          column: columnIdentifier(drop[1] ?? drop[2]!),
          op: "drop",
          path,
          line: lineAt(clean, at),
        });
        continue;
      }
      const rename =
        /^rename\s+(?:column\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+to\s+(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/i.exec(
          text,
        );
      if (rename) {
        const from = columnIdentifier(rename[1] ?? rename[2]!);
        events.push({
          table,
          column: columnIdentifier(rename[3] ?? rename[4]!),
          from,
          op: "rename",
          path,
          line: lineAt(clean, at),
        });
        continue;
      }
      const alter =
        /^alter\s+(?:column\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_$]*))\s+(set\s+not\s+null|drop\s+not\s+null|type\s+([\s\S]+))$/i.exec(
          text,
        );
      if (alter) {
        const column = columnIdentifier(alter[1] ?? alter[2]!);
        const actionText = alter[3]!;
        events.push({
          table,
          column,
          op: "alter",
          path,
          line: lineAt(clean, at),
          ...(/^type\s+/i.test(actionText)
            ? { type: typeOf(actionText.replace(/^type\s+/i, "")) }
            : {}),
          ...(/not\s+null/i.test(actionText) ? { nullable: !/^drop/i.test(actionText) } : {}),
        });
      }
    }
  }

  return { resources, events };
}

/** Backwards-compatible table/RPC resource list used by older call sites. */
export function sqlResources(path: string, sql: string) {
  return parseSqlSchema(path, sql).resources;
}

function eventOrder(a: SqlColumnEvent, b: SqlColumnEvent) {
  return a.path.localeCompare(b.path) || a.line - b.line;
}

/** Replays ordered DDL into the columns that exist after the last migration. */
export function replaySqlColumns(events: SqlColumnEvent[]): SqlColumn[] {
  const columns = new Map<string, SqlColumn>();
  for (const event of [...events].sort(eventOrder)) {
    if (event.op === "drop") {
      columns.delete(event.column);
      continue;
    }
    if (event.op === "rename") {
      const previous = event.from ? columns.get(event.from) : undefined;
      if (event.from) columns.delete(event.from);
      columns.set(event.column, {
        name: event.column,
        type: priorType(event, previous),
        nullable: event.nullable ?? previous?.nullable ?? true,
      });
      continue;
    }
    if (event.op === "alter") {
      const previous = columns.get(event.column);
      if (!previous && !event.type) continue;
      columns.set(event.column, {
        name: event.column,
        type: event.type ?? priorType(event, previous),
        nullable: event.nullable ?? previous?.nullable ?? true,
      });
      continue;
    }
    columns.set(event.column, {
      name: event.column,
      type: priorType(event, columns.get(event.column)),
      nullable: event.nullable ?? true,
    });
  }
  return [...columns.values()];
}

function priorType(event: SqlColumnEvent, previous: SqlColumn | undefined) {
  return event.type && event.type !== "unknown" ? event.type : (previous?.type ?? "unknown");
}

/**
 * Attaches final columns and column-level drift to table resources. A reference
 * is only drift when the DDL exists and does not declare the named column.
 */
export function hydrateColumnContracts(resources: DataResource[], files: AnalyzedFile[]) {
  const refsByTable = new Map<string, { path: string; ref: ColumnRef }[]>();
  for (const file of files)
    for (const ref of file.columnRefs ?? []) {
      const table = ref.table.toLowerCase();
      const list = refsByTable.get(table) ?? [];
      list.push({ path: file.path, ref });
      refsByTable.set(table, list);
    }

  for (const resource of resources) {
    if (resource.kind !== "table" || !resource.sqlEvents?.length) continue;
    const columns = replaySqlColumns(resource.sqlEvents);
    if (columns.length) resource.columns = columns;
    const known = new Map(columns.map((column) => [column.name.toLowerCase(), column]));
    if (!known.size) continue;
    const dropped = new Set(
      resource.sqlEvents.filter((event) => event.op === "drop").map((event) => event.column),
    );
    const findings = new Map<string, NonNullable<DataResource["columnDrift"]>[number]>();
    for (const { path, ref } of refsByTable.get(resource.name.toLowerCase()) ?? []) {
      const column = ref.column.toLowerCase();
      if (known.has(column)) continue;
      const kind = dropped.has(column) ? "dropped-column" : "unknown-column";
      const key = `${kind}:${column}`;
      const finding = findings.get(key) ?? {
        kind,
        table: resource.name,
        column,
        message:
          kind === "dropped-column"
            ? `Code still references ${resource.name}.${column}, but a migration dropped it.`
            : `Code references ${resource.name}.${column}, which no analyzed migration declares.`,
        references: [],
      };
      finding.references.push({ path, line: ref.line, operation: ref.operation });
      findings.set(key, finding);
    }
    resource.columnDrift = [...findings.values()]
      .map((finding) => ({
        ...finding,
        references: finding.references
          .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
          .slice(0, 50),
      }))
      .sort((a, b) => a.column.localeCompare(b.column) || a.kind.localeCompare(b.kind));
    if (!resource.columnDrift.length) delete resource.columnDrift;
  }
}

/** All drift findings across an analysis, for MCP results and agent briefings. */
export function columnDriftFindings(analysis: {
  resources: DataResource[];
}): NonNullable<DataResource["columnDrift"]> {
  return analysis.resources.flatMap((resource) => resource.columnDrift ?? []);
}
