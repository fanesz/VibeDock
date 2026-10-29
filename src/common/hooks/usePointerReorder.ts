import { useRef, useState } from "react";

export function usePointerReorder(onReorder: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const stateRef = useRef<{
    from: number;
    over: number | null;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    // Only handle primary button, and ignore inputs/buttons
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.tagName === "INPUT" || targetEl.closest("button")) return;

    stateRef.current = {
      from: index,
      over: index,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };

    const onPointerMove = (ev: PointerEvent) => {
      const s = stateRef.current;
      if (!s) return;

      const dist = Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY);
      if (!s.dragging && dist > 4) {
        s.dragging = true;
        setDragIndex(s.from);
      }

      if (s.dragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-reorder-index]");
        const target = el ? Number(el.dataset.reorderIndex) : null;
        if (target !== null && !isNaN(target) && target !== s.over) {
          s.over = target;
          setDragOverIndex(target);
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const s = stateRef.current;
      if (s && s.dragging && s.over !== null && s.from !== s.over) {
        onReorder(s.from, s.over);
      }
      stateRef.current = null;
      setDragIndex(null);
      setDragOverIndex(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  return { dragIndex, dragOverIndex, handlePointerDown };
}
