import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail, TriangleAlert } from "lucide-react";
import {
  CONTACT_EMAIL,
  CONTACT_TOPICS,
  mailtoHref,
  replyPromiseText,
  type ContactTopic,
} from "@/lib/contact";

const MESSAGE_MAX = 4000;

type Result = {
  reference: string;
  delivered: boolean;
  confirmationDelivered: boolean;
  message: string;
  topic: ContactTopic;
};

export function ContactForm({
  defaultTopic = "Plans and access",
  intro,
}: {
  defaultTopic?: ContactTopic;
  intro?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>(defaultTopic);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, website }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        reference?: string;
        delivered?: boolean;
        confirmationDelivered?: boolean;
        message?: string;
      };
      if (!response.ok || !body.reference)
        throw new Error(body.error || "We could not send your message. Please try again.");
      setResult({
        reference: body.reference,
        delivered: body.delivered === true,
        confirmationDelivered: body.confirmationDelivered === true,
        message: body.message ?? "",
        topic,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send your message.");
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={
          result.delivered
            ? "border-border bg-surface rounded-2xl border p-5"
            : "border-risk/40 bg-risk/10 rounded-2xl border p-5"
        }
      >
        <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
          {result.delivered ? (
            <CheckCircle2 className="text-brand-ivory size-4" />
          ) : (
            <TriangleAlert className="text-risk size-4" />
          )}
          {result.delivered ? "Message received" : "Message saved, team not alerted"}
        </p>
        <p className="text-body-ink mt-2 text-sm leading-relaxed">
          Your reference is <span className="font-mono font-semibold">{result.reference}</span>.{" "}
          {result.message}
        </p>
        {result.confirmationDelivered && (
          <p className="text-subtle-foreground mt-2 text-xs">A receipt is on its way to {email}.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={mailtoHref(result.topic, result.reference)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <Mail className="size-4" />
            {result.delivered ? `Email ${CONTACT_EMAIL}` : "Send it by email"}
          </a>
          {!result.delivered && (
            <button
              type="button"
              onClick={() => setResult(null)}
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
            >
              Try the form again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border-border bg-card/70 rounded-2xl border p-5">
      {intro && <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{intro}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Your name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={120}
            className="border-border bg-surface focus:border-primary mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="text-xs font-medium">
          Your email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            maxLength={200}
            className="border-border bg-surface focus:border-primary mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium">
        What is this about
        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value as ContactTopic)}
          className="border-border bg-surface focus:border-primary mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
        >
          {CONTACT_TOPICS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {/* Spam control: a person never fills this, so a filled value is dropped. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium">
        How can we help
        <textarea
          required
          minLength={10}
          maxLength={MESSAGE_MAX}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby="contact-message-help"
          className="border-border bg-surface focus:border-primary mt-1 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
        />
      </label>
      <p id="contact-message-help" className="text-muted-foreground mt-1 text-[11px]">
        {message.length} of {MESSAGE_MAX} characters. Tell us what you are trying to do and what is
        in the way.
      </p>
      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="border-risk/35 bg-risk/10 text-foreground mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
        >
          <TriangleAlert className="text-risk mt-0.5 size-3.5 shrink-0" />
          <span>
            {error}{" "}
            <a
              className="underline decoration-primary/60 underline-offset-2"
              href={mailtoHref(topic)}
            >
              Email {CONTACT_EMAIL} instead
            </a>
          </span>
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
          <a className="underline" href={mailtoHref(topic)}>
            {CONTACT_EMAIL}
          </a>
        </span>
      </div>
      <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
        {replyPromiseText(topic)}
      </p>
    </form>
  );
}
