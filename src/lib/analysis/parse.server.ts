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

export interface RawBinding {
  /** name exported by the other module: "default", "*" for a namespace, or a named export */
  imported: string;
  /** name this file uses locally (for re-exports: the name it exports under) */
  local: string;
  /** line of this name, which differs from the statement's line in multi-line imports */
  line?: number;
}

export interface RawImport {
  specifier: string;
  line: number;
  typeOnly: boolean;
  dynamic: boolean;
  bindings: RawBinding[];
  /** `export * from "x"` */
  reexportAll: boolean;
}

export interface RawDataCall {
  method: "from" | "rpc" | "storage" | "prisma";
  name: string;
  receiver: string;
  line: number;
}

export interface RawExportSignature {
  kind: "function" | "class" | "variable" | "type" | "enum" | "default" | "reexport";
  /** number of parameters a caller must pass (functions only) */
  required?: number;
  /** most parameters a caller may pass; null when the function takes rest arguments */
  max?: number | null;
}

export interface RawCall {
  /** local identifier that was called; for `ns.fn()` on a namespace import: the namespace */
  local: string;
  member?: string;
  args: number;
  spread: boolean;
  line: number;
}

export interface ParsedSource {
  imports: RawImport[];
  exports: string[];
  exportSigs: Record<string, RawExportSignature>;
  functions: string[];
  classes: string[];
  envVars: { name: string; line: number; moduleScope: boolean }[];
  urls: { host: string; line: number }[];
  dataCalls: RawDataCall[];
  /** calls whose callee is bound by an import; the engine keeps only the relevant ones */
  calls: RawCall[];
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

const MAX_CALLS_PER_FILE = 600;

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

function signatureOf(fn: TS.SignatureDeclarationBase): RawExportSignature {
  const params = fn.parameters.filter(
    (parameter) => !(ts.isIdentifier(parameter.name) && parameter.name.text === "this"),
  );
  const rest = params.some((parameter) => parameter.dotDotDotToken);
  // Like the compiler: a caller must pass every parameter up to the last one that is required,
  // so optional parameters before a required one are effectively required too.
  let required = 0;
  params.forEach((parameter, index) => {
    if (!parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken)
      required = index + 1;
  });
  return { kind: "function", required, max: rest ? null : params.length };
}

const URL_PATTERN = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:?#]|$)/i;

/** Extracts structural facts from one JS/TS source file using the TypeScript parser. */
export function parseSource(path: string, content: string): ParsedSource {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind(path));
  const lineOf = (node: TS.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const result: ParsedSource = {
    imports: [],
    exports: [],
    exportSigs: {},
    functions: [],
    classes: [],
    envVars: [],
    urls: [],
    dataCalls: [],
    calls: [],
    loc: content.split("\n").filter((line) => line.trim()).length,
  };
  const exports = new Set<string>();
  const sig = (name: string, value: RawExportSignature) => {
    exports.add(name);
    result.exportSigs[name] = value;
  };

  for (const statement of sf.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) result.functions.push(statement.name.text);
      if (exported)
        sig(isDefault ? "default" : (statement.name?.text ?? "default"), signatureOf(statement));
    } else if (ts.isClassDeclaration(statement)) {
      if (statement.name) result.classes.push(statement.name.text);
      if (exported)
        sig(isDefault ? "default" : (statement.name?.text ?? "default"), { kind: "class" });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name);
        const init = declaration.initializer;
        const isFn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        if (isFn) result.functions.push(...names);
        if (exported)
          for (const name of names)
            sig(
              name,
              isFn && ts.isIdentifier(declaration.name)
                ? signatureOf(init as TS.ArrowFunction | TS.FunctionExpression)
                : { kind: "variable" },
            );
      }
    } else if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (exported)
        sig(statement.name.text, { kind: ts.isEnumDeclaration(statement) ? "enum" : "type" });
    } else if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      sig(
        "default",
        ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)
          ? signatureOf(expression)
          : { kind: "default" },
      );
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause))
        statement.exportClause.elements.forEach((element) =>
          sig(element.name.text, { kind: "variable" }),
        );
    }
  }

  // Functions are visited with a depth counter so reads that run at import time are known.
  let functionDepth = 0;
  const enterFunction = (node: TS.Node) =>
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    // instance property initializers run per instance, not at import
    (ts.isPropertyDeclaration(node) && !hasModifier(node, ts.SyntaxKind.StaticKeyword));

  const addEnv = (name: string, node: TS.Node) =>
    result.envVars.push({ name, line: lineOf(node), moduleScope: functionDepth === 0 });

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
        const bindings: RawBinding[] = [];
        if (clause?.name) bindings.push({ imported: "default", local: clause.name.text });
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings))
            bindings.push({ imported: "*", local: clause.namedBindings.name.text });
          else
            for (const element of clause.namedBindings.elements)
              bindings.push({
                imported: (element.propertyName ?? element.name).text,
                local: element.name.text,
                line: lineOf(element),
              });
        }
        result.imports.push({
          specifier,
          line: lineOf(node),
          typeOnly: Boolean(clause?.isTypeOnly) || namedTypeOnly,
          dynamic: false,
          bindings,
          reexportAll: false,
        });
      }
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = literalText(node.moduleSpecifier);
      if (specifier !== null) {
        const bindings: RawBinding[] = [];
        let reexportAll = false;
        if (!node.exportClause) {
          reexportAll = true;
          bindings.push({ imported: "*", local: "*" });
          exports.add(`* from ${specifier}`);
        } else if (ts.isNamespaceExport(node.exportClause)) {
          bindings.push({ imported: "*", local: node.exportClause.name.text });
          sig(node.exportClause.name.text, { kind: "reexport" });
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            bindings.push({
              imported: (element.propertyName ?? element.name).text,
              local: element.name.text,
            });
            sig(element.name.text, { kind: "reexport" });
          }
        }
        result.imports.push({
          specifier,
          line: lineOf(node),
          typeOnly: node.isTypeOnly,
          dynamic: false,
          bindings,
          reexportAll,
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
          bindings: [{ imported: "*", local: node.name.text }],
          reexportAll: false,
        });
      return;
    }

    const functionLike = enterFunction(node);
    if (functionLike) functionDepth += 1;

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const firstArg = literalText(node.arguments[0]);
      if (callee.kind === ts.SyntaxKind.ImportKeyword && firstArg !== null) {
        result.imports.push({
          specifier: firstArg,
          line: lineOf(node),
          typeOnly: false,
          dynamic: true,
          bindings: [{ imported: "*", local: "*" }],
          reexportAll: false,
        });
      } else if (ts.isIdentifier(callee) && callee.text === "require" && firstArg !== null) {
        const parent = node.parent;
        const bindings: RawBinding[] = [];
        if (parent && ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
          for (const element of parent.name.elements)
            if (ts.isIdentifier(element.name))
              bindings.push({
                imported:
                  element.propertyName && ts.isIdentifier(element.propertyName)
                    ? element.propertyName.text
                    : element.name.text,
                local: element.name.text,
              });
        } else bindings.push({ imported: "*", local: "*" });
        result.imports.push({
          specifier: firstArg,
          line: lineOf(node),
          typeOnly: false,
          dynamic: false,
          bindings,
          reexportAll: false,
        });
      } else {
        if (result.calls.length < MAX_CALLS_PER_FILE) {
          const spread = node.arguments.some((argument) => ts.isSpreadElement(argument));
          if (ts.isIdentifier(callee))
            result.calls.push({
              local: callee.text,
              args: node.arguments.length,
              spread,
              line: lineOf(node),
            });
          else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression))
            result.calls.push({
              local: callee.expression.text,
              member: callee.name.text,
              args: node.arguments.length,
              spread,
              line: lineOf(node),
            });
        }
        if (ts.isPropertyAccessExpression(callee)) {
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
            addEnv(firstArg, node);
          }
        }
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText(sf);
      if (owner === "process.env" || owner === "import.meta.env") addEnv(node.name.text, node);
    } else if (ts.isElementAccessExpression(node)) {
      const owner = node.expression.getText(sf);
      const key = literalText(node.argumentExpression);
      if ((owner === "process.env" || owner === "import.meta.env") && key) addEnv(key, node);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node)
    ) {
      const match = URL_PATTERN.exec(node.text);
      if (match?.[1]) result.urls.push({ host: match[1].toLowerCase(), line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
    if (functionLike) functionDepth -= 1;
  };
  visit(sf);

  result.exports = [...exports];
  return result;
}

export interface SyntaxProblem {
  line: number;
  message: string;
}

/** Real syntax errors from the TypeScript parser, with line numbers. */
export function syntaxProblems(path: string, content: string): SyntaxProblem[] {
  const output = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  });
  return (output.diagnostics ?? []).map((diagnostic) => {
    const source = diagnostic.file;
    const line =
      source && diagnostic.start !== undefined
        ? source.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 1;
    return { line, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n") };
  });
}

/** Parses tsconfig/jsconfig text, tolerating comments and trailing commas. */
export function parseJsonc(text: string): Record<string, unknown> | null {
  const parsed = ts.parseConfigFileTextToJson("config.json", text);
  return parsed.error ? null : ((parsed.config ?? null) as Record<string, unknown> | null);
}
