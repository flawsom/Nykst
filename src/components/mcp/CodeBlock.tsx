import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  title?: string;
  code: string;
  note?: string | undefined;
  /** Decides the label: bash is typed into a terminal, everything else is a file's content. */
  language?: "bash" | "json" | "toml" | "markdown";
};

const KIND: Record<NonNullable<Props["language"]>, { label: string; tone: string }> = {
  bash: { label: "Run in a terminal", tone: "text-primary border-primary/40 bg-primary/10" },
  json: {
    label: "File content, not a terminal command",
    tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  },
  toml: {
    label: "File content, not a terminal command",
    tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  },
  markdown: {
    label: "Paste into your instruction file",
    tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  },
};

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => undefined);
      }}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
    >
      {copied ? <Check className="text-primary size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ title, code, note, language }: Props) {
  const kind = language ? KIND[language] : null;
  return (
    <figure className="border-border bg-background overflow-hidden rounded-xl border">
      {kind && (
        <div className={`border-b px-3 py-1 text-[11px] font-semibold ${kind.tone}`}>
          {kind.label}
        </div>
      )}
      <figcaption className="border-border bg-surface flex items-center justify-between gap-3 border-b px-3 py-1.5">
        <span className="text-muted-foreground truncate font-mono text-[11px]">
          {title ?? "Snippet"}
        </span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
      {note && (
        <p className="border-border text-muted-foreground border-t px-3.5 py-2 text-[11px] leading-relaxed">
          {note}
        </p>
      )}
    </figure>
  );
}
