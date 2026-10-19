import { describe, expect, test } from "bun:test";
import {
  parsePolyglot,
  polyglotLanguageOf,
  polyglotRole,
  resolvePolyglotImport,
} from "../src/lib/analysis/polyglot";

const PATHS = new Set([
  "app/main.py",
  "app/__init__.py",
  "app/services/__init__.py",
  "app/services/user.py",
  "shared/models.py",
  "cmd/server/main.go",
  "internal/store/users.go",
  "internal/store/users_test.go",
  "src/lib.rs",
  "src/models.rs",
  "src/api/handler.rs",
  "src/api/mod.rs",
]);

describe("polyglot adapters", () => {
  test("detects the language from the path", () => {
    expect(polyglotLanguageOf("app/main.py")).toBe("py");
    expect(polyglotLanguageOf("cmd/server/main.go")).toBe("go");
    expect(polyglotLanguageOf("src/lib.rs")).toBe("rust");
    expect(polyglotLanguageOf("src/main.ts")).toBeNull();
  });

  test("extracts Python imports, public symbols, env vars and endpoints", () => {
    const parsed = parsePolyglot(
      "app/main.py",
      [
        "from .services.user import get_user",
        "import os",
        "import requests",
        'DATABASE_URL = os.getenv("DATABASE_URL")',
        "",
        "def main():",
        "    return get_user()",
        "",
        '@app.get("/api/users")',
        "async def list_users():",
        '    return requests.get("https://api.github.com/user")',
      ].join("\n"),
    );

    expect(parsed.imports.map((item) => item.specifier)).toEqual([
      ".services.user",
      "os",
      "requests",
    ]);
    expect(parsed.functions).toContain("main");
    expect(parsed.functions).toContain("list_users");
    expect(parsed.exports).toContain("main");
    expect(parsed.envVars).toContainEqual({ name: "DATABASE_URL", line: 4 });
    expect(parsed.endpoints).toContainEqual({ path: "/api/users", line: 9, protocol: "http" });
    expect(parsed.urls).toContainEqual({ host: "api.github.com", line: 11 });
  });

  test("resolves Python relative and absolute imports without guessing", () => {
    expect(resolvePolyglotImport("app/main.py", ".services.user", PATHS)).toEqual([
      { kind: "internal", target: "app/services/user.py" },
    ]);
    expect(resolvePolyglotImport("app/main.py", "shared.models", PATHS)).toEqual([
      { kind: "internal", target: "shared/models.py" },
    ]);
    expect(resolvePolyglotImport("app/main.py", "requests", PATHS)).toEqual([
      { kind: "external", target: "requests" },
    ]);
    expect(resolvePolyglotImport("app/main.py", "os", PATHS)).toEqual([
      { kind: "builtin", target: "os" },
    ]);
  });

  test("resolves Go package imports to every non-test file in the package", () => {
    const parsed = parsePolyglot(
      "cmd/server/main.go",
      [
        "package main",
        "",
        "import (",
        '  "fmt"',
        '  "example.com/app/internal/store"',
        '  "github.com/gin-gonic/gin"',
        ")",
        "",
        "func main() {",
        '  store.Open(os.Getenv("DATABASE_URL"))',
        "}",
      ].join("\n"),
    );

    expect(parsed.imports.map((item) => item.specifier)).toEqual([
      "fmt",
      "example.com/app/internal/store",
      "github.com/gin-gonic/gin",
    ]);
    expect(parsed.functions).toContain("main");
    expect(parsed.envVars).toContainEqual({ name: "DATABASE_URL", line: 10 });
    expect(
      resolvePolyglotImport(
        "cmd/server/main.go",
        "example.com/app/internal/store",
        PATHS,
        "example.com/app",
      ),
    ).toEqual([{ kind: "internal", target: "internal/store/users.go" }]);
    expect(
      resolvePolyglotImport(
        "cmd/server/main.go",
        "github.com/gin-gonic/gin",
        PATHS,
        "example.com/app",
      ),
    ).toEqual([{ kind: "external", target: "github.com/gin-gonic/gin" }]);
  });

  test("resolves Rust crate, self and mod paths", () => {
    const parsed = parsePolyglot(
      "src/api/handler.rs",
      [
        "use crate::models::User;",
        "use serde::Deserialize;",
        "mod nested;",
        "pub fn handle() {",
        '    let _ = std::env::var("DATABASE_URL");',
        "}",
      ].join("\n"),
    );

    expect(parsed.imports.map((item) => item.specifier)).toEqual([
      "crate::models::User",
      "serde",
      "mod:nested",
    ]);
    expect(parsed.functions).toContain("handle");
    expect(parsed.exports).toContain("handle");
    expect(parsed.envVars).toContainEqual({ name: "DATABASE_URL", line: 5 });
    expect(resolvePolyglotImport("src/api/handler.rs", "crate::models::User", PATHS)).toEqual([
      { kind: "internal", target: "src/models.rs" },
    ]);
    expect(resolvePolyglotImport("src/api/handler.rs", "mod:nested", PATHS)).toEqual([
      { kind: "unresolved", target: "src/api/nested.rs" },
    ]);
  });

  test("assigns honest roles to polyglot files", () => {
    expect(polyglotRole("tests/test_auth.py")).toBe("test");
    expect(polyglotRole("cmd/server/main.go")).toBe("server");
    expect(polyglotRole("internal/store/users_test.go")).toBe("test");
    expect(polyglotRole("src/lib.rs")).toBe("lib");
  });
});
