/**
 * Deterministic Stage 2 proposal used when no provider key is configured or the
 * provider is unavailable. It never invents an API call and never changes an
 * existing contract; it either inserts a request comment above the first export
 * or appends one documented export whose name is derived from the prompt.
 */

export interface FallbackProposal {
  content: string;
  summary: string;
  language: "ts" | "py" | "go" | "rust" | "other";
}

function languageOf(path: string): FallbackProposal["language"] {
  if (/\.[cm]?[jt]sx?$/i.test(path)) return "ts";
  if (/\.py$/i.test(path)) return "py";
  if (/\.go$/i.test(path)) return "go";
  if (/\.rs$/i.test(path)) return "rust";
  return "other";
}

function commentFor(language: FallbackProposal["language"], text: string) {
  if (language === "py") return `# ${text}`;
  if (language === "other") return `// ${text}`;
  return `// ${text}`;
}

function sanitize(text: string) {
  return text.replace(/\s+/g, " ").replace(/\*\//g, "* /").trim().slice(0, 140);
}

function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function identifier(value: string) {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "");
  if (!cleaned || !/^[A-Za-z_$]/.test(cleaned)) return null;
  return cleaned.slice(0, 48);
}

export function deterministicProposal(
  prompt: string,
  content: string,
  path: string,
): FallbackProposal {
  const language = languageOf(path);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const summary = sanitize(prompt) || "requested change";
  const comment = commentFor(language, `Requested change: ${summary}`);

  if (/\bcomment\b|\bdoc(?:ument)?\b|\bjsdoc\b/i.test(prompt)) {
    const lines = content.split(newline);
    const index = lines.findIndex((line) =>
      /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\b/.test(line),
    );
    if (index >= 0) {
      const indent = lines[index]!.match(/^\s*/)?.[0] ?? "";
      lines.splice(index, 0, `${indent}${comment}`);
      return {
        content: lines.join(newline),
        summary: "Inserted a grounded request comment above the first exported declaration.",
        language,
      };
    }
  }

  if (language === "ts") {
    const requested = /\b(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(
      prompt,
    )?.[1];
    const named = requested ? identifier(requested) : null;
    if (named && !new RegExp(`\\b${named}\\b`).test(content)) {
      return {
        content: `${content.replace(/\s*$/, "")}${newline}${newline}${comment}${newline}export const ${named} = ${JSON.stringify(summary)};${newline}`,
        summary: `Appended a documented export named ${named} without touching existing contracts.`,
        language,
      };
    }
  }

  const generated = identifier(`nykstGrounded${fnv1a(prompt).toString(16).slice(0, 6)}`)!;
  if (new RegExp(`\\b${generated}\\b`).test(content))
    return {
      content,
      summary: "The deterministic proposal was already present in this file.",
      language,
    };

  return {
    content: `${content.replace(/\s*$/, "")}${newline}${newline}${comment}${newline}${
      language === "ts" ? `export const ${generated} = ${JSON.stringify(summary)};` : ""
    }${newline}`,
    summary:
      language === "ts"
        ? `Appended a documented export ${generated} without touching existing contracts.`
        : "Appended a request comment without touching existing code.",
    language,
  };
}
