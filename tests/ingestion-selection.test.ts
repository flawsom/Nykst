import { describe, expect, test } from "bun:test";
import { wantsContent } from "../src/lib/analysis/engine.server";

/**
 * Repositories do not all look like src/lib and src/routes. Files that carry
 * dependency or contract evidence must be read wherever the repository keeps
 * them, and build output must never be read.
 */
describe("ingested file selection", () => {
  test("reads SQL DDL from any directory, not only migrations/", () => {
    for (const path of [
      "supabase/migrations/20260101000000_init.sql",
      "db/schema.sql",
      "app/backend/tables.sql",
      "sql/001_users.sql",
      "schema.sql",
    ])
      expect(wantsContent(path, 2048), path).toBe(true);
  });

  test("reads tsconfig, jsconfig and monorepo package configs anywhere", () => {
    for (const path of [
      "tsconfig.json",
      "jsconfig.json",
      "packages/app/tsconfig.json",
      "apps/web/lib/tsconfig.build.json",
      "package.json",
      "packages/api/package.json",
    ])
      expect(wantsContent(path, 1024), path).toBe(true);
  });

  test("reads contracts and polyglot sources in any directory", () => {
    for (const path of [
      "contracts/openapi.yaml",
      "api/swagger.json",
      "proto/payments/v1/pay.proto",
      "backend/main.py",
      "cmd/server/main.go",
      "pkg/lib.rs",
      "prisma/schema.prisma",
    ])
      expect(wantsContent(path, 4096), path).toBe(true);
  });

  test("skips build output and oversized files", () => {
    expect(wantsContent("node_modules/pkg/x.ts", 100)).toBe(false);
    expect(wantsContent("dist/app.js", 100)).toBe(false);
    expect(wantsContent("src/lib/core.ts", 5 * 1024 * 1024)).toBe(false);
  });
});
