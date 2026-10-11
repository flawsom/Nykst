/**
 * Line diffs and git-style patches. Pure and dependency-free so the server can produce a patch
 * and the browser can show the same changes.
 */

export interface DiffLine {
  type: " " | "+" | "-";
  text: string;
  /** the line has no newline at the end of the file */
  noNewline?: boolean;
}

const MAX_MATRIX_CELLS = 6_000_000;
const NO_NEWLINE = "\u0000";

/** Lines of a text. A last line without a newline is a different line from one with it. */
function splitLines(text: string): { key: string; text: string; noNewline: boolean }[] {
  if (text === "") return [];
  const finalNewline = text.endsWith("\n");
  const lines = (finalNewline ? text.slice(0, -1) : text).split("\n");
  return lines.map((line, index) => {
    const noNewline = !finalNewline && index === lines.length - 1;
    return { key: noNewline ? line + NO_NEWLINE : line, text: line, noNewline };
  });
}

type Item = ReturnType<typeof splitLines>[number];

const asLine = (type: DiffLine["type"], item: Item): DiffLine => ({
  type,
  text: item.text,
  ...(item.noNewline ? { noNewline: true } : {}),
});

/** Shortest edit script between two texts (longest common subsequence on the changed middle). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start]!.key === b[start]!.key) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1]!.key === b[endB - 1]!.key) {
    endA -= 1;
    endB -= 1;
  }
  const head = a.slice(0, start).map((item) => asLine(" ", item));
  const tail = a.slice(endA).map((item) => asLine(" ", item));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const middle: DiffLine[] = [];

  if (midA.length * midB.length > MAX_MATRIX_CELLS) {
    // Too different to align cheaply: show the region as removed, then added.
    for (const item of midA) middle.push(asLine("-", item));
    for (const item of midB) middle.push(asLine("+", item));
  } else {
    const n = midA.length;
    const m = midB.length;
    const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1)
      for (let j = m - 1; j >= 0; j -= 1)
        table[i]![j] =
          midA[i]!.key === midB[j]!.key
            ? table[i + 1]![j + 1]! + 1
            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i]!.key === midB[j]!.key) {
        middle.push(asLine(" ", midA[i]!));
        i += 1;
        j += 1;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
        middle.push(asLine("-", midA[i]!));
        i += 1;
      } else {
        middle.push(asLine("+", midB[j]!));
        j += 1;
      }
    }
    for (; i < n; i += 1) middle.push(asLine("-", midA[i]!));
    for (; j < m; j += 1) middle.push(asLine("+", midB[j]!));
  }
  return [...head, ...middle, ...tail];
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((line) => line.type === "+").length,
    removed: lines.filter((line) => line.type === "-").length,
  };
}

/**
 * A patch for one file in the format `git apply` and `patch -p1` accept. Pass null for
 * `before` when the file is new and null for `after` when it is deleted.
 */
export function unifiedDiff(
  path: string,
  before: string | null,
  after: string | null,
  context = 3,
) {
  if (before === after) return "";
  const lines = diffLines(before ?? "", after ?? "");
  const changed: number[] = [];
  lines.forEach((line, index) => {
    if (line.type !== " ") changed.push(index);
  });
  if (!changed.length) return "";

  const header = [`diff --git a/${path} b/${path}`];
  if (before === null) header.push("new file mode 100644");
  if (after === null) header.push("deleted file mode 100644");
  header.push(before === null ? "--- /dev/null" : `--- a/${path}`);
  header.push(after === null ? "+++ /dev/null" : `+++ b/${path}`);

  const hunks: [number, number][] = [];
  for (const index of changed) {
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    const last = hunks[hunks.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else hunks.push([from, to]);
  }

  // Number of old/new lines before each position, to compute hunk start lines.
  const oldBefore: number[] = [];
  const newBefore: number[] = [];
  let o = 0;
  let n = 0;
  for (const line of lines) {
    oldBefore.push(o);
    newBefore.push(n);
    if (line.type !== "+") o += 1;
    if (line.type !== "-") n += 1;
  }

  const body: string[] = [];
  for (const [from, to] of hunks) {
    const slice = lines.slice(from, to + 1);
    const oldCount = slice.filter((line) => line.type !== "+").length;
    const newCount = slice.filter((line) => line.type !== "-").length;
    const oldStart = oldCount === 0 ? oldBefore[from]! : oldBefore[from]! + 1;
    const newStart = newCount === 0 ? newBefore[from]! : newBefore[from]! + 1;
    body.push(
      `@@ -${oldStart}${oldCount === 1 ? "" : `,${oldCount}`} +${newStart}${newCount === 1 ? "" : `,${newCount}`} @@`,
    );
    for (const line of slice) {
      body.push(`${line.type}${line.text}`);
      if (line.noNewline) body.push("\\ No newline at end of file");
    }
  }
  return `${[...header, ...body].join("\n")}\n`;
}
