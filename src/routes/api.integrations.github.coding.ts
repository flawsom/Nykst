import { createFileRoute } from "@tanstack/react-router";
import {
  githubBranchSha,
  githubContent,
  githubCreateBranch,
  githubCreatePullRequest,
  githubPutFile,
  json,
  requireGithubToken,
} from "@/lib/integrations/github";
import {
  AiKeyError,
  chatWithUserKey,
  currentUserId,
  loadUserKey,
  platformKey,
} from "@/lib/byok.server";

const SYSTEM = `You are Nykst Memory's safe code-change engine. Return only the complete proposed replacement file between the exact markers BEGIN_FILE and END_FILE. Do not include markdown fences, commentary, or any other file. Preserve existing behavior unless the requested change requires it. Never invent APIs or dependencies.`;

function diffLines(before: string, after: string, path: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  const removed = a.slice(start, endA + 1);
  const added = b.slice(start, endB + 1);
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${start + 1},${removed.length} +${start + 1},${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join("\n");
}

function parseReplacement(answer: string) {
  const match = answer.match(/BEGIN_FILE\s*\n([\s\S]*?)\nEND_FILE/);
  if (!match?.[1])
    throw new Error(
      "The coding model did not return a safe file replacement. Try a more specific request.",
    );
  return match[1];
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const Route = createFileRoute("/api/integrations/github/coding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const body = (await request.json()) as Record<string, unknown>;
          const action = clean(body["action"], 20);
          const owner = clean(body["owner"], 100);
          const repo = clean(body["repo"], 100);
          const path = clean(body["path"], 300);
          const base = clean(body["base"], 100) || "main";
          if (!owner || !repo || !path || path.includes(".."))
            return json({ error: "A safe repository file path is required." }, { status: 400 });

          if (action === "prepare") {
            const prompt = clean(body["prompt"], 4000);
            if (!prompt) return json({ error: "Describe the code change first." }, { status: 400 });
            const userId = await currentUserId(request);
            if (!userId)
              return json({ error: "Connect GitHub before generating a change." }, { status: 401 });
            const key = (await loadUserKey(userId)) ?? platformKey();
            if (!key)
              return json(
                {
                  error: "Add your provider key in Connect API before generating a change.",
                  needsKey: true,
                },
                { status: 428 },
              );
            const file = await githubContent(token, owner, repo, path, base);
            if (file.type !== "file" || !file.content)
              return json({ error: "GitHub did not return a text file." }, { status: 400 });
            const before = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
            if (before.length > 200_000)
              return json({ error: "This file is too large for a safe review." }, { status: 413 });
            const answer = await chatWithUserKey(
              key,
              SYSTEM,
              `Repository: ${owner}/${repo}\nBase branch: ${base}\nFile: ${path}\n\nRequested change:\n${prompt}\n\nCurrent file:\n${before}\n\nReturn exactly:\nBEGIN_FILE\n<complete replacement file>\nEND_FILE`,
              // A whole-file replacement cannot fit in the navigator budget.
              { maxTokens: 4000 },
            );
            const after = parseReplacement(answer);
            if (after.length > 220_000)
              return json(
                { error: "The proposed file is too large to review safely." },
                { status: 413 },
              );
            return json({
              owner,
              repo,
              path,
              base,
              baseSha: file.sha,
              before,
              after,
              diff: diffLines(before, after, path),
              testStatus: "not_run",
              testMessage:
                "No repository test command is configured in this preview. Tests must be run by the repository's CI after the PR is opened.",
            });
          }

          if (action === "create-pr") {
            const after = typeof body["after"] === "string" ? body["after"] : "";
            const title = clean(body["title"], 140) || `Nykst: update ${path}`;
            const commitMessage = clean(body["commitMessage"], 140) || title;
            const branch = clean(body["branch"], 80).replace(/[^a-zA-Z0-9._/-]/g, "-");
            const baseSha = clean(body["baseSha"], 100);
            if (
              !after ||
              !branch ||
              !baseSha ||
              branch === base ||
              branch.startsWith("-") ||
              branch.includes("..")
            )
              return json(
                {
                  error: "A reviewed file, unique branch, and current base revision are required.",
                },
                { status: 400 },
              );
            if (after.length > 220_000)
              return json(
                { error: "The proposed file is too large to publish safely." },
                { status: 413 },
              );
            const currentSha = await githubBranchSha(token, owner, repo, base);
            if (currentSha !== baseSha)
              return json(
                {
                  error:
                    "The base branch changed while you were reviewing. Generate a fresh preview.",
                },
                { status: 409 },
              );
            await githubCreateBranch(token, owner, repo, branch, currentSha);
            const commit = await githubPutFile(
              token,
              owner,
              repo,
              path,
              after,
              branch,
              commitMessage,
              baseSha,
            );
            const pull = await githubCreatePullRequest(
              token,
              owner,
              repo,
              title,
              `${clean(body["description"], 5000)}\n\nGenerated and reviewed in Nykst.\n\nTest status: not run by Nykst; configure repository CI to validate this PR before merge.`,
              branch,
              base,
            );
            return json({
              branch,
              commitSha: commit.commit?.sha ?? null,
              pullRequest: pull,
              testStatus: "not_run",
              testMessage: "PR created. Repository CI should run the authoritative tests now.",
            });
          }
          return json({ error: "Unknown coding action." }, { status: 400 });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 400;
          return json(
            { error: error instanceof Error ? error.message : "Coding workflow failed" },
            { status },
          );
        }
      },
    },
  },
});
