import { useMemo, useState } from "react";
import { childKindLabel, childrenOf, kindLabel, type GraphNode } from "@/lib/graph-data";
import type { RoleDef } from "@/lib/access";
import { knownRemedy, stepsFor, useRemediation, type IssueLike } from "@/lib/remediation";
import { useChatMemory } from "@/lib/chat-memory";
import { VirtualCodeLab } from "./VirtualCodeLab";
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

/* ---------------- evidence ---------------- */

export interface Evidence {
  kind: "node" | "file" | "incident" | "metric";
  label: string;
  /** graph node this evidence points at, when it is navigable */
  node?: GraphNode;
}

const EV_TONE: Record<Evidence["kind"], string> = {
  node: "var(--node-capability)",
  file: "var(--node-file)",
  incident: "var(--primary)",
  metric: "var(--node-module)",
};

/** Sample descendant nodes / file paths this insight was derived from. */
function evidenceSources(node: GraphNode, kids: GraphNode[]) {
  const nodes = kids.slice(0, 3);
  const files: string[] = [];
  const walk = (n: GraphNode, depth: number) => {
    if (files.length >= 4 || depth > 2) return;
    for (const c of childrenOf(n)) {
      if (files.length >= 4) return;
      if (!c.expandable) files.push(c.detail?.path ?? c.label);
      else walk(c, depth + 1);
    }
  };
  if (!node.expandable) files.push(node.detail?.path ?? node.label);
  else walk(node, 0);
  return { nodes, files };
}

const INCIDENT_PATTERNS = [
  "Retry storm during partner degradation",
  "Auth token expiry cascade",
  "Cache stampede after deploy",
  "Schema drift on a shared contract",
  "Config rollout with no kill switch",
];

function incidentsOf(node: GraphNode) {
  const count = 1 + Math.floor(score(`${node.id}#inc`) * 3);
  return Array.from({ length: count }, (_, i) => {
    const p = INCIDENT_PATTERNS[Math.floor(score(`${node.id}#inc-${i}`) * INCIDENT_PATTERNS.length)]!;
    const days = 8 + Math.floor(score(`${node.id}#inc-age-${i}`) * 300);
    return {
      id: `${node.id}-inc-${i}`,
      pattern: p,
      when: `${days}d ago`,
      minutes: 12 + Math.floor(score(`${node.id}#inc-min-${i}`) * 180),
    };
  });
}

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

/* ---------------- problem tracker ---------------- */

interface Tracker {
  id: string;
  title: string;
  count: string;
  tone: string;
  headline: string;
  detail: string[];
  evidence: Evidence[];
}

function trackersFor(
  voice: Voice,
  node: GraphNode,
  kids: GraphNode[],
  issues: (IssueLike & { severity: string })[],
  resolvedIds: string[],
): Tracker[] {
  const b = node.blast;
  const { nodes, files } = evidenceSources(node, kids);
  const incidents = incidentsOf(node);
  const open = issues.filter((i) => !resolvedIds.includes(i.id));
  const errorPaths = issues.filter(
    (i) => i.area === "Reliability" || i.area === "Quality" || i.title.includes("error"),
  );
  const security = issues.filter((i) => i.area === "Security" || i.area === "Governance");
  const nodeEv: Evidence[] = nodes.map((n) => ({ kind: "node", label: n.label, node: n }));
  const fileEv: Evidence[] = files.map((f) => ({ kind: "file", label: f }));

  return [
    {
      id: "problems",
      title: "Open problems",
      count: `${open.length}`,
      tone: open.length ? "var(--primary)" : "var(--node-file)",
      headline: open.length
        ? voice === "executive"
          ? (BUSINESS_MEANING[open[0]!.title] ?? open[0]!.title)
          : `Highest severity: ${open[0]!.title} (${open[0]!.severity})`
        : "Nothing open in this area.",
      detail: open
        .slice(0, 4)
        .map((i) =>
          voice === "executive"
            ? `${BUSINESS_MEANING[i.title] ?? i.title} — ${i.owner}`
            : `${i.title} · ${i.area} · ${i.severity} · ${i.owner}`,
        ),
      evidence: [...nodeEv, ...fileEv.slice(0, 2)],
    },
    {
      id: "errors",
      title: "Error & failure paths",
      count: `${errorPaths.length}`,
      tone: "var(--node-capability)",
      headline: errorPaths.length
        ? voice === "executive"
          ? "Failures here can reach customers before anyone is paged."
          : `${errorPaths.length} finding${errorPaths.length === 1 ? "" : "s"} sit on failure handling paths.`
        : "No unguarded failure paths flagged.",
      detail: errorPaths.slice(0, 3).map((i) => `${i.title} — ${stepsFor(i)[0]}`),
      evidence: fileEv.length ? fileEv : nodeEv,
    },
    {
      id: "blast",
      title: "Blast radius",
      count: b.level,
      tone: sevTone[b.level === "Moderate" ? "Medium" : b.level] ?? "var(--node-module)",
      headline:
        voice === "executive"
          ? `A change here reaches ${b.services.toLocaleString()} services across ${b.teams} team${b.teams > 1 ? "s" : ""}.`
          : `${b.services} services · ${b.modules} modules · ${b.files} files · ${b.teams} teams.`,
      detail: [
        `Upstream: ${node.dependencies.slice(0, 4).join(", ") || "none tracked"}`,
        `Downstream: ${node.dependents.slice(0, 4).join(", ") || "none tracked"}`,
      ],
      evidence: [
        { kind: "metric", label: `${b.services} services` },
        { kind: "metric", label: `${b.teams} teams` },
        ...nodeEv.slice(0, 2),
      ],
    },
    {
      id: "incidents",
      title: "Past incident patterns",
      count: `${incidents.length}`,
      tone: "var(--node-service)",
      headline: incidents.length
        ? `Recurring trigger: ${incidents[0]!.pattern}.`
        : "No incident history recorded here.",
      detail: incidents.map((i) => `${i.pattern} · ${i.when} · ${i.minutes}m impact`),
      evidence: [
        ...incidents.map((i) => ({ kind: "incident" as const, label: `${i.pattern} (${i.when})` })),
        ...nodeEv.slice(0, 1),
      ],
    },
    {
      id: "ownership",
      title: "Ownership & exposure",
      count: `${node.owners.length}`,
      tone: "var(--node-domain)",
      headline: security.length
        ? voice === "executive"
          ? "There is a compliance-shaped risk with no clear accountable team."
          : `${security.length} security/governance finding${security.length === 1 ? "" : "s"} in scope.`
        : `Accountable: ${node.owners.join(" and ")}.`,
      detail: [
        `Owners: ${node.owners.join(", ")}`,
        ...security.slice(0, 2).map((i) => `${i.title} — ${i.owner}`),
      ],
      evidence: [
        ...node.owners.map((o) => ({ kind: "metric" as const, label: o })),
        ...nodeEv.slice(0, 2),
      ],
    },
  ];
}

/* ---------------- ask ---------------- */

function answerFor(
  voice: Voice,
  q: string,
  node: GraphNode,
  kids: GraphNode[],
): { text: string; evidence: Evidence[] } {
  const b = node.blast;
  const low = q.toLowerCase();
  const exec = voice === "executive";
  const { nodes, files } = evidenceSources(node, kids);
  const nodeEv: Evidence[] = nodes.map((n) => ({ kind: "node", label: n.label, node: n }));
  const fileEv: Evidence[] = files.slice(0, 3).map((f) => ({ kind: "file", label: f }));
  const incEv: Evidence[] = incidentsOf(node).map((i) => ({
    kind: "incident",
    label: `${i.pattern} (${i.when})`,
  }));
  const blastEv: Evidence[] = [
    { kind: "metric", label: `${b.services} services` },
    { kind: "metric", label: `blast ${b.level}` },
  ];

  if (low.includes("break") || low.includes("change") || low.includes("impact") || low.includes("risk"))
    return {
      text: exec
        ? `Touching ${node.label} affects ${b.services.toLocaleString()} services across ${b.teams} team${b.teams > 1 ? "s" : ""} — ${b.level.toLowerCase()} exposure. Expect coordination across those teams and a longer release window.`
        : `Blast radius ${b.level}: ${b.services} services, ${b.modules} modules, ${b.files} files, ${b.teams} teams. Downstream consumers: ${node.dependents.slice(0, 4).join(", ") || "none tracked"}. Gate the change behind dependent verification.`,
      evidence: [...blastEv, ...nodeEv, ...incEv.slice(0, 1)],
    };

  if (low.includes("depend"))
    return {
      text: exec
        ? `${node.label} relies on ${node.dependencies.length} other area${node.dependencies.length === 1 ? "" : "s"} and ${node.dependents.length} area${node.dependents.length === 1 ? "" : "s"} rely on it.`
        : `Upstream: ${node.dependencies.join(", ") || "none"}. Downstream: ${node.dependents.join(", ") || "none"}.`,
      evidence: [
        ...node.dependencies.slice(0, 3).map((d) => ({ kind: "node" as const, label: d })),
        ...nodeEv.slice(0, 2),
      ],
    };

  if (low.includes("own") || low.includes("who") || low.includes("review"))
    return {
      text: `Accountable: ${node.owners.join(" and ")}${exec ? "." : ` — route PRs and incident pages here.`}`,
      evidence: [
        ...node.owners.map((o) => ({ kind: "metric" as const, label: o })),
        ...fileEv.slice(0, 2),
      ],
    };

  if (low.includes("issue") || low.includes("problem") || low.includes("fix")) {
    const list = issuesOf(node);
    return {
      text: exec
        ? `${list.length} open findings. Highest impact: ${BUSINESS_MEANING[list[0]!.title] ?? list[0]!.title}`
        : `${list.length} open: ${list.map((i) => `${i.title} (${i.severity})`).join("; ")}.`,
      evidence: [...fileEv, ...nodeEv.slice(0, 2), ...incEv.slice(0, 1)],
    };
  }

  if (low.includes("incident") || low.includes("outage") || low.includes("history"))
    return {
      text: `Recorded patterns on ${node.label}: ${incidentsOf(node)
        .map((i) => `${i.pattern} (${i.when}, ${i.minutes}m)`)
        .join("; ")}.`,
      evidence: [...incEv, ...nodeEv.slice(0, 1)],
    };

  if (low.includes("what") || low.includes("do"))
    return {
      text: exec
        ? `${node.summary} It groups ${kids.length} ${childKindLabel[node.kind].toLowerCase()} and is one of your ${b.teams}-team areas.`
        : `${node.summary} Children: ${kids.slice(0, 5).map((k) => k.label).join(", ") || "none"}.`,
      evidence: [...nodeEv, ...fileEv.slice(0, 2)],
    };

  return {
    text: exec
      ? `${node.label}: ${node.summary} ${b.teams} team${b.teams > 1 ? "s" : ""} own it, ${b.services} services depend on it.`
      : `${node.label} — ${kindLabel[node.kind].toLowerCase()}. ${node.summary} ${node.dependencies.length} upstream / ${node.dependents.length} downstream.`,
    evidence: [...nodeEv, ...blastEv.slice(0, 1)],
  };
}

function suggestionsFor(voice: Voice) {
  if (voice === "executive")
    return ["Why does this matter?", "What is the risk here?", "Who is accountable?"];
  if (voice === "guided") return ["What does this do?", "Who owns it?", "What connects to it?"];
  return ["What breaks if I change it?", "Show dependencies", "What issues are open?"];
}

/* ---------------- evidence strip ---------------- */

function EvidenceStrip({
  items,
  onOpen,
}: {
  items: Evidence[];
  onOpen: (n: GraphNode) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2.5">
      <div className="text-muted-foreground text-[9px] tracking-[0.24em] uppercase">
        Source evidence
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {items.map((e, i) => {
          const inner = (
            <>
              <span
                className="size-1 shrink-0 rounded-full"
                style={{ background: EV_TONE[e.kind] }}
              />
              <span className="truncate">{e.label}</span>
            </>
          );
          return e.node ? (
            <button
              key={`${e.label}-${i}`}
              onClick={() => onOpen(e.node!)}
              title={`${e.kind} · click to open in graph`}
              className="border-border bg-surface-2 hover:bg-secondary flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors"
            >
              {inner}
            </button>
          ) : (
            <span
              key={`${e.label}-${i}`}
              title={e.kind}
              className="border-border bg-surface flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
            >
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
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
  const [tab, setTab] = useState<"brief" | "ask">("brief");
  const [openCard, setOpenCard] = useState<string | null>("problems");
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string; evidence: Evidence[] }[]>([]);
  const { resolve, remedies, resolvedIds } = useRemediation();

  const trackers = useMemo(
    () => trackersFor(voice, node, related, issues, resolvedIds),
    [voice, node, related, issues, resolvedIds],
  );

  const ask = (text: string) => {
    const query = text.trim();
    if (!query) return;
    const res = answerFor(voice, query, node, related);
    setThread((t) => [...t, { q: query, a: res.text, evidence: res.evidence }]);
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
              {t === "brief" ? "Problem tracker" : "Ask"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {tab === "brief" ? (
          <>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Tracked signals for this {kindLabel[node.kind].toLowerCase()}. Click a box for the
              detail and the evidence it came from.
            </p>

            {trackers.map((t) => {
              const open = openCard === t.id;
              return (
                <div key={t.id} className="border-border bg-surface rounded-lg border">
                  <button
                    onClick={() => setOpenCard(open ? null : t.id)}
                    className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: t.tone }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{t.title}</span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {t.headline}
                      </span>
                    </span>
                    <span className="border-border bg-surface-2 rounded-full border px-2 py-0.5 text-[10px]">
                      {t.count}
                    </span>
                  </button>

                  {open && (
                    <div className="border-border border-t px-3 py-2.5">
                      <ul className="space-y-1">
                        {t.detail.length ? (
                          t.detail.map((d) => (
                            <li key={d} className="text-[11px] leading-relaxed">
                              {d}
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground text-[11px]">Nothing tracked.</li>
                        )}
                      </ul>
                      <EvidenceStrip items={t.evidence} onOpen={onOpen} />
                    </div>
                  )}
                </div>
              );
            })}

            {voice !== "guided" && (
              <div className="pt-2">
                <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                  {voice === "executive" ? "Decisions waiting on you" : "Fix queue"}
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
                    const { files } = evidenceSources(node, related);
                    const evidence: Evidence[] = [
                      { kind: "node", label: node.label, node },
                      ...files.slice(0, 2).map((f) => ({ kind: "file" as const, label: f })),
                      ...(known
                        ? [
                            {
                              kind: "incident" as const,
                              label: `Pattern proven on ${known.provenOn}`,
                            },
                          ]
                        : []),
                    ];
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

                        <div className="ml-3.5">
                          <EvidenceStrip items={evidence} onOpen={onOpen} />
                        </div>

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
              <div className="pt-2">
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
                Ask anything about {node.label}. Every answer cites the graph nodes, files and
                incident patterns it used.
              </p>
            )}

            {thread.map((t, i) => (
              <div key={`${t.q}-${i}`} className="space-y-2">
                <div className="bg-secondary text-foreground ml-6 rounded-lg px-3 py-2 text-[13px]">
                  {t.q}
                </div>
                <div className="text-sm leading-relaxed">{t.a}</div>
                <EvidenceStrip items={t.evidence} onOpen={onOpen} />
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
