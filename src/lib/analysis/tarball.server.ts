/**
 * Streams a GitHub repository tarball and keeps only the files the analysis engine
 * asks for. One request replaces thousands of per-file contents API calls.
 */

const BLOCK = 512;
const MAX_ARCHIVE_BYTES = 600 * 1024 * 1024;

export interface TarballResult {
  /** every regular file path in the archive, repository-relative */
  paths: string[];
  sizes: Map<string, number>;
  contents: Map<string, string>;
  /** commit SHA recorded by GitHub in the archive's global pax header */
  commitSha: string | null;
}

class ByteQueue {
  private chunks: Uint8Array[] = [];
  private length = 0;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  get size() {
    return this.length;
  }

  /** Drops n bytes without copying them; caller must check size first. */
  discard(n: number) {
    let remaining = n;
    while (remaining > 0) {
      const head = this.chunks[0]!;
      if (head.length <= remaining) {
        remaining -= head.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(remaining);
        remaining = 0;
      }
    }
    this.length -= n;
  }

  /** Removes and returns exactly n bytes; caller must check size first. */
  take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let offset = 0;
    while (offset < n) {
      const head = this.chunks[0]!;
      const needed = n - offset;
      if (head.length <= needed) {
        out.set(head, offset);
        offset += head.length;
        this.chunks.shift();
      } else {
        out.set(head.subarray(0, needed), offset);
        this.chunks[0] = head.subarray(needed);
        offset += needed;
      }
    }
    this.length -= n;
    return out;
  }
}

const decoder = new TextDecoder();

function cString(bytes: Uint8Array, start: number, length: number) {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end));
}

function octal(bytes: Uint8Array, start: number, length: number) {
  // GNU base-256 encoding for very large files.
  if (bytes[start]! & 0x80) {
    let value = 0;
    for (let i = start + 1; i < start + length; i += 1) value = value * 256 + bytes[i]!;
    return value;
  }
  const text = cString(bytes, start, length).trim();
  return text ? parseInt(text, 8) : 0;
}

function paxRecords(bytes: Uint8Array) {
  const records = new Map<string, string>();
  const text = decoder.decode(bytes);
  let offset = 0;
  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space === -1) break;
    const length = parseInt(text.slice(offset, space), 10);
    if (!length) break;
    const record = text.slice(space + 1, offset + length - 1);
    const equals = record.indexOf("=");
    if (equals !== -1) records.set(record.slice(0, equals), record.slice(equals + 1));
    offset += length;
  }
  return records;
}

export async function fetchRepositoryTarball(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  wants: (path: string, size: number) => boolean,
): Promise<TarballResult> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nykst-software-intelligence",
      },
      redirect: "follow",
    },
  );
  if (!response.ok || !response.body)
    throw new Error(`GitHub tarball download failed with status ${response.status}.`);

  const reader = response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const queue = new ByteQueue();
  let finished = false;
  let total = 0;
  const fill = async (n: number) => {
    while (queue.size < n && !finished) {
      const { value, done } = await reader.read();
      if (done) finished = true;
      else if (value) {
        total += value.length;
        if (total > MAX_ARCHIVE_BYTES) {
          await reader.cancel();
          throw new Error("Repository archive exceeds the 600 MB analysis limit.");
        }
        queue.push(value);
      }
    }
    return queue.size >= n;
  };

  const result: TarballResult = {
    paths: [],
    sizes: new Map(),
    contents: new Map(),
    commitSha: null,
  };
  let nextPath: string | null = null;

  while (await fill(BLOCK)) {
    const header = queue.take(BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    const name = cString(header, 0, 100);
    const prefix = cString(header, 345, 155);
    let path = nextPath ?? (prefix ? `${prefix}/${name}` : name);

    const readBody = async () => {
      if (!(await fill(padded))) throw new Error("Repository archive ended unexpectedly.");
      return queue.take(padded).subarray(0, size);
    };
    const skipBody = async () => {
      let remaining = padded;
      while (remaining > 0) {
        const step = Math.min(remaining, 1024 * 1024);
        if (!(await fill(step))) throw new Error("Repository archive ended unexpectedly.");
        queue.discard(step);
        remaining -= step;
      }
    };

    if (type === "g" || type === "x") {
      const records = paxRecords(await readBody());
      if (type === "g") result.commitSha = records.get("comment")?.trim() || result.commitSha;
      else nextPath = records.get("path") ?? null;
      continue;
    }
    if (type === "L") {
      nextPath = decoder.decode(await readBody()).replace(/\0+$/, "");
      continue;
    }
    nextPath = null;
    // GitHub wraps everything in "<owner>-<repo>-<sha>/".
    path = path.slice(path.indexOf("/") + 1);
    if ((type === "0" || type === "\0" || type === "7") && path) {
      result.paths.push(path);
      result.sizes.set(path, size);
      if (wants(path, size)) {
        result.contents.set(path, decoder.decode(await readBody()));
        continue;
      }
    }
    await skipBody();
  }
  if (!finished) await reader.cancel().catch(() => undefined);
  return result;
}
