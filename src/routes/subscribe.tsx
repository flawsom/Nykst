import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { ContactForm } from "@/components/site/ContactForm";

const CONTACT_EMAIL = "nykstsoftint@gmail.com";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Plans and access · Nykst" },
      {
        name: "description",
        content:
          "Tell us about your team and we will set up your Nykst workspace and walk you through your first repository map.",
      },
    ],
  }),
  component: PlansPage,
});

function PlansPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Plans" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
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

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
            Plans and access
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with your own repository.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed">
            Nykst is open for early access. Tell us what you work on and we will set up your
            workspace, connect one repository with you, and walk through the first map together.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "A map of every file and how it connects, built from your repository.",
              "A clear answer to what a change will affect, before you make it.",
              "History and decisions in one place, so the next person does not start from zero.",
              "Help getting your first repository connected, by a person, not a form reply.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
            No payment is taken on this page. We agree the right plan with you before anything
            starts, and you can stop at any time.
          </p>
        </div>

        <div>
          <ContactForm
            defaultTopic="Plans and access"
            contactEmail={CONTACT_EMAIL}
            intro="Tell us your name, the best email to reach you, and one sentence about your codebase."
          />
        </div>
      </div>
    </main>
  );
}
