import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionLabel } from "@/components/site/SectionLabel";

const QUESTIONS = [
  {
    question: "What does Nykst actually read?",
    answer:
      "Only the repositories you choose. Nykst reads the files needed to build a structural map: paths, imports, exports, SQL migrations, API contracts and the places your code touches external services. GitHub access is read-only. Nothing is committed, pushed or opened as a pull request.",
  },
  {
    question: "Does Nykst write to my repository?",
    answer:
      "No. The safe-coding loop works on an in-memory copy of the map. A proposed edit or deletion is checked for broken imports, new cycles and database column drift before anything touches disk. The result is evidence and a diff, never a commit.",
  },
  {
    question: "How is this different from a code graph or a code search tool?",
    answer:
      "A graph shows what connects to what. Nykst follows those connections to the consequence: the exact files, routes and tests a change reaches, the database columns it reads or writes, and whether a proposed patch makes the map worse. That is the difference between seeing the shape and knowing what breaks.",
  },
  {
    question: "Which languages and systems are covered?",
    answer:
      "TypeScript and JavaScript are compiled with the TypeScript compiler. Python, Go and Rust have static adapters. SQL migrations, Prisma models, OpenAPI operations and gRPC methods are linked to their call sites. Dynamic imports and framework conventions that leave no static edge are reported as limits, not guessed.",
  },
  {
    question: "Can I use it from my coding assistant?",
    answer:
      "Yes. Nykst exposes eleven read-only tools over MCP. The setup guides cover Claude Code, Cursor, VS Code, Codex, Windsurf, Gemini CLI, Cline, Zed and any other client that supports remote MCP servers.",
  },
  {
    question: "How does the trial work?",
    answer:
      "Start a seven-day trial on the plans page. Razorpay authorizes the payment method when you begin; Nykst does not charge during the trial. If you do not cancel before day eight, the plan begins. Monthly has a seven-day money-back window after the first charge, and annual has fourteen days.",
  },
  {
    question: "Do you train on my code?",
    answer:
      "No. Nykst does not train models on your code. Your saved map is used to answer your questions and to give your connected assistant evidence about your repositories. AI features use the provider you configure, and every substantive answer should point back to a file, line or commit.",
  },
  {
    question: "Can I remove access later?",
    answer:
      "Yes. GitHub access can be removed at any time from your GitHub settings, and the map stops updating. Nykst never asks for write access. If you need a saved workspace closed, contact us and a person will handle it.",
  },
];

export function LandingFaq() {
  return (
    <section
      id="faq"
      className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
        <div>
          <SectionLabel>Questions</SectionLabel>
          <h2 className="font-display mt-3 max-w-sm text-3xl leading-[1.08] tracking-tight sm:text-4xl">
            The things worth knowing before you connect a repo.
          </h2>
          <p className="text-body-ink mt-4 max-w-sm text-sm leading-relaxed">
            Clear answers about access, evidence, safety and what the map can and cannot see. If
            yours is not here, a person replies within two business days.
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {QUESTIONS.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`} className="border-border/70">
              <AccordionTrigger className="text-foreground py-5 text-left text-sm font-medium hover:no-underline sm:text-[15px]">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-subtle-foreground max-w-2xl text-xs leading-relaxed sm:text-[13px]">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
