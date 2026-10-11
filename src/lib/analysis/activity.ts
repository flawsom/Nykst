import {
  daysBetween,
  isFixLike,
  isRevert,
  monthOf,
  revertedSha,
  revertedSubject,
} from "./history-utils";
import type { HistoryCommit, HistoryPullRequest, RepoHistory } from "./types";

/**
 * Who worked where and when, derived from commit and pull request history. Reverts are
 * matched to the commit they undo when the message says so ("This reverts commit …"); a fix
 * that follows a change to the same files within two weeks is shown as *likely* related, and
 * labelled as inferred.
 */

export interface AuthorActivity {
  name: string;
  commits: number;
  fixes: number;
  files: number;
  firstActive: string;
  lastActive: string;
}

export interface TimelineMonth {
  month: string;
  commits: number;
  fixes: number;
  authors: string[];
}

export interface Episode {
  kind: "revert" | "fix-after-change";
  /** explicit: the message names the original; inferred: same files shortly before */
  confidence: "explicit" | "inferred";
  commit: HistoryCommit;
  relatedTo: HistoryCommit | null;
  note: string;
}

export interface Activity {
  commits: HistoryCommit[];
  authors: AuthorActivity[];
  timeline: TimelineMonth[];
  episodes: Episode[];
  pullRequests: HistoryPullRequest[];
  window: { from: string; to: string; commits: number };
}

const BULK_COMMIT_FILES = 25;
const FOLLOW_UP_DAYS = 14;

export function computeActivity(
  history: RepoHistory | undefined,
  paths?: string[],
): Activity | null {
  if (!history?.commits.length) return null;
  const everything = [...history.commits].sort((a, b) => a.date.localeCompare(b.date));
  const wanted = paths ? new Set(paths) : null;
  const commits = wanted
    ? everything.filter((commit) => commit.files.some((file) => wanted.has(file)))
    : everything;
  const pullRequests = wanted
    ? history.pullRequests.filter((pull) => pull.files.some((file) => wanted.has(file)))
    : history.pullRequests;
  if (!commits.length && !pullRequests.length) return null;

  const authors = new Map<string, AuthorActivity & { touched: Set<string> }>();
  const months = new Map<string, TimelineMonth & { who: Set<string> }>();
  for (const commit of commits) {
    const fix = isFixLike(commit.message);
    const author =
      authors.get(commit.author) ??
      ({
        name: commit.author,
        commits: 0,
        fixes: 0,
        files: 0,
        firstActive: commit.date,
        lastActive: commit.date,
        touched: new Set<string>(),
      } as AuthorActivity & { touched: Set<string> });
    author.commits += 1;
    if (fix) author.fixes += 1;
    for (const file of commit.files) if (!wanted || wanted.has(file)) author.touched.add(file);
    if (commit.date < author.firstActive) author.firstActive = commit.date;
    if (commit.date > author.lastActive) author.lastActive = commit.date;
    authors.set(commit.author, author);

    const key = monthOf(commit.date);
    const month = months.get(key) ?? {
      month: key,
      commits: 0,
      fixes: 0,
      authors: [],
      who: new Set<string>(),
    };
    month.commits += 1;
    if (fix) month.fixes += 1;
    month.who.add(commit.author);
    months.set(key, month);
  }

  const episodes: Episode[] = [];
  const bySha = new Map(everything.map((commit) => [commit.sha.toLowerCase(), commit]));
  const bySubject = new Map(everything.map((commit) => [commit.message, commit]));
  for (const commit of commits) {
    if (isRevert(commit.message)) {
      const sha = revertedSha(commit.message, commit.body);
      const subject = revertedSubject(commit.message);
      const original =
        (sha &&
          [...bySha.entries()].find(([key]) => key.startsWith(sha) || sha.startsWith(key))?.[1]) ||
        (subject ? (bySubject.get(subject) ?? null) : null);
      episodes.push({
        kind: "revert",
        confidence: original ? "explicit" : "inferred",
        commit,
        relatedTo: original ?? null,
        note: original
          ? `Undid ${original.sha.slice(0, 7)} "${original.message}" by ${original.author}`
          : "Reverted an earlier change that is outside the history window",
      });
      continue;
    }
    if (!isFixLike(commit.message) || commit.files.length > BULK_COMMIT_FILES) continue;
    const fixedFiles = new Set(commit.files);
    const earlier = everything
      .filter(
        (candidate) =>
          candidate.date < commit.date &&
          candidate.sha !== commit.sha &&
          !isFixLike(candidate.message) &&
          candidate.files.length <= BULK_COMMIT_FILES &&
          daysBetween(candidate.date, commit.date) <= FOLLOW_UP_DAYS &&
          candidate.files.some((file) => fixedFiles.has(file)),
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (earlier)
      episodes.push({
        kind: "fix-after-change",
        confidence: "inferred",
        commit,
        relatedTo: earlier,
        note: `Touches the same files as ${earlier.sha.slice(0, 7)} "${earlier.message}" ${Math.max(1, Math.round(daysBetween(earlier.date, commit.date)))} day(s) earlier`,
      });
  }

  const dates = commits.map((commit) => commit.date).sort();
  return {
    commits: [...commits].reverse(),
    authors: [...authors.values()]
      .map(({ touched, ...author }) => ({ ...author, files: touched.size }))
      .sort((a, b) => b.commits - a.commits),
    timeline: [...months.values()]
      .map(({ who, ...month }) => ({ ...month, authors: [...who].sort() }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    episodes: episodes.reverse().slice(0, 25),
    pullRequests,
    window: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "", commits: commits.length },
  };
}
