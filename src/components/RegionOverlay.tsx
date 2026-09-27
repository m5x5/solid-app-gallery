import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { Region } from "@/lib/regions";
import { curie, termColor } from "@/lib/vocab";
import { cn } from "@/lib/utils";

export type Box = { x: number; y: number; w: number; h: number };

// The boxes drawn on a screenshot, positioned in percent of the image so they
// land in the same place at every size — on a 180px card thumbnail and in the
// full-screen detail alike. In `drawing` mode a drag creates a new box (the
// draft is owned by the parent so the side panel can complete it).
export function RegionOverlay({
  regions,
  compact = false,
  drawing = false,
  draft,
  onDraft,
  selectedId,
  onSelect,
}: {
  regions: Region[];
  // Thumbnails: boxes only, no labels, no interaction.
  compact?: boolean;
  drawing?: boolean;
  draft?: Box | null;
  // Called continuously while dragging and once more with `done` on release.
  onDraft?: (box: Box | null, done: boolean) => void;
  selectedId?: string | null;
  onSelect?: (r: Region | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const toPercent = useCallback((e: React.PointerEvent) => {
    const el = ref.current!;
    const b = el.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - b.left) / b.width) * 100),
      y: clamp(((e.clientY - b.top) / b.height) * 100),
    };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (!drawing || !onDraft) return;
    e.preventDefault();
    e.stopPropagation();
    ref.current!.setPointerCapture(e.pointerId);
    start.current = toPercent(e);
    onDraft({ ...start.current, w: 0, h: 0 }, false);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawing || !start.current || !onDraft) return;
    e.stopPropagation();
    onDraft(boxFrom(start.current, toPercent(e)), false);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drawing || !start.current || !onDraft) return;
    e.stopPropagation();
    const box = boxFrom(start.current, toPercent(e));
    start.current = null;
    // A click without a drag is not a box.
    onDraft(box.w > 1 && box.h > 1 ? box : null, true);
  }

  return (
    <div
      ref={ref}
      className={cn(
        "absolute inset-0 select-none",
        drawing ? "cursor-crosshair touch-none" : "pointer-events-none"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        onDraft?.(null, true);
      }}
      onClick={(e) => {
        if (drawing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {regions.map((r) => (
        <RegionBox
          key={r.id}
          region={r}
          compact={compact}
          selected={selectedId === r.id}
          interactive={!compact && !drawing && !!onSelect}
          onClick={() => onSelect?.(selectedId === r.id ? null : r)}
        />
      ))}
      {draft && draft.w > 0 && draft.h > 0 && (
        <div
          className="absolute rounded-sm border-2 border-dashed border-white bg-white/20 shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
          style={boxStyle(draft)}
        />
      )}
    </div>
  );
}

function RegionBox({
  region,
  compact,
  selected,
  interactive,
  onClick,
}: {
  region: Region;
  compact: boolean;
  selected: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  const color = termColor(region.term);
  return (
    <div
      className={cn(
        "absolute rounded-sm border-2 transition-shadow",
        interactive && "pointer-events-auto cursor-pointer hover:shadow-[0_0_0_2px_rgba(255,255,255,.7)]",
        selected && "shadow-[0_0_0_3px_rgba(255,255,255,.9)]"
      )}
      style={{
        ...boxStyle(region),
        borderColor: color,
        background: color.replace(")", " / 0.18)"),
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={compact ? curie(region.term) : undefined}
    >
      {!compact && (
        <span
          className="absolute -top-0.5 left-0 flex -translate-y-full items-center gap-0.5 whitespace-nowrap rounded px-1 py-px font-mono text-[10px] font-semibold leading-tight text-black"
          style={{ background: color }}
        >
          {region.role === "edits" && <Pencil className="h-2.5 w-2.5" />}
          {curie(region.term)}
        </span>
      )}
    </div>
  );
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
function boxStyle(b: Box): React.CSSProperties {
  return { left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` };
}

// A screenshot drawn with object-fit: contain plus an overlay that covers
// exactly the rendered image (not the letterboxed frame around it), so the
// percent coordinates of the boxes line up with the pixels they were drawn
// on. The rect is recomputed on load and whenever the frame resizes.
export function AnnotatedImage({
  src,
  alt,
  className,
  imgClassName,
  overlay,
  imgProps,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  overlay?: ReactNode;
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<React.CSSProperties | null>(null);

  const measure = useCallback(() => {
    const w = wrap.current;
    const i = img.current;
    if (!w || !i || !i.naturalWidth || !i.naturalHeight) return;
    const cw = w.clientWidth;
    const ch = w.clientHeight;
    const s = Math.min(cw / i.naturalWidth, ch / i.naturalHeight);
    const rw = i.naturalWidth * s;
    const rh = i.naturalHeight * s;
    setRect({ left: (cw - rw) / 2, top: (ch - rh) / 2, width: rw, height: rh });
  }, []);

  useLayoutEffect(measure, [measure, src]);
  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrap} className={cn("relative h-full w-full", className)}>
      <img
        ref={img}
        src={src}
        alt={alt}
        onLoad={measure}
        className={cn("h-full w-full object-contain", imgClassName)}
        {...imgProps}
      />
      {overlay && rect && (
        <div className="absolute" style={rect}>
          {overlay}
        </div>
      )}
    </div>
  );
}
