import type TS from "typescript";
import type { ColumnRef, ExportedSymbol, SymbolParameter, SymbolProperty } from "./types";

// Loaded on first use so a problem with the compiler can only affect analysis, never the
// server's startup (the router bundle imports this module for every request).
let ts: typeof TS;

export async function loadParser() {
  if (ts) return;
  // TypeScript's Node host reads __filename/__dirname while loading. A bundled ES module
  // has neither, so give it a placeholder; only createSourceFile is used, no lib files.
  const scope = globalThis as { __filename?: string; __dirname?: string };
  scope.__filename ??= "/node_modules/typescript/lib/typescript.js";
  scope.__dirname ??= "/node_modules/typescript/lib";
  const mod = (await import("typescript")) as typeof TS & { default?: typeof TS };
  ts = mod.default ?? mod;
}

export interface RawImport {
  specifier: string;
  line: number;
  typeOnly: boolean;
  dynamic: boolean;
}

export interface RawDataCall {
  method: "from" | "rpc" | "storage" | "prisma";
  name: string;
  receiver: string;
  line: number;
}

export interface ParsedEndpoint {
  path: string;
  line: number;
  protocol: "http" | "grpc";
}

export interface ParsedSource {
  imports: RawImport[];
  exports: string[];
  functions: string[];
  classes: string[];
  envVars: { name: string; line: number }[];
  urls: { host: string; line: number }[];
  dataCalls: RawDataCall[];
  /** literal HTTP routes and gRPC method strings, for federation */
  endpoints: ParsedEndpoint[];
  /** exported signatures, including arity and type properties */
  symbols: ExportedSymbol[];
  /** literal table.column references read or written by client calls */
  columnRefs: ColumnRef[];
  loc: number;
}

const PRISMA_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

function scriptKind(path: string) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[mc]?ts$/.test(path)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function hasModifier(node: TS.Node, kind: TS.SyntaxKind) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

function literalText(node: TS.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function bindingNames(name: TS.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

const MAX_TYPE_TEXT = 160;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TYPE_TEXT);
}

function typeText(sf: TS.SourceFile, node: TS.Node | undefined) {
  return node ? cleanText(node.getText(sf)) : "unknown";
}

function parametersOf(sf: TS.SourceFile, nodes: TS.NodeArray<TS.ParameterDeclaration>) {
  const parameters: SymbolParameter[] = nodes.map((node) => ({
    name: cleanText(node.name.getText(sf)),
    type: typeText(sf, node.type),
    optional: Boolean(node.questionToken || node.initializer),
    rest: Boolean(node.dotDotDotToken),
  }));
  return {
    parameters,
    arity: parameters.length,
    requiredArity: parameters.filter((parameter) => !parameter.optional && !parameter.rest).length,
  };
}

function memberName(sf: TS.SourceFile, member: TS.Node) {
  if (!("name" in member)) return "";
  const name = (member as { name?: TS.Node }).name;
  if (!name) return "";
  return cleanText(name.getText(sf)).replace(/^["']|["']$/g, "");
}

function typePropertiesOf(sf: TS.SourceFile, members: readonly TS.Node[]) {
  const properties: SymbolProperty[] = [];
  for (const member of members) {
    if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
      if (
        hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
        hasModifier(member, ts.SyntaxKind.ProtectedKeyword)
      )
        continue;
      const name = memberName(sf, member);
      if (!name) continue;
      properties.push({
        name,
        type: typeText(sf, member.type),
        optional: Boolean(member.questionToken),
        readonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
      });
      continue;
    }
    if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
      const name = memberName(sf, member);
      if (!name) continue;
      const params = parametersOf(sf, member.parameters);
      properties.push({
        name,
        type: `(${params.parameters
          .map(
            (parameter) =>
              `${parameter.rest ? "..." : ""}${parameter.name}${parameter.optional ? "?" : ""}${parameter.type !== "unknown" ? `: ${parameter.type}` : ""}`,
          )
          .join(", ")}) => ${typeText(sf, member.type)}`,
        optional: Boolean(member.questionToken),
        readonly: false,
      });
      continue;
    }
    if (ts.isEnumMember(member)) {
      const name = memberName(sf, member);
      if (name)
        properties.push({
          name,
          type: member.initializer ? cleanText(member.initializer.getText(sf)) : "enum",
          optional: false,
          readonly: true,
        });
    }
  }
  return properties.slice(0, 40);
}

function signatureForStatement(
  sf: TS.SourceFile,
  statement: TS.Statement,
  line: number,
): ExportedSymbol | null {
  if (ts.isFunctionDeclaration(statement)) {
    const params = parametersOf(sf, statement.parameters);
    return {
      name: statement.name?.text ?? "default",
      kind: "function",
      line,
      ...params,
      returnType: typeText(sf, statement.type),
    };
  }
  if (ts.isClassDeclaration(statement))
    return {
      name: statement.name?.text ?? "default",
      kind: "class",
      line,
      typeProperties: typePropertiesOf(sf, statement.members),
    };
  if (ts.isInterfaceDeclaration(statement))
    return {
      name: statement.name.text,
      kind: "interface",
      line,
      typeProperties: typePropertiesOf(sf, statement.members),
    };
  if (ts.isTypeAliasDeclaration(statement))
    return {
      name: statement.name.text,
      kind: "type",
      line,
      typeProperties: ts.isTypeLiteralNode(statement.type)
        ? typePropertiesOf(sf, statement.type.members)
        : [],
    };
  if (ts.isEnumDeclaration(statement))
    return {
      name: statement.name.text,
      kind: "enum",
      line,
      typeProperties: typePropertiesOf(sf, statement.members),
    };
  return null;
}

function columnNamesFromValue(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== "*" && !part.includes("(") && !part.includes(")"))
    .map((part) => part.split(":").pop()!.trim())
    .filter((part) => /^[a-z_][a-z0-9_$]*$/i.test(part))
    .map((part) => part.toLowerCase());
}

function columnNamesFromExpression(sf: TS.SourceFile, node: TS.Expression | undefined) {
  if (!node) return [];
  if (ts.isArrayLiteralExpression(node))
    return node.elements.flatMap((element) =>
      ts.isStringLiteral(element) ? [element.text.toLowerCase()] : [],
    );
  if (ts.isObjectLiteralExpression(node))
    return node.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
        const name = memberName(sf, property);
        return name ? [name.toLowerCase()] : [];
      }
      return [];
    });
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return columnNamesFromValue(node.text);
  return [];
}

function columnRefsForCall(
  sf: TS.SourceFile,
  method: string,
  args: readonly TS.Expression[],
  chain: string,
  line: number,
) {
  const table = /\.from\(\s*["']([^"']+)["']/.exec(chain)?.[1];
  if (!table) return [];
  const select = new Set([
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "contains",
    "containedBy",
    "overlaps",
    "textSearch",
    "order",
    "not",
  ]);
  const objectMethods = new Set(["insert", "update", "upsert"]);
  let columns: string[] = [];
  if (select.has(method)) columns = columnNamesFromExpression(sf, args[0]);
  else if (objectMethods.has(method)) columns = columnNamesFromExpression(sf, args[0]);
  else if (method === "match") columns = columnNamesFromExpression(sf, args[0]);
  return columns.map((column) => ({
    table: table.toLowerCase(),
    column,
    line,
    operation: method,
  }));
}

const URL_PATTERN = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:?#]|$)/i;

/** Extracts structural facts from one JS/TS source file using the TypeScript parser. */
export function parseSource(path: string, content: string): ParsedSource {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, false, scriptKind(path));
  const lineOf = (node: TS.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const result: ParsedSource = {
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    envVars: [],
    urls: [],
    dataCalls: [],
    endpoints: [],
    symbols: [],
    columnRefs: [],
    loc: content.split("\n").filter((line) => line.trim()).length,
  };
  const exports = new Set<string>();
  const endpoints = new Set<string>();
  const symbolNames = new Set<string>();
  const addSymbol = (symbol: ExportedSymbol | null) => {
    if (!symbol || symbolNames.has(symbol.name)) return;
    symbolNames.add(symbol.name);
    result.symbols.push(symbol);
  };

  for (const statement of sf.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    const line = lineOf(statement);
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) result.functions.push(statement.name.text);
      if (exported) {
        const name = isDefault ? "default" : (statement.name?.text ?? "default");
        exports.add(name);
        addSymbol({ ...signatureForStatement(sf, statement, line)!, name });
      }
    } else if (ts.isClassDeclaration(statement)) {
      if (statement.name) result.classes.push(statement.name.text);
      if (exported) {
        const name = isDefault ? "default" : (statement.name?.text ?? "default");
        exports.add(name);
        addSymbol({ ...signatureForStatement(sf, statement, line)!, name });
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
          result.functions.push(...names);
        if (!exported) continue;
        for (const name of names) {
          exports.add(name);
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            const params = parametersOf(sf, init.parameters);
            addSymbol({
              name,
              kind: "function",
              line,
              ...params,
              returnType: typeText(sf, init.type ?? declaration.type),
            });
          } else {
            addSymbol({
              name,
              kind: "const",
              line,
              typeProperties:
                declaration.type && ts.isTypeLiteralNode(declaration.type)
                  ? typePropertiesOf(sf, declaration.type.members)
                  : init && ts.isObjectLiteralExpression(init)
                    ? init.properties.flatMap((property) => {
                        const propertyName = memberName(sf, property);
                        if (!propertyName) return [];
                        return [
                          {
                            name: propertyName,
                            type: "unknown",
                            optional: false,
                            readonly: false,
                          },
                        ];
                      })
                    : [],
            });
          }
        }
      }
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (exported) {
        exports.add(statement.name.text);
        addSymbol(signatureForStatement(sf, statement, line));
      }
    } else if (ts.isExportAssignment(statement)) {
      exports.add("default");
      addSymbol({ name: "default", kind: "re-export", line });
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        statement.exportClause.elements.forEach((element) => {
          exports.add(element.name.text);
          addSymbol({ name: element.name.text, kind: "re-export", line });
        });
    }
  }

  const visit = (node: TS.Node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) {
        const clause = node.importClause;
        const namedTypeOnly =
          !!clause &&
          !clause.name &&
          !!clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly);
        result.imports.push({
          specifier,
          line: lineOf(node),
          typeOnly: Boolean(clause?.isTypeOnly) || namedTypeOnly,
          dynamic: false,
        });
      }
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) {
        result.imports.push({
          specifier,
          line: lineOf(node),
          typeOnly: node.isTypeOnly,
          dynamic: false,
        });
        if (!node.exportClause) {
          exports.add(`* from ${specifier}`);
          addSymbol({ name: `* from ${specifier}`, kind: "re-export", line: lineOf(node) });
        } else if (ts.isNamedExports(node.exportClause))
          node.exportClause.elements.forEach((element) => {
            exports.add(element.name.text);
            addSymbol({ name: element.name.text, kind: "re-export", line: lineOf(node) });
          });
      }
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = literalText(node.moduleReference.expression);
      if (specifier !== null)
        result.imports.push({
          specifier,
          line: lineOf(node),
          typeOnly: node.isTypeOnly,
          dynamic: false,
        });
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const firstArg = literalText(node.arguments[0]);
      if (callee.kind === ts.SyntaxKind.ImportKeyword && firstArg !== null) {
        result.imports.push({
          specifier: firstArg,
          line: lineOf(node),
          typeOnly: false,
          dynamic: true,
        });
      } else if (ts.isIdentifier(callee) && callee.text === "require" && firstArg !== null) {
        result.imports.push({
          specifier: firstArg,
          line: lineOf(node),
          typeOnly: false,
          dynamic: false,
        });
      } else if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        const receiver = callee.expression.getText(sf).replace(/\s+/g, "").slice(0, 120);
        result.columnRefs.push(
          ...columnRefsForCall(sf, method, node.arguments, receiver, lineOf(node)),
        );
        if ((method === "from" || method === "rpc") && firstArg !== null) {
          result.dataCalls.push({
            method: method === "from" && /\.storage$/.test(receiver) ? "storage" : method,
            name: firstArg,
            receiver,
            line: lineOf(node),
          });
        } else if (
          PRISMA_OPERATIONS.has(method) &&
          ts.isPropertyAccessExpression(callee.expression) &&
          !callee.expression.name.text.startsWith("$")
        ) {
          const root = callee.expression.expression.getText(sf);
          if (/(^|\.)(prisma|db)$/i.test(root))
            result.dataCalls.push({
              method: "prisma",
              name: callee.expression.name.text,
              receiver: root,
              line: lineOf(node),
            });
        } else if (method === "get" && callee.expression.getText(sf) === "Deno.env" && firstArg) {
          result.envVars.push({ name: firstArg, line: lineOf(node) });
        }
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText(sf);
      if (owner === "process.env" || owner === "import.meta.env")
        result.envVars.push({ name: node.name.text, line: lineOf(node) });
    } else if (ts.isElementAccessExpression(node)) {
      const owner = node.expression.getText(sf);
      const key = literalText(node.argumentExpression);
      if ((owner === "process.env" || owner === "import.meta.env") && key)
        result.envVars.push({ name: key, line: lineOf(node) });
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node)
    ) {
      const match = URL_PATTERN.exec(node.text);
      if (match?.[1]) result.urls.push({ host: match[1].toLowerCase(), line: lineOf(node) });
      const text = node.text;
      if (
        text.length <= 200 &&
        text !== "/" &&
        !/\s/.test(text) &&
        !/\.[a-z0-9]{2,5}$/i.test(text) &&
        ((text.startsWith("/") && /^\/[A-Za-z0-9_\-./{}:$]*$/.test(text)) ||
          /^[A-Z][A-Za-z0-9_]*\/[A-Z][A-Za-z0-9_]*$/.test(text)) &&
        !endpoints.has(text)
      ) {
        endpoints.add(text);
        result.endpoints.push({
          path: text,
          line: lineOf(node),
          protocol: text.startsWith("/") ? "http" : "grpc",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  result.exports = [...exports].slice(0, 100);
  result.endpoints = result.endpoints.slice(0, 100);
  result.symbols = result.symbols.slice(0, 100);
  result.columnRefs = result.columnRefs.slice(0, 500);
  return result;
}

/** Parses tsconfig/jsconfig text, tolerating comments and trailing commas. */
export function parseJsonc(text: string): Record<string, unknown> | null {
  const parsed = ts.parseConfigFileTextToJson("config.json", text);
  return parsed.error ? null : ((parsed.config ?? null) as Record<string, unknown> | null);
}
