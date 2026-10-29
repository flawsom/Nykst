import snapshotRaw from "./self-snapshot.json?raw";
import type { RepoAnalysis } from "./types";

/**
 * Analysis of this repository at the time the snapshot was generated.
 * Used when the server runs from a bundle that has no source tree to walk.
 *
 * Imported as raw text on purpose. A static JSON import makes TypeScript infer
 * the type of a one megabyte object literal on every cold typecheck, which
 * pushed `tsc -b` past three minutes. The string import keeps the same bundle
 * content and the cast below is the single place the shape is asserted.
 */
export const selfSnapshot = JSON.parse(snapshotRaw) as RepoAnalysis;
