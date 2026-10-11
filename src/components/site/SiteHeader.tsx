import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Nykst home">
      <span className="bg-primary block size-2.5 rounded-full" aria-hidden />
      <span className="font-mono text-[15px] font-semibold tracking-[0.2em] uppercase">Nykst</span>
    </Link>
  );
}

const navLink =
  "text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-1" aria-label="Main">
          <Link to="/mcp" className={navLink}>
            AI agents
          </Link>
          <Link to="/subscribe" className={navLink}>
            Pricing
          </Link>
          {children}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-border/70 mt-24 border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm sm:px-6">
        <Wordmark />
        <p>
          Read-only access. Source files are analyzed in memory; only the derived graph and history
          are saved.
        </p>
        <div className="flex gap-4">
          <Link to="/mcp" className="hover:text-foreground">
            MCP setup
          </Link>
          <Link to="/subscribe" className="hover:text-foreground">
            Pricing
          </Link>
        </div>
      </div>
    </footer>
  );
}
