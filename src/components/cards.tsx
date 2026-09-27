import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";
import { DesktopFrame } from "./DesktopFrame";
import { BookmarkButton } from "./BookmarkButton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useBookmarks } from "@/lib/bookmarks";
import { useDevice } from "@/lib/device-context";
import { Badge } from "@/components/ui/badge";
import { screenFor, screenFrames, cardFrames, type App } from "@/lib/apps";
import { AppIcon } from "./AppIcon";
import { cn } from "@/lib/utils";
import { armAppTransition, armScreenTransition, returnScreenTransitionName } from "@/lib/transitions";
import { useSwipe } from "@/lib/use-swipe";
import { regionsForImage, useRegions } from "@/lib/regions";
import { RegionOverlay } from "./RegionOverlay";

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
  // The card's screens for this viewport: the admin's highlighted picks when
  // there are any, else the first few (see cardFrames). The list already hides
  // apps without any for this viewport; fall back defensively.
  const deviceFrames = cardFrames(app.id, device);
  const frames: (string | undefined)[] = deviceFrames.length
    ? deviceFrames
    : [undefined];
  const [i, setI] = useState(0);
  const n = frames.length;
  const hasCarousel = n > 1;
  const { regions } = useRegions(app.id);
  const overlayFor = (img?: string) => {
    const rs = regionsForImage(regions, img);
    return rs.length ? <RegionOverlay regions={rs} compact /> : undefined;
  };

  // Sliding track: frames sit side by side; swipes follow the finger and the
  // arrows/commit slide with an eased transition (see lib/use-swipe.ts).
  const swipe = useSwipe({ index: i, count: n, onChange: setI });
  function go(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    swipe.go(delta);
  }

  return (
    <div className="group block break-inside-avoid">
      {/* borderless surface: the screen sits on the card grey, the app label
          below it on the page background */}
      <div className="relative flex items-center gap-1.5 rounded-2xl bg-card p-3 transition hover:bg-foreground/[0.06]">
        {/* The whole surface opens the app — the screen, the padding around it
            and the gaps beside it. A second tab stop would be noise, so it is
            hidden from the keyboard and the accessibility tree (the screen and
            the label below are both real links to the same place). */}
        <Link
          to={`/app/${encodeURIComponent(app.id)}`}
          aria-hidden="true"
          tabIndex={-1}
          onClick={(e) => swipe.dragging && e.preventDefault()}
          className="absolute inset-0 z-0 rounded-2xl"
        />

        {/* prev arrow — beside the frame, hidden (space kept) at the start */}
        {hasCarousel && (
          <button
            aria-label="Previous screen"
            onClick={(e) => go(-1, e)}
            disabled={i === 0}
            className={cn(
              "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition hover:bg-secondary/80",
              // opacity-0, not invisible: the dead arrow still covers its spot
              // and swallows the click instead of opening the app by accident.
              i === 0 && "cursor-default opacity-0"
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          className={cn(
            "relative z-10",
            // Explicit width: without it the wrapper shrink-wraps the <img> and
            // resizes when the image arrives (a visible layout shift).
            device === "desktop" ? "min-w-0 flex-1" : "mx-auto w-full max-w-[230px]"
          )}
          {...swipe.handlers}
          style={{ touchAction: hasCarousel ? "pan-y" : undefined }}
        >
          {/* badge hugs the screen itself, not the arrow row */}
          {badge && (
            <Badge className="absolute left-2.5 top-2.5 z-10 bg-black/70 text-white backdrop-blur">
              {badge}
            </Badge>
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
                    <DesktopFrame app={app} image={img} priority={priority && idx === 0} overlay={overlayFor(img)} />
                  ) : (
                    <PhoneFrame app={app} image={img} step={idx} priority={priority && idx === 0} overlay={overlayFor(img)} />
                  )}
                </div>
              ))}
            </div>
          </Link>
        </div>

        {/* next arrow — beside the frame, hidden (but still occupying its
            column, so the frame doesn't jump) at the end */}
        {hasCarousel && (
          <button
            aria-label="Next screen"
            onClick={(e) => go(1, e)}
            disabled={i === n - 1}
            className={cn(
              "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition hover:bg-secondary/80",
              i === n - 1 && "cursor-default opacity-0"
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* dots — level with the top edge of the screen, centred on the next
            arrow's column: four 6px dots with a 4px gap come to exactly the
            arrow's 36px width, so the strip never grows past it. */}
        {hasCarousel && (
          <div className="absolute right-3 top-3 z-10 flex w-9 items-center justify-center gap-1">
            {frames.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                  idx === Math.min(i, n - 1) ? "bg-foreground" : "bg-foreground/30"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 mt-2.5 flex items-center gap-2">
        <Link
          to={`/app/${encodeURIComponent(app.id)}`}
          viewTransition
          onClick={(e) => armAppTransition(e.currentTarget, app.id)}
          className="group/label flex min-w-0 flex-1 items-center gap-2"
        >
          <span data-vt="icon" className="flex shrink-0">
            <AppIcon app={app} size={40} rounded="rounded-lg" />
          </span>
          <div className="min-w-0">
            <div data-vt="name" className="truncate text-sm font-semibold group-hover/label:underline">
              {app.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {shorten(app.description, 60)}
            </div>
          </div>
        </Link>
        <CardActions app={app} />
      </div>
    </div>
  );
}

// Trim a description to a card-friendly length, breaking on a word boundary.
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

// Card actions — bookmarking lives here rather than as an overlay on the
// screen, so the shot stays uncovered.
function CardActions({ app }: { app: App }) {
  const { isBookmarked, toggle } = useBookmarks();
  const saved = isBookmarked(app.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${app.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-testid={`bookmark-${app.id}`}
          onSelect={() => toggle(app.id)}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
          {saved ? "Remove bookmark" : "Save"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { regions } = useRegions(app.id);
  const rs = regionsForImage(regions, img);
  const overlay = rs.length ? <RegionOverlay regions={rs} compact /> : undefined;
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
            <DesktopFrame app={app} image={img} overlay={overlay} />
          ) : (
            <PhoneFrame app={app} image={img} overlay={overlay} />
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
          <AppIcon app={app} size={28} rounded="rounded-lg" />
        </span>
        <span data-vt="name" className="truncate text-sm font-medium">
          {app.name}
        </span>
      </Link>
    </div>
  );
}
