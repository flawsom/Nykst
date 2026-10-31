import { Bot, Braces, Database, FileJson2, ShieldCheck } from "lucide-react";
import { TOOLS } from "@/lib/mcp-guides";
import { SectionLabel } from "@/components/site/SectionLabel";

const CLIENTS = [
  "Claude Code",
  "Cursor",
  "VS Code",
  "Codex",
  "Windsurf",
  "Gemini CLI",
  "Cline",
  "Zed",
];

const INPUTS = ["TypeScript", "Python", "Go", "Rust", "SQL migrations", "OpenAPI", "gRPC"];

export function WorksWith() {
  return (
    <div className="border-border/70 bg-surface/25 relative z-20 border-y">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:gap-10">
        <div>
          <SectionLabel icon={<ShieldCheck className="size-3.5" />}>
            Works where you already work
          </SectionLabel>
          <p className="text-subtle-foreground mt-1.5 max-w-sm text-xs leading-relaxed">
            {TOOLS.length} read-only tools over MCP. No copy-pasting context into a chat box.
          </p>
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-subtle-foreground mr-1 inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] uppercase">
              <Bot className="size-3.5" /> Your assistant
            </span>
            {CLIENTS.map((client) => (
              <span
                key={client}
                className="border-border bg-card/70 text-subtle-foreground rounded-md border px-2 py-1 text-[10px] font-medium"
              >
                {client}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-subtle-foreground mr-1 inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] uppercase">
              <FileJson2 className="size-3.5" /> Your system
            </span>
            {INPUTS.map((input) => (
              <span
                key={input}
                className="border-border bg-card/70 text-subtle-foreground rounded-md border px-2 py-1 text-[10px] font-medium"
              >
                {input}
              </span>
            ))}
            <span className="text-subtle-foreground ml-1 inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] uppercase">
              <Braces className="size-3.5" /> <Database className="size-3.5" /> linked, not guessed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
