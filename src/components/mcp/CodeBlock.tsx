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
  bash: { label: "Run in a terminal", tone: "text-ok border-border bg-ok-soft" },
  json: {
    label: "File content, not a terminal command",
    tone: "text-warn border-border bg-warn-soft",
  },
  toml: {
    label: "File content, not a terminal command",
    tone: "text-warn border-border bg-warn-soft",
  },
  markdown: {
    label: "Paste into your instruction file",
    tone: "text-warn border-border bg-warn-soft",
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
      className="text-muted-foreground hover:text-foreground hover:bg-surface-2 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors"
    >
      {copied ? (
        <Check className="text-ok size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ title, code, note, language }: Props) {
  const kind = language ? KIND[language] : null;
  return (
    <figure className="border-border bg-card overflow-hidden rounded-lg border">
      {kind && (
        <div className={`border-b px-3 py-1.5 text-xs font-semibold ${kind.tone}`}>
          {kind.label}
        </div>
      )}
      <figcaption className="border-border bg-surface flex items-center justify-between gap-3 border-b py-0.5 pr-1 pl-3">
        <span className="text-muted-foreground truncate font-mono text-xs">
          {title ?? "Snippet"}
        </span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
      {note && (
        <p className="border-border text-muted-foreground border-t px-4 py-2 text-xs leading-relaxed">
          {note}
        </p>
      )}
    </figure>
  );
}
