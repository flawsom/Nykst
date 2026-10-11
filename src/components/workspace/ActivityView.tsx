import { useMemo, useState } from "react";
import { computeActivity, type Activity, type Episode } from "@/lib/analysis/activity";
import type { HistoryCommit } from "@/lib/analysis/types";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, EmptyState, FileLink, SectionTitle, Stat, buttonClass } from "./ui";

const RECENT_COMMITS = 30;
const RECENT_PRS = 15;
const TOP_AUTHORS = 8;
const FILES_SHOWN = 12;

function day(iso: string) {
  return iso.slice(0, 10);
}

function ShaLink({ commit }: { commit: HistoryCommit }) {
  const short = commit.sha.slice(0, 7);
  return commit.url ? (
    <a
      href={commit.url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary font-mono text-xs underline-offset-2 hover:underline"
    >
      {short}
    </a>
  ) : (
    <span className="text-muted-foreground font-mono text-xs">{short}</span>
  );
}

export function ActivityView() {
  const { data, selected } = useWorkspace();
  const activity = useMemo(
    () => computeActivity(data.history, selected ? [selected] : undefined),
    [data.history, selected],
  );

  if (!activity) {
    return (
      <EmptyState title="No activity to show">
        {selected && data.history?.commits.length
          ? "No commits in the analyzed history touched this file."
          : "Commit history was not available for this repository, so activity cannot be shown."}
      </EmptyState>
    );
  }
  return <ActivityBody activity={activity} scope={selected} />;
}

function ActivityBody({ activity, scope }: { activity: Activity; scope: string | null }) {
  const [allAuthors, setAllAuthors] = useState(false);
  const fixes = activity.timeline.reduce((sum, month) => sum + month.fixes, 0);
  const reverts = activity.episodes.filter((episode) => episode.kind === "revert").length;
  const authors = allAuthors ? activity.authors : activity.authors.slice(0, TOP_AUTHORS);
  const recent = [...activity.commits].reverse().slice(0, RECENT_COMMITS);
  const pulls = [...activity.pullRequests]
    .sort((a, b) => (b.mergedAt ?? "").localeCompare(a.mergedAt ?? "") || b.number - a.number)
    .slice(0, RECENT_PRS);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-muted-foreground text-sm break-all">
          {scope ?? "Whole repository"}, {day(activity.window.from)} to {day(activity.window.to)},{" "}
          {activity.window.commits} commits
        </p>
        <p className="text-muted-foreground text-xs">
          History covers the most recent commits that were analyzed, not necessarily the whole age
          of the repository.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Commits" value={activity.commits.length} />
        <Stat label="Contributors" value={activity.authors.length} />
        <Stat label="Fixes" value={fixes} tone={fixes ? "warn" : "neutral"} />
        <Stat label="Reverts" value={reverts} tone={reverts ? "danger" : "neutral"} />
      </div>

      <Timeline activity={activity} />

      <section className="space-y-2">
        <SectionTitle>Contributors</SectionTitle>
        <ul className="border-border divide-border divide-y rounded-lg border">
          {authors.map((author, i) => (
            <li key={author.name} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
              <span className="text-subtle tabular w-5 text-xs">{i + 1}</span>
              <span className="min-w-0 flex-1 text-sm font-medium break-words">{author.name}</span>
              <span className="text-muted-foreground text-xs">
                {author.commits} commits, {author.fixes} fixes, {author.files} files,{" "}
                {day(author.firstActive)} to {day(author.lastActive)}
              </span>
            </li>
          ))}
        </ul>
        {activity.authors.length > TOP_AUTHORS && (
          <button
            type="button"
            className={buttonClass.ghost}
            onClick={() => setAllAuthors((v) => !v)}
          >
            {allAuthors ? "Show top 8" : `Show all ${activity.authors.length}`}
          </button>
        )}
      </section>

      {activity.episodes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Episodes</SectionTitle>
          <ul className="space-y-2">
            {activity.episodes.map((episode, i) => (
              <EpisodeItem key={`${episode.commit.sha}:${i}`} episode={episode} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle>Recent commits</SectionTitle>
        <ul className="border-border divide-border divide-y rounded-lg border">
          {recent.map((commit) => (
            <CommitRow key={commit.sha} commit={commit} />
          ))}
        </ul>
      </section>

      {pulls.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Pull requests</SectionTitle>
          <ul className="border-border divide-border divide-y rounded-lg border">
            {pulls.map((pull) => (
              <li key={pull.number} className="space-y-0.5 px-3 py-2">
                <p className="text-sm font-medium">
                  {pull.url ? (
                    <a
                      href={pull.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary tabular underline-offset-2 hover:underline"
                    >
                      #{pull.number}
                    </a>
                  ) : (
                    <span className="tabular">#{pull.number}</span>
                  )}{" "}
                  {pull.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {pull.author},{" "}
                  {pull.mergedAt ? `merged ${day(pull.mergedAt)}` : `not merged (${pull.state})`},{" "}
                  {pull.files.length} files
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Timeline({ activity }: { activity: Activity }) {
  const months = activity.timeline;
  const max = Math.max(1, ...months.map((month) => month.commits));
  const every = Math.max(1, Math.ceil(months.length / 8));
  return (
    <section className="space-y-2">
      <SectionTitle>Commits per month</SectionTitle>
      <div className="border-border bg-surface rounded-lg border p-3">
        <div className="flex h-32 items-end gap-1" role="img" aria-label="Commits per month">
          {months.map((month) => (
            <div
              key={month.month}
              className="bg-primary/70 flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t"
              style={{ height: `${(month.commits / max) * 100}%` }}
              title={`${month.month}: ${month.commits} commits, ${month.fixes} fixes`}
            >
              <div
                className="bg-warn"
                style={{ height: `${(month.fixes / month.commits) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1" aria-hidden>
          {months.map((month, i) => (
            <div key={month.month} className="text-subtle min-w-0 flex-1 text-xs">
              <span className="block overflow-visible whitespace-nowrap">
                {i % every === 0 ? month.month : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="bg-primary/70 size-2.5 rounded-sm" /> Commits
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="bg-warn size-2.5 rounded-sm" /> Fixes
          </span>
        </p>
      </div>
      <details>
        <summary className="text-muted-foreground hover:text-foreground min-h-10 cursor-pointer py-2 text-sm">
          Show as table
        </summary>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Commits</th>
                <th className="px-3 py-2 font-medium">Fixes</th>
                <th className="px-3 py-2 font-medium">Contributors</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month} className="border-border border-t">
                  <td className="px-3 py-1.5">{month.month}</td>
                  <td className="tabular px-3 py-1.5">{month.commits}</td>
                  <td className="tabular px-3 py-1.5">{month.fixes}</td>
                  <td className="tabular px-3 py-1.5">{month.authors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function EpisodeItem({ episode }: { episode: Episode }) {
  const { commit, relatedTo } = episode;
  return (
    <li className="border-border bg-card space-y-1 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={episode.kind === "revert" ? "danger" : "warn"}>
          {episode.kind === "revert" ? "Revert" : "Fix after change"}
        </Badge>
        {episode.confidence === "explicit" ? (
          <Badge tone="ok">Stated in the commit</Badge>
        ) : (
          <Badge>Inferred (same files, shortly after)</Badge>
        )}
      </div>
      <p className="text-sm font-medium break-words">{commit.message}</p>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
        <ShaLink commit={commit} />
        <span>{commit.author}</span>
        <span>{day(commit.date)}</span>
      </p>
      {relatedTo && (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          <span>Relates to</span>
          <ShaLink commit={relatedTo} />
          <span className="break-words">{relatedTo.message}</span>
        </p>
      )}
      <p className="text-muted-foreground text-sm">{episode.note}</p>
    </li>
  );
}

function CommitRow({ commit }: { commit: HistoryCommit }) {
  return (
    <li>
      <details className="group">
        <summary className="hover:bg-surface-2 min-h-12 cursor-pointer px-3 py-2">
          <span className="text-sm break-words">{commit.message}</span>
          <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
            <ShaLink commit={commit} />
            <span>{commit.author}</span>
            <span>{day(commit.date)}</span>
            <span>{commit.files.length} files</span>
          </span>
        </summary>
        {commit.files.length > 0 && (
          <ul className="space-y-1 px-3 pt-1 pb-3">
            {commit.files.slice(0, FILES_SHOWN).map((file) => (
              <li key={file}>
                <FileLink path={file} />
              </li>
            ))}
            {commit.files.length > FILES_SHOWN && (
              <li className="text-muted-foreground text-xs">
                and {commit.files.length - FILES_SHOWN} more
              </li>
            )}
          </ul>
        )}
      </details>
    </li>
  );
}
