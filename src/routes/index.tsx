import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GithubConnectPanel } from "@/components/graph/GithubConnectPanel";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { AdvantagesForm } from "@/components/graph/AdvantagesForm";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst — System Navigator for Software Organizations" },
      {
        name: "description",
        content:
          "Nykst is the definitive system navigator for software organizations. Experience living software graphs, persistent memory, and autonomous reasoning.",
      },
      { property: "og:title", content: "Nykst — System Navigator for Software Organizations" },
      {
        property: "og:description",
        content:
          "Connect GitHub and let Nykst derive your engineering system from the code and collaboration history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function AuthWall() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const sendMagicLink = async () => {
    if (!email.trim()) {
      setMessage("Enter your email address to continue.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setMessage(
        error
          ? "Email sign-up is not configured yet. Please try again later."
          : "Check your inbox for a secure sign-up link.",
      );
    } catch {
      setMessage("Account sign-up is not configured yet. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  const continueWith = async (provider: "google" | "apple" | "github") => {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) setMessage("This sign-up method is not available yet. Try email instead.");
    } catch {
      setMessage("Account sign-up is not configured yet. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-xl">
      <div className="border-border bg-card w-full max-w-md rounded-3xl border p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2.5 rounded-full" />
          <span className="text-sm font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </div>
        <p className="text-primary mt-8 text-[10px] font-mono tracking-[0.28em] uppercase">
          Your software map starts here
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Create your account</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Sign up first, then connect the repository you want Nykst to understand. Your repository
          context stays connected to this account.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {(["google", "apple", "github"] as const).map((provider) => (
            <button
              key={provider}
              disabled={busy}
              onClick={() => void continueWith(provider)}
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-2 py-2.5 text-xs font-medium capitalize transition-colors disabled:opacity-50"
            >
              {provider}
            </button>
          ))}
        </div>

        <div className="text-muted-foreground my-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
          <span className="bg-border h-px flex-1" /> or use email{" "}
          <span className="bg-border h-px flex-1" />
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="border-border bg-surface min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={busy}
            onClick={() => void sendMagicLink()}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Continue
          </button>
        </div>
        {message && <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{message}</p>}
        <p className="text-muted-foreground mt-6 text-[11px] leading-relaxed">
          By continuing, you agree to use Nykst with repositories you are authorized to access. We
          use read-only repository access for mapping.
        </p>
      </div>
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [preRegister, setPreRegister] = useState(false);
  const [advantages, setAdvantages] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mounted) return;
          setSession(data.session);
          setAuthReady(true);
        })
        .catch(() => mounted && setAuthReady(true));
    } catch {
      setAuthReady(true);
    }

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const result = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (mounted) setSession(nextSession);
      });
      subscription = result.data.subscription;
    } catch {
      // Supabase may be intentionally unconfigured in a preview. Keep the page usable.
      setAuthReady(true);
    }

    setGithubConnected(new URLSearchParams(window.location.search).get("github") === "connected");
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const logout = () => {
    void supabase.auth.signOut().catch(() => undefined);
  };

  const connect = () => {
    window.location.assign("/api/integrations/github/start");
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {preRegister && <PreRegisterForm onClose={() => setPreRegister(false)} />}
      {advantages && <AdvantagesForm onClose={() => setAdvantages(false)} />}
      {authReady && !session && <AuthWall />}

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="aurora size-[520px]"
          style={{ background: "var(--primary)", opacity: 0.18, top: "-14%", left: "-8%" }}
        />
        <span
          className="aurora size-[420px]"
          style={{
            background: "var(--node-capability)",
            opacity: 0.14,
            top: "22%",
            right: "-10%",
            animationDelay: "-6s",
          }}
        />
        <span
          className="aurora size-[380px]"
          style={{
            background: "var(--node-service)",
            opacity: 0.12,
            bottom: "-12%",
            left: "34%",
            animationDelay: "-11s",
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid" />

      <header className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2.5 rounded-full" />
          <span className="text-[15px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/graph"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Open graph →
          </Link>
          <Link
            to="/intelligence"
            className="text-primary hover:underline transition-colors font-medium flex items-center gap-1"
          >
            <Sparkles className="size-3.5" /> Intelligence Core →
          </Link>
          {session && (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground hidden max-w-[180px] truncate font-mono text-xs sm:inline">
                {session.user.email ?? "Connected account"}
              </span>
              <button
                onClick={logout}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow glow-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Pre-register
          </button>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24">
        <p className="animate-rise text-primary text-xs tracking-[0.3em] uppercase font-mono">
          System Intelligence & Organizational Navigation
        </p>
        <h1
          className="animate-rise text-gradient mt-6 max-w-4xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          The system navigator for your software organization.
        </h1>
        <p
          className="animate-rise text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed"
          style={{ animationDelay: "160ms" }}
        >
          Connect your organization once. Nykst analyzes the codebase itself and renders it as a
          living graph — core domains, capabilities, services, modules, down to a single file. No
          folder browsing. No guesswork.
        </p>

        {/* Pre-register & Distinct Green Advantages Section */}
        <div
          className="animate-rise mt-8 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "200ms" }}
        >
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow lift hover:lift-hover rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20"
          >
            Pre-register for early access
          </button>

          <button
            onClick={() => setAdvantages(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50 rounded-xl px-6 py-3.5 text-sm font-semibold transition-colors flex items-center gap-2 shadow-md shadow-emerald-600/20"
          >
            Advantages of using Nykst
          </button>
        </div>

        <div
          className="animate-rise text-muted-foreground mt-10 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px]"
          style={{ animationDelay: "220ms" }}
        >
          <span>14 core domains derived</span>
          <span>128 repositories parsed</span>
          <span>214 services mapped</span>
          <span>299,600 files indexed</span>
        </div>

        <div
          className="animate-rise border-border bg-card/70 mt-14 max-w-3xl rounded-2xl border p-6 backdrop-blur"
          style={{ animationDelay: "240ms", boxShadow: "var(--shadow-panel)" }}
        >
          <h2 className="text-sm font-medium">Connect your organization</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Nykst installs read-only and derives the graph itself — we never ask you to describe
            your architecture.
          </p>

          <div className="border-primary/30 bg-secondary/40 mt-5 rounded-xl border px-4 py-3">
            <span className="block text-sm font-medium">GitHub</span>
            <span className="text-muted-foreground block text-[11px]">
              Connect securely to choose an organization and repository.
            </span>
          </div>

          <GithubConnectPanel connected={githubConnected} onConnect={connect} />

          <div className="border-border bg-surface/70 mt-3 rounded-xl border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-medium">Demo account</span>
                <span className="text-muted-foreground block text-[11px]">
                  Explore a realistic Nykst thesis graph without connecting GitHub.
                </span>
              </div>
              <button
                onClick={() => window.location.assign("/graph?demo=1")}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shrink-0 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
              >
                Explore demo graph →
              </button>
            </div>
          </div>
        </div>

        <div
          id="extension"
          className="border-border bg-card/70 mt-24 flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-6 backdrop-blur"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="max-w-lg">
            <h2 className="text-sm font-medium">Nykst inside your editor</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Install the extension to open any file's node, dependencies and blast radius from VS
              Code or JetBrains — the same graph, without switching context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="#extension"
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download for VS Code
            </a>
            <a
              href="#extension"
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download for JetBrains
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
