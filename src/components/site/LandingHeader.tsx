import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { cn } from "@/lib/utils";
import { ApiSettingsButton } from "@/components/graph/ApiSettings";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV = [
  { label: "How it works", href: "#architecture-engine" },
  { label: "System map", to: "/graph" },
  { label: "History", to: "/intelligence" },
  { label: "Developers", to: "/mcp" },
  { label: "Plans", href: "#plans" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "border-border/70 bg-background/85 sticky top-0 z-40 border-b backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300",
        scrolled && "bg-background/95 border-border shadow-[0_18px_50px_-38px_rgba(0,0,0,0.95)]",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5">
          <NykstBrand subtitle="See what your change will touch" size={30} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV.map((item) =>
            "href" in item ? (
              <a
                key={item.label}
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:bg-surface group relative rounded-lg px-3 py-2 text-xs font-medium transition-colors"
              >
                {item.label}
                <span className="bg-primary absolute inset-x-3 -bottom-px h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="text-muted-foreground hover:text-foreground hover:bg-surface group relative rounded-lg px-3 py-2 text-xs font-medium transition-colors"
              >
                {item.label}
                <span className="bg-primary absolute inset-x-3 -bottom-px h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
              </Link>
            ),
          )}
          <ApiSettingsButton />
          <Link
            to="/subscribe"
            className="bg-primary text-primary-foreground hover:bg-primary-glow group ml-2 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_var(--primary)]"
          >
            Start trial
            <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <Link
            to="/subscribe"
            className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex h-11 items-center gap-1.5 rounded-lg px-3.5 text-[11px] font-semibold transition-colors"
          >
            Start trial
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="border-border bg-surface text-foreground hover:bg-surface-2 inline-flex size-11 items-center justify-center rounded-lg border transition-colors"
              >
                <Menu className="size-4" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="border-border bg-background w-[88vw] max-w-sm overflow-y-auto p-6"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="font-display text-xl tracking-tight">Menu</SheetTitle>
                <SheetDescription className="text-muted-foreground text-xs">
                  Open the live map, read the docs, or start a 7-day trial.
                </SheetDescription>
              </SheetHeader>
              <nav className="mt-8 grid gap-1" aria-label="Mobile navigation">
                {NAV.map((item) =>
                  "href" in item ? (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="border-border/60 text-foreground hover:bg-surface flex items-center justify-between border-b py-3 text-sm font-medium"
                    >
                      {item.label}
                      <ArrowUpRight className="text-muted-foreground size-4" />
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="border-border/60 text-foreground hover:bg-surface flex items-center justify-between border-b py-3 text-sm font-medium"
                    >
                      {item.label}
                      <ArrowUpRight className="text-muted-foreground size-4" />
                    </Link>
                  ),
                )}
              </nav>
              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  AI settings
                </span>
                <ApiSettingsButton />
              </div>
              <Link
                to="/subscribe"
                onClick={() => setOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary-glow mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Start 7-day trial <ArrowUpRight className="size-4" />
              </Link>
              <p className="text-muted-foreground mt-3 text-center text-[10px] leading-relaxed">
                Read-only GitHub access. Cancel any time before day 8.
              </p>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
