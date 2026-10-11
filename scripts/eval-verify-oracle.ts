/**
 * Does the change verifier agree with the TypeScript compiler?
 *
 *   bun scripts/eval-verify-oracle.ts <repo-dir> [mutations=20]
 *
 * It mutates real code in two ways and asks both tools what breaks:
 *   rename   an exported function is renamed, so every file importing it should break
 *   require  a required parameter is added to an exported function, so every caller breaks
 * The compiler is the referee: its "has no exported member" (TS2305/TS2724) and "expected N
 * arguments" (TS2554/TS2555) errors, minus the errors the project already had, are the truth.
 * Missing node_modules produce other errors, which are ignored by looking only at those codes.
 */
import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { verifyChange } from "../src/lib/analysis/verify.server";
import { readRepo } from "./lib/local-repo";

const root = resolve(process.argv[2] ?? ".");
const wanted = Number(process.argv[3] ?? 20);
const relative = (file: string) => file.replace(`${root}/`, "");

const configPath = ["tsconfig.json", "tsconfig.app.json"]
  .map((name) => join(root, name))
  .find(existsSync);
if (!configPath) throw new Error("No tsconfig.json at the repository root; this oracle needs one.");
const parsed = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  root,
);
const options: ts.CompilerOptions = {
  ...parsed.options,
  noEmit: true,
  skipLibCheck: true,
  incremental: false,
  composite: false,
};

function compile(overrides: Map<string, string>) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  host.readFile = (file) => overrides.get(file) ?? read(file);
  const getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate) => {
    const text = overrides.get(file);
    return text !== undefined
      ? ts.createSourceFile(file, text, languageVersion, true)
      : getSource(file, languageVersion, onError, shouldCreate);
  };
  const program = ts.createProgram(parsed.fileNames, options, host);
  const out = new Set<string>();
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (!d.file || ![2305, 2724, 2614, 2554, 2555].includes(d.code)) continue;
    const line = d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1;
    out.add(`${relative(d.file.fileName)}:${line}:${d.code}`);
  }
  return out;
}

const { paths, contents } = readRepo(root);
const analysis = await analyzeRepository({ ref: "HEAD", paths, contents });
const inProgram = new Set(parsed.fileNames.map(relative));
const baseline = compile(new Map());
console.log(
  `\n${root}: ${analysis.stats.analyzedFiles} files, tsc baseline has ${baseline.size} relevant errors`,
);

type Candidate = { path: string; name: string; kind: "rename" | "require"; position: number };
const candidates: Candidate[] = [];
const importersOf = new Map<string, Set<string>>();
for (const file of analysis.files)
  for (const ref of file.imports)
    if (ref.kind === "internal" && ref.target)
      (importersOf.get(ref.target) ?? importersOf.set(ref.target, new Set()).get(ref.target)!).add(
        file.path,
      );

for (const file of analysis.files) {
  if (file.role === "test" || !importersOf.get(file.path)?.size) continue;
  const text = contents.get(file.path);
  if (!text) continue;
  const source = ts.createSourceFile(file.path, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const name = statement.name.text;
    const called = analysis.files.some((other) =>
      other.calls.some((call) => call.target === file.path && call.name === name),
    );
    const imported = analysis.files.some((other) =>
      other.imports.some((ref) => ref.target === file.path && ref.names.includes(name)),
    );
    if (imported)
      candidates.push({
        path: file.path,
        name,
        kind: "rename",
        position: statement.name.getStart(source),
      });
    if (called && !statement.parameters.some((parameter) => parameter.dotDotDotToken)) {
      const closeParen = text.indexOf(
        ")",
        statement.parameters.end > 0 ? statement.parameters.end - 1 : statement.name.end,
      );
      if (closeParen > 0)
        candidates.push({
          path: file.path,
          name,
          kind: "require",
          // the end of the last parameter itself: the list's own end includes a trailing comma
          position: statement.parameters.length
            ? statement.parameters[statement.parameters.length - 1]!.end
            : statement.name.end + 1,
        });
    }
  }
}
// spread the sample across both kinds and many files
const picked: Candidate[] = [];
for (const kind of ["rename", "require"] as const) {
  const pool = candidates
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.path.localeCompare(b.path));
  const step = Math.max(1, Math.floor(pool.length / Math.ceil(wanted / 2)));
  for (
    let i = 0;
    i < pool.length && picked.filter((c) => c.kind === kind).length < Math.ceil(wanted / 2);
    i += step
  )
    picked.push(pool[i]!);
}

let tp = 0;
let fp = 0;
let fn = 0;
const misses: string[] = [];
for (const candidate of picked) {
  const original = contents.get(candidate.path)!;
  const mutated =
    candidate.kind === "rename"
      ? original.slice(0, candidate.position) +
        `${candidate.name}Renamed` +
        original.slice(candidate.position + candidate.name.length)
      : original.slice(0, candidate.position) +
        (original[candidate.position - 1] === "(" ? "__extra: string" : ", __extra: string") +
        original.slice(candidate.position);
  const after = compile(new Map([[join(root, candidate.path), mutated]]));
  const truth = new Set(
    [...after]
      .filter((entry) => !baseline.has(entry))
      .filter((entry) => !entry.startsWith(`${candidate.path}:`))
      .map((entry) => entry.split(":").slice(0, 2).join(":")),
  );
  const report = await verifyChange(analysis, [{ path: candidate.path, content: mutated }]);
  const flagged = new Set(
    report.issues
      .filter(
        (issue) =>
          issue.severity === "error" &&
          (issue.check === "removed-export" || issue.check === "signature") &&
          issue.line &&
          issue.path !== candidate.path &&
          inProgram.has(issue.path),
      )
      .map((issue) => `${issue.path}:${issue.line}`),
  );
  const hit = [...truth].filter((entry) => flagged.has(entry)).length;
  tp += hit;
  fn += truth.size - hit;
  fp += [...flagged].filter((entry) => !truth.has(entry)).length;
  if (truth.size !== hit || flagged.size !== hit)
    misses.push(
      `${candidate.kind} ${candidate.path} ${candidate.name}: tsc ${truth.size}, nykst ${flagged.size}, agree ${hit}${[
        ...truth,
      ]
        .filter((e) => !flagged.has(e))
        .slice(0, 2)
        .map((e) => ` missed ${e}`)
        .join("")}${[...flagged]
        .filter((e) => !truth.has(e))
        .slice(0, 2)
        .map((e) => ` extra ${e}`)
        .join("")}`,
    );
}
console.log(
  `${picked.length} mutations (${picked.filter((c) => c.kind === "rename").length} renames, ${picked.filter((c) => c.kind === "require").length} added required parameters)`,
);
console.log(
  `places tsc says break: ${tp + fn} | Nykst found: ${tp} (${tp + fn ? ((100 * tp) / (tp + fn)).toFixed(1) : "n/a"}%) | Nykst flagged that tsc did not: ${fp}`,
);
for (const line of misses.slice(0, 8)) console.log(`  ${line}`);
