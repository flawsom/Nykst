import { ChevronRight, File, Folder, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { buildTree, searchFiles, worstSeverity, type TreeNode } from "@/lib/workspace/model";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./WorkspaceContext";

const DOT = { high: "bg-danger", medium: "bg-warn", low: "bg-info" } as const;

export function Explorer() {
  const { data, index, selected, select, findingsByPath } = useWorkspace();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildTree(data.analysis.files.map((file) => file.path)), [data]);
  const matches = useMemo(() => searchFiles(index, query, 60), [index, query]);
  // Folders on the way to the selected file stay open.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const isOpen = (node: TreeNode) =>
    open.has(node.path) || (selected !== null && selected.startsWith(`${node.path}/`));
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const row = (node: TreeNode, depth: number) => {
    const sev = node.kind === "file" ? worstSeverity(findingsByPath.get(node.path)) : null;
    const dependents = node.kind === "file" ? (index.dependents.get(node.path)?.length ?? 0) : 0;
    const expanded = node.kind === "dir" && isOpen(node);
    return (
      <li key={node.path} role="none">
        <button
          type="button"
          role="treeitem"
          aria-expanded={node.kind === "dir" ? expanded : undefined}
          aria-selected={node.path === selected}
          onClick={() => (node.kind === "dir" ? toggle(node.path) : select(node.path))}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={cn(
            "hover:bg-muted flex min-h-9 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm transition-colors",
            node.path === selected && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {node.kind === "dir" ? (
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
              aria-hidden
            />
          ) : (
            <span className="w-3.5 shrink-0" aria-hidden />
          )}
          {node.kind === "dir" ? (
            <Folder className="text-subtle size-4 shrink-0" aria-hidden />
          ) : (
            <File className="text-subtle size-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {sev && (
            <span className={cn("size-2 shrink-0 rounded-full", DOT[sev])} title={`${sev} finding`}>
              <span className="sr-only">{sev} finding</span>
            </span>
          )}
          {node.kind === "dir" ? (
            <span className="text-subtle tabular text-xs">{node.files}</span>
          ) : dependents > 0 ? (
            <span className="text-subtle tabular text-xs" title={`${dependents} files import this`}>
              {dependents}
            </span>
          ) : null}
        </button>
        {expanded && node.children.length > 0 && (
          <ul role="group">{node.children.map((child) => row(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <label className="relative block">
          <span className="sr-only">Filter files</span>
          <Search
            className="text-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files or exports"
            className="border-input bg-background placeholder:text-subtle min-h-10 w-full rounded-lg border pr-3 pl-9 text-sm"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {query.trim() ? (
          matches.length ? (
            <ul role="tree" aria-label="Matching files">
              {matches.map((match) => (
                <li key={match.path} role="none">
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={match.path === selected}
                    onClick={() => select(match.path)}
                    className={cn(
                      "hover:bg-muted flex min-h-10 w-full flex-col justify-center rounded-md px-2 text-left transition-colors",
                      match.path === selected && "bg-primary/10",
                    )}
                  >
                    <span className="truncate text-sm">{match.path.split("/").pop()}</span>
                    <span className="text-subtle truncate font-mono text-xs">
                      {match.path}
                      {match.match ? ` · exports ${match.match}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-2 py-4 text-sm">
              No file or export matches “{query}”.
            </p>
          )
        ) : (
          <ul role="tree" aria-label="Repository files">
            {tree.children.map((child) => row(child, 0))}
          </ul>
        )}
      </div>
    </div>
  );
}
