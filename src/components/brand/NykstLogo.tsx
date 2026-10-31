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
          <stop offset="0%" stopColor="#030906" />
          <stop offset="100%" stopColor="#0b1912" />
        </linearGradient>
        <linearGradient id="nykst-mark-prism" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2ede3" />
          <stop offset="58%" stopColor="#c7b99b" />
          <stop offset="100%" stopColor="#e1d5bd" />
        </linearGradient>
        <linearGradient id="nykst-mark-edge" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#183328" />
          <stop offset="100%" stopColor="#a31c1b" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="nykst-mark-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c7b99b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#c7b99b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect
        width="64"
        height="64"
        rx="16"
        fill="url(#nykst-mark-bg)"
        stroke="#183328"
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
        stroke="#a31c1b"
        strokeWidth="1.4"
        strokeDasharray="2.5 2.5"
        opacity="0.8"
      />
      <circle cx="19" cy="20" r="3.6" fill="#030906" stroke="#c7b99b" strokeWidth="2.2" />
      <circle cx="45" cy="44" r="3.6" fill="#030906" stroke="#a31c1b" strokeWidth="2.2" />
      <circle cx="19" cy="44" r="2.8" fill="#a31c1b" />
      <circle cx="45" cy="20" r="2.8" fill="#741514" />
      <circle cx="32" cy="32" r="3.4" fill="#f2ede3" />
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
          <span className="text-subtle-foreground mt-1 hidden font-mono text-[9px] tracking-[0.18em] uppercase sm:inline">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
