/**
 * Setup guides for connecting AI coding agents to Nykst's MCP endpoint. Each guide renders
 * its snippets from the endpoint URL and an access token (or a placeholder), so the /mcp
 * page can fill in the real values as soon as a token is created.
 *
 * Formats were checked against each tool's own documentation (Claude Code, Cursor, VS Code,
 * Codex, Gemini CLI, Cline, Zed, Windsurf, mcp-remote). Claude Code and the Codex CLI
 * commands were also run against a local Nykst endpoint.
 */

export const PRODUCTION_ORIGIN = "https://nykst-software-intellegence.shuzalniraula.workers.dev";
export const TOKEN_PLACEHOLDER = "YOUR_NYKST_TOKEN";

export type GuideContext = { url: string; token: string };

export type Snippet = {
  /** Short label above the block, e.g. "Terminal" or "~/.cursor/mcp.json". */
  title: string;
  language: "bash" | "json" | "toml" | "markdown";
  code: (ctx: GuideContext) => string;
  /** Extra explanation shown under the block. */
  note?: string;
};

export type Guide = {
  id: string;
  name: string;
  /** One line under the tab, shown before the steps. */
  summary: string;
  steps: string[];
  snippets: Snippet[];
  /** How to confirm the connection worked in this tool. */
  verify: string;
  /** Known limits or gotchas for this tool. */
  caveat?: string;
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

const vscodeConfig = (url: string) =>
  json({
    servers: {
      nykst: {
        type: "http",
        url,
        headers: { Authorization: "Bearer ${input:nykst-token}" },
      },
    },
    inputs: [
      {
        type: "promptString",
        id: "nykst-token",
        description: "Nykst access token",
        password: true,
      },
    ],
  });

export const GUIDES: Guide[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    summary: "One command. Nykst is then available in every project.",
    steps: [
      "Make sure Claude Code is installed: running claude --version in a terminal should print a version.",
      "Run the command below in any terminal (macOS, Linux, Windows PowerShell or Command Prompt).",
      "Start Claude Code and type /mcp. nykst should be listed as connected.",
    ],
    snippets: [
      {
        title: "Terminal",
        language: "bash",
        code: ({ url, token }) =>
          `claude mcp add --transport http --scope user nykst ${url} --header "Authorization: Bearer ${token}"`,
        note: "--scope user makes it available in all your projects. Drop it to add Nykst to the current project only.",
      },
      {
        title: "Share with your team: .mcp.json in the repo root",
        language: "json",
        code: ({ url }) =>
          json({
            mcpServers: {
              nykst: {
                type: "http",
                url,
                headers: { Authorization: "Bearer ${NYKST_TOKEN}" },
              },
            },
          }),
        note: "Commit this file, not your token. Each teammate creates their own token and exports NYKST_TOKEN in their shell.",
      },
    ],
    verify: "claude mcp list shows nykst as ✔ Connected, or type /mcp inside a session.",
  },
  {
    id: "cursor",
    name: "Cursor",
    summary: "Add a server to Cursor's MCP config file.",
    steps: [
      "Open ~/.cursor/mcp.json (all projects) or .cursor/mcp.json (this project). Create it if it doesn't exist.",
      "Paste the block below. If the file already lists servers, add only the nykst entry inside mcpServers.",
      "Open Cursor Settings → MCP. nykst should show a green dot and its tools.",
    ],
    snippets: [
      {
        title: "~/.cursor/mcp.json",
        language: "json",
        code: ({ url, token }) =>
          json({ mcpServers: { nykst: { url, headers: { Authorization: `Bearer ${token}` } } } }),
        note: 'For a config file you commit to git, use "Bearer ${env:NYKST_TOKEN}" instead of the token and set that environment variable.',
      },
    ],
    verify:
      "Cursor Settings → MCP lists nykst with a green dot. In chat, agent mode can now call its tools.",
  },
  {
    id: "vscode",
    name: "VS Code",
    summary: "GitHub Copilot agent mode. VS Code asks for the token, so it never sits in a file.",
    steps: [
      "You need VS Code with GitHub Copilot signed in. MCP servers run in Copilot Chat's Agent mode.",
      "Create .vscode/mcp.json in your project (or run the command MCP: Open User Configuration for all projects).",
      "Paste the first block below into that file. It is file content, not a terminal command. Or use one of the terminal options, which create the file for you.",
      "VS Code shows a Start button above the server entry. Click it and paste your token when prompted.",
      "Open Copilot Chat in Agent mode and check the tools icon for nykst.",
    ],
    snippets: [
      {
        title: ".vscode/mcp.json",
        language: "json",
        code: ({ url }) => vscodeConfig(url),
        note: "This is the content of a file. Open or create .vscode/mcp.json in VS Code and paste it there. Don't paste it into a terminal.",
      },
      {
        title: "Or create the file from a terminal (Windows PowerShell)",
        language: "bash",
        code: ({ url }) =>
          `New-Item -ItemType Directory -Force .vscode | Out-Null\n@'\n${vscodeConfig(url)}\n'@ | Set-Content .vscode\\mcp.json`,
        note: "Run it in your project folder. It writes the file for you.",
      },
      {
        title: "Or create the file from a terminal (macOS/Linux)",
        language: "bash",
        code: ({ url }) =>
          `mkdir -p .vscode\ncat > .vscode/mcp.json <<'EOF'\n${vscodeConfig(url)}\nEOF`,
        note: "Run it in your project folder. It writes the file for you.",
      },
    ],
    verify:
      "The tools icon in Copilot Chat (Agent mode) lists Nykst's tools. If there is an error, run the command MCP: List Servers, choose nykst and pick Show Output to read it.",
  },
  {
    id: "codex",
    name: "Codex CLI",
    summary: "Codex reads the token from an environment variable.",
    steps: [
      "Put your token in an environment variable, for example in ~/.zshrc or ~/.bashrc.",
      "Register the server.",
      "Restart Codex.",
    ],
    snippets: [
      {
        title: "Terminal (macOS/Linux)",
        language: "bash",
        code: ({ url, token }) =>
          `export NYKST_TOKEN="${token}"\ncodex mcp add nykst --url ${url} --bearer-token-env-var NYKST_TOKEN`,
      },
      {
        title: "Terminal (Windows PowerShell)",
        language: "bash",
        code: ({ url, token }) =>
          `setx NYKST_TOKEN "${token}"\n# Close and reopen the terminal, then:\ncodex mcp add nykst --url ${url} --bearer-token-env-var NYKST_TOKEN`,
        note: "export doesn't exist on Windows. setx saves the variable for new terminals.",
      },
      {
        title: "Or edit ~/.codex/config.toml",
        language: "toml",
        code: ({ url }) =>
          `[mcp_servers.nykst]\nurl = "${url}"\nbearer_token_env_var = "NYKST_TOKEN"`,
        note: "Use .codex/config.toml in a project to scope it to that project.",
      },
    ],
    verify: "codex mcp list shows nykst as enabled with a Bearer token.",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    summary: "One command, or edit settings.json.",
    steps: ["Run the command below.", "Start Gemini CLI and run /mcp to see nykst and its tools."],
    snippets: [
      {
        title: "Terminal",
        language: "bash",
        code: ({ url, token }) =>
          `gemini mcp add --transport http --header "Authorization: Bearer ${token}" nykst ${url}`,
      },
      {
        title: "Or edit ~/.gemini/settings.json",
        language: "json",
        code: ({ url, token }) =>
          json({
            mcpServers: { nykst: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } },
          }),
        note: "Use .gemini/settings.json in a project to scope it to that project.",
      },
    ],
    verify: "/mcp inside Gemini CLI lists nykst and its tools.",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    summary: "Add a server from Cascade's MCP settings.",
    steps: [
      "In Cascade, open the MCP servers panel and choose Configure. This opens your mcp_config.json.",
      "Add the nykst entry to mcpServers. Windsurf reads the token from an environment variable, so export NYKST_TOKEN first and restart Windsurf.",
      "Press Refresh in the MCP panel.",
    ],
    snippets: [
      {
        title: "mcp_config.json",
        language: "json",
        code: ({ url }) =>
          json({
            mcpServers: {
              nykst: { serverUrl: url, headers: { Authorization: "Bearer ${env:NYKST_TOKEN}" } },
            },
          }),
      },
      {
        title: "Terminal (macOS/Linux)",
        language: "bash",
        code: ({ token }) => `export NYKST_TOKEN="${token}"`,
        note: "Put it in ~/.zshrc or ~/.bashrc so it survives restarts.",
      },
      {
        title: "Terminal (Windows PowerShell)",
        language: "bash",
        code: ({ token }) => `setx NYKST_TOKEN "${token}"`,
        note: "Restart Windsurf afterwards so it picks up the variable.",
      },
    ],
    verify: "The MCP panel lists nykst with its tools enabled.",
  },
  {
    id: "cline",
    name: "Cline",
    summary: "For the Cline extension in VS Code and other editors.",
    steps: [
      "Click the MCP Servers icon in Cline, open the Configure tab and choose Configure MCP Servers.",
      "Paste the entry below into cline_mcp_settings.json.",
    ],
    snippets: [
      {
        title: "cline_mcp_settings.json",
        language: "json",
        code: ({ url, token }) =>
          json({
            mcpServers: {
              nykst: {
                type: "streamableHttp",
                url,
                headers: { Authorization: `Bearer ${token}` },
                disabled: false,
                autoApprove: [],
              },
            },
          }),
      },
    ],
    verify: "nykst shows a green dot in Cline's MCP Servers list.",
  },
  {
    id: "zed",
    name: "Zed",
    summary: "Zed calls MCP servers context servers.",
    steps: ["Open Zed's settings.json (Cmd/Ctrl + ,) and add the entry below."],
    snippets: [
      {
        title: "settings.json",
        language: "json",
        code: ({ url, token }) =>
          json({
            context_servers: { nykst: { url, headers: { Authorization: `Bearer ${token}` } } },
          }),
      },
    ],
    verify: "In the Agent panel's settings, nykst shows a green indicator.",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    summary: "Uses a small bridge, because the desktop config only starts local programs.",
    steps: [
      "Install Node.js (nodejs.org) if you don't have it.",
      "In Claude Desktop, open Settings → Developer → Edit Config.",
      "Paste the entry below into claude_desktop_config.json, then quit and reopen Claude Desktop.",
    ],
    snippets: [
      {
        title: "claude_desktop_config.json",
        language: "json",
        code: ({ url, token }) =>
          json({
            mcpServers: {
              nykst: {
                command: "npx",
                args: ["-y", "mcp-remote", url, "--header", "Authorization:${NYKST_AUTH}"],
                env: { NYKST_AUTH: `Bearer ${token}` },
              },
            },
          }),
        note: "The token is in an env value on purpose: mcp-remote breaks on spaces inside args on some systems.",
      },
    ],
    verify: 'Click the connectors icon under the chat box. "nykst" and its tools are listed.',
    caveat:
      "Claude.ai on the web and Claude's custom connectors need OAuth sign-in, which Nykst doesn't offer yet. Use Claude Code or this bridge.",
  },
  {
    id: "other",
    name: "Any other client",
    summary: "Nykst speaks standard MCP over HTTP, so anything that supports remote servers works.",
    steps: [
      "Add a remote server with the Streamable HTTP transport.",
      "Set the URL and the Authorization header below.",
      "If your client only supports local (stdio) servers, run it through mcp-remote, as in the Claude Desktop guide.",
    ],
    snippets: [
      {
        title: "Connection details",
        language: "bash",
        code: ({ url, token }) =>
          `URL:        ${url}\nTransport:  Streamable HTTP\nHeader:     Authorization: Bearer ${token}`,
      },
      {
        title: "Test it from a terminal",
        language: "bash",
        code: ({ url, token }) =>
          `curl -s -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${token}" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        note: "A list of nine tools means the token and URL are correct.",
      },
    ],
    verify: "The curl command returns the nine tools.",
  },
];

export type ToolGroup = { title: string; blurb: string; tools: Tool[] };
export type Tool = {
  name: string;
  summary: string;
  /** True only for tools that change anything (just `remember`, which adds a note). */
  writes?: boolean;
};

export const TOOL_GROUPS: ToolGroup[] = [
  {
    title: "See what a change will break",
    blurb: "Read-only questions about the code graph.",
    tools: [
      {
        name: "get_impact",
        summary:
          "Files, page and API routes, and tests affected by changing the paths you give it, with exact import lines and recent history.",
      },
      {
        name: "find_usages",
        summary:
          "Every file and line that touches a database table, an external service or an environment variable.",
      },
      {
        name: "get_architecture",
        summary:
          "Overview of the repository: areas, external services, data, most depended-on files, circular imports.",
      },
      { name: "search_files", summary: "Find files by path or exported symbol name." },
    ],
  },
  {
    title: "Know the history",
    blurb: "What the team and the repository already know.",
    tools: [
      {
        name: "get_memory",
        summary:
          "Notes, decisions, gotchas and bug-fix explanations recorded for files or folders. Read before changing code that has a history.",
      },
      {
        name: "get_findings",
        summary:
          "Provable problems with file and line evidence: import cycles, unresolved imports, undeclared packages, hot files with no tests, orphaned files.",
      },
    ],
  },
  {
    title: "Check and remember",
    blurb: "Check an edit before it lands, and leave a note for the next person.",
    tools: [
      {
        name: "verify_change",
        summary:
          "Pass the new content of the files you edited. Nykst checks it against the graph for removed exports still in use, changed signatures, unresolved imports, new cycles and syntax errors, and says what it could not check. It does not write anything.",
      },
      {
        name: "remember",
        writes: true,
        summary:
          "Saves a note (a decision, a gotcha, a bug fix) on a file, a folder or the whole repository. This is the only tool that writes, and it only adds a note. Notes can hold no secrets.",
      },
    ],
  },
];

export const LIST_REPOSITORIES_NOTE =
  "list_repositories also shows which repositories you have mapped. Your agent calls it when it needs to pick one.";

export const EXAMPLE_PROMPTS = [
  "Before you change src/lib/auth.ts, use Nykst get_impact and tell me what breaks.",
  "Which code reads or writes the users table? Use Nykst find_usages.",
  "Check Nykst get_memory and get_findings for src/lib/billing.ts before editing it.",
  "After writing the change, run Nykst verify_change on the files you edited and fix anything it reports.",
];

export const CAN_AND_CANNOT = {
  can: [
    "Read the analysis of repositories you mapped: file paths, exports, import connections, history, findings.",
    "Add notes with remember. Notes are stored in Nykst, and you can see what was added.",
    "Check proposed edits with verify_change. The check only reports; it saves nothing.",
  ],
  cannot: [
    "Write to your repository, open pull requests or push commits. Nykst's GitHub access is read-only.",
    "Edit or delete existing notes, or change anything besides adding a note.",
    "Keep working once you revoke the token. You can revoke any token in step 2.",
  ],
};

/** Instruction text that makes agents consult Nykst before editing, for the repo's rules file. */
export const AGENT_RULES = `## Nykst (code impact)
Before changing code, use the Nykst MCP tools:
- Call get_impact with the files you plan to edit. Read the direct importers, the affected routes and the tests it lists.
- Call get_memory and get_findings for those files, and respect the notes you find.
- Call find_usages for any database table, external service or environment variable you touch.
After writing the change, call verify_change with the full new content of every file you edited and fix what it reports. Run the tests Nykst listed and mention anything it flagged in your summary.
If you learn something the next person should know, save it with remember. Never put secrets in a note.`;

export const RULE_FILES = [
  { tool: "Claude Code", file: "CLAUDE.md" },
  { tool: "Codex, Cursor, Windsurf and others", file: "AGENTS.md" },
  { tool: "Cursor", file: ".cursor/rules/nykst.mdc" },
  { tool: "GitHub Copilot", file: ".github/copilot-instructions.md" },
];
