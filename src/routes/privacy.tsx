import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Baby,
  Clock3,
  FileText,
  Globe2,
  Info,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import {
  BREACH_PLAYBOOK,
  CHILDREN_POLICY,
  DATA_MAP,
  DPDP_PHASES,
  NOTICE,
  PURPOSES,
  RIGHTS,
  SUB_PROCESSORS,
} from "@/lib/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy and data · Nykst" }] }),
  component: PrivacyPage,
});

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
      <div className="flex items-start gap-2.5">
        <span className="text-primary mt-0.5">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  const [hindiGate, setHindiGate] = useState<string | null>(null);

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Privacy" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
            Plans
          </Link>
          <Link to="/limits" className="text-muted-foreground hover:text-foreground">
            Limits
          </Link>
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/");
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="size-3.5" /> Back
          </button>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
          Privacy and data
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          What Nykst holds, where it goes, and what is not enabled.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          This page is a transparency record, not a legal notice and not a claim of substantive DPDP
          compliance. India DPDP substantive duties are scheduled for 13 May 2027. Consent controls,
          rights requests and the Hindi notice stay gated until the DPO accepts the role and the
          required reviews are recorded.
        </p>

        <div className="border-amber-500/30 bg-amber-500/10 mt-6 flex items-start gap-2 rounded-xl border px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">No compliance claim is made yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
              Notice, consent records, rights workflow, breach clocks and the vendor contracts are
              specified but not all built or tested. Every gated control below states exactly what
              is missing instead of showing a fake toggle.
            </p>
          </div>
        </div>

        <Section
          title="Notice"
          subtitle="Versioned, standalone, and shown only in a language that has been reviewed."
          icon={<FileText className="size-4" />}
        >
          <div className="border-border bg-surface/60 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">Nykst privacy notice</p>
                <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                  {NOTICE.id} · version {NOTICE.version} · {NOTICE.status}
                </p>
              </div>
              <span className="border-border bg-card rounded-full border px-2.5 py-1 font-mono text-[10px]">
                Effective date not set
              </span>
            </div>
            <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
              A notice version is fixed once shown. Changing a purpose, processor, transfer or
              retention period creates a new version; it never silently edits the version a person
              already consented to.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="border-emerald-500/30 bg-emerald-500/10 rounded-full border px-2.5 py-1 text-[10px] text-emerald-300">
                English · draft
              </span>
              <button
                type="button"
                data-testid="hindi-notice-toggle"
                onClick={() => setHindiGate(NOTICE.languages.hi.reason)}
                className="border-border bg-surface hover:bg-surface-2 rounded-full border px-2.5 py-1 text-[10px]"
              >
                हिन्दी · gated
              </button>
            </div>
            {hindiGate && (
              <p
                data-testid="hindi-notice-gate"
                className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
              >
                {hindiGate}
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Purposes and consent"
          subtitle="One purpose per decision. A bundled consent is not a consent."
          icon={<ShieldCheck className="size-4" />}
        >
          <ul className="space-y-2">
            {PURPOSES.map((purpose) => (
              <li key={purpose.id} className="border-border bg-surface/60 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">
                      <span className="font-mono text-primary">{purpose.id}</span> {purpose.label}
                      {purpose.required && (
                        <span className="text-muted-foreground ml-1.5 text-[10px] uppercase">
                          required
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                      {purpose.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-disabled="true"
                    disabled
                    data-testid={`consent-${purpose.id}`}
                    className="border-border bg-card text-muted-foreground shrink-0 cursor-not-allowed rounded-full border px-2.5 py-1 text-[10px]"
                  >
                    {purpose.defaultState === "required" ? "Required" : "Off by default"} · gated
                  </button>
                </div>
                <p className="text-muted-foreground mt-2 border-t border-dashed border-border pt-2 text-[10px] leading-relaxed">
                  {purpose.gate}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Data map"
          subtitle="One row per processing activity, with role, basis, retention, processors and transfer."
          icon={<Globe2 className="size-4" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="text-muted-foreground border-border border-b">
                  <th className="py-2 pr-3 font-medium">Activity</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Basis</th>
                  <th className="py-2 pr-3 font-medium">Retention</th>
                  <th className="py-2 font-medium">Processors</th>
                </tr>
              </thead>
              <tbody>
                {DATA_MAP.map((row) => (
                  <tr key={row.activity} className="border-border/70 border-b align-top">
                    <td className="py-2.5 pr-3 font-medium">{row.activity}</td>
                    <td className="text-muted-foreground py-2.5 pr-3">{row.role}</td>
                    <td className="text-muted-foreground py-2.5 pr-3">{row.data}</td>
                    <td className="text-muted-foreground py-2.5 pr-3">{row.basis}</td>
                    <td className="text-muted-foreground py-2.5 pr-3">{row.retention}</td>
                    <td className="text-muted-foreground py-2.5">
                      {row.processors}
                      <span className="text-muted-foreground/70 mt-1 block">{row.transfer}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Rights"
          subtitle="Access, correction, erasure, grievance and nomination, with the real status of each."
          icon={<Users className="size-4" />}
        >
          <ul className="space-y-2">
            {RIGHTS.map((right) => (
              <li key={right.id} className="border-border bg-surface/60 rounded-xl border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold">{right.label}</p>
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    {right.status}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                  {right.detail}
                </p>
                <p className="text-muted-foreground mt-1.5 text-[10px] leading-relaxed">
                  {right.reason}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-[10px] leading-relaxed">
            No Data Protection Officer name, email or postal address is shown because the interim
            appointment has not been accepted. A placeholder officer would be worse than an honest
            gap.
          </p>
        </Section>

        <Section
          title="Breach playbook"
          subtitle="Every personal data breach is notifiable. The clocks below are drafted, not rehearsed."
          icon={<Clock3 className="size-4" />}
        >
          <ul className="space-y-2">
            {BREACH_PLAYBOOK.map((item) => (
              <li
                key={item.clock}
                className="border-border bg-surface/60 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]"
              >
                <span className="font-medium">{item.clock}</span>
                <span className="text-muted-foreground">{item.deadline}</span>
                <span className="text-amber-300">{item.status}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Processors and sub-processors"
          subtitle="A vendor that is not on this list must not receive user data."
          icon={<LockKeyhole className="size-4" />}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {SUB_PROCESSORS.map((item) => (
              <li
                key={item.name}
                className="border-border bg-surface/60 rounded-lg border px-3 py-2"
              >
                <p className="text-[11px] font-semibold">{item.name}</p>
                <p className="text-muted-foreground mt-0.5 text-[10px]">{item.purpose}</p>
                <p className="text-muted-foreground mt-1 font-mono text-[10px]">{item.status}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Children"
          subtitle="No tracking, behavioural monitoring, or targeted advertising for a child account."
          icon={<Baby className="size-4" />}
        >
          <p className="border-border bg-surface/60 text-muted-foreground rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed">
            {CHILDREN_POLICY.summary}
          </p>
        </Section>

        <Section
          title="DPDP timeline"
          subtitle="Do not wait for 2027 to build; do not claim 2026 compliance for duties not in force."
          icon={<Clock3 className="size-4" />}
        >
          <ol className="space-y-2">
            {DPDP_PHASES.map((phase) => (
              <li key={phase.date} className="flex flex-wrap gap-x-3 text-[11px]">
                <span className="text-primary w-28 shrink-0 font-mono">{phase.date}</span>
                <span className="w-40 shrink-0 font-medium">{phase.phase}</span>
                <span className="text-muted-foreground">{phase.detail}</span>
              </li>
            ))}
          </ol>
        </Section>

        <p className="text-muted-foreground mt-8 text-[10px] leading-relaxed">
          This is general product research, not legal advice. Section and Rule numbers must be
          checked against the Gazette text with counsel before the product ships on them.
        </p>
      </div>
    </main>
  );
}
