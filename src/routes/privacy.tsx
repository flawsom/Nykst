import { type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock3, LockKeyhole, Mail, ShieldCheck, Trash2, Users } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { ContactForm } from "@/components/site/ContactForm";

const CONTACT_EMAIL = "nykstsoftint@gmail.com";
const UPDATED = "29 October 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · Nykst" },
      {
        name: "description",
        content:
          "What Nykst stores, why, how long we keep it, who helps us run the service, and how to ask us to access, correct or delete your data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacyPage() {
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

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Privacy</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your code stays yours.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Nykst reads the repositories you choose so it can build a map of your system. It does not
          write to them. This page explains what we store, why we store it, how long we keep it, and
          how you can change or remove it. Last updated {UPDATED}.
        </p>

        <Section title="What we store" icon={<ShieldCheck className="size-4" />}>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your name, email and the messages you send us.</li>
            <li>
              The account details you sign in with, and the repositories you choose to connect.
            </li>
            <li>
              A structural map of those repositories: files, connections, database tables, and
              related notes. We keep derived structure, not a copy of your code.
            </li>
            <li>Basic usage information, so we can keep the service working and fix problems.</li>
          </ul>
        </Section>

        <Section title="Why we store it" icon={<LockKeyhole className="size-4" />}>
          <p>
            To build and show your system map, to answer your questions about it, to run your
            account, to reply when you contact us, and to keep the service secure. We do not sell
            your data, and we do not use your private code to train models.
          </p>
          <p>
            If you choose to use an AI assistant inside Nykst, only the parts of the repository
            needed to answer that question are sent. You can use Nykst without turning that on.
          </p>
        </Section>

        <Section title="Who helps us run it" icon={<Users className="size-4" />}>
          <p>
            A small number of service providers host the application, store the database, send
            email, and process payments when billing is active. They act on our instructions and
            only for the purposes above. We do not name them on this page, but you can ask us for
            the current list at{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="How long we keep it" icon={<Clock3 className="size-4" />}>
          <p>
            Account and repository maps stay while your workspace is active and for 30 days after
            you close it. Support messages are kept for one year. Usage logs are kept for one year.
            When you ask us to delete your account, we remove the map, the stored history, and the
            derived answers, and we tell you when it is done.
          </p>
        </Section>

        <Section title="Your choices" icon={<Trash2 className="size-4" />}>
          <p>
            You can ask us to show you what we hold, correct it, delete it, or stop a particular
            use. You can also tell us who should act for you if you are unable to. Send the request
            with the form below or email us. You get a reference straight away, and we reply within
            2 business days.
          </p>
          <p>
            You can disconnect a repository at any time, and you can close your account from your
            workspace settings or by asking us.
          </p>
        </Section>

        <Section title="Contact us" icon={<Mail className="size-4" />}>
          <p>
            Privacy requests go to{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            , or use the form below to get a reference number immediately.
          </p>
          <div className="mt-4">
            <ContactForm
              defaultTopic="Privacy request"
              contactEmail={CONTACT_EMAIL}
              intro="Tell us what you need. Choose Privacy request so it reaches the right queue."
            />
          </div>
        </Section>

        <p className="text-muted-foreground mt-8 text-xs">
          Nykst operates from India. If you are not satisfied with our reply, tell us in the same
          thread and we will escalate it. You can also contact your local data protection authority.
        </p>
      </div>
    </main>
  );
}
