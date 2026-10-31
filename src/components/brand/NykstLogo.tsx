import { cn } from "@/lib/utils";

export function NykstMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 select-none", className)}
      role="img"
      aria-label="Nykst mark"
    >
      <defs>
        <linearGradient id="nykst-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#070d14" />
          <stop offset="100%" stopColor="#0c1824" />
        </linearGradient>
        <linearGradient id="nykst-mark-prism" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="52%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="nykst-mark-edge" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="nykst-mark-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect
        width="64"
        height="64"
        rx="16"
        fill="url(#nykst-mark-bg)"
        stroke="#1e3242"
        strokeWidth="1.8"
      />
      <circle cx="32" cy="32" r="24" fill="url(#nykst-mark-core)" />
      <polygon
        points="32,8 52,19.5 52,44.5 32,56 12,44.5 12,19.5"
        fill="none"
        stroke="url(#nykst-mark-edge)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19,44 L19,20 L45,44 L45,20"
        fill="none"
        stroke="url(#nykst-mark-prism)"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="19"
        y1="32"
        x2="45"
        y2="32"
        stroke="#60a5fa"
        strokeWidth="1.4"
        strokeDasharray="2.5 2.5"
        opacity="0.85"
      />
      <circle cx="19" cy="20" r="3.6" fill="#070d14" stroke="#5eead4" strokeWidth="2.2" />
      <circle cx="45" cy="44" r="3.6" fill="#070d14" stroke="#2dd4bf" strokeWidth="2.2" />
      <circle cx="19" cy="44" r="2.8" fill="#60a5fa" />
      <circle cx="45" cy="20" r="2.8" fill="#a78bfa" />
      <circle cx="32" cy="32" r="3.4" fill="#5eead4" />
    </svg>
  );
}

export function NykstBrand({
  subtitle = "See what your change will touch",
  size = 30,
  className,
}: {
  subtitle?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NykstMark size={size} className="transition-transform duration-300 group-hover:scale-105" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[14px] font-bold tracking-[0.24em] uppercase text-foreground">
          Nykst
        </span>
        {subtitle && (
          <span className="text-primary/80 mt-1 hidden font-mono text-[9px] tracking-[0.18em] uppercase sm:inline">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
