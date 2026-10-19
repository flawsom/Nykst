import type { GraphNode } from "@/lib/graph-data";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { historyFor } from "@/lib/analysis/impact";

export type EnvelopeEvidence = {
  source: "graph" | "commit" | "pull_request" | "issue" | "repository" | "inference";
  label: string;
  detail: string;
  strength: "direct" | "supporting" | "inferred";
};

export type ContextEnvelope = {
  target: { label: string; kind: string; path: string; summary: string };
  intent: string;
  connected: { label: string; relation: string; why: string }[];
  historicalChanges: { title: string; date: string; actor: string; detail: string }[];
  coChanged: { label: string; reason: string; confidence: "high" | "medium" }[];
  origin: { title: string; detail: string }[];
  inspectBeforeActing: {
    title: string;
    reason: string;
    severity: "critical" | "important" | "watch";
  }[];
  columnDrift: {
    resource: string;
    column: string;
    kind: "unknown-column" | "dropped-column";
    message: string;
    references: { path: string; line: number; operation: string }[];
  }[];
  evidence: EnvelopeEvidence[];
  confidence: "high" | "medium" | "limited";
};

type RecordLike = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function recordText(record: RecordLike) {
  return [record["message"], record["title"], record["body"], record["name"], record["subject"]]
    .map(stringValue)
    .filter(Boolean)
    .join(" ");
}

function dateValue(record: RecordLike) {
  const value = record["committed_at"] ?? record["created_at"] ?? record["updated_at"];
  return stringValue(value).slice(0, 10) || "Unknown date";
}

function actorValue(record: RecordLike) {
  const author = record["author"];
  if (author && typeof author === "object") {
    const login = stringValue((author as RecordLike)["login"]);
    if (login) return login;
  }
  return stringValue(record["author_name"]) || stringValue(record["user"]) || "Unknown contributor";
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
}

function overlapScore(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

export function buildBeforeYouActEnvelope(
  node: GraphNode,
  snapshot: RepositorySnapshot | null,
  intent: string,
): ContextEnvelope {
  const cleanIntent = intent.trim() || `Understand ${node.label} before editing it`;
  const nodePath = node.detail?.path || node.id.split(":").slice(1).join(":") || node.label;
  const targetText = `${node.label} ${nodePath} ${node.summary} ${cleanIntent}`;
  const evidence: EnvelopeEvidence[] = [
    {
      source: "graph",
      label: "System graph",
      detail: `${node.kind} selected at ${nodePath}.`,
      strength: "direct",
    },
    {
      source: "graph",
      label: "Blast radius",
      detail: `${node.blast.level} exposure across ${node.blast.services} services, ${node.blast.modules} modules, and ${node.blast.files} files.`,
      strength: "direct",
    },
  ];

  const children = (node.children ?? []).slice(0, 8).map((child) => ({
    label: child.label,
    relation: child.kind === "file" ? "contains" : "owns",
    why: child.summary,
  }));
  const connected = [
    ...children,
    ...node.dependencies.slice(0, 5).map((label) => ({
      label,
      relation: "depends on",
      why: "Recorded as a dependency of the selected node.",
    })),
    ...node.dependents.slice(0, 5).map((label) => ({
      label,
      relation: "is used by",
      why: "Recorded as a dependent of the selected node.",
    })),
  ].slice(0, 10);
  if (connected.length)
    evidence.push({
      source: "graph",
      label: "Structural adjacency",
      detail: `${connected.length} connected graph records were attached to the envelope.`,
      strength: "direct",
    });

  const commits = (snapshot?.commits ?? []) as RecordLike[];
  const pullRequests = (snapshot?.pull_requests ?? []) as RecordLike[];
  const issues = (snapshot?.issues ?? []) as RecordLike[];
  const relevantCommits = commits
    .filter((commit) => overlapScore(targetText, recordText(commit)) > 0)
    .slice(0, 6);
  const relevantPrs = pullRequests
    .filter((pr) => overlapScore(targetText, recordText(pr)) > 0)
    .slice(0, 5);
  const relevantIssues = issues
    .filter((issue) => overlapScore(targetText, recordText(issue)) > 0)
    .slice(0, 5);

  // With analyzed history, use commits that actually changed these files instead of word overlap.
  const fileHistory =
    snapshot?.history && node.analysisRef
      ? historyFor(snapshot.history, node.analysisRef.paths)
      : null;
  const historicalChanges = fileHistory
    ? fileHistory.commits.slice(0, 8).map((commit) => ({
        title: commit.message.slice(0, 120),
        date: commit.date.slice(0, 10) || "Unknown date",
        actor: commit.author,
        detail: `Commit ${commit.sha.slice(0, 7)} changed ${commit.files
          .filter((file) => node.analysisRef!.paths.includes(file))
          .slice(0, 3)
          .join(", ")}.`,
      }))
    : relevantCommits.map((commit) => ({
        title: recordText(commit).slice(0, 120),
        date: dateValue(commit),
        actor: actorValue(commit),
        detail:
          "Commit language overlaps the selected area or stated intent; inspect the full diff before changing it.",
      }));
  (fileHistory ? [] : relevantPrs).forEach((pr) =>
    historicalChanges.push({
      title: recordText(pr).slice(0, 120),
      date: dateValue(pr),
      actor: actorValue(pr),
      detail: "Pull request context overlaps the selected area or stated intent.",
    }),
  );
  if (historicalChanges.length)
    evidence.push({
      source: fileHistory || relevantCommits.length ? "commit" : "pull_request",
      label: "Change history",
      detail: fileHistory
        ? `${historicalChanges.length} recent commits changed these files.`
        : `${historicalChanges.length} historical records overlap the target context.`,
      strength: fileHistory ? "direct" : "supporting",
    });

  const targetPaths = new Set(node.analysisRef?.paths ?? [nodePath]);
  const columnDrift = (snapshot?.analysis?.resources ?? [])
    .flatMap((resource) =>
      (resource.columnDrift ?? []).map((finding) => ({ resource: resource.id, ...finding })),
    )
    .filter((finding) => finding.references.some((reference) => targetPaths.has(reference.path)))
    .slice(0, 20);
  if (columnDrift.length)
    evidence.push({
      source: "graph",
      label: "SQL contract drift",
      detail: `${columnDrift.length} column reference${columnDrift.length === 1 ? "" : "s"} disagree with the analyzed migration DDL.`,
      strength: "direct",
    });

  const coChanged = fileHistory?.coChange.length
    ? fileHistory.coChange.slice(0, 8).map((item) => ({
        label: item.path,
        reason: `Changed in the same commit or pull request ${item.count} times.`,
        confidence: item.count >= 3 ? ("high" as const) : ("medium" as const),
      }))
    : [
        ...new Set([
          ...relevantCommits.flatMap((commit) => {
            const files = commit["files"];
            return Array.isArray(files)
              ? files.map((file) =>
                  typeof file === "string" ? file : stringValue((file as RecordLike)["filename"]),
                )
              : [];
          }),
          ...relevantPrs.flatMap((pr) => {
            const files = pr["files"];
            return Array.isArray(files)
              ? files.map((file) =>
                  typeof file === "string" ? file : stringValue((file as RecordLike)["filename"]),
                )
              : [];
          }),
        ]),
      ]
        .filter(Boolean)
        .filter((file) => file !== nodePath)
        .slice(0, 8)
        .map((file) => ({
          label: file,
          reason: "Appears in the same change record as the target.",
          confidence: "high" as const,
        }));
  if (!coChanged.length && connected.length) {
    coChanged.push(
      ...connected.slice(0, 5).map((item) => ({
        label: item.label,
        reason: "Structurally adjacent; change coupling is inferred, not directly observed.",
        confidence: "medium" as const,
      })),
    );
    evidence.push({
      source: "inference",
      label: "Change coupling",
      detail:
        "No file-level co-change payload was available, so adjacent graph nodes are used as a cautious proxy.",
      strength: "inferred",
    });
  }

  const origin = relevantIssues.slice(0, 3).map((issue) => ({
    title: recordText(issue).slice(0, 100),
    detail: `Issue state: ${stringValue(issue["state"]) || "unknown"}. This is historical context, not proof of causality.`,
  }));
  if (!origin.length && snapshot?.repository?.description)
    origin.push({ title: "Repository intent", detail: snapshot.repository.description });
  if (origin.length)
    evidence.push({
      source: relevantIssues.length ? "issue" : "repository",
      label: "Why this exists",
      detail: `${origin.length} origin signal${origin.length === 1 ? "" : "s"} attached.`,
      strength: relevantIssues.length ? "supporting" : "direct",
    });

  const inspectBeforeActing: ContextEnvelope["inspectBeforeActing"] = [];
  if (node.blast.level === "High" || node.blast.level === "Critical")
    inspectBeforeActing.push({
      title: "Trace the blast radius",
      reason: "The selected area is connected to many downstream surfaces.",
      severity: "critical",
    });
  if (
    node.kind === "file" &&
    /auth|payment|billing|permission|token|session/i.test(
      `${node.label} ${nodePath} ${cleanIntent}`,
    )
  )
    inspectBeforeActing.push({
      title: "Inspect security and contract boundaries",
      reason: "The intent touches a boundary where silent behavior changes can escape local tests.",
      severity: "critical",
    });
  if (columnDrift.length)
    inspectBeforeActing.push({
      title: "Reconcile SQL contract drift",
      reason: columnDrift
        .slice(0, 3)
        .map((finding) => finding.message)
        .join(" "),
      severity: "critical",
    });
  if (coChanged.length)
    inspectBeforeActing.push({
      title: "Review coupled changes",
      reason: `${coChanged.length} neighboring areas repeatedly appear in the target context or are structurally adjacent.`,
      severity: "important",
    });
  if (relevantIssues.length)
    inspectBeforeActing.push({
      title: "Read the historical incidents",
      reason:
        "Past issues overlap the requested action; avoid recreating an already-solved failure mode.",
      severity: "important",
    });
  if (!inspectBeforeActing.length)
    inspectBeforeActing.push({
      title: "Confirm the owning boundary",
      reason:
        "The current graph evidence is limited; identify the public contract and its consumers before editing.",
      severity: "watch",
    });

  const confidence: ContextEnvelope["confidence"] = !snapshot
    ? "limited"
    : evidence.length >= 5
      ? "high"
      : "medium";
  return {
    target: { label: node.label, kind: node.kind, path: nodePath, summary: node.summary },
    intent: cleanIntent,
    connected,
    historicalChanges,
    coChanged,
    origin,
    columnDrift,
    inspectBeforeActing,
    evidence,
    confidence,
  };
}
