import type { ExternalService } from "./types";

type CatalogEntry = {
  id: string;
  name: string;
  category: ExternalService["category"];
  /** exact package names or prefixes ending in "/" */
  packages?: string[];
  /** hostnames matched against string literals like "https://api.github.com/..." */
  hosts?: string[];
  /** environment variable prefixes, matched after stripping VITE_/NEXT_PUBLIC_/PUBLIC_ */
  env?: string[];
  /** files whose presence proves the service is part of the system */
  files?: RegExp[];
};

export const SERVICE_CATALOG: CatalogEntry[] = [
  {
    id: "supabase",
    name: "Supabase",
    category: "database",
    packages: ["@supabase/"],
    hosts: ["supabase.co", "supabase.com"],
    env: ["SUPABASE_"],
    files: [/^supabase\/(config\.toml|migrations\/)/],
  },
  {
    id: "firebase",
    name: "Firebase",
    category: "database",
    packages: ["firebase", "firebase-admin", "firebase-functions"],
    env: ["FIREBASE_"],
    files: [/(^|\/)firebase\.json$/],
  },
  {
    id: "prisma",
    name: "Prisma",
    category: "database",
    packages: ["@prisma/client", "prisma"],
    files: [/(^|\/)schema\.prisma$/],
  },
  {
    id: "drizzle",
    name: "Drizzle ORM",
    category: "database",
    packages: ["drizzle-orm", "drizzle-kit"],
    files: [/(^|\/)drizzle\.config\.[jt]s$/],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "database",
    packages: ["pg", "postgres", "@neondatabase/serverless", "@vercel/postgres"],
    env: ["DATABASE_URL", "POSTGRES_", "PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"],
  },
  {
    id: "mongodb",
    name: "MongoDB",
    category: "database",
    packages: ["mongodb", "mongoose"],
    env: ["MONGODB_", "MONGO_"],
  },
  {
    id: "redis",
    name: "Redis",
    category: "database",
    packages: ["redis", "ioredis", "@upstash/redis"],
    env: ["REDIS_", "UPSTASH_REDIS_"],
  },
  { id: "convex", name: "Convex", category: "database", packages: ["convex"], env: ["CONVEX_"] },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    packages: ["stripe", "@stripe/"],
    hosts: ["api.stripe.com"],
    env: ["STRIPE_"],
  },
  {
    id: "paddle",
    name: "Paddle",
    category: "payments",
    packages: ["@paddle/"],
    hosts: ["api.paddle.com", "sandbox-api.paddle.com"],
    env: ["PADDLE_"],
  },
  {
    id: "lemonsqueezy",
    name: "Lemon Squeezy",
    category: "payments",
    packages: ["@lemonsqueezy/"],
    env: ["LEMONSQUEEZY_", "LEMON_SQUEEZY_"],
  },
  { id: "clerk", name: "Clerk", category: "auth", packages: ["@clerk/"], env: ["CLERK_"] },
  {
    id: "authjs",
    name: "Auth.js",
    category: "auth",
    packages: ["next-auth", "@auth/"],
    env: ["NEXTAUTH_", "AUTH_SECRET"],
  },
  { id: "auth0", name: "Auth0", category: "auth", packages: ["@auth0/", "auth0"], env: ["AUTH0_"] },
  {
    id: "github",
    name: "GitHub API",
    category: "api",
    packages: ["@octokit/", "octokit"],
    hosts: ["api.github.com"],
    env: ["GITHUB_"],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    packages: ["openai", "@ai-sdk/openai"],
    hosts: ["api.openai.com"],
    env: ["OPENAI_"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "ai",
    packages: ["@anthropic-ai/", "@ai-sdk/anthropic"],
    hosts: ["api.anthropic.com"],
    env: ["ANTHROPIC_"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "ai",
    packages: ["@google/generative-ai", "@google/genai", "@ai-sdk/google"],
    hosts: ["generativelanguage.googleapis.com"],
    env: ["GEMINI_", "GOOGLE_AI_", "GOOGLE_GENERATIVE_AI_"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "ai",
    packages: ["@openrouter/"],
    hosts: ["openrouter.ai"],
    env: ["OPENROUTER_"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "ai",
    hosts: ["api.deepseek.com"],
    env: ["DEEPSEEK_"],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "hosting",
    packages: ["@vercel/"],
    env: ["VERCEL_"],
    files: [/^vercel\.json$/, /^\.vercel\//],
  },
  {
    id: "netlify",
    name: "Netlify",
    category: "hosting",
    packages: ["@netlify/"],
    env: ["NETLIFY_"],
    files: [/^netlify\.toml$/],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    category: "hosting",
    packages: ["@cloudflare/", "wrangler"],
    env: ["CLOUDFLARE_", "CF_"],
    files: [/(^|\/)wrangler\.(toml|jsonc?)$/],
  },
  {
    id: "docker",
    name: "Docker",
    category: "infra",
    files: [/(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/],
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    category: "infra",
    files: [/^\.github\/workflows\//],
  },
  { id: "aws", name: "AWS", category: "infra", packages: ["@aws-sdk/", "aws-sdk"], env: ["AWS_"] },
  {
    id: "gcp",
    name: "Google Cloud",
    category: "infra",
    packages: ["@google-cloud/"],
    env: ["GCP_", "GOOGLE_CLOUD_"],
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "observability",
    packages: ["@sentry/"],
    env: ["SENTRY_"],
  },
  {
    id: "datadog",
    name: "Datadog",
    category: "observability",
    packages: ["dd-trace", "@datadog/"],
    env: ["DD_", "DATADOG_"],
  },
  {
    id: "posthog",
    name: "PostHog",
    category: "analytics",
    packages: ["posthog-js", "posthog-node"],
    env: ["POSTHOG_"],
  },
  {
    id: "resend",
    name: "Resend",
    category: "email",
    packages: ["resend"],
    hosts: ["api.resend.com"],
    env: ["RESEND_"],
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    category: "email",
    packages: ["@sendgrid/"],
    env: ["SENDGRID_"],
  },
  { id: "twilio", name: "Twilio", category: "api", packages: ["twilio"], env: ["TWILIO_"] },
  {
    id: "slack",
    name: "Slack",
    category: "api",
    packages: ["@slack/"],
    hosts: ["hooks.slack.com", "slack.com"],
    env: ["SLACK_"],
  },
  {
    id: "uploadthing",
    name: "UploadThing",
    category: "storage",
    packages: ["uploadthing", "@uploadthing/"],
    env: ["UPLOADTHING_"],
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    category: "storage",
    packages: ["cloudinary", "next-cloudinary"],
    env: ["CLOUDINARY_"],
  },
  { id: "inngest", name: "Inngest", category: "queue", packages: ["inngest"], env: ["INNGEST_"] },
  {
    id: "trigger",
    name: "Trigger.dev",
    category: "queue",
    packages: ["@trigger.dev/"],
    env: ["TRIGGER_"],
  },
];

const byId = new Map(SERVICE_CATALOG.map((entry) => [entry.id, entry]));

export function catalogEntry(id: string) {
  return byId.get(id);
}

function matchesPackage(pattern: string, pkg: string) {
  return pattern.endsWith("/") ? pkg.startsWith(pattern) : pkg === pattern;
}

export function serviceForPackage(pkg: string): string | null {
  for (const entry of SERVICE_CATALOG)
    if (entry.packages?.some((pattern) => matchesPackage(pattern, pkg))) return entry.id;
  return null;
}

export function serviceForHost(host: string): string | null {
  const lower = host.toLowerCase();
  for (const entry of SERVICE_CATALOG)
    if (entry.hosts?.some((candidate) => lower === candidate || lower.endsWith(`.${candidate}`)))
      return entry.id;
  return null;
}

export function serviceForEnv(name: string): string | null {
  const bare = name.replace(/^(VITE_|NEXT_PUBLIC_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/, "");
  for (const entry of SERVICE_CATALOG)
    if (entry.env?.some((prefix) => bare === prefix || bare.startsWith(prefix))) return entry.id;
  return null;
}

export function serviceForFile(path: string): string | null {
  for (const entry of SERVICE_CATALOG)
    if (entry.files?.some((pattern) => pattern.test(path))) return entry.id;
  return null;
}
