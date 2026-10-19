import type TS from "typescript";

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
    loc: content.split("\n").filter((line) => line.trim()).length,
  };
  const exports = new Set<string>();
  const endpoints = new Set<string>();

  for (const statement of sf.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) result.functions.push(statement.name.text);
      if (exported) exports.add(isDefault ? "default" : (statement.name?.text ?? "default"));
    } else if (ts.isClassDeclaration(statement)) {
      if (statement.name) result.classes.push(statement.name.text);
      if (exported) exports.add(isDefault ? "default" : (statement.name?.text ?? "default"));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
          result.functions.push(...names);
        if (exported) names.forEach((name) => exports.add(name));
      }
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (exported) exports.add(statement.name.text);
    } else if (ts.isExportAssignment(statement)) {
      exports.add("default");
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        statement.exportClause.elements.forEach((element) => exports.add(element.name.text));
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
        if (!node.exportClause) exports.add(`* from ${specifier}`);
        else if (ts.isNamedExports(node.exportClause))
          node.exportClause.elements.forEach((element) => exports.add(element.name.text));
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

  result.exports = [...exports];
  result.endpoints = result.endpoints.slice(0, 100);
  return result;
}

/** Parses tsconfig/jsconfig text, tolerating comments and trailing commas. */
export function parseJsonc(text: string): Record<string, unknown> | null {
  const parsed = ts.parseConfigFileTextToJson("config.json", text);
  return parsed.error ? null : ((parsed.config ?? null) as Record<string, unknown> | null);
}
