import { describe, expect, test } from "bun:test";
import {
  BREACH_PLAYBOOK,
  DATA_MAP,
  NOTICE,
  PURPOSES,
  RIGHTS,
  privacySummary,
} from "../src/lib/privacy";

describe("DPDP transparency registry", () => {
  test("has five distinct purposes, with marketing and training off by default", () => {
    expect(PURPOSES.map((purpose) => purpose.id)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(new Set(PURPOSES.map((purpose) => purpose.id)).size).toBe(5);
    expect(PURPOSES.filter((purpose) => purpose.required).map((purpose) => purpose.id)).toEqual([
      "P1",
    ]);
    expect(PURPOSES.find((purpose) => purpose.id === "P4")?.defaultState).toBe("off");
    expect(PURPOSES.find((purpose) => purpose.id === "P3")?.description).toContain("training");
    expect(PURPOSES.every((purpose) => purpose.gate.length > 20)).toBe(true);
  });

  test("the notice is versioned, has no invented effective date, and Hindi stays gated", () => {
    expect(NOTICE.version).toMatch(/^\d{4}-\d{2}-\d{2}-draft$/);
    expect(NOTICE.effectiveDate).toBeNull();
    expect(NOTICE.languages.en.status).toBe("draft");
    expect(NOTICE.languages.hi.status).toBe("gated");
    expect(NOTICE.languages.hi.reason).toContain("never shown as Hindi");
  });

  test("the data map covers role, basis, retention, processors and transfer", () => {
    expect(DATA_MAP.length).toBeGreaterThanOrEqual(5);
    for (const row of DATA_MAP) {
      expect(row.activity.length).toBeGreaterThan(3);
      expect(["fiduciary", "processor"]).toContain(row.role);
      expect(row.basis.length).toBeGreaterThan(10);
      expect(row.retention.length).toBeGreaterThan(10);
      expect(row.processors.length).toBeGreaterThan(3);
      expect(row.transfer.length).toBeGreaterThan(10);
    }
    expect(DATA_MAP.some((row) => row.role === "processor")).toBe(true);
    expect(DATA_MAP.some((row) => row.processors.includes("Razorpay"))).toBe(true);
  });

  test("rights and breach clocks are present but not claimed as live", () => {
    expect(RIGHTS.map((right) => right.id)).toEqual([
      "access",
      "correction",
      "erasure",
      "grievance",
      "nomination",
    ]);
    expect(RIGHTS.every((right) => right.status === "gated")).toBe(true);
    expect(BREACH_PLAYBOOK.map((item) => item.clock)).toEqual([
      "Principals",
      "Data Protection Board",
      "CERT-In",
    ]);
    expect(BREACH_PLAYBOOK[1]?.deadline).toContain("72 hours");
    expect(BREACH_PLAYBOOK[2]?.deadline).toContain("6 hours");
    expect(BREACH_PLAYBOOK.every((item) => item.status === "Draft, not rehearsed")).toBe(true);
  });

  test("the summary never claims substantive compliance", () => {
    const summary = privacySummary();
    expect(summary.complianceClaim).toBe(false);
    const text = JSON.stringify(summary);
    // No placeholder officer is published.
    expect(text).not.toContain("@gmail.com");
    expect(text).not.toContain("DPO:");
  });
});
