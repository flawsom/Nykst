/**
 * Graph model shared by the navigator, the analysis engine and the impact envelope.
 *
 * Every node in the product comes from a real repository analysis
 * (`buildRepositoryGraph` in `@/lib/repository-graph`). There is no generated or
 * sample organization here: when nothing is connected the product shows a real
 * empty state instead of invented data.
 */

export type NodeKind = "org" | "domain" | "capability" | "service" | "module" | "file";

export interface BlastRadius {
  services: number;
  modules: number;
  files: number;
  teams: number;
  level: "Low" | "Moderate" | "High" | "Critical";
}

export interface FileDetail {
  path: string;
  language: string;
  loc: number;
  classes: string[];
  functions: string[];
  tests: string[];
  history: { when: string; who: string; what: string }[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  summary: string;
  metrics?: { label: string; value: string }[];
  owners: string[];
  dependencies: string[];
  dependents: string[];
  blast: BlastRadius;
  detail?: FileDetail;
  children?: GraphNode[];
  /** git repository this node maps to, e.g. acme/billing-api */
  repo?: string;
  /** primary implementation language */
  language?: string;
  /** false when this node is a terminal leaf (a file) */
  expandable: boolean;
  /** set on nodes built from a real repository analysis */
  analysisRef?: {
    type: "repository" | "directory" | "file" | "service" | "resource" | "group";
    key: string;
    /** analyzed source files this node stands for; the seeds for impact analysis */
    paths: string[];
  };
}

/** Children of a real node. Nodes without children are leaves, nothing is generated. */
export function childrenOf(node: GraphNode): GraphNode[] {
  if (node.children) return node.children;
  return [];
}

export const kindLabel: Record<NodeKind, string> = {
  org: "Organization",
  domain: "Core domain",
  capability: "Capability",
  service: "Service",
  module: "Module",
  file: "File",
};

export const childKindLabel: Record<NodeKind, string> = {
  org: "Core domains",
  domain: "Capabilities",
  capability: "Services",
  service: "Modules",
  module: "Files",
  file: "Structure",
};
