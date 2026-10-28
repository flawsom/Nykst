/**
 * DPDP transparency data for the privacy dashboard.
 *
 * This is a build-status record, not a legal notice and not a claim of
 * substantive DPDP compliance. Substantive duties are scheduled for 13 May 2027
 * in the PRD research, so the page states what is built, what is gated, and what
 * is not in force.
 */

export interface Purpose {
  id: "P1" | "P2" | "P3" | "P4" | "P5";
  label: string;
  description: string;
  required: boolean;
  defaultState: "required" | "off";
  gate: string;
}

export const PURPOSES: Purpose[] = [
  {
    id: "P1",
    label: "Core service",
    description:
      "Account, repository connection, indexing, search, and answers about a connected repository.",
    required: true,
    defaultState: "required",
    gate: "Consent records are not enabled until the DPO accepts the interim role and the consent store is verified.",
  },
  {
    id: "P2",
    label: "AI processing",
    description: "Sending selected snippets and prompts to a named AI provider in a named region.",
    required: false,
    defaultState: "off",
    gate: "Provider, region, retention and training terms must be shown at repo connect and first AI use first.",
  },
  {
    id: "P3",
    label: "Product improvement and analytics",
    description:
      "Usage telemetry, and separately any use of code for model training or evaluation.",
    required: false,
    defaultState: "off",
    gate: "Training is a separate opt-in and stays off by default; no customer code is used for training in this build.",
  },
  {
    id: "P4",
    label: "Marketing and communications",
    description: "Product news, upsell, and research contact.",
    required: false,
    defaultState: "off",
    gate: "Marketing consent defaults to off and is not bundled with the core service.",
  },
  {
    id: "P5",
    label: "Integrations and sharing",
    description: "Each third-party integration as its own grant with its own scope.",
    required: false,
    defaultState: "off",
    gate: "Per-integration grants are not enabled until each integration has its own scope and withdrawal path.",
  },
];

export const NOTICE = {
  id: "nykst-privacy-notice",
  version: "2026-10-28-draft",
  /** No effective date is claimed: the notice is a draft until counsel review. */
  effectiveDate: null,
  status: "draft" as const,
  languages: {
    en: { status: "draft", reviewedBy: null },
    hi: {
      status: "gated",
      reviewedBy: null,
      reason:
        "Hindi text is pending translator and counsel review. English text is never shown as Hindi.",
    },
  },
} as const;

export interface DataMapRow {
  activity: string;
  role: "fiduciary" | "processor";
  data: string;
  purpose: string;
  basis: string;
  retention: string;
  processors: string;
  transfer: string;
}

export const DATA_MAP: DataMapRow[] = [
  {
    activity: "Account and sign-in",
    role: "fiduciary",
    data: "GitHub user id, login, avatar and session cookie",
    purpose: "P1 core service",
    basis: "Consent; contract for the service",
    retention: "While the account exists, then deleted on request",
    processors: "GitHub (OAuth), Supabase (database)",
    transfer: "Provider regions; disclosed per vendor",
  },
  {
    activity: "Repository indexing and analysis",
    role: "processor",
    data: "Repository contents, paths, imports, SQL migrations, commit metadata",
    purpose: "P1 core service on the customer instruction",
    basis: "Processor on documented customer instruction",
    retention: "Until the customer deletes the snapshot or the account",
    processors: "GitHub (read-only), Supabase",
    transfer: "Provider regions; disclosed per vendor",
  },
  {
    activity: "AI-assisted explanation",
    role: "processor",
    data: "Selected snippets and the user prompt",
    purpose: "P2 AI processing",
    basis: "Separate consent, not bundled with P1",
    retention: "Minimum snippet; provider retention terms must be recorded before enabling",
    processors: "Configured AI provider in server storage",
    transfer: "Provider region, to be recorded before enabling",
  },
  {
    activity: "Billing",
    role: "fiduciary",
    data: "Plan, period, payment status, last four digits; no full card number",
    purpose: "P1 core service and legal obligation",
    basis: "Contract and legal obligation for tax records",
    retention: "Invoices and tax records for the legally required period",
    processors: "Razorpay when live; no live charge in this build",
    transfer: "India settlement; international conversion not enabled",
  },
  {
    activity: "Support and rights requests",
    role: "fiduciary",
    data: "Contact details and the content of the request",
    purpose: "P1 core service and grievance",
    basis: "Consent and legal obligation",
    retention: "Request log retained for the grievance window",
    processors: "Support mailbox provider, to be recorded",
    transfer: "Provider regions; contact to be announced",
  },
];

export const RIGHTS = [
  {
    id: "access",
    label: "Access and information",
    detail: "A summary of the personal data processed and the processors it was shared with.",
    status: "gated",
    reason:
      "The self-service export is not enabled until the DPO accepts the interim role and the data map is verified.",
  },
  {
    id: "correction",
    label: "Correction and completion",
    detail: "Correct inaccurate data and complete incomplete data.",
    status: "gated",
    reason: "The request workflow and reference ids are not enabled yet.",
  },
  {
    id: "erasure",
    label: "Erasure",
    detail: "Erase data when the purpose is served, unless law requires retention.",
    status: "gated",
    reason:
      "Deletion propagation to indexes, embeddings and provider copies must be verified before this is offered.",
  },
  {
    id: "grievance",
    label: "Grievance redressal",
    detail: "A named contact and a response commitment before any Board complaint.",
    status: "gated",
    reason:
      "The DPO appointment and published contact are pending acceptance. No placeholder name or email is shown.",
  },
  {
    id: "nomination",
    label: "Nomination",
    detail: "Nominate a person to exercise rights on death or incapacity.",
    status: "gated",
    reason: "The nomination record is not enabled yet.",
  },
] as const;

export const BREACH_PLAYBOOK = [
  {
    clock: "Principals",
    deadline: "Without delay after awareness",
    status: "Draft, not rehearsed",
  },
  {
    clock: "Data Protection Board",
    deadline: "Without delay, detailed report within 72 hours",
    status: "Draft, not rehearsed",
  },
  {
    clock: "CERT-In",
    deadline: "Within 6 hours for specified cyber incidents",
    status: "Draft, not rehearsed",
  },
] as const;

export const CHILDREN_POLICY = {
  status: "gated",
  summary:
    "Nykst is not designed for children. No tracking, behavioural monitoring, or targeted advertising is enabled for a child account. A child account flow is not offered until verifiable parental consent and the required safeguards are built and tested.",
} as const;

export const SUB_PROCESSORS = [
  { name: "GitHub", purpose: "Read-only repository access and sign-in", status: "Configured" },
  { name: "Supabase", purpose: "Database and authentication storage", status: "Configured" },
  {
    name: "AI provider",
    purpose: "Optional AI-assisted explanation",
    status: "Configured in server storage; contract terms not published",
  },
  { name: "Vercel", purpose: "Hosting and deployment", status: "Configured" },
  { name: "Razorpay", purpose: "Payments", status: "Not live; no charge is taken" },
] as const;

export const DPDP_PHASES = [
  {
    date: "13 Nov 2025",
    phase: "Phase 1 in force",
    detail: "Board and procedure provisions only.",
  },
  {
    date: "13 Nov 2026",
    phase: "Phase 2 scheduled",
    detail: "Consent Manager registration; not a general fiduciary deadline.",
  },
  {
    date: "13 May 2027",
    phase: "Phase 3 scheduled",
    detail: "Substantive duties: notice, consent, security, breach, retention, children, rights.",
  },
] as const;

export function privacySummary() {
  return {
    notice: NOTICE,
    purposes: PURPOSES,
    rights: RIGHTS,
    dataMap: DATA_MAP,
    breach: BREACH_PLAYBOOK,
    children: CHILDREN_POLICY,
    subProcessors: SUB_PROCESSORS,
    phases: DPDP_PHASES,
    /** No substantive compliance claim is made before the May 2027 duties are in force and tested. */
    complianceClaim: false as const,
  };
}
