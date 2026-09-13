import { useState } from "react";
import { childrenOf, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";

interface Props {
  root: GraphNode;
  activeId: string;
  openIds: Set<string>;
  onSelect: (node: GraphNode) => void;
  /** access filter — nodes outside the viewer's scope are never listed */
  visible?: ((n: GraphNode) => boolean) | undefined;
}

export function TreePanel({ root, activeId, openIds, onSelect, visible }: Props) {
  return (
    <aside className="border-border bg-card/40 hidden w-[248px] shrink-0 overflow-y-auto border-r backdrop-blur md:block">
      <div className="border-border text-muted-foreground border-b px-4 py-3 text-[10px] tracking-[0.24em] uppercase">
        System tree
      </div>
      <div className="py-2">
        <TreeRow
          node={root}
          depth={0}
          activeId={activeId}
          openIds={openIds}
          onSelect={onSelect}
          visible={visible}
        />
      </div>
    </aside>
  );
}

function TreeRow({
  node,
  depth,
  activeId,
  openIds,
  onSelect,
  visible,
}: {
  node: GraphNode;
  depth: number;
  activeId: string;
  openIds: Set<string>;
  onSelect: (n: GraphNode) => void;
  visible?: ((n: GraphNode) => boolean) | undefined;
}) {
  const [open, setOpen] = useState(openIds.has(node.id) || depth === 0);
  const expanded = open || openIds.has(node.id);
  const all = expanded && node.expandable ? childrenOf(node) : [];
  const kids = visible ? all.filter(visible) : all;
  const hidden = all.length - kids.length;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-2 text-sm transition-colors",
          activeId === node.id ? "bg-secondary text-foreground" : "hover:bg-surface",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.expandable ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground w-4 shrink-0 text-[10px]"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          onClick={() => onSelect(node)}
          className={cn(
            "flex-1 truncate py-1 text-left",
            activeId === node.id ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {node.label}
        </button>
      </div>
      {expanded &&
        kids.map((c) => (
          <TreeRow
            key={c.id}
            node={c}
            depth={depth + 1}
            activeId={activeId}
            openIds={openIds}
            onSelect={onSelect}
            visible={visible}
          />
        ))}
      {expanded && hidden > 0 && (
        <div
          className="text-muted-foreground/70 py-1 text-[11px] italic"
          style={{ paddingLeft: `${24 + depth * 12}px` }}
        >
          {hidden} restricted
        </div>
      )}
    </div>
  );
}
