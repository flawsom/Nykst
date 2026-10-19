import type { ExportedSymbol } from "./types";

/** One deterministic, human-readable signature line. */
export function formatSymbolSignature(symbol: ExportedSymbol) {
  if (symbol.kind === "re-export") return symbol.name;
  const parameters = symbol.parameters?.length
    ? symbol.parameters
        .map((parameter) => {
          const rest = parameter.rest ? "..." : "";
          const optional = parameter.optional ? "?" : "";
          const type = parameter.type && parameter.type !== "unknown" ? `: ${parameter.type}` : "";
          return `${rest}${parameter.name}${optional}${type}`;
        })
        .join(", ")
    : "";
  const returnType =
    symbol.returnType && symbol.returnType !== "unknown" ? `: ${symbol.returnType}` : "";
  const prefix =
    symbol.kind === "function"
      ? "function"
      : symbol.kind === "class"
        ? "class"
        : symbol.kind === "interface"
          ? "interface"
          : symbol.kind === "type"
            ? "type"
            : symbol.kind === "enum"
              ? "enum"
              : "const";
  return `${prefix} ${symbol.name}${parameters || symbol.kind === "function" ? `(${parameters})` : ""}${returnType}`;
}

/** Compact, bounded list used by MCP search results and the dossier. */
export function summarizeSymbol(symbol: ExportedSymbol) {
  return {
    name: symbol.name,
    kind: symbol.kind,
    line: symbol.line,
    signature: formatSymbolSignature(symbol),
    arity: symbol.arity ?? null,
    required_arity: symbol.requiredArity ?? null,
    parameters: symbol.parameters?.slice(0, 12) ?? [],
    return_type: symbol.returnType ?? null,
    type_properties: symbol.typeProperties?.slice(0, 30) ?? [],
  };
}
