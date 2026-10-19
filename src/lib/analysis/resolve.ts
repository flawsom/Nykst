import type { ImportKind, WorkspacePackage } from "./types";

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const ASSET_PATTERN =
  /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|json|md|mdx|txt|html|wasm|glsl|vue|svelte|astro)(\?.*)?$/i;

export interface PathAlias {
  /** tsconfig pattern such as "@/*" or "~lib" */
  pattern: string;
  /** repository-relative targets such as "src/*" */
  targets: string[];
}

export interface AliasScope {
  /** directory the aliases apply to ("" for repository root) */
  dir: string;
  aliases: PathAlias[];
}

export interface PackageManifest {
  dir: string;
  name?: string;
  main?: string;
  module?: string;
  types?: string;
  source?: string;
  exports?: unknown;
}

export interface ResolvedImport {
  kind: ImportKind;
  target?: string;
}

export function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function joinPath(...parts: string[]) {
  const out: string[] = [];
  for (const segment of parts.join("/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

export function packageNameOf(specifier: string) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function isWithin(path: string, dir: string) {
  return dir === "" || path === dir || path.startsWith(`${dir}/`);
}

export class ImportResolver {
  private readonly packagesByName = new Map<string, PackageManifest>();
  private readonly scopes: AliasScope[];

  constructor(
    private readonly paths: Set<string>,
    manifests: PackageManifest[],
    scopes: AliasScope[],
  ) {
    for (const manifest of manifests)
      if (manifest.name) this.packagesByName.set(manifest.name, manifest);
    // Most specific directory first so nested packages override the root config.
    this.scopes = [...scopes].sort((a, b) => b.dir.length - a.dir.length);
  }

  get workspacePackages(): WorkspacePackage[] {
    return [...this.packagesByName.values()].map((manifest) => ({
      name: manifest.name!,
      dir: manifest.dir,
    }));
  }

  /** Resolves a path without extension to a concrete file, following TS/Node conventions. */
  private probe(base: string): string | null {
    if (this.paths.has(base) && !base.endsWith("/")) {
      if (SOURCE_EXTENSIONS.some((ext) => base.endsWith(ext)) || ASSET_PATTERN.test(base))
        return base;
    }
    // ESM-style "./x.js" that actually points at "./x.ts"
    const jsMatch = /\.(m|c)?jsx?$/.exec(base);
    if (jsMatch) {
      const stem = base.slice(0, -jsMatch[0].length);
      for (const ext of [".ts", ".tsx", ".mts", ".cts"])
        if (this.paths.has(stem + ext)) return stem + ext;
    }
    for (const ext of SOURCE_EXTENSIONS) if (this.paths.has(base + ext)) return base + ext;
    if (this.paths.has(`${base}.d.ts`)) return `${base}.d.ts`;
    for (const ext of SOURCE_EXTENSIONS)
      if (this.paths.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    if (this.paths.has(`${base}/index.d.ts`)) return `${base}/index.d.ts`;
    return null;
  }

  private viaAliases(from: string, specifier: string): string | null {
    for (const scope of this.scopes) {
      if (!isWithin(from, scope.dir)) continue;
      for (const alias of scope.aliases) {
        const star = alias.pattern.indexOf("*");
        let rest: string | null = null;
        if (star === -1) {
          if (specifier === alias.pattern) rest = "";
        } else {
          const prefix = alias.pattern.slice(0, star);
          const suffix = alias.pattern.slice(star + 1);
          if (
            specifier.startsWith(prefix) &&
            specifier.endsWith(suffix) &&
            specifier.length >= prefix.length + suffix.length
          )
            rest = specifier.slice(prefix.length, specifier.length - suffix.length);
        }
        if (rest === null) continue;
        for (const target of alias.targets) {
          const hit = this.probe(joinPath(target.replace("*", rest)));
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  private viaWorkspace(specifier: string): string | null {
    const name = packageNameOf(specifier);
    const manifest = this.packagesByName.get(name);
    if (!manifest) return null;
    const subpath = specifier.slice(name.length).replace(/^\//, "");
    if (subpath) {
      return (
        this.probe(joinPath(manifest.dir, subpath)) ??
        this.probe(joinPath(manifest.dir, "src", subpath))
      );
    }
    const exportsField = manifest.exports;
    const exportTargets: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === "string") exportTargets.push(value);
      else if (value && typeof value === "object")
        for (const [key, nested] of Object.entries(value as Record<string, unknown>))
          if (key === "." || !key.startsWith(".")) collect(nested);
    };
    collect(exportsField);
    for (const candidate of [
      manifest.source,
      ...exportTargets,
      manifest.module,
      manifest.main,
      manifest.types,
      "src/index",
      "index",
    ]) {
      if (!candidate) continue;
      const hit = this.probe(joinPath(manifest.dir, candidate));
      if (hit) return hit;
    }
    return null;
  }

  resolve(from: string, specifier: string): ResolvedImport {
    const clean = specifier.split("?")[0] ?? specifier;
    if (clean.startsWith("node:") || NODE_BUILTINS.has(clean))
      return { kind: "builtin", target: clean.replace(/^node:/, "") };
    if (clean.startsWith(".") || clean.startsWith("/")) {
      const base = clean.startsWith("/") ? joinPath(clean) : joinPath(dirname(from), clean);
      const hit = this.probe(base);
      if (hit) return { kind: ASSET_PATTERN.test(hit) ? "asset" : "internal", target: hit };
      if (ASSET_PATTERN.test(clean)) return { kind: "asset", target: base };
      return { kind: "unresolved", target: base };
    }
    const aliased = this.viaAliases(from, clean);
    if (aliased)
      return { kind: ASSET_PATTERN.test(aliased) ? "asset" : "internal", target: aliased };
    const workspace = this.viaWorkspace(clean);
    if (workspace) return { kind: "internal", target: workspace };
    if (/^(@\/|~\/|#)/.test(clean)) return { kind: "unresolved" };
    if (/^(virtual:|\$|astro:|bun:)/.test(clean)) return { kind: "builtin", target: clean };
    return { kind: "external", target: packageNameOf(clean) };
  }
}

const POLYGLOT_EXTENSIONS = [".py", ".go", ".rs"];

export function isSourcePath(path: string) {
  const supported =
    SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext)) ||
    POLYGLOT_EXTENSIONS.some((ext) => path.endsWith(ext));
  return (
    supported &&
    !path.endsWith(".d.ts") &&
    !/\.min\.[cm]?js$/.test(path) &&
    !/(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.output|\.vercel|\.turbo|coverage|vendor|\.git)\//.test(
      path,
    )
  );
}
