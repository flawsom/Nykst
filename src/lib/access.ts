import type { GraphNode } from "./graph-data";

export type RoleId = "engineer";

export interface RoleDef {
  id: RoleId;
  name: string;
  blurb: string;
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
    id: "engineer",
    name: "Engineer",
    blurb: "Full technical depth across every domain and repository.",
    domains: [],
    can: {
      viewAllDomains: true,
      viewIncidents: true,
      resolveIssues: true,
      approveAutoFix: true,
      manageAccess: true,
    },
  },
];

export function getRoleId(): RoleId {
  return "engineer";
}

export function setRoleId(_id: RoleId) {}

export function roleOf(_id: RoleId): RoleDef {
  return ROLES[0]!;
}

export function useRole(): RoleDef {
  return ROLES[0]!;
}

export function canView(_role: RoleDef, _node: GraphNode): boolean {
  return true;
}

export function filterForRole(_role: RoleDef, nodes: GraphNode[]): GraphNode[] {
  return nodes;
}

export function restrictedCount(_role: RoleDef, _nodes: GraphNode[]): number {
  return 0;
}
