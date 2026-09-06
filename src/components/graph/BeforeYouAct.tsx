import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  GitCommit,
  History,
  Link2,
  X,
} from "lucide-react";
import type { GraphNode } from "@/lib/graph-data";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { askNykstAi, openApiSettings } from "@/lib/ai-client";
import { buildBeforeYouActEnvelope, type ContextEnvelope } from "@/lib/before-you-act";
import { cn } from "@/lib/utils";

export function BeforeYouAct({
  node,
  snapshot,
  open,
  onClose,
}: {
  node: GraphNode;
  snapshot: RepositorySnapshot | null;
  open: boolean;
  onClose: () => void;
}) {
  const [intent, setIntent] = useState("");
  const [envelope, setEnvelope] = useState<ContextEnvelope | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const preview = useMemo(
    () => buildBeforeYouActEnvelope(node, snapshot, intent),
    [node, snapshot, intent],
  );

  if (!open) return null;

  const analyze = () => {
    setEnvelope(preview);
    setAiAnswer(null);
  };

  const ask = async () => {
    const current = envelope ?? preview;
    setEnvelope(current);
    setAiLoading(true);
    setAiAnswer(null);
    const result = await askNykstAi(
      `Before any code is written, explain the consequences of this intended action. Identify what must be verified, what may break, and which evidence is strongest. Do not propose code.\n\nIntent: ${current.intent}`,
      JSON.stringify(current),
    );
    setAiLoading(false);
    if (result.ok) setAiAnswer(result.answer);
    else if (result.needsKey) openApiSettings();
    else setAiAnswer(result.error);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Before You Act"
    >
      <div className="border-border bg-background flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <header className="border-border flex items-center justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.24em] text-primary">
              <span className="glow-ring bg-primary size-1.5 rounded-full" /> Before You Act
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold">
              Understand the consequence before touching {node.label}.
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-2 transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="border-border bg-card/40 grid gap-3 border-b p-5 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.18em]">
              What are you considering?
            </label>
            <input
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") analyze();
              }}
              placeholder={`e.g. “I want to change ${node.label}”`}
              className="border-border bg-surface text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary"
              autoFocus
            />
          </div>
          <button
            onClick={analyze}
            className="bg-primary text-primary-foreground self-end rounded-xl px-5 py-3 text-sm font-semibold transition-transform active:scale-[0.97]"
          >
            Build context envelope <ArrowRight className="ml-1 inline size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!envelope ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <BrainCircuit className="text-primary mb-4 size-8" />
              <h3 className="text-base font-semibold">
                The graph is ready to reason about the action.
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                Describe what you want to change. NYKST will assemble structure, history, coupling,
                origin, and evidence before any implementation is discussed.
              </p>
            </div>
          ) : (
            <EnvelopeBody
              envelope={envelope}
              aiAnswer={aiAnswer}
              aiLoading={aiLoading}
              onAsk={ask}
              onOpenSettings={openApiSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EnvelopeBody({
  envelope,
  aiAnswer,
  aiLoading,
  onAsk,
  onOpenSettings,
}: {
  envelope: ContextEnvelope;
  aiAnswer: string | null;
  aiLoading: boolean;
  onAsk: () => void;
  onOpenSettings: () => void;
}) {
  const confidenceClass =
    envelope.confidence === "high"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : envelope.confidence === "medium"
        ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
        : "text-muted-foreground border-border bg-surface";
  return (
    <div className="space-y-5">
      <section className="border-primary/25 bg-primary/5 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-[10px] font-mono uppercase tracking-[0.18em]">
              Action under consideration
            </p>
            <h3 className="mt-1 text-xl font-semibold">{envelope.intent}</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Touching <span className="text-foreground font-medium">{envelope.target.path}</span> ·{" "}
              {envelope.target.kind} · {envelope.target.summary}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase",
              confidenceClass,
            )}
          >
            {envelope.confidence} evidence
          </span>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <EnvelopeSection
          icon={Link2}
          title="What is connected"
          subtitle="The structural neighborhood NYKST sees before you edit"
        >
          <div className="flex flex-wrap gap-2">
            {envelope.connected.length ? (
              envelope.connected.map((item) => (
                <span
                  key={`${item.relation}-${item.label}`}
                  className="border-border bg-surface inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
                >
                  <span className="text-primary">{item.relation}</span> {item.label}
                </span>
              ))
            ) : (
              <Empty text="No direct adjacency was available." />
            )}
          </div>
        </EnvelopeSection>
        <EnvelopeSection
          icon={AlertTriangle}
          title="Inspect before acting"
          subtitle="The questions most likely to prevent an avoidable break"
        >
          <div className="space-y-2">
            {envelope.inspectBeforeActing.map((item) => (
              <div
                key={item.title}
                className="border-border bg-surface flex items-start gap-2.5 rounded-lg border p-3"
              >
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    item.severity === "critical"
                      ? "text-red-300"
                      : item.severity === "important"
                        ? "text-amber-300"
                        : "text-muted-foreground",
                  )}
                />
                <div>
                  <p className="text-xs font-medium">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                    {item.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </EnvelopeSection>
        <EnvelopeSection
          icon={History}
          title="What changed around it"
          subtitle="Historical records that overlap the action"
        >
          <div className="space-y-2">
            {envelope.historicalChanges.length ? (
              envelope.historicalChanges.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="border-border bg-surface rounded-lg border p-3"
                >
                  <div className="flex items-start gap-2">
                    <GitCommit className="text-primary mt-0.5 size-3.5 shrink-0" />
                    <p className="text-xs font-medium">{item.title}</p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {item.date} · {item.actor}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              ))
            ) : (
              <Empty text="No overlapping commit or pull-request language was found in the available snapshot." />
            )}
          </div>
        </EnvelopeSection>
        <EnvelopeSection
          icon={ChevronRight}
          title="What tends to move with it"
          subtitle="Repeated or inferred coupling—not a generic dependency list"
        >
          <div className="space-y-2">
            {envelope.coChanged.length ? (
              envelope.coChanged.map((item) => (
                <div
                  key={item.label}
                  className="border-border bg-surface flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="text-muted-foreground mt-1 text-[11px]">{item.reason}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[10px] font-mono">
                    {item.confidence}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No co-change evidence was available." />
            )}
          </div>
        </EnvelopeSection>
      </div>
      <section className="border-border bg-card/60 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Ask for a consequence reading</p>
            <p className="text-muted-foreground mt-1 text-xs">
              NYKST will reason over this envelope. It will not generate code.
            </p>
          </div>
          <button
            onClick={onAsk}
            disabled={aiLoading}
            className="bg-primary text-primary-foreground disabled:opacity-60 rounded-lg px-4 py-2 text-xs font-semibold"
          >
            {aiLoading ? "Reading context…" : "Ask NYKST"}
          </button>
        </div>
        {aiAnswer && (
          <div className="border-border bg-surface mt-4 whitespace-pre-line rounded-lg border p-4 text-xs leading-relaxed">
            {aiAnswer}
          </div>
        )}
        {!aiAnswer && (
          <button
            onClick={onOpenSettings}
            className="text-muted-foreground hover:text-primary mt-3 text-[11px] transition-colors"
          >
            Using your connected AI provider · Manage API Settings
          </button>
        )}
      </section>
      <section className="border-border rounded-xl border p-4">
        <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.18em]">
          Evidence supporting this envelope
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {envelope.evidence.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-start gap-2 text-[11px]">
              <CheckCircle2
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  item.strength === "direct"
                    ? "text-emerald-300"
                    : item.strength === "supporting"
                      ? "text-primary"
                      : "text-amber-300",
                )}
              />
              <div>
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground"> — {item.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EnvelopeSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Link2;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card/60 rounded-xl border p-4">
      <div className="flex items-start gap-2.5">
        <Icon className="text-primary mt-0.5 size-4 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-1 text-[11px]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed">
      {text}
    </p>
  );
}
