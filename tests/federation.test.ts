import { describe, expect, test } from "bun:test";
import {
  buildContractCatalog,
  federateRepositories,
  parseOpenApiDocument,
  parseProtoDocument,
} from "../src/lib/analysis/federation";
import type {
  AnalyzedFile,
  ContractCatalog,
  EndpointRef,
  RepoAnalysis,
} from "../src/lib/analysis/types";

function file(path: string, endpoints: EndpointRef[]): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: 10,
    packageDir: "",
    role: "api",
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    envVars: [],
    services: [],
    resources: [],
    endpoints,
  };
}

function analysis(files: AnalyzedFile[], contracts?: ContractCatalog): RepoAnalysis {
  return {
    version: 2,
    generatedAt: "2026-01-01T00:00:00.000Z",
    method: "typescript-ast",
    ref: "test",
    packages: [],
    files,
    services: [],
    resources: [],
    envVars: [],
    cycles: [],
    stats: {
      treeFiles: files.length,
      sourceFiles: files.length,
      analyzedFiles: files.length,
      internalEdges: 0,
      externalPackages: 0,
      unresolvedImports: 0,
      skippedFiles: 0,
      loc: files.length * 10,
      durationMs: 1,
    },
    limitations: [],
    ...(contracts ? { contracts } : {}),
  };
}

describe("OpenAPI parsing", () => {
  test("reads JSON operations with ids, tags and schemas", () => {
    const contract = parseOpenApiDocument(
      "api/openapi.json",
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Users API", version: "1.4.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/users/{id}": {
            get: {
              operationId: "getUser",
              summary: "Read a user",
              tags: ["users"],
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
            patch: {
              operationId: "updateUser",
              requestBody: {
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/UserPatch" } },
                },
              },
            },
          },
        },
      }),
    );
    expect(contract).not.toBeNull();
    expect(contract!.title).toBe("Users API");
    expect(contract!.servers).toEqual(["https://api.example.com"]);
    expect(contract!.operations).toHaveLength(2);
    const get = contract!.operations.find((operation) => operation.method === "get")!;
    expect(get.id).toBe("GET /users/{id}");
    expect(get.operationId).toBe("getUser");
    expect(get.tags).toEqual(["users"]);
    expect(get.responseSchema).toBe("User");
    const patch = contract!.operations.find((operation) => operation.method === "patch")!;
    expect(patch.requestSchema).toBe("UserPatch");
  });

  test("reads the supported YAML subset", () => {
    const contract = parseOpenApiDocument(
      "api/openapi.yaml",
      [
        "openapi: 3.0.3",
        "info:",
        "  title: Billing API",
        "  version: 2.1.0",
        "servers:",
        "  - url: https://billing.example.com",
        "paths:",
        "  /invoices/{invoiceId}:",
        "    get:",
        "      operationId: getInvoice",
        "      summary: Read one invoice",
        "      tags: [billing, read]",
        "      responses:",
        "        '200':",
        "          content:",
        "            application/json:",
        "              schema:",
        "                $ref: '#/components/schemas/Invoice'",
        "    post:",
        "      operationId: payInvoice",
      ].join("\n"),
    );
    expect(contract).not.toBeNull();
    expect(contract!.title).toBe("Billing API");
    expect(contract!.version).toBe("2.1.0");
    expect(contract!.servers).toEqual(["https://billing.example.com"]);
    expect(contract!.operations.map((operation) => operation.id)).toEqual([
      "GET /invoices/{invoiceId}",
      "POST /invoices/{invoiceId}",
    ]);
    const get = contract!.operations[0]!;
    expect(get.tags).toEqual(["billing", "read"]);
    expect(get.summary).toBe("Read one invoice");
    expect(get.responseSchema).toBe("Invoice");
  });

  test("returns null instead of throwing on malformed input", () => {
    expect(parseOpenApiDocument("openapi.json", "{ nope")).toBeNull();
    expect(parseOpenApiDocument("openapi.yaml", "paths: [unterminated")).toBeNull();
  });

  test("builds a deduplicated catalog from contract files only", () => {
    const catalog = buildContractCatalog([
      {
        path: "openapi.json",
        text: JSON.stringify({ info: { title: "A" }, paths: { "/a": { get: {} } } }),
      },
      { path: "README.md", text: "# not a contract" },
    ]);
    expect(catalog.openapi).toHaveLength(1);
    expect(catalog.openapi[0]!.operations[0]!.id).toBe("GET /a");
    expect(catalog.grpc).toEqual([]);
  });
});

describe("proto parsing", () => {
  test("extracts services, methods and streaming directions", () => {
    const services = parseProtoDocument(
      "proto/users.proto",
      `
      syntax = "proto3";
      package nykst.users.v1;

      service Users {
        rpc GetUser (GetUserRequest) returns (User);
        rpc WatchUsers (WatchRequest) returns (stream User);
        rpc Upload (stream Chunk) returns (UploadResult) { option deadline = 30; }
      }

      service Health {
        rpc Check (Empty) returns (HealthReply);
      }
      `,
    );
    expect(services).toHaveLength(2);
    expect(services[0]!.id).toBe("nykst.users.v1.Users");
    expect(services[0]!.rpcs).toEqual([
      {
        name: "GetUser",
        request: "GetUserRequest",
        response: "User",
        clientStreaming: false,
        serverStreaming: false,
      },
      {
        name: "WatchUsers",
        request: "WatchRequest",
        response: "User",
        clientStreaming: false,
        serverStreaming: true,
      },
      {
        name: "Upload",
        request: "Chunk",
        response: "UploadResult",
        clientStreaming: true,
        serverStreaming: false,
      },
    ]);
    expect(services[1]!.rpcs[0]!.name).toBe("Check");
  });
});

describe("cross-repository federation", () => {
  const catalog: ContractCatalog = {
    openapi: [
      {
        source: "services/users/openapi.json",
        title: "Users API",
        version: "1.0.0",
        servers: ["https://users.example.com"],
        operations: [
          {
            id: "GET /v1/users/{id}",
            source: "services/users/openapi.json",
            path: "/v1/users/{id}",
            method: "get",
            operationId: "getUser",
            tags: ["users"],
          },
          {
            id: "GET /v1/health",
            source: "services/users/openapi.json",
            path: "/v1/health",
            method: "get",
            operationId: "health",
            tags: [],
          },
        ],
      },
    ],
    grpc: [
      {
        id: "nykst.auth.v1.AuthService",
        source: "proto/auth.proto",
        package: "nykst.auth.v1",
        name: "AuthService",
        rpcs: [
          {
            name: "Verify",
            request: "VerifyRequest",
            response: "VerifyReply",
            clientStreaming: false,
            serverStreaming: false,
          },
        ],
      },
    ],
  };

  test("links consumer call sites to provider operations across repositories", () => {
    const result = federateRepositories([
      {
        repository: "flawsom/users-service",
        analysis: analysis([file("src/server.ts", [])], catalog),
      },
      {
        repository: "flawsom/web",
        analysis: analysis([
          file("src/lib/users.ts", [
            { path: "/v1/users/42?expand=team", line: 12, protocol: "http" },
            { path: "/v1/health", line: 20, protocol: "http" },
            { path: "/nykst.auth.v1.AuthService/Verify", line: 31, protocol: "grpc" },
            { path: "/v1/unknown", line: 44, protocol: "http" },
          ]),
        ]),
      },
    ]);

    expect(result.repositories).toBe(2);
    expect(result.operations).toBe(2);
    expect(result.services).toBe(1);
    expect(result.unmatchedEndpoints).toBe(1);
    expect(result.edges).toEqual([
      {
        fromRepository: "flawsom/web",
        fromPath: "src/lib/users.ts",
        line: 12,
        toRepository: "flawsom/users-service",
        operationId: "getUser",
        protocol: "openapi",
        matchedBy: "template",
      },
      {
        fromRepository: "flawsom/web",
        fromPath: "src/lib/users.ts",
        line: 20,
        toRepository: "flawsom/users-service",
        operationId: "health",
        protocol: "openapi",
        matchedBy: "exact",
      },
      {
        fromRepository: "flawsom/web",
        fromPath: "src/lib/users.ts",
        line: 31,
        toRepository: "flawsom/users-service",
        operationId: "nykst.auth.v1.AuthService/Verify",
        protocol: "grpc",
        matchedBy: "grpc-method",
      },
    ]);
    expect(result.limitations.some((item) => item.includes("wildcards"))).toBe(true);
  });

  test("keeps same-repository contract edges and reports empty catalogs", () => {
    const same = federateRepositories([
      {
        repository: "flawsom/app",
        analysis: analysis(
          [file("src/client.ts", [{ path: "/v1/health", line: 3, protocol: "http" }])],
          catalog,
        ),
      },
    ]);
    expect(same.edges).toHaveLength(1);
    expect(same.edges[0]!.fromRepository).toBe("flawsom/app");
    expect(same.edges[0]!.toRepository).toBe("flawsom/app");

    const empty = federateRepositories([
      { repository: "flawsom/empty", analysis: analysis([file("src/index.ts", [])]) },
    ]);
    expect(empty.operations).toBe(0);
    expect(empty.limitations[0]).toContain("No OpenAPI or gRPC contracts");
  });
});
