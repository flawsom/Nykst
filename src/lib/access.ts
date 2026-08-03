import { useEffect, useState } from "react";
import type { GraphNode } from "./graph-data";

export type RoleId = "owner" | "architect" | "engineer" | "viewer";

export interface RoleDef {
  id: RoleId;
  name: string;
  blurb: string;
  /** domain labels this role may open; empty array = every domain */
  domains: string[];
  can: {
    viewAllDomains: boolean;
    viewIncidents: boolean;
    resolveIssues: boolean;
    approveAutoFix: boolean;
    manageAccess: boolean;
  };
}

export const ROLES: RoleDef[] = [
  {
    id: "owner",
    name: "Org owner",
    blurb: "Full visibility across every domain, plus access and approval control.",
    domains: [],
    can: {
      viewAllDomains: true,
      viewIncidents: true,
      resolveIssues: true,
      approveAutoFix: true,
      manageAccess: true,
    },
  },
  {
    id: "architect",
    name: "Architect",
    blurb: "Sees the whole graph and may resolve issues, but not change access.",
    domains: [],
    can: {
      viewAllDomains: true,
      viewIncidents: true,
      resolveIssues: true,
      approveAutoFix: true,
      manageAccess: false,
    },
  },
  {
    id: "engineer",
    name: "Engineer",
    blurb: "Scoped to the domains their teams own. Can resolve issues in scope.",
    domains: ["Platform Engineering", "Core APIs", "Data & Analytics"],
    can: {
      viewAllDomains: false,
      viewIncidents: true,
      resolveIssues: true,
      approveAutoFix: false,
      manageAccess: false,
    },
  },
  {
    id: "viewer",
    name: "Viewer",
    blurb: "Read-only navigation of public domains. No incidents, no remediation.",
    domains: ["Platform Engineering", "Core APIs"],
    can: {
      viewAllDomains: false,
      viewIncidents: false,
      resolveIssues: false,
      approveAutoFix: false,
      manageAccess: false,
    },
  },
];

const KEY = "nykst.role";
const listeners = new Set<(r: RoleId) => void>();

export function getRoleId(): RoleId {
  if (typeof window === "undefined") return "engineer";
  const v = localStorage.getItem(KEY) as RoleId | null;
  return ROLES.some((r) => r.id === v) ? (v as RoleId) : "engineer";
}

export function setRoleId(id: RoleId) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, id);
  listeners.forEach((l) => l(id));
}

export function roleOf(id: RoleId): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[2]!;
}

/** Reactive current role. */
export function useRole(): RoleDef {
  const [id, setId] = useState<RoleId>("engineer");
  useEffect(() => {
    setId(getRoleId());
    const l = (next: RoleId) => setId(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return roleOf(id);
}

/** A node is permitted when its domain ancestor is in the role's scope. */
export function canView(role: RoleDef, node: GraphNode): boolean {
  if (role.can.viewAllDomains) return true;
  if (node.kind === "org") return true;
  const domain = node.id.split("/").find((seg) => seg.startsWith("domain:"));
  if (!domain) return true;
  const label = domain.slice("domain:".length);
  return role.domains.includes(label);
}

export function filterForRole(role: RoleDef, nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((n) => canView(role, n));
}

export function restrictedCount(role: RoleDef, nodes: GraphNode[]): number {
  return nodes.length - filterForRole(role, nodes).length;
}
