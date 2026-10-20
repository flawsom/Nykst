import type { GraphNode, NodeKind } from "@/lib/graph-data";
import { historyFor, indexAnalysis, levelFor, type AnalysisIndex } from "./impact";
import type { AnalyzedFile, RepoAnalysis, RepoHistory } from "./types";

type DirTrie = { name: string; path: string; dirs: Map<string, DirTrie>; files: string[] };

const ROLE_LABEL: Record<AnalyzedFile["role"], [string, string]> = {
  route: ["page route", "page routes"],
  api: ["API endpoint", "API endpoints"],
  component: ["component", "components"],
  hook: ["hook", "hooks"],
  server: ["server module", "server modules"],
  lib: ["library module", "library modules"],
  test: ["test", "tests"],
  config: ["config file", "config files"],
  script: ["script", "scripts"],
  types: ["type module", "type modules"],
  generated: ["generated file", "generated files"],
  other: ["file", "files"],
};

function plural(count: number, [one, many]: [string, string]) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The six-level chain: organization (root) -> domain -> capability -> service ->
 * module -> file. The level is derived from the real directory depth of the
 * ingested tree, so `app/`, `cmd/`, `packages/*` and `src/` all read the same
 * way without assuming a particular repository shape.
 */
function kindAt(depth: number): NodeKind {
  if (depth <= 1) return "domain";
  if (depth === 2) return "capability";
  if (depth === 3) return "service";
  return "module";
}

/**
 * Reverse reachability for a set of files using integer ids; cheap enough to run for
 * every directory of a few-thousand-file repository in the browser.
 */
class Reach {
  private readonly ids = new Map<string, number>();
  private readonly paths: string[] = [];
  private readonly reverse: number[][] = [];
  private readonly runtimeReverse: number[][] = [];
  private readonly entry: boolean[] = [];
  private readonly counted: boolean[] = [];
  private readonly mark: Int32Array;
  private stamp = 0;

  constructor(index: AnalysisIndex) {
    for (const file of index.analysis.files) {
      this.ids.set(file.path, this.paths.length);
      this.paths.push(file.path);
      this.reverse.push([]);
      this.runtimeReverse.push([]);
      this.entry.push(file.role === "route" || file.role === "api");
      this.counted.push(file.role !== "test");
    }
    for (const [target, edges] of index.dependents) {
      const to = this.ids.get(target);
      if (to === undefined) continue;
      for (const edge of edges) {
        const from = this.ids.get(edge.path);
        if (from === undefined) continue;
        this.reverse[to]!.push(from);
        if (!edge.typeOnly) this.runtimeReverse[to]!.push(from);
      }
    }
    this.mark = new Int32Array(this.paths.length);
  }

  /** Runtime dependents outside the seed set. */
  of(seeds: string[]) {
    this.stamp += 1;
    const stamp = this.stamp;
    const queue: number[] = [];
    const seedIds = new Set<number>();
    for (const path of seeds) {
      const id = this.ids.get(path);
      if (id === undefined) continue;
      seedIds.add(id);
      this.mark[id] = stamp;
      queue.push(id);
    }
    let files = 0;
    let entrypoints = 0;
    const areas = new Set<string>();
    const dirs = new Set<string>();
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of this.runtimeReverse[queue[head]!]!) {
        if (this.mark[next] === stamp) continue;
        this.mark[next] = stamp;
        queue.push(next);
        if (!this.counted[next]) continue;
        files += 1;
        if (this.entry[next]) entrypoints += 1;
        const path = this.paths[next]!;
        const parts = path.split("/");
        areas.add(parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0]!);
        dirs.add(parts.slice(0, -1).join("/"));
      }
    }
    return { files, entrypoints, areas: areas.size, dirs: dirs.size };
  }
}

export function buildAnalysisGraph(
  repoName: string,
  analysis: RepoAnalysis,
  history?: RepoHistory,
): GraphNode {
  const index = indexAnalysis(analysis);
  const reach = new Reach(index);
  const total = analysis.files.length;
  const rootId = `repo:${repoName}|`;
  const cycleFiles = new Set(analysis.cycles.flat());

  const blastFor = (paths: string[]) => {
    const result = reach.of(paths);
    return {
      services: result.areas,
      modules: result.dirs,
      files: result.files,
      teams: 0,
      level: levelFor(result.files, result.entrypoints, total),
    };
  };

  const owners = (paths: string[]) =>
    history
      ? historyFor(history, paths)
          .authors.slice(0, 3)
          .map((author) => `@${author.name}`)
      : [];

  const outsideEdges = (paths: string[]) => {
    const inside = new Set(paths);
    const dependencies = new Set<string>();
    const dependents = new Set<string>();
    for (const path of paths) {
      for (const edge of index.dependencies.get(path) ?? [])
        if (!inside.has(edge.path)) dependencies.add(edge.path);
      for (const edge of index.dependents.get(path) ?? [])
        if (!inside.has(edge.path)) dependents.add(edge.path);
    }
    return { dependencies: [...dependencies].sort(), dependents: [...dependents].sort() };
  };

  const describeFiles = (paths: string[]) => {
    const roles = new Map<AnalyzedFile["role"], number>();
    const services = new Set<string>();
    let loc = 0;
    for (const path of paths) {
      const file = index.files.get(path);
      if (!file) continue;
      roles.set(file.role, (roles.get(file.role) ?? 0) + 1);
      file.services.forEach((id) => services.add(index.services.get(id)?.name ?? id));
      loc += file.loc;
    }
    const roleText = [...roles.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([role, count]) => plural(count, ROLE_LABEL[role]))
      .join(", ");
    return { loc, roleText, services: [...services] };
  };

  const fileNode = (parentId: string, path: string): GraphNode => {
    const file = index.files.get(path)!;
    const edges = outsideEdges([path]);
    const external = [
      ...new Set(file.imports.filter((i) => i.kind === "external").map((i) => i.target!)),
    ];
    const fileHistory = history ? historyFor(history, [path]) : null;
    const exportsText = file.exports.length
      ? `Exports ${file.exports.slice(0, 4).join(", ")}${file.exports.length > 4 ? ` +${file.exports.length - 4}` : ""}.`
      : "No exports.";
    return {
      id: `${parentId}f:${path}|`,
      kind: "file",
      label: path.split("/").pop() ?? path,
      summary: `${ROLE_LABEL[file.role][0][0]!.toUpperCase()}${ROLE_LABEL[file.role][0].slice(1)} · ${exportsText} Imported by ${edges.dependents.length} file${edges.dependents.length === 1 ? "" : "s"}${file.services.length ? ` · talks to ${file.services.map((id) => index.services.get(id)?.name ?? id).join(", ")}` : ""}.`,
      metrics: [
        { label: "LOC", value: String(file.loc) },
        { label: "Imports", value: String(edges.dependencies.length) },
        { label: "Imported by", value: String(edges.dependents.length) },
        { label: "Packages", value: String(external.length) },
      ],
      owners: owners([path]),
      dependencies: edges.dependencies,
      dependents: edges.dependents,
      blast: blastFor([path]),
      ...(cycleFiles.has(path) ? { cycle: true } : {}),
      repo: repoName,
      language: file.language === "ts" || file.language === "tsx" ? "TypeScript" : "JavaScript",
      detail: {
        path,
        language: file.language.toUpperCase(),
        loc: file.loc,
        classes: file.classes,
        functions: file.functions,
        tests: (index.dependents.get(path) ?? [])
          .map((edge) => edge.path)
          .filter((dependent) => index.files.get(dependent)?.role === "test"),
        history: (fileHistory?.commits ?? []).slice(0, 10).map((commit) => ({
          when: commit.date.slice(0, 10),
          who: commit.author,
          what: commit.message,
        })),
      },
      expandable: false,
      analysisRef: { type: "file", key: path, paths: [path] },
    };
  };

  const groupNode = (
    id: string,
    kind: NodeKind,
    label: string,
    paths: string[],
    children: GraphNode[],
    summary: string,
    type: NonNullable<GraphNode["analysisRef"]>["type"],
    key: string,
  ): GraphNode => {
    const edges = outsideEdges(paths);
    const described = describeFiles(paths);
    return {
      id,
      kind,
      label,
      summary,
      metrics: [
        { label: "Files", value: String(paths.length) },
        { label: "LOC", value: described.loc.toLocaleString("en-US") },
        { label: "Used from outside", value: String(edges.dependents.length) },
        { label: "Uses outside", value: String(edges.dependencies.length) },
      ],
      owners: owners(paths),
      dependencies: edges.dependencies.slice(0, 200),
      dependents: edges.dependents.slice(0, 200),
      blast: blastFor(paths),
      ...(paths.some((path) => cycleFiles.has(path)) ? { cycle: true } : {}),
      repo: repoName,
      language: "TypeScript",
      children,
      expandable: children.length > 0,
      analysisRef: { type, key, paths },
    };
  };

  const importance = (node: GraphNode) =>
    node.dependents.length * 3 + (node.analysisRef?.paths.length ?? 0);

  /* ------------------------------ code tree ------------------------------ */
  const trie: DirTrie = { name: "", path: "", dirs: new Map(), files: [] };
  for (const file of analysis.files) {
    const parts = file.path.split("/");
    let cursor = trie;
    for (const part of parts.slice(0, -1)) {
      const path = cursor.path ? `${cursor.path}/${part}` : part;
      let next = cursor.dirs.get(part);
      if (!next) {
        next = { name: part, path, dirs: new Map(), files: [] };
        cursor.dirs.set(part, next);
      }
      cursor = next;
    }
    cursor.files.push(file.path);
  }
  const allFiles = (dir: DirTrie): string[] => [
    ...dir.files,
    ...[...dir.dirs.values()].flatMap(allFiles),
  ];
  const collapse = (dir: DirTrie): DirTrie => {
    let current = dir;
    let label = dir.name;
    while (current.files.length === 0 && current.dirs.size === 1) {
      current = [...current.dirs.values()][0]!;
      label = `${label}/${current.name}`;
    }
    return { ...current, name: label };
  };

  const dirNode = (
    parentId: string,
    dir: DirTrie,
    depth: number,
    labelOverride?: string,
  ): GraphNode => {
    const id = `${parentId}d:${dir.path}|`;
    const children = [
      ...[...dir.dirs.values()].map((child) => dirNode(id, collapse(child), depth + 1)),
      ...dir.files.map((path) => fileNode(id, path)),
    ].sort((a, b) => importance(b) - importance(a) || a.label.localeCompare(b.label));
    const paths = allFiles(dir);
    const described = describeFiles(paths);
    const summary = `${plural(paths.length, ["source file", "source files"])} in ${dir.path || "the repository root"}${described.roleText ? `: ${described.roleText}` : ""}.${described.services.length ? ` Talks to ${described.services.join(", ")}.` : ""}`;
    return groupNode(
      id,
      kindAt(depth),
      labelOverride ?? dir.name,
      paths,
      children,
      summary,
      "directory",
      dir.path,
    );
  };

  // Hoist a dominant source root (src/, app/, lib/) so its sub-areas become the top level.
  const areas: GraphNode[] = [];
  const rootChildren = [...trie.dirs.values()].map(collapse);
  for (const dir of rootChildren) {
    const count = allFiles(dir).length;
    const dominant = count / Math.max(total, 1) >= 0.5 && dir.dirs.size > 1;
    if (dominant) {
      for (const sub of dir.dirs.values()) {
        const collapsed = collapse(sub);
        areas.push(dirNode(rootId, collapsed, 1, `${dir.name}/${collapsed.name}`));
      }
      if (dir.files.length) {
        const looseId = `${rootId}loose:${dir.path}|`;
        const children = dir.files.map((path) => fileNode(looseId, path));
        areas.push(
          groupNode(
            looseId,
            "domain",
            `${dir.name} (entry files)`,
            dir.files,
            children,
            `Files directly inside ${dir.path}/, usually application entry points and wiring.`,
            "directory",
            `${dir.path}/*`,
          ),
        );
      }
    } else {
      areas.push(dirNode(rootId, dir, 1));
    }
  }
  if (trie.files.length) {
    const looseId = `${rootId}loose:root|`;
    areas.push(
      groupNode(
        looseId,
        "domain",
        "Repository root files",
        trie.files,
        trie.files.map((path) => fileNode(looseId, path)),
        "Source files at the top of the repository, typically configuration.",
        "directory",
        "*",
      ),
    );
  }
  areas.sort((a, b) => importance(b) - importance(a) || a.label.localeCompare(b.label));

  /* --------------------------- external services -------------------------- */
  const serviceGroupId = `${rootId}services|`;
  const serviceNodes = analysis.services.map((service) => {
    const id = `${serviceGroupId}s:${service.id}|`;
    const paths = service.files.filter((path) => index.files.has(path));
    const configFiles = service.files.filter((path) => !index.files.has(path));
    const reasons = [...new Set(service.evidence.map((item) => item.reason))].slice(0, 4);
    return groupNode(
      id,
      "service",
      service.name,
      paths,
      paths.map((path) => fileNode(id, path)),
      `${service.category} dependency used by ${plural(paths.length, ["source file", "source files"])}. Evidence: ${reasons.join("; ")}${configFiles.length ? `; config ${configFiles.slice(0, 3).join(", ")}` : ""}.`,
      "service",
      service.id,
    );
  });

  /* ------------------------------ data layer ------------------------------ */
  const dataGroupId = `${rootId}data|`;
  const resourceNodes = analysis.resources
    .filter((resource) => resource.uses.length || resource.definedIn.length)
    .map((resource) => {
      const id = `${dataGroupId}r:${resource.id}|`;
      const paths = [...new Set(resource.uses.map((use) => use.path))];
      const owner = index.services.get(resource.service)?.name ?? resource.service;
      return groupNode(
        id,
        "module",
        resource.name,
        paths,
        paths.map((path) => fileNode(id, path)),
        `${owner} ${resource.kind}${resource.definedIn.length ? `, defined in ${resource.definedIn.join(", ")}` : ", no definition found in the repository"}. ${paths.length ? `Read or written by ${plural(paths.length, ["file", "files"])}.` : "No code references found."}`,
        "resource",
        resource.id,
      );
    });

  const topLevel = [...areas];
  if (serviceNodes.length) {
    const paths = [...new Set(serviceNodes.flatMap((node) => node.analysisRef!.paths))];
    topLevel.push(
      groupNode(
        serviceGroupId,
        "domain",
        "External services",
        paths,
        serviceNodes,
        `${plural(serviceNodes.length, ["external service", "external services"])} detected from imports, API hosts, environment variables and config files.`,
        "group",
        "services",
      ),
    );
  }
  if (resourceNodes.length) {
    const paths = [...new Set(resourceNodes.flatMap((node) => node.analysisRef!.paths))];
    topLevel.push(
      groupNode(
        dataGroupId,
        "domain",
        "Data",
        paths,
        resourceNodes,
        `${plural(resourceNodes.length, ["table, function or model", "tables, functions and models"])} found in migrations, schemas and client calls.`,
        "group",
        "data",
      ),
    );
  }

  const all = analysis.files.map((file) => file.path);
  const root = groupNode(
    rootId,
    "org",
    repoName,
    all,
    topLevel,
    `${plural(analysis.stats.analyzedFiles, ["source file", "source files"])}, ${analysis.stats.internalEdges.toLocaleString("en-US")} import edges, ${plural(analysis.services.length, ["external service", "external services"])}. Parsed with the TypeScript compiler at ${analysis.ref.slice(0, 8)}.`,
    "repository",
    repoName,
  );
  root.metrics = [
    { label: "Source files", value: analysis.stats.analyzedFiles.toLocaleString("en-US") },
    { label: "LOC", value: analysis.stats.loc.toLocaleString("en-US") },
    { label: "Import edges", value: analysis.stats.internalEdges.toLocaleString("en-US") },
    { label: "Services", value: String(analysis.services.length) },
    { label: "Cycles", value: String(analysis.cycles.length) },
  ];
  return root;
}
