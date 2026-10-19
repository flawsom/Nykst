import type { RepoAnalysis } from "./types";
import snapshot from "./self-snapshot.json";

/**
 * Analysis of this repository at the time the snapshot was generated.
 * Used when the server runs from a bundle that has no source tree to walk.
 */
export const selfSnapshot = snapshot as unknown as RepoAnalysis;
