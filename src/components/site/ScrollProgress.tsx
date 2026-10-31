import { useEffect, useState } from "react";

/**
 * A thin reading-progress line for long product pages. It follows the real
 * document height and intentionally stays out of the accessibility tree.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px">
      <div
        className="bg-brand-crimson h-full origin-left shadow-[0_0_14px_var(--brand-crimson)] transition-[width] duration-150 ease-out"
        style={{ width: `${(progress * 100).toFixed(2)}%` }}
      />
    </div>
  );
}
