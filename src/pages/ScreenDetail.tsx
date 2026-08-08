import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApp, screenFrames } from "@/lib/apps";
import { useSolid } from "@/lib/solid-context";
import { listScreenshots, fetchImageObjectUrl } from "@/lib/solid-data";
import { useFormFactors } from "@/lib/use-form-factor";
import { PhoneFrame } from "@/components/PhoneFrame";
import { DesktopFrame } from "@/components/DesktopFrame";
import { AppIcon } from "@/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { BookmarkButton } from "@/components/BookmarkButton";
import { Comments } from "@/components/Comments";

// Full-screen detail (Mobbin-style): the screen on the left, a Comments panel
// (public + private) on the right. Works for a single screen or a flow frame.
export function ScreenDetail() {
  const { id } = useParams();
  const appId = id ? decodeURIComponent(id) : "";
  const app = getApp(appId);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoggedIn, webId } = useSolid();
  // Comments are a side panel on desktop, but hidden by default on mobile and
  // toggled via the header button (next to the bookmark).
  const [showComments, setShowComments] = useState(false);
  // The user's own pod uploads, shown after the catalog frames — same order as
  // the app detail page so the ?i= index lines up (otherwise an uploaded screen
  // would index past the catalog frames and render a synthetic placeholder).
  const [uploads, setUploads] = useState<string[]>([]);

  useEffect(() => {
    if (!app || !isLoggedIn || !webId) {
      setUploads([]);
      return;
    }
    let alive = true;
    listScreenshots(webId, app.id).then(async (urls) => {
      const objs = await Promise.all(
        urls.map((u) => fetchImageObjectUrl(u).catch(() => ""))
      );
      if (alive) setUploads(objs.filter(Boolean));
    });
    return () => {
      alive = false;
    };
  }, [app, isLoggedIn, webId]);

  if (!app) {
    return <div className="p-10 text-center text-muted-foreground">Not found.</div>;
  }

  const frames = [...screenFrames(app.id), ...uploads];
  const i = Math.min(Math.max(Number(params.get("i") || 0), 0), Math.max(0, frames.length - 1));
  const image = frames[i];
  const screenId = `${app.id}::${i}`; // distinct comment thread per screen/frame

  function go(delta: number) {
    const next = Math.min(Math.max(i + delta, 0), frames.length - 1);
    const p = new URLSearchParams(params);
    p.set("i", String(next));
    // Replace (not push) so paging through frames doesn't stack history
    // entries — closing then returns to the page in a single step.
    setParams(p, { replace: true });
  }
  function close() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/screens");
  }

  // Adaptive frame: wide screenshots get a desktop window, tall ones a phone.
  const formFactors = useFormFactors(frames.filter(Boolean) as string[]);
  const isDesktop = image ? formFactors[image] === "desktop" : false;

  // Touch swipe (mobile): horizontal swipe pages between screens.
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm md:flex-row">
      {/* left: screen — top half on mobile, left column on desktop */}
      <div className="relative flex min-h-0 flex-[1.2] flex-col md:flex-1">
        <div className="flex items-center justify-between px-5 py-4">
          <Link
            to={`/app/${encodeURIComponent(app.id)}`}
            className="flex items-center gap-2.5"
          >
            <AppIcon app={app} size={32} rounded="rounded-lg" />
            <span className="font-semibold">{app.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <BookmarkButton appId={app.id} />
            <button
              onClick={() => setShowComments((v) => !v)}
              aria-label={showComments ? "Hide comments" : "Show comments"}
              aria-pressed={showComments}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/20 md:hidden",
                showComments ? "bg-white/20" : "bg-white/10"
              )}
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-6 pb-6"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {frames.length > 1 && i > 0 && (
            <button
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-6 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {isDesktop ? (
            <DesktopFrame app={app} image={image} className="max-h-full w-full max-w-[860px]" />
          ) : (
            <PhoneFrame app={app} image={image} className="max-h-full w-auto max-w-[300px]" />
          )}
          {frames.length > 1 && i < frames.length - 1 && (
            <button
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-6 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-6 pb-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            Found in <Badge>{app.category}</Badge>
          </span>
          {frames.length > 1 && (
            <span>
              Screen {i + 1} / {frames.length}
            </span>
          )}
        </div>
      </div>

      {/* right: comments — hidden on mobile until toggled (bottom half), always
          a fixed side column on desktop */}
      <aside
        className={cn(
          "min-h-0 flex-1 flex-col border-t border-border bg-card md:flex md:w-[340px] md:flex-none md:border-l md:border-t-0",
          showComments ? "flex" : "hidden"
        )}
      >
        <Comments screenId={screenId} />
      </aside>
    </div>
  );
}
