import { useRef, useState } from "react";
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
export function DiscoverCard({ app }: { app: App }) {
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

  function go(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setI((p) => Math.min(Math.max(p + delta, 0), n - 1));
  }

  // Touch swipe so the carousel is navigable on mobile (arrows are hover-only).
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null || !hasCarousel) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40)
      setI((p) => Math.min(Math.max(p + (dx < 0 ? 1 : -1), 0), n - 1));
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
            device === "desktop" ? "min-w-0 flex-1" : "mx-auto max-w-[230px]"
          )}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
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
          <Link to={`/app/${encodeURIComponent(app.id)}`} className="block">
            {device === "desktop" ? (
              <DesktopFrame app={app} image={frames[Math.min(i, n - 1)]} />
            ) : (
              <PhoneFrame app={app} image={frames[Math.min(i, n - 1)]} step={i} />
            )}
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
        className="mt-3 flex items-center gap-2 px-1"
      >
        <AppIcon app={app} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{app.name}</div>
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
export function ScreenCard({ app, image }: { app: App; image?: string }) {
  const { device } = useDevice();
  const img = image ?? screenFrames(app.id, device)[0] ?? screenFor(app.id);
  return (
    <Link to={`/screen/${encodeURIComponent(app.id)}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl">
        {device === "desktop" ? (
          <DesktopFrame app={app} image={img} />
        ) : (
          <PhoneFrame app={app} image={img} />
        )}
        <div className="absolute right-2.5 top-2.5 z-10">
          <BookmarkButton appId={app.id} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <AppIcon app={app} />
        <span className="truncate text-sm font-medium">{app.name}</span>
      </div>
    </Link>
  );
}
