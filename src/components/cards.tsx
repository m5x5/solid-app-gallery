import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";
import { DesktopFrame } from "./DesktopFrame";
import { BookmarkButton } from "./BookmarkButton";
import { useDevice } from "@/lib/device-context";
import { Badge } from "@/components/ui/badge";
import { screenFor, screenFrames, type App } from "@/lib/apps";
import { AppIcon } from "./AppIcon";
import { cn } from "@/lib/utils";
import { armAppTransition, armScreenTransition, returnScreenTransitionName } from "@/lib/transitions";
import { useSwipe } from "@/lib/use-swipe";

// "New"/"Updated" badge derived from the modified date.
function freshness(app: App): string | null {
  if (!app.modified) return null;
  const days = (Date.now() - new Date(app.modified).getTime()) / 86400000;
  if (days < 90) return "Updated";
  return null;
}

// Discover card — a mini carousel (Mobbin-style): dots top-right, prev/next
// arrows on hover, paging through the app's screens. Page 1 is the real
// captured screenshot (when present); the rest are synthetic app screens.
export function DiscoverCard({ app, priority = false }: { app: App; priority?: boolean }) {
  const badge = freshness(app);
  const { device } = useDevice();
  // Only the selected device's screenshots, in the matching frame (the list
  // already hides apps without any for this viewport; fall back defensively).
  const deviceFrames = screenFrames(app.id, device);
  const frames: (string | undefined)[] = deviceFrames.length
    ? deviceFrames
    : [undefined];
  const [i, setI] = useState(0);
  const n = frames.length;
  const hasCarousel = n > 1;

  // Sliding track: frames sit side by side; swipes follow the finger and the
  // arrows/commit slide with an eased transition (see lib/use-swipe.ts).
  const swipe = useSwipe({ index: i, count: n, onChange: setI });
  function go(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    swipe.go(delta);
  }

  return (
    <div className="group relative block break-inside-avoid rounded-2xl border border-border bg-card p-3 transition hover:border-white/25">
      {badge && (
        <Badge className="absolute left-5 top-5 z-10 bg-black/70 backdrop-blur">
          {badge}
        </Badge>
      )}

      {/* bookmark toggle — top-right of the card */}
      <div className="absolute right-4 top-4 z-20">
        <BookmarkButton appId={app.id} />
      </div>

      <div className="flex items-center gap-1.5">
        {/* prev arrow — beside the frame, disabled (not hidden) at the start */}
        {hasCarousel && (
          <button
            aria-label="Previous screen"
            onClick={(e) => go(-1, e)}
            disabled={i === 0}
            className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          className={cn(
            "relative",
            // Explicit width: without it the wrapper shrink-wraps the <img> and
            // resizes when the image arrives (a visible layout shift).
            device === "desktop" ? "min-w-0 flex-1" : "mx-auto w-full max-w-[230px]"
          )}
          {...swipe.handlers}
          style={{ touchAction: hasCarousel ? "pan-y" : undefined }}
        >
          {/* dots — one per real frame */}
          {hasCarousel && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
              {frames.map((_, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-colors",
                    idx === Math.min(i, n - 1) ? "bg-white" : "bg-white/40"
                  )}
                />
              ))}
            </div>
          )}
          <Link
            to={`/app/${encodeURIComponent(app.id)}`}
            className={cn("block", device === "desktop" ? "rounded-xl" : "rounded-[1.6rem]", "overflow-hidden")}
            onClick={(e) => swipe.dragging && e.preventDefault()}
            draggable={false}
          >
            <div className="flex" style={swipe.trackStyle}>
              {frames.map((img, idx) => (
                <div key={idx} className="w-full shrink-0" aria-hidden={idx !== i}>
                  {device === "desktop" ? (
                    <DesktopFrame app={app} image={img} priority={priority && idx === 0} />
                  ) : (
                    <PhoneFrame app={app} image={img} step={idx} priority={priority && idx === 0} />
                  )}
                </div>
              ))}
            </div>
          </Link>
        </div>

        {/* next arrow — beside the frame, disabled (not hidden) at the end */}
        {hasCarousel && (
          <button
            aria-label="Next screen"
            onClick={(e) => go(1, e)}
            disabled={i === n - 1}
            className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <Link
        to={`/app/${encodeURIComponent(app.id)}`}
        viewTransition
        onClick={(e) => armAppTransition(e.currentTarget, app.id)}
        className="mt-3 flex items-center gap-2 px-1"
      >
        <span data-vt="icon" className="flex shrink-0">
          <AppIcon app={app} />
        </span>
        <div className="min-w-0">
          <div data-vt="name" className="truncate text-sm font-semibold">
            {app.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {app.category}
          </div>
        </div>
      </Link>
    </div>
  );
}

// Screens grid card — a screen + app label below (Mobbin screens view). Renders
// in the active device's frame.
export function ScreenCard({
  app,
  image,
  frameIndex,
}: {
  app: App;
  image?: string;
  // Index into screenFrames(app.id) — lets a card open its own frame in the
  // detail view (?i=) instead of always frame 0.
  frameIndex?: number;
}) {
  const { device } = useDevice();
  const img = image ?? screenFrames(app.id, device)[0] ?? screenFor(app.id);
  const to =
    `/screen/${encodeURIComponent(app.id)}` +
    (frameIndex ? `?i=${frameIndex}` : "");
  return (
    <div className="group">
      {/* the screen opens the screen detail; the caption opens the app */}
      <Link
        to={to}
        viewTransition
        state={{ from: window.location.pathname + window.location.search }}
        onClick={(e) => armScreenTransition(e.currentTarget, app.id, frameIndex ?? 0)}
        className="block"
      >
        <div
          data-vt="shot"
          className="relative overflow-hidden rounded-2xl"
          style={{ viewTransitionName: returnScreenTransitionName(app.id, frameIndex ?? 0) }}
        >
          {device === "desktop" ? (
            <DesktopFrame app={app} image={img} />
          ) : (
            <PhoneFrame app={app} image={img} />
          )}
          <div className="absolute right-2.5 top-2.5 z-10">
            <BookmarkButton appId={app.id} />
          </div>
        </div>
      </Link>
      <Link
        to={`/app/${encodeURIComponent(app.id)}`}
        viewTransition
        onClick={(e) => armAppTransition(e.currentTarget, app.id)}
        className="mt-2.5 flex items-center gap-2 hover:underline"
      >
        <span data-vt="icon" className="flex shrink-0">
          <AppIcon app={app} />
        </span>
        <span data-vt="name" className="truncate text-sm font-medium">
          {app.name}
        </span>
      </Link>
    </div>
  );
}
