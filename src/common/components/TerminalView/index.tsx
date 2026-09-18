import { useEffect, useRef } from "react";
import type { TerminalTab } from "@stores/terminals";
import { cn } from "@utils/cn";
import { acquireEngine, fitEngine, releaseEngine } from "./engine";

// Thin wrapper: the xterm instance + PTY live in the engine registry (engine.ts)
// so they survive remounts. This component only owns the container div and asks
// the engine to attach/refit/detach.
export default function TerminalView({
  term,
  visible,
  focused,
}: {
  term: TerminalTab;
  visible: boolean; // project active AND this terminal's group is the shown tab
  focused: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    acquireEngine(container, term);

    // Refit whenever the pane changes size (panel drag, window resize). Without
    // this the xterm keeps its old cols/rows, so its screen overflows the shrunk
    // pane and scrolls past its own background. rAF coalesces drag spam.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitEngine(term.id));
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      releaseEngine(term.id);
    };
  }, []);

  // Refit + focus when this terminal becomes visible (it couldn't measure while hidden).
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => fitEngine(term.id, true));
    return () => cancelAnimationFrame(raf);
  }, [visible, term.id]);

  return (
    <div
      className={cn(
        "h-full w-full bg-[#09090b] p-1.5",
        focused ? "ring-1 ring-inset ring-sky-700/60" : "ring-1 ring-inset ring-transparent"
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
