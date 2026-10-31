import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Editorial section marker.
 *
 * The crimson rule carries the brand signal. The label stays support ink so it
 * never competes with the one filled sand action on the page.
 */
export function SectionLabel({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-subtle-foreground flex items-center gap-2.5 font-mono text-[10px] tracking-[0.26em] uppercase",
        className,
      )}
    >
      <span aria-hidden="true" className="bg-live h-px w-4 shrink-0" />
      {icon}
      <span>{children}</span>
    </p>
  );
}
