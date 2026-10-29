import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Handshake } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { ContactForm } from "@/components/site/ContactForm";

const CONTACT_EMAIL = "nykstsoftint@gmail.com";

export const Route = createFileRoute("/partnerships")({
  head: () => ({
    meta: [
      { title: "Partnerships · Nykst" },
      {
        name: "description",
        content:
          "Work with Nykst on integrations, team deployments, research, or community projects. Tell us what you have in mind.",
      },
    ],
  }),
  component: PartnershipsPage,
});

function PartnershipsPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Partnerships" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
            Plans
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
            Partnerships
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Build something with us.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed">
            We work with teams who care about the same question Nykst answers: what will this change
            affect before it ships? That includes developer tools, engineering organisations,
            research groups, and open source projects.
          </p>
          <ul className="text-muted-foreground mt-6 space-y-3 text-sm leading-relaxed">
            <li className="flex gap-2.5">
              <Handshake className="text-primary mt-0.5 size-4 shrink-0" />
              Integrations with editors, review tools, and delivery pipelines.
            </li>
            <li className="flex gap-2.5">
              <Handshake className="text-primary mt-0.5 size-4 shrink-0" />
              Team rollouts with a shared map of your systems.
            </li>
            <li className="flex gap-2.5">
              <Handshake className="text-primary mt-0.5 size-4 shrink-0" />
              Research and teaching on real repositories.
            </li>
          </ul>
          <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
            Tell us what you have in mind, who it is for, and the outcome you want. A person reads
            every message.
          </p>
        </div>

        <div>
          <ContactForm
            defaultTopic="Partnerships"
            contactEmail={CONTACT_EMAIL}
            intro="Share the shape of the partnership and the best way to reach you."
          />
        </div>
      </div>
    </main>
  );
}
