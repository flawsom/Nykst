import type TS from "typescript";
import type {
  ColumnRef,
  ExportedSymbol,
  ImportedSymbolUsage,
  ReExportRef,
  SymbolParameter,
  SymbolProperty,
} from "./types";

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
  importedSymbolUsages?: ImportedSymbolUsage[];
  reExports: ReExportRef[];
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

function mergeOverloads(sf: TS.SourceFile, declarations: TS.FunctionDeclaration[]) {
  // Overload signatures (no body) define the public contract. The implementation
  // signature is intentionally excluded when explicit overloads exist.
  const signatures = declarations.filter((declaration) => !declaration.body);
  const contract = signatures.length ? signatures : declarations;
  const widest = [...contract].sort((a, b) => b.parameters.length - a.parameters.length)[0]!;
  const parameterSets = contract.map((declaration) => parametersOf(sf, declaration.parameters));
  const hasRest = parameterSets.some((set) => set.parameters.some((parameter) => parameter.rest));
  return {
    ...parametersOf(sf, widest.parameters),
    requiredArity: Math.min(...parameterSets.map((set) => set.requiredArity)),
    arity: hasRest
      ? parameterSets.reduce((max, set) => Math.max(max, set.arity), 0)
      : Math.max(...parameterSets.map((set) => set.arity)),
    overloadCount: signatures.length || undefined,
    returnType: typeText(sf, contract.find((declaration) => declaration.type)?.type ?? widest.type),
  };
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
    importedSymbolUsages: [],
    reExports: [],
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
  const exportedFunctions = new Map<string, TS.FunctionDeclaration[]>();
  for (const statement of sf.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const list = exportedFunctions.get(statement.name.text) ?? [];
    list.push(statement);
    exportedFunctions.set(statement.name.text, list);
  }

  for (const statement of sf.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    const line = lineOf(statement);
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) result.functions.push(statement.name.text);
      if (exported) {
        const name = isDefault ? "default" : (statement.name?.text ?? "default");
        exports.add(name);
        const overloads = statement.name ? (exportedFunctions.get(statement.name.text) ?? []) : [];
        addSymbol({
          ...(overloads.length > 1
            ? mergeOverloads(sf, overloads)
            : (signatureForStatement(sf, statement, line) ?? {})),
          name,
          kind: "function",
          line,
        } as ExportedSymbol);
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

  // Record syntax-level bindings. This does not perform type resolution or scope analysis.
  const bindings = new Map<string, ImportedSymbolUsage>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const specifier = literalText(statement.moduleSpecifier);
    if (specifier === null) continue;
    const clause = statement.importClause;
    const add = (importedName: string, localName: string, isTypeOnly: boolean) => {
      const usage: ImportedSymbolUsage = {
        specifier,
        importedName,
        localName,
        importLine: lineOf(statement),
        isTypeOnly,
        callSites: [],
        propertyAccesses: [],
      };
      bindings.set(localName, usage);
      result.importedSymbolUsages!.push(usage);
    };
    if (clause.name) add("default", clause.name.text, clause.isTypeOnly);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
      add("*", clause.namedBindings.name.text, clause.isTypeOnly);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
      for (const element of clause.namedBindings.elements)
        add(
          element.propertyName?.text ?? element.name.text,
          element.name.text,
          clause.isTypeOnly || element.isTypeOnly,
        );
  }

  // Lexical shadowing: an inner declaration of the same name is a different value,
  // so it must not be attributed to a top-level import binding.
  const scopeStack: Set<string>[] = [];
  const isShadowed = (name: string) => scopeStack.some((scope) => scope.has(name));

  function declarationNamesInScope(node: TS.Node): string[] {
    const names: string[] = [];
    const addStatement = (statement: TS.Statement) => {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations)
          names.push(...bindingNames(declaration.name));
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name
      ) {
        names.push(statement.name.text);
      }
    };
    if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters ?? []) names.push(...bindingNames(parameter.name));
      const body = (node as { body?: TS.ConciseBody }).body;
      if (body && ts.isBlock(body))
        for (const statement of body.statements) addStatement(statement);
    } else if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      for (const statement of node.statements) addStatement(statement);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      names.push(...bindingNames(node.variableDeclaration.name));
    }
    return names;
  }

  const visit = (node: TS.Node) => {
    const opensScope = ts.isFunctionLike(node) || ts.isBlock(node) || ts.isModuleBlock(node);
    if (opensScope) {
      const names = declarationNamesInScope(node);
      if (names.length) scopeStack.push(new Set(names));
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && !isShadowed(node.expression.text)) {
        const usage = bindings.get(node.expression.text);
        if (usage)
          usage.callSites.push({
            line: lineOf(node),
            argCount: node.arguments.length,
            hasSpreadArg: node.arguments.some(ts.isSpreadElement),
          });
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const namespace = node.expression.expression;
        if (ts.isIdentifier(namespace) && !isShadowed(namespace.text)) {
          const usage = bindings.get(namespace.text);
          if (usage && usage.importedName === "*") {
            const member = node.expression.name.text;
            usage.callSites.push({
              line: lineOf(node),
              argCount: node.arguments.length,
              hasSpreadArg: node.arguments.some(ts.isSpreadElement),
              member,
            });
          }
        }
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      !isShadowed(node.expression.text)
    ) {
      const usage = bindings.get(node.expression.text);
      if (usage) usage.propertyAccesses.push({ property: node.name.text, line: lineOf(node) });
    }
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
          result.reExports.push({
            specifier,
            line: lineOf(node),
            exportedName: "*",
            importedName: "*",
            typeOnly: node.isTypeOnly,
          });
          addSymbol({ name: `* from ${specifier}`, kind: "re-export", line: lineOf(node) });
        } else if (ts.isNamedExports(node.exportClause))
          node.exportClause.elements.forEach((element) => {
            const importedName = element.propertyName?.text ?? element.name.text;
            exports.add(element.name.text);
            result.reExports.push({
              specifier,
              line: lineOf(node),
              exportedName: element.name.text,
              importedName,
              typeOnly: node.isTypeOnly || element.isTypeOnly,
            });
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
    if (opensScope && declarationNamesInScope(node).length) scopeStack.pop();
  };
  visit(sf);

  result.exports = [...exports].slice(0, 100);
  result.reExports = result.reExports.slice(0, 100);
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
