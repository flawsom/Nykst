import { useMemo, useState } from "react";
import { childKindLabel, childrenOf, kindLabel, type GraphNode } from "@/lib/graph-data";
import type { RoleDef } from "@/lib/access";
import { knownRemedy, stepsFor, useRemediation, type IssueLike } from "@/lib/remediation";
import { cn } from "@/lib/utils";

/* deterministic scoring, identical approach to the dossier */
function score(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const ISSUE_KINDS = [
  ["Cyclic dependency detected", "Architecture", "High"],
  ["Missing test coverage on error paths", "Quality", "Medium"],
  ["Deprecated API still referenced", "Maintenance", "Medium"],
  ["Unbounded retry loop", "Reliability", "Critical"],
  ["Secrets read at module scope", "Security", "High"],
  ["Hot path allocates per request", "Performance", "Medium"],
  ["Ownership unclear — no CODEOWNERS entry", "Governance", "Low"],
] as const;

/** Plain-language consequence of each issue class, for non-technical roles. */
const BUSINESS_MEANING: Record<string, string> = {
  "Cyclic dependency detected": "Teams block each other — shipping here is slower than it looks.",
  "Missing test coverage on error paths": "Failures reach customers before anyone notices.",
  "Deprecated API still referenced": "Carrying old work that will force an unplanned migration.",
  "Unbounded retry loop": "One slow partner can take this area down entirely.",
  "Secrets read at module scope": "Credential exposure risk — a compliance finding waiting to happen.",
  "Hot path allocates per request": "Higher infrastructure spend and slower response for users.",
  "Ownership unclear — no CODEOWNERS entry": "No accountable team — incidents here have no owner.",
};

function issuesOf(n: GraphNode): (IssueLike & { severity: string })[] {
  const s = score(`${n.id}#issues`);
  const count = 2 + Math.floor(s * 4);
  return Array.from({ length: count }, (_, i) => {
    const offset = Math.floor(score(`${n.id}#issue-kind-${i}-${i * 7 + 3}`) * ISSUE_KINDS.length);
    const k = ISSUE_KINDS[(offset + i) % ISSUE_KINDS.length]!;
    return {
      id: `${n.id}-issue-${i}`,
      title: k[0],
      area: k[1],
      severity: k[2] as string,
      owner: n.owners[i % n.owners.length] ?? n.owners[0]!,
    };
  });
}

const sevTone: Record<string, string> = {
  Low: "var(--node-file)",
  Medium: "var(--node-module)",
  High: "var(--node-capability)",
  Critical: "var(--primary)",
};

/* ---------------- role voice ---------------- */

type Voice = "technical" | "executive" | "guided";

function voiceOf(role: RoleDef): Voice {
  if (role.id === "owner") return "executive";
  if (role.id === "viewer") return "guided";
  return "technical";
}

const VOICE_LABEL: Record<Voice, string> = {
  technical: "Engineering mentor",
  executive: "Business mentor",
  guided: "Guided tour",
};

function briefFor(voice: Voice, node: GraphNode, kids: GraphNode[], issues: IssueLike[]) {
  const b = node.blast;
  const kidWord = childKindLabel[node.kind].toLowerCase();
  const worst = issues[0];

  if (voice === "executive") {
    return [
      {
        h: "What this is",
        p: `${node.label} is one of your ${kindLabel[node.kind].toLowerCase()} areas. It covers ${kids.length} ${kidWord} and is run by ${b.teams} team${b.teams > 1 ? "s" : ""}.`,
      },
      {
        h: "Why it matters",
        p: `A change here reaches ${b.services.toLocaleString()} services. That is ${b.level.toLowerCase()} exposure — ${
          b.level === "Critical" || b.level === "High"
            ? "plan changes here with the owning teams before committing dates."
            : "changes can move without org-wide coordination."
        }`,
      },
      {
        h: "Where the money leaks",
        p: worst
          ? `${BUSINESS_MEANING[worst.title] ?? worst.title} Accountable: ${worst.owner}.`
          : "No material risks flagged in this area right now.",
      },
      {
        h: "Your next decision",
        p: `${issues.length} open finding${issues.length === 1 ? "" : "s"} in this area. You can approve the known fixes below without reading any code.`,
      },
    ];
  }

  if (voice === "guided") {
    return [
      {
        h: "Where you are",
        p: `${node.label} — a ${kindLabel[node.kind].toLowerCase()} in this organization. ${node.summary}`,
      },
      {
        h: "What to do next",
        p: `Click any of the ${kids.length} ${kidWord} on the canvas to go one level deeper, or use the "i" badge for a full dossier.`,
      },
      {
        h: "Who runs it",
        p: `Owned by ${node.owners.join(" and ")}.`,
      },
    ];
  }

  return [
    {
      h: "Surface",
      p: `${node.label} exposes ${kids.length} ${kidWord}, pulls ${node.dependencies.length} upstream dependenc${node.dependencies.length === 1 ? "y" : "ies"} and is consumed by ${node.dependents.length} downstream node${node.dependents.length === 1 ? "" : "s"}.`,
    },
    {
      h: "Blast radius",
      p: `${b.level} — ${b.services} services · ${b.modules} modules · ${b.files} files · ${b.teams} teams. Upstream: ${node.dependencies.slice(0, 3).join(", ") || "none"}. Downstream: ${node.dependents.slice(0, 3).join(", ") || "none"}.`,
    },
    {
      h: "Change guidance",
      p: worst
        ? `Start at "${worst.title}" (${worst.area}, ${(worst as { severity?: string }).severity ?? "Medium"}). Verify dependents before rollout; ${node.owners[0]} reviews.`
        : `No blocking findings. Standard review path: ${node.owners.join(", ")}.`,
    },
  ];
}

function answerFor(voice: Voice, q: string, node: GraphNode, kids: GraphNode[]) {
  const b = node.blast;
  const low = q.toLowerCase();
  const exec = voice === "executive";

  if (low.includes("break") || low.includes("change") || low.includes("impact") || low.includes("risk"))
    return exec
      ? `Touching ${node.label} affects ${b.services.toLocaleString()} services across ${b.teams} team${b.teams > 1 ? "s" : ""} — ${b.level.toLowerCase()} exposure. Practically: expect coordination across those teams and a longer release window.`
      : `Blast radius ${b.level}: ${b.services} services, ${b.modules} modules, ${b.files} files, ${b.teams} teams. Downstream consumers: ${node.dependents.slice(0, 4).join(", ") || "none tracked"}. Gate the change behind dependent verification.`;

  if (low.includes("depend"))
    return exec
      ? `${node.label} relies on ${node.dependencies.length} other area${node.dependencies.length === 1 ? "" : "s"} and ${node.dependents.length} area${node.dependents.length === 1 ? "" : "s"} rely on it. The more inbound reliance, the harder this is to replace.`
      : `Upstream: ${node.dependencies.join(", ") || "none"}. Downstream: ${node.dependents.join(", ") || "none"}.`;

  if (low.includes("own") || low.includes("who") || low.includes("review"))
    return `Accountable: ${node.owners.join(" and ")}${exec ? "." : ` — route PRs and incident pages here.`}`;

  if (low.includes("issue") || low.includes("problem") || low.includes("fix")) {
    const list = issuesOf(node);
    return exec
      ? `${list.length} open findings. Highest impact: ${BUSINESS_MEANING[list[0]!.title] ?? list[0]!.title}`
      : `${list.length} open: ${list.map((i) => `${i.title} (${i.severity})`).join("; ")}.`;
  }

  if (low.includes("what") || low.includes("do"))
    return exec
      ? `${node.summary} It groups ${kids.length} ${childKindLabel[node.kind].toLowerCase()} and is one of your ${b.teams}-team areas.`
      : `${node.summary} Children: ${kids.slice(0, 5).map((k) => k.label).join(", ") || "none"}.`;

  return exec
    ? `${node.label}: ${node.summary} ${b.teams} team${b.teams > 1 ? "s" : ""} own it, ${b.services} services depend on it.`
    : `${node.label} — ${kindLabel[node.kind].toLowerCase()}. ${node.summary} ${node.dependencies.length} upstream / ${node.dependents.length} downstream.`;
}

function suggestionsFor(voice: Voice) {
  if (voice === "executive")
    return ["Why does this matter?", "What is the risk here?", "Who is accountable?"];
  if (voice === "guided") return ["What does this do?", "Who owns it?", "What connects to it?"];
  return ["What breaks if I change it?", "Show dependencies", "What issues are open?"];
}

/* ---------------- panel ---------------- */

export function MentorPanel({
  node,
  role,
  related,
  onOpen,
}: {
  node: GraphNode;
  role: RoleDef;
  related: GraphNode[];
  onOpen: (n: GraphNode) => void;
}) {
  const voice = voiceOf(role);
  const issues = useMemo(() => issuesOf(node), [node]);
  const brief = useMemo(() => briefFor(voice, node, related, issues), [voice, node, related, issues]);
  const [tab, setTab] = useState<"brief" | "ask">("brief");
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);
  const { resolve, remedies, resolvedIds } = useRemediation();

  const ask = (text: string) => {
    const query = text.trim();
    if (!query) return;
    setThread((t) => [...t, { q: query, a: answerFor(voice, query, node, related) }]);
    setQ("");
  };

  return (
    <aside className="border-border bg-card/60 hidden w-[360px] shrink-0 flex-col overflow-hidden border-l backdrop-blur lg:flex">
      <div className="border-border border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="glow-ring bg-primary block size-1.5 rounded-full" />
          <span className="text-primary text-[10px] tracking-[0.28em] uppercase">
            {VOICE_LABEL[voice]}
          </span>
        </div>
        <h2 className="mt-1.5 truncate text-base font-semibold">{node.label}</h2>
        <p className="text-muted-foreground text-[11px]">
          {kindLabel[node.kind]} · speaking to you as {role.name.toLowerCase()}
        </p>

        <div className="border-border bg-surface mt-3 flex rounded-lg border p-0.5 text-[11px]">
          {(["brief", "ask"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 transition-colors",
                tab === t ? "bg-secondary text-foreground" : "text-muted-foreground",
              )}
            >
              {t === "brief" ? "Briefing" : "Ask"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {tab === "brief" ? (
          <>
            {brief.map((b) => (
              <div key={b.h}>
                <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                  {b.h}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed">{b.p}</p>
              </div>
            ))}

            {voice !== "guided" && (
              <div>
                <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                  {voice === "executive" ? "Decisions waiting on you" : "Open issues"}
                </h3>
                <ul className="mt-2 space-y-2">
                  {issues.map((i) => {
                    const solved = resolvedIds.includes(i.id);
                    const known = knownRemedy(i);
                    const canAct = solved
                      ? false
                      : known
                        ? role.can.approveAutoFix
                        : role.can.resolveIssues;
                    return (
                      <li
                        key={i.id}
                        className="border-border bg-surface rounded-lg border px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full"
                            style={{ background: sevTone[i.severity] ?? "var(--primary)" }}
                          />
                          <div className="min-w-0">
                            <div className="text-[13px] leading-snug font-medium">{i.title}</div>
                            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                              {voice === "executive"
                                ? (BUSINESS_MEANING[i.title] ?? i.area)
                                : `${i.area} · ${i.severity} · ${i.owner}`}
                            </p>
                          </div>
                        </div>

                        {voice === "technical" && !solved && (
                          <ol className="text-muted-foreground mt-2 ml-3.5 list-decimal space-y-0.5 pl-2 text-[11px]">
                            {stepsFor(i).map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ol>
                        )}

                        {known && !solved && (
                          <p className="text-primary mt-2 ml-3.5 text-[11px]">
                            Pattern already solved on {known.provenOn} — needs approval.
                          </p>
                        )}

                        <div className="mt-2 ml-3.5">
                          {solved ? (
                            <span className="text-muted-foreground text-[11px]">
                              Resolved · pattern stored
                              {remedies[`${i.area}::${i.title}`]
                                ? ` (${remedies[`${i.area}::${i.title}`]!.appliedCount}×)`
                                : ""}
                            </span>
                          ) : canAct ? (
                            <button
                              onClick={() => resolve(i, node)}
                              className="border-border bg-surface-2 hover:bg-secondary rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                            >
                              {known ? "Approve known fix" : "Mark solved"}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">
                              Needs {known ? "approver" : "an engineer"} — outside your role
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {related.length > 0 && (
              <div>
                <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                  Go deeper · {related.length}
                </h3>
                <ul className="mt-2 space-y-1">
                  {related.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => onOpen(c)}
                        className="text-muted-foreground hover:text-foreground hover:bg-surface w-full truncate rounded-md px-2 py-1 text-left text-sm transition-colors"
                      >
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {suggestionsFor(voice).map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="border-border bg-surface hover:bg-surface-2 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>

            {thread.length === 0 && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                Ask anything about {node.label}. Answers are written for a {role.name.toLowerCase()}.
              </p>
            )}

            {thread.map((t, i) => (
              <div key={`${t.q}-${i}`} className="space-y-2">
                <div className="bg-secondary text-foreground ml-6 rounded-lg px-3 py-2 text-[13px]">
                  {t.q}
                </div>
                <div className="text-sm leading-relaxed">{t.a}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tab === "ask" && (
        <div className="border-border border-t p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Ask about ${node.label}`}
              className="border-border bg-surface min-w-0 flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-[12px] font-medium"
            >
              Ask
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
