import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { WebGLFieldCanvas } from "./WebGLFieldCanvas";

export { WebGLFieldCanvas };

/**
 * 1. Spotlight & Grain Canvas Overlay
 * Renders the WebGL2 fluid & neural field backdrop alongside a cursor-following
 * radial spotlight and animated film grain texture.
 */
export function SpotlightBackdrop({
  withWebGL = true,
  accentState = "teal",
}: {
  withWebGL?: boolean;
  accentState?: "teal" | "cyan" | "amber";
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const onMove = (e: MouseEvent) => {
      el.style.setProperty("--spot-x", `${e.clientX}px`);
      el.style.setProperty("--spot-y", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <>
      {withWebGL && <WebGLFieldCanvas accentState={accentState} />}
      <div
        ref={ref}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
        style={
          {
            "--spot-x": "50vw",
            "--spot-y": "28vh",
            background:
              "radial-gradient(620px circle at var(--spot-x) var(--spot-y), color-mix(in oklab, var(--primary) 9%, transparent), transparent 68%)",
          } as React.CSSProperties
        }
      >
        <div className="film-grain absolute inset-0 opacity-30" />
      </div>
    </>
  );
}

/**
 * 2. Magnetic Hover Button Container
 * Gently pulls buttons or interactive CTAs toward the pointer within a 40px proximity radius
 * and snaps back elastically.
 */
export function Magnetic({
  children,
  strength = 0.22,
  radius = 40,
  className,
}: {
  children: ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.max(rect.width, rect.height) / 2 + radius;
    if (dist > maxDist) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    setOffset({
      x: Math.max(-14, Math.min(14, dx * strength)),
      y: Math.max(-10, Math.min(10, dy * strength)),
    });
  };

  const handleLeave = () => setOffset({ x: 0, y: 0 });

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      data-magnetic="true"
      className={cn(
        "inline-flex transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className,
      )}
      style={{
        transform: `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0)`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * 3. 3D Card Tilt on Hover with Dynamic Specular Border Spotlight
 * Capped at 4deg by default so technical text remains razor-sharp.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 4,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { maxTilt?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<{
    rotateX: number;
    rotateY: number;
    glareX: number;
    glareY: number;
    hovered: boolean;
  }>({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, hovered: false });

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const py = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const clampedTilt = Math.min(maxTilt, 4);
    const rotateY = (px - 0.5) * clampedTilt * 2;
    const rotateX = (0.5 - py) * clampedTilt * 2;
    setStyle({
      rotateX,
      rotateY,
      glareX: px * 100,
      glareY: py * 100,
      hovered: true,
    });
  };

  const onLeave = () => setStyle((prev) => ({ ...prev, rotateX: 0, rotateY: 0, hovered: false }));

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-tilt-card="true"
      className={cn(
        "relative overflow-hidden transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform",
        className,
      )}
      style={{
        transform: `perspective(1100px) rotateX(${style.rotateX.toFixed(2)}deg) rotateY(${style.rotateY.toFixed(2)}deg) translateZ(${style.hovered ? "3px" : "0px"})`,
      }}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: style.hovered ? 1 : 0,
          background: `radial-gradient(360px circle at ${style.glareX.toFixed(1)}% ${style.glareY.toFixed(1)}%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/**
 * 4. Split Text / Blur-to-Focus Headline Reveal
 */
export function SplitText({
  text,
  className,
  wordClassName,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={cn("inline", className)} aria-label={text}>
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          className={cn("animate-rise inline-block", wordClassName)}
          style={{ animationDelay: `${idx * 35}ms` }}
        >
          {word}
          {idx < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  );
}

/**
 * 5. Text Scramble Decoder
 * Cycles through monospace glyphs before settling on the target string.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/::<>[]{}#";

export function ScrambleText({
  text,
  className,
  durationMs = 680,
}: {
  text: string;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const steps = Math.max(12, Math.round(durationMs / 32));
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = frame / steps;
      if (progress >= 1) {
        setDisplay(text);
        window.clearInterval(timer);
        return;
      }
      const settledCount = Math.floor(text.length * progress);
      const next = text
        .split("")
        .map((char, idx) => {
          if (char === " " || char === "·" || idx < settledCount) return char;
          return GLYPHS[(idx + frame * 3) % GLYPHS.length]!;
        })
        .join("");
      setDisplay(next);
    }, 32);
    return () => window.clearInterval(timer);
  }, [text, durationMs]);

  return <span className={className}>{display}</span>;
}

/**
 * 6. Scroll-Triggered Numeric Counter
 * Counts smoothly to the real numeric value when scrolled into view or updated.
 */
export function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  durationMs = 900,
  className,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    setShown(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasAnimated.current) return;
        hasAnimated.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(Math.round(value * eased));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className} data-counter-value={value}>
      {prefix}
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/**
 * 7. Blur-to-Focus Reveal on Scroll
 */
export function BlurReveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.95) {
      setVisible(false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", className)}
      style={{
        transitionDelay: `${delayMs}ms`,
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : "blur(8px)",
        transform: visible ? "translate3d(0, 0, 0)" : "translate3d(0, 18px, 0)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 8. Infinite Marquee Ticker (Scroll-Velocity Reactive)
 */
export function InfiniteMarquee({
  items,
  className,
}: {
  items: { label: string; value: string; badge?: string }[];
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const doubled = [...items, ...items];

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let lastTime = performance.now();
    let decayTimer = 0;

    const onScroll = () => {
      const now = performance.now();
      const dt = Math.max(16, now - lastTime);
      const dy = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      lastTime = now;

      const velocity = Math.min(2.5, dy / dt);
      const duration = Math.max(14, 38 - velocity * 10);
      if (trackRef.current) {
        trackRef.current.style.animationDuration = `${duration.toFixed(1)}s`;
      }
      window.clearTimeout(decayTimer);
      decayTimer = window.setTimeout(() => {
        if (trackRef.current) {
          trackRef.current.style.animationDuration = "38s";
        }
      }, 220);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(decayTimer);
    };
  }, []);

  return (
    <div
      className={cn(
        "border-border/80 bg-surface/50 relative overflow-hidden border-y py-2.5 backdrop-blur-sm",
        className,
      )}
    >
      <div ref={trackRef} className="animate-marquee flex items-center gap-8 px-4">
        {doubled.map((item, idx) => (
          <div key={`${item.label}-${idx}`} className="flex shrink-0 items-center gap-2.5 text-xs">
            <span className="bg-primary size-1.5 rounded-full" />
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              {item.label}
            </span>
            <span className="text-foreground font-mono text-[11px] font-semibold">
              {item.value}
            </span>
            {item.badge && (
              <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase">
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 9. Hardware-Accelerated Clip-Path Curtain / Portal Reveal
 */
export function ClipPathReveal({
  open,
  mode = "curtain",
  children,
  className,
}: {
  open: boolean;
  mode?: "curtain" | "portal";
  children: ReactNode;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const clipPath =
    mode === "portal"
      ? revealed
        ? "circle(150% at 50% 50%)"
        : "circle(0% at 50% 50%)"
      : revealed
        ? "inset(0% 0% 0% 0% round 0px)"
        : "inset(0% 0% 0% 100% round 16px)";

  return (
    <div
      data-clip-reveal={mode}
      className={cn(
        "transition-[clip-path,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className,
      )}
      style={{
        clipPath,
        opacity: revealed ? 1 : 0.85,
      }}
    >
      {children}
    </div>
  );
}
