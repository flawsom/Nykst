import type { RawDataCall } from "./parse.server";

/** Receivers that call `.from("x")` but are never a database client. */
const NON_DB_RECEIVER =
  /^(Array|Buffer|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array|Object|Set|Map|Promise|String|Readable|Observable|Blob|File|Response|Headers|Iterator|rxjs|z|Rx)$/;

export interface DataTarget {
  kind: "table" | "rpc" | "bucket" | "model";
  name: string;
  owner: "supabase" | "prisma";
  line: number;
}

/**
 * Which database tables, functions, buckets and ORM models a file's calls refer to.
 * `isKnown` says whether a table or function is defined in the repository (migrations), which
 * lets `.from("x")` on an unusual variable name still count when "x" is a real table.
 */
export function dataCallTargets(
  calls: RawDataCall[],
  usesSupabase: boolean,
  isKnown: (kind: "table" | "rpc", name: string) => boolean,
): DataTarget[] {
  const out: DataTarget[] = [];
  for (const call of calls) {
    if (call.method === "prisma") {
      out.push({ kind: "model", name: call.name, owner: "prisma", line: call.line });
      continue;
    }
    if (NON_DB_RECEIVER.test(call.receiver) || /^[A-Z]\w*$/.test(call.receiver)) continue;
    const looksLikeClient = /supabase|client|admin|\bdb\b|\bsb\b/i.test(call.receiver);
    const lookupKind = call.method === "rpc" ? "rpc" : "table";
    const known = isKnown(lookupKind, call.name.toLowerCase());
    if (!usesSupabase || (!looksLikeClient && !known)) continue;
    const kind = call.method === "rpc" ? "rpc" : call.method === "storage" ? "bucket" : "table";
    out.push({
      kind,
      name: kind === "bucket" ? call.name : call.name.toLowerCase(),
      owner: "supabase",
      line: call.line,
    });
  }
  return out;
}
