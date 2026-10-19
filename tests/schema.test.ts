import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Keeps the provisioned database honest in two ways:
//   1. static: supabase/schema.sql must create every table and column the generated
//      Supabase types declare, with row-level security and the right grants;
//   2. live: when Supabase credentials are present, the real project is asked for every
//      table, and the anonymous role must be refused on private data.
// The live half skips itself when no credentials exist, so CI without secrets still runs.

const schema = readFileSync("supabase/schema.sql", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

/** Tables that own private workspace data: service role only. */
const PRIVATE_TABLES = [
  "repository_ingestions",
  "user_ai_keys",
  "nykst_subscriptions",
  "nykst_payment_submissions",
  "production_signals",
  "root_cause_diagnoses",
  "mcp_access_tokens",
  "integration_connections",
];

/** Tables anonymous visitors may only insert into (surveys and feedback). */
const PUBLIC_WRITE_TABLES = ["pre_registration", "pre_registrations", "advantages_feedback"];

function sqlTables(): string[] {
  return [...schema.matchAll(/create table (?:if not exists )?public\.([a-z_][a-z0-9_]*)/gi)].map(
    (match) => match[1]!,
  );
}

function sqlCreateStatement(table: string): string {
  const start = schema.search(
    new RegExp(`create table (?:if not exists )?public\\.${table}\\b`, "i"),
  );
  if (start < 0) return "";
  const end = schema.indexOf("\n);", start);
  return schema.slice(start, end < 0 ? undefined : end);
}

function typedTables(): Map<string, string[]> {
  const tables = [...types.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{$/gm)];
  const result = new Map<string, string[]>();
  tables.forEach((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < tables.length ? tables[index + 1]!.index! : types.length;
    const body = types.slice(start, end);
    const references = /^ {8}References: \{$/m.exec(body);
    const rowBlock = body.slice(0, references ? references.index : body.length);
    const columns = [...rowBlock.matchAll(/^ {10}([a-z_][a-z0-9_]*):/gm)].map(
      (column) => column[1]!,
    );
    result.set(match[1]!, columns);
  });
  return result;
}

const created = sqlTables();
const typed = typedTables();

describe("supabase/schema.sql matches the generated client types", () => {
  test("every typed table is created by the schema", () => {
    const missing = [...typed.keys()].filter((table) => !created.includes(table));
    expect(missing).toEqual([]);
  });

  test("every created table has generated types", () => {
    const untyped = created.filter((table) => !typed.has(table));
    expect(untyped).toEqual([]);
  });

  test("row-level security is enabled on every created table", () => {
    const rls = new Set(
      [...schema.matchAll(/alter table public\.([a-z_][a-z0-9_]*)\s*\n?\s*enable row level security/gi)].map(
        (match) => match[1]!,
      ),
    );
    const unprotected = created.filter((table) => !rls.has(table));
    expect(unprotected).toEqual([]);
  });

  test("private tables revoke the client roles", () => {
    for (const table of PRIVATE_TABLES) {
      expect(schema).toMatch(
        new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"),
      );
    }
  });

  test("survey tables allow inserts but nothing else for the client roles", () => {
    for (const table of PUBLIC_WRITE_TABLES) {
      expect(schema).toMatch(
        new RegExp(`grant insert on public\\.${table} to anon, authenticated`, "i"),
      );
      expect(schema).not.toMatch(new RegExp(`grant select on public\\.${table} to`, "i"));
    }
  });

  test("every typed column is created, either inline or as an added column", () => {
    const missing: string[] = [];
    for (const [table, columns] of typed) {
      const statement = sqlCreateStatement(table);
      for (const column of columns) {
        if (statement.includes(column)) continue;
        if (new RegExp(`add column if not exists ${column}\\b`, "i").test(schema)) continue;
        missing.push(`${table}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/* ------------------------------- live database ------------------------------- */

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const publishableKey =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
const live = Boolean(url && serviceKey);

function rest(path: string, key: string) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

describe("the live project answers for every table", () => {
  test.skipIf(!live)("service role can read all eleven tables", async () => {
    const results = await Promise.all(
      created.map(async (table) => {
        const response = await rest(`${table}?select=id&limit=1`, serviceKey!);
        return { table, status: response.status };
      }),
    );
    expect(results.filter((result) => result.status >= 400)).toEqual([]);
  });

  test.skipIf(!live || !publishableKey)(
    "the anonymous role is refused on private tables",
    async () => {
      const results = await Promise.all(
        PRIVATE_TABLES.map(async (table) => {
          const response = await rest(`${table}?select=id&limit=1`, publishableKey!);
          return { table, status: response.status };
        }),
      );
      // 401/403 permission denied; anything 2xx would mean private data is world-readable.
      expect(results.filter((result) => result.status < 400)).toEqual([]);
    },
  );

  test.skipIf(!live || !publishableKey)(
    "the anonymous role can only write survey rows, never read them",
    async () => {
      const response = await rest("pre_registration?select=id&limit=1", publishableKey!);
      expect(response.status).toBeLessThan(400);
      const rows = (await response.json()) as unknown[];
      // Row-level security returns the empty set, never other people's submissions.
      expect(rows).toEqual([]);
    },
  );
});
