/**
 * Local incremental graph patching.
 *
 *   bun scripts/watch.ts [directory]
 *
 * Reads the checkout once, then watches source, SQL, contract and docs files.
 * Every change reuses the stored graph and reparses only the changed paths; the
 * resulting snapshot is written to .nykst/analysis.json (disable with --no-write).
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  analyzeRepository,
  MAX_SOURCE_BYTES,
  wantsContent,
} from "../src/lib/analysis/engine.server";
import { patchRepositoryAnalysis, type ChangedFile } from "../src/lib/analysis/patch.server";
import { isSourcePath } from "../src/lib/analysis/resolve";

const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const root = resolve(rootArg ?? process.cwd());
const output = join(root, ".nykst", "analysis.json");
const shouldWrite = !flags.has("--no-write");
const IGNORED =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.output|\.vercel|\.turbo|coverage|vendor|\.nykst)(\/|$)/;

function relevant(path: string) {
  return (
    isSourcePath(path) ||
    wantsContent(path, 0) ||
    /\.sql$/i.test(path) ||
    /(^|\/)schema\.prisma$/i.test(path)
  );
}

function readIfPossible(path: string, size: number) {
  if (!relevant(path)) return null;
  if (size > Math.max(MAX_SOURCE_BYTES, 1_000_000)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function walk(dir: string, paths: string[], contents: Map<string, string>) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (IGNORED.test(full)) continue;
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, paths, contents);
    else {
      const path = relative(root, full).replace(/\\/g, "/");
      paths.push(path);
      const text = readIfPossible(full, stat.size);
      if (text !== null) contents.set(path, text);
    }
  }
}

const started = Date.now();
const paths: string[] = [];
const contents = new Map<string, string>();
walk(root, paths, contents);
let analysis = await analyzeRepository({ ref: "local-watch", paths, contents });
console.log(
  `Nykst watch: ${analysis.stats.analyzedFiles} files, ${analysis.stats.internalEdges} edges, ${analysis.resources.length} resources in ${Date.now() - started} ms`,
);

let wroteOutput = false;
function persist() {
  if (!shouldWrite) return;
  try {
    mkdirSync(join(root, ".nykst"), { recursive: true });
    writeFileSync(output, `${JSON.stringify(analysis)}\n`);
    wroteOutput = true;
  } catch (error) {
    console.error(`Could not write ${output}:`, error instanceof Error ? error.message : error);
  }
}
persist();
if (wroteOutput) console.log(`Snapshot: ${output}`);
console.log("Watching for local changes. Press Ctrl+C to stop.");

const watchers = new Map<string, ReturnType<typeof watch>>();
function watchDirectory(dir: string) {
  if (watchers.has(dir)) return;
  let watcher;
  try {
    watcher = watch(dir, { persistent: true }, (_event, filename) => {
      if (!filename) return;
      const full = join(dir, filename.toString());
      try {
        if (statSync(full).isDirectory()) {
          watchDirectory(full);
          schedule(full);
          return;
        }
      } catch {
        // The path was deleted; schedule it so the graph can prune it.
      }
      schedule(full);
    });
  } catch (error) {
    console.error(`Cannot watch ${dir}:`, error instanceof Error ? error.message : error);
    return;
  }
  watcher.on("error", (error) => console.error(`Watch error in ${dir}:`, error.message));
  watchers.set(dir, watcher);
  for (const entry of readdirSync(dir)) {
    if (IGNORED.test(join(dir, entry))) continue;
    try {
      if (lstatSync(join(dir, entry)).isDirectory()) watchDirectory(join(dir, entry));
    } catch {
      // A path can disappear while we walk it.
    }
  }
}

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let queue = Promise.resolve();

function schedule(full: string) {
  const path = relative(root, full).replace(/\\/g, "/");
  if (!path || IGNORED.test(full)) return;
  pending.add(path);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 220);
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const changed = [...pending];
  pending.clear();
  if (!changed.length) return;
  queue = queue.then(async () => {
    const changes: ChangedFile[] = changed.map((path) => {
      const full = join(root, path);
      if (!existsSync(full)) return { path, content: null };
      try {
        return { path, content: readFileSync(full, "utf8") };
      } catch {
        return { path, content: null };
      }
    });
    const relevantChanges = changes.filter(
      (change) => change.content === null || relevant(change.path),
    );
    if (!relevantChanges.length) return;
    const startedPatch = Date.now();
    try {
      analysis = await patchRepositoryAnalysis(analysis, relevantChanges);
      persist();
      console.log(
        `patched ${relevantChanges.length} path(s) in ${Date.now() - startedPatch} ms: ${analysis.stats.analyzedFiles} files, ${analysis.stats.unresolvedImports} unresolved, ${analysis.cycles.length} cycles`,
      );
    } catch (error) {
      console.error("Patch failed:", error instanceof Error ? error.message : error);
    }
  });
}

watchDirectory(root);
process.on("SIGINT", () => {
  for (const watcher of watchers.values()) watcher.close();
  console.log("\nNykst watch stopped.");
  process.exit(0);
});
