import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const TOPICS = ["Plans and access", "Partnerships", "Privacy request", "Support"] as const;

type Topic = (typeof TOPICS)[number];

export function ContactForm({
  defaultTopic = "Plans and access",
  contactEmail,
  intro,
}: {
  defaultTopic?: Topic;
  contactEmail: string;
  intro?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>(defaultTopic);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        reference?: string;
      };
      if (!response.ok || !body.reference)
        throw new Error(body.error || "We could not send your message. Please try again.");
      setReference(body.reference);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send your message.");
    } finally {
      setSending(false);
    }
  };

  if (reference) {
    return (
      <div role="status" className="border-emerald-500/30 bg-emerald-500/10 rounded-2xl border p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
          <CheckCircle2 className="size-4" /> Message received
        </p>
        <p className="mt-2 text-sm text-emerald-100/90">
          Your reference is <span className="font-mono font-semibold">{reference}</span>. We reply
          within 2 business days at {email}. Keep the reference if you need to follow up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border-border bg-card/70 rounded-2xl border p-5">
      {intro && <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{intro}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className="border-border bg-surface mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs font-medium">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="border-border bg-surface mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium">
        What is this about
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value as Topic)}
          className="border-border bg-surface mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {TOPICS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-xs font-medium">
        How can we help
        <textarea
          required
          minLength={10}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="border-border bg-surface mt-1 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-xs text-amber-300">
          {error}{" "}
          <a className="underline" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending}
          className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {sending && <Loader2 className="size-4 animate-spin" />}
          {sending ? "Sending" : "Send message"}
        </button>
        <span className="text-muted-foreground text-xs">
          Or email{" "}
          <a className="underline" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </span>
      </div>
    </form>
  );
}
