import { useCallback, useEffect, useRef, useState } from "react";

// Touch swipe with real motion: the content follows the finger (with
// resistance at the ends), then either commits to the next/previous item with
// an eased slide or springs back. Arrow buttons trigger the same slide.
//
//   const swipe = useSwipe({ index, count, onChange });
//   <div {...swipe.handlers}>            // the viewport (overflow hidden)
//     <div style={swipe.trackStyle}>     // the track: items side by side, each w-full
//       {items.map(...)}
//     </div>
//   </div>
//   swipe.go(+1)  // animate to the next item
export function useSwipe(opts: {
  index: number;
  count: number;
  onChange: (next: number) => void;
  threshold?: number; // px, default 48
}) {
  const { index, count, onChange, threshold = 48 } = opts;
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const width = useRef(1);
  const axis = useRef<"x" | "y" | null>(null);
  const [dx, setDx] = useState(0); // finger offset while dragging (px)
  const [animating, setAnimating] = useState(false);
  const reduce =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (v: number) => Math.min(Math.max(v, 0), count - 1);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (count < 2) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    width.current = (e.currentTarget as HTMLElement).clientWidth || 1;
    axis.current = null;
    setAnimating(false);
  }, [count]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null || startY.current === null) return;
      const mx = e.touches[0].clientX - startX.current;
      const my = e.touches[0].clientY - startY.current;
      // Decide once whether this is a horizontal swipe or a vertical scroll.
      if (!axis.current) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      }
      if (axis.current !== "x") return;
      // Resistance past the first/last item.
      const atEdge = (mx > 0 && index === 0) || (mx < 0 && index === count - 1);
      setDx(atEdge ? mx * 0.3 : mx);
    },
    [index, count]
  );

  const finish = useCallback(
    (delta: number) => {
      const next = clamp(index + delta);
      setAnimating(true);
      setDx(0);
      if (next !== index) onChange(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, count, onChange]
  );

  const onTouchEnd = useCallback(() => {
    if (startX.current === null) return;
    const moved = dx;
    startX.current = null;
    startY.current = null;
    const wasX = axis.current === "x";
    axis.current = null;
    if (!wasX) {
      setDx(0);
      return;
    }
    // Commit on distance or a decent flick; otherwise spring back.
    const commit = Math.abs(moved) > Math.max(threshold, width.current * 0.18);
    finish(commit ? (moved < 0 ? 1 : -1) : 0);
  }, [dx, threshold, finish]);

  // Arrow buttons / keyboard: same eased slide.
  const go = useCallback((delta: number) => finish(delta), [finish]);

  // Drop the transition class after it has played so drags feel immediate.
  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setAnimating(false), 320);
    return () => clearTimeout(t);
  }, [animating, index]);

  const trackStyle: React.CSSProperties = {
    transform: `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`,
    transition: animating && !reduce ? "transform 300ms cubic-bezier(0.2, 0, 0, 1)" : "none",
    willChange: "transform",
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    trackStyle,
    dragging: dx !== 0,
    go,
  };
}
