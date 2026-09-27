import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, MessageCircle, Scan } from "lucide-react";
import { cn } from "@/lib/utils";
import { screenTransitionName, setLastOpenedScreen } from "@/lib/transitions";
import { useSwipe } from "@/lib/use-swipe";
import { useHead, JsonLd, appJsonLd, appUrl, breadcrumbJsonLd } from "@/lib/seo";
import { getApp, screenFrames, frameTags } from "@/lib/apps";
import { useSolid } from "@/lib/solid-context";
import { listScreenshots, fetchImageObjectUrl, loadComments } from "@/lib/solid-data";
import { regionsForImage, useRegions } from "@/lib/regions";
import { useAppShapes, useShapeTerms } from "@/lib/app-shapes";
import { useFormFactors } from "@/lib/use-form-factor";
import { PhoneFrame } from "@/components/PhoneFrame";
import { DesktopFrame } from "@/components/DesktopFrame";
import { RegionOverlay, type Box } from "@/components/RegionOverlay";
import { RegionPanel } from "@/components/RegionPanel";
import { AppIcon } from "@/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { BookmarkButton } from "@/components/BookmarkButton";
import { Comments } from "@/components/Comments";

type Panel = "data" | "comments";

// Full-screen detail (Mobbin-style): the screen on the left, a side panel on
// the right with two tabs — the data regions drawn on this screen (and the
// tool to add one) and the comments (public + private). Works for a single
// screen or a flow frame.
export function ScreenDetail() {
  const { id } = useParams();
  const appId = id ? decodeURIComponent(id) : "";
  const app = getApp(appId);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoggedIn, webId } = useSolid();
  // The panel is a side column on desktop, but hidden by default on mobile and
  // toggled via the header button (next to the bookmark). Opened by default —
  // on the comments tab — when a specific comment is targeted (?c=<url>).
  const [showPanel, setShowPanel] = useState(() => !!params.get("c"));
  const [panel, setPanel] = useState<Panel>("comments");
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

  const headIdx = Number(params.get("i") || 0);
  useHead({
    title: app ? `${app.name} — screen ${headIdx + 1}` : "Screen not found",
    description: app ? `Screenshot ${headIdx + 1} of ${app.name}${app.description ? ` — ${app.description}` : ""}`.slice(0, 300) : undefined,
    image: app ? screenFrames(app.id)[headIdx] || screenFrames(app.id)[0] : undefined,
    path: app ? `/screen/${encodeURIComponent(app.id)}` : undefined,
    type: "article",
  });

  const frames = app ? [...screenFrames(app.id), ...uploads] : [];
  const i = Math.min(Math.max(Number(params.get("i") || 0), 0), Math.max(0, frames.length - 1));
  const image = frames[i];
  const screenId = app ? `${app.id}::${i}` : ""; // distinct comment thread / region key per screen

  // Comment count for the panel tab — reloaded per screen/frame, and again
  // whenever the panel opens/closes so posting or deleting a comment updates
  // the badge without a page reload.
  const [commentCount, setCommentCount] = useState(0);
  useEffect(() => {
    if (!screenId) return;
    let alive = true;
    loadComments(screenId, webId).then((c) => {
      if (alive) setCommentCount(c.length);
    });
    return () => {
      alive = false;
    };
  }, [screenId, webId, showPanel]);

  // Data regions on this app's screens; the annotation tool's transient
  // state lives here because the overlay (on the image) and the panel (on
  // the side) both work on it.
  const { regions: allRegions } = useRegions(app?.id);
  // Terms from the shapes the app publishes on its landing page, for the picker.
  const { data: published } = useAppShapes(app);
  const shapeTerms = useShapeTerms(published.shapes);
  const regions = useMemo(() => regionsForImage(allRegions, image, screenId), [allRegions, image, screenId]);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Box | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Leaving a screen drops any half-made box and selection.
  useEffect(() => {
    setDrawing(false);
    setDraft(null);
    setSelectedId(null);
  }, [screenId]);
  function onDraft(box: Box | null, done: boolean) {
    setDraft(box);
    // A finished box opens the form in the panel (visible on mobile too);
    // a click without a drag keeps drawing mode on for another try.
    if (done && box) {
      setPanel("data");
      setShowPanel(true);
    }
  }

  function setIndex(next: number) {
    const p = new URLSearchParams(params);
    p.set("i", String(next));
    // Replace (not push) so paging through frames doesn't stack history
    // entries — closing then returns to the page in a single step.
    setParams(p, { replace: true });
  }
  // Sliding track: frames side by side; swipes follow the finger, arrows and
  // commits slide with an eased transition (see lib/use-swipe.ts).
  const swipe = useSwipe({ index: i, count: frames.length, onChange: setIndex });
  function go(delta: number) {
    swipe.go(delta);
  }
  // Remember which frame is showing so the page we return to can morph it
  // back into its thumbnail (paging with the arrows keeps this current).
  useEffect(() => {
    if (app) setLastOpenedScreen(app.id, i);
  }, [app, i]);

  // Close: go back to the page that opened this screen (passed as link state
  // by the thumbnails) with a view transition so the frame morphs back into
  // its thumbnail. `replace` keeps history the same as a real back would.
  // Opened directly (no state), fall back to plain history back / /screens.
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  function close() {
    if (from) navigate(from, { viewTransition: true, replace: true });
    else if (window.history.length > 1) navigate(-1);
    else navigate("/screens", { viewTransition: true });
  }

  // Adaptive frame: wide screenshots get a desktop window, tall ones a phone.
  const formFactors = useFormFactors(frames.filter(Boolean) as string[]);

  if (!app) {
    return <div className="p-10 text-center text-muted-foreground">Not found.</div>;
  }

  const panelCount = panel === "data" ? regions.length : commentCount;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/90 backdrop-blur-sm md:flex-row">
      {image && (
        <JsonLd
          data={[
            {
              "@type": "ImageObject",
              "@id": `${window.location.origin}/screen/${encodeURIComponent(app.id)}?i=${i}`,
              contentUrl: image,
              name: `${app.name} — screen ${i + 1}`,
              ...(frameTags(app.id, image).length ? { keywords: frameTags(app.id, image).join(", ") } : {}),
              about: appJsonLd(app),
            },
            breadcrumbJsonLd([
              { name: "Solid Gallery", url: `${window.location.origin}/` },
              { name: app.name, url: appUrl(app) },
              { name: `Screen ${i + 1}`, url: `${window.location.origin}/screen/${encodeURIComponent(app.id)}?i=${i}` },
            ]),
          ]}
        />
      )}
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
            <BookmarkButton appId={app.id} variant="chrome" className="h-9 w-9" />
            <button
              onClick={() => setShowPanel((v) => !v)}
              aria-label={showPanel ? "Hide panel" : "Show data and comments"}
              aria-pressed={showPanel}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-foreground/20 md:hidden",
                showPanel ? "bg-foreground/20" : "bg-foreground/10"
              )}
            >
              {panel === "comments" ? <MessageCircle className="h-5 w-5" /> : <Scan className="h-5 w-5" />}
              {panelCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {panelCount > 99 ? "99+" : panelCount}
                </span>
              )}
            </button>
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-6 pb-6"
          {...(drawing ? {} : swipe.handlers)}
          style={{ touchAction: frames.length > 1 && !drawing ? "pan-y" : undefined }}
        >
          {frames.length > 1 && i > 0 && !drawing && (
            <button
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {/* Track of all frames; only the current one carries the shared-element
              name so open/close morphs stay unambiguous. Each slide is a full-width
              cell with the frame centered in it. */}
          <div className="h-full w-full max-w-[860px] overflow-hidden">
            <div className="flex h-full" style={swipe.trackStyle}>
              {frames.map((f, idx) => {
                const desktop = f ? formFactors[f] === "desktop" : false;
                // The current frame gets the live overlay (labels, selection,
                // drawing); the neighbours just their boxes, so a swipe lands
                // on an already-annotated screen.
                const rs = idx === i ? regions : regionsForImage(allRegions, f, `${app.id}::${idx}`);
                const overlay =
                  idx === i ? (
                    <RegionOverlay
                      regions={rs}
                      drawing={drawing}
                      draft={draft}
                      onDraft={onDraft}
                      selectedId={selectedId}
                      onSelect={(r) => setSelectedId(r?.id ?? null)}
                    />
                  ) : rs.length ? (
                    <RegionOverlay regions={rs} compact />
                  ) : undefined;
                return (
                  <div
                    key={idx}
                    className="flex h-full w-full shrink-0 items-center justify-center"
                    aria-hidden={idx !== i}
                  >
                    <div
                      className={cn("flex min-h-0 justify-center", desktop ? "w-full max-w-[860px]" : "")}
                      style={idx === i ? { viewTransitionName: screenTransitionName(app.id, i) } : undefined}
                    >
                      {desktop ? (
                        <DesktopFrame app={app} image={f} overlay={overlay} className="max-h-full w-full max-w-[860px]" />
                      ) : (
                        <PhoneFrame app={app} image={f} overlay={overlay} className="max-h-full w-auto max-w-[300px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {frames.length > 1 && i < frames.length - 1 && !drawing && (
            <button
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-6 pb-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            Found in <Badge>{app.category}</Badge>
          </span>
          {drawing ? (
            <span className="text-foreground">Drag a box on the screenshot</span>
          ) : (
            frames.length > 1 && (
              <span>
                Screen {i + 1} / {frames.length}
              </span>
            )
          )}
        </div>
      </div>

      {/* mobile-only scrim behind the bottom sheet; tap to dismiss */}
      {showPanel && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setShowPanel(false)}
          aria-hidden="true"
        />
      )}

      {/* right: data regions / comments — a bottom sheet overlay on mobile
          (toggled), always a fixed side column on desktop */}
      <aside
        className={cn(
          "min-h-0 flex-1 flex-col bg-card pb-[env(safe-area-inset-bottom)] md:flex md:w-[360px] md:flex-none md:border-l md:border-t-0 md:pb-0",
          showPanel
            ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] rounded-t-2xl border-t border-border shadow-2xl md:static md:inset-auto md:z-auto md:max-h-none md:rounded-none md:shadow-none"
            : "hidden md:flex"
        )}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2 md:hidden">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex shrink-0 gap-1 border-b border-border px-3 pt-2">
          {(
            [
              { key: "comments", label: "Comments", Icon: MessageCircle, count: commentCount },
              { key: "data", label: "Data", Icon: Scan, count: regions.length },
            ] as { key: Panel; label: string; Icon: typeof Scan; count: number }[]
          ).map(({ key, label, Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPanel(key)}
              aria-pressed={panel === key}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium transition-colors",
                panel === key
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {panel === "comments" ? (
            <Comments screenId={screenId} app={app} image={image} />
          ) : (
            <RegionPanel
              app={app}
              screenId={screenId}
              image={image}
              drawing={drawing}
              setDrawing={setDrawing}
              draft={draft}
              setDraft={setDraft}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              terms={shapeTerms}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
