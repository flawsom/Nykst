# Nykst MCP contract

Endpoint: `POST /api/mcp` (Streamable HTTP, JSON responses)
Schema: `GET /api/mcp/schema` and `docs/mcp-tools.json`
Protocol versions: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`
Authentication: `Authorization: Bearer nyk_...`

The schema is generated from `src/lib/analysis/tools.ts` by `bun run mcp:schema`.
`tests/mcp-contract.test.ts` fails when the committed schema and the executed
catalog disagree.

## Requests

`initialize` returns the negotiated protocol version, capabilities and server
info. `tools/list` returns the eleven tools with their input schemas and
annotations. `tools/call` takes a tool `name` and an `arguments` object.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "get_impact",
    "arguments": { "paths": ["src/lib/analysis/engine.server.ts"] }
  }
}
```

## Responses

A successful tool call returns the JSON-RPC result envelope below. The text
block is the same JSON as `structuredContent`, so both text-only and structured
clients see identical evidence.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [{ "type": "text", "text": "{ ... }" }],
    "structuredContent": { "repository": "flawsom/nykst", "commit": "HEAD" },
    "isError": false
  }
}
```

Repository-scoped tools include `repository`, `commit` and `analyzed_at`.
`search_files` returns `results`; `get_impact` returns `impact`, `entrypoints`
and `limitations`; `get_federation` returns `operations`, `edges`, `unmatched`
and `repositories`; `get_trace_overlay` returns `spans`, `matchedSpans`,
`coverage`, `files`, `edges` and `unmatchedSpans`.

## Errors

Transport and protocol errors use JSON-RPC error codes:

| Code     | Meaning                                               |
| :------- | :---------------------------------------------------- |
| `-32700` | Parse error                                           |
| `-32600` | Invalid request                                       |
| `-32601` | Method not found                                      |
| `-32001` | Missing, placeholder, unknown or revoked access token |

A tool-level failure (unknown path, missing argument, snapshot without usage
evidence) is returned as a successful JSON-RPC response with `isError: true`
and a readable message in `content`. That keeps the agent's retry loop in the
same channel instead of losing the request.

## Read-only guarantee

All eleven tools carry `readOnlyHint: true`. None writes to a repository,
snapshot or database row. `simulate_change`, `run_safe_code_loop`,
`generate_fix_patch`, `get_federation` and `get_trace_overlay` operate on
clones or pure functions. Simulation results state `"persisted": false`.

`generate_fix_patch` returns a diff only when the verified breaking score falls
without adding a cycle; otherwise it refuses with a reason. A clean overlay is
not a full TypeScript assignability proof or a test run, and it is never
presented as one.
