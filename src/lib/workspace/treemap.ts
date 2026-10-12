/** Pure treemap helpers: squarified layout and a size-weighted folder hierarchy. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Placed extends Rect {
  id: string;
}

const MIN_VALUE = 1e-6;

/** Squarified treemap (Bruls et al.). Output is ordered by value, largest first, ties by input order. */
export function squarify(items: { id: string; value: number }[], rect: Rect): Placed[] {
  if (items.length === 0) return [];
  const sorted = items
    .map((item, order) => ({
      id: item.id,
      order,
      value: Number.isFinite(item.value) && item.value > MIN_VALUE ? item.value : MIN_VALUE,
    }))
    .sort((a, b) => b.value - a.value || a.order - b.order);
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  const area = Math.max(0, rect.w) * Math.max(0, rect.h);
  const scaled = sorted.map((item) => ({ id: item.id, area: (item.value / total) * area }));

  const out: Placed[] = [];
  let { x, y, w, h } = rect;
  w = Math.max(0, w);
  h = Math.max(0, h);

  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum <= 0 || side <= 0) return Infinity;
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  let i = 0;
  while (i < scaled.length) {
    const side = Math.min(w, h);
    const row: number[] = [];
    let j = i;
    while (j < scaled.length) {
      const next = [...row, scaled[j]!.area];
      if (row.length > 0 && worst(next, side) > worst(row, side)) break;
      row.push(scaled[j]!.area);
      j += 1;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const last = j >= scaled.length;
    if (w >= h) {
      // column on the left
      const colW = last ? w : h > 0 ? sum / h : 0;
      let cy = y;
      row.forEach((a, k) => {
        const ih = last && k === row.length - 1 ? y + h - cy : colW > 0 ? a / colW : 0;
        out.push({ id: scaled[i + k]!.id, x, y: cy, w: colW, h: ih });
        cy += ih;
      });
      x += colW;
      w -= colW;
    } else {
      const rowH = last ? h : w > 0 ? sum / w : 0;
      let cx = x;
      row.forEach((a, k) => {
        const iw = last && k === row.length - 1 ? x + w - cx : rowH > 0 ? a / rowH : 0;
        out.push({ id: scaled[i + k]!.id, x: cx, y, w: iw, h: rowH });
        cx += iw;
      });
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}

export interface HNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  loc: number;
  children: HNode[];
}

/** Nested folders/files; loc of a folder is the sum below it; single-folder chains are joined (a/b/c). */
export function buildHierarchy(files: { path: string; loc: number }[]): HNode {
  const root: HNode = { name: "", path: "", kind: "dir", loc: 0, children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const full = parts.slice(0, index + 1).join("/");
      const isFile = index === parts.length - 1;
      let next = cursor.children.find((child) => child.path === full);
      if (!next) {
        next = { name: part, path: full, kind: isFile ? "file" : "dir", loc: 0, children: [] };
        cursor.children.push(next);
      }
      if (isFile) next.loc = Math.max(0, file.loc);
      cursor = next;
    });
  }
  const finish = (node: HNode): HNode => {
    node.children = node.children.map(finish);
    if (node.kind === "dir") node.loc = node.children.reduce((sum, c) => sum + c.loc, 0);
    node.children.sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
    if (
      node.kind === "dir" &&
      node.path &&
      node.children.length === 1 &&
      node.children[0]!.kind === "dir"
    ) {
      const only = node.children[0]!;
      return { ...only, name: `${node.name}/${only.name}` };
    }
    return node;
  };
  return finish(root);
}
