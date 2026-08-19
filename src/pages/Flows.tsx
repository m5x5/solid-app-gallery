import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  apps,
  categories,
  initialsFor,
  screenFrames,
  frameTags,
  appHasTag,
  FLOW_ACTION_TAGS,
  flowActionCounts,
  type App,
} from "@/lib/apps";
import { PhoneFrame } from "@/components/PhoneFrame";
import { useHead, JsonLd, itemListJsonLd } from "@/lib/seo";
import { armScreenTransition, returnScreenTransitionName } from "@/lib/transitions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// A flow = the app's captured screens that belong to the selected action
// (frames tagged with it), in capture order. Each frame keeps its index into
// the app's full frame list so the detail view opens the right screen.
// Legacy entries with no per-frame tags fall back to all frames; synthetic
// frames are only used when an app has no captured screenshots yet.
function FlowRow({ app, tags }: { app: App; tags: string[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const all = screenFrames(app.id);
  const tagged = all
    .map((path, index) => ({ path, index }))
    .filter((f) => frameTags(app.id, f.path).some((t) => tags.includes(t)));
  const real = tagged.length ? tagged : all.map((path, index) => ({ path, index }));
  const frames: { path?: string; index: number }[] = real.length
    ? real
    : [{ index: 0 }, { index: 0 }, { index: 0 }];

  function scrollRight() {
    scroller.current?.scrollBy({ left: 360, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth pb-1"
      >
        {frames.map((f, i) => (
          <Link
            key={i}
            to={`/screen/${encodeURIComponent(app.id)}?i=${f.index}`}
            viewTransition
            state={{ from: window.location.pathname + window.location.search }}
            onClick={(e) => armScreenTransition(e.currentTarget, app.id, f.index)}
            className="w-[160px] shrink-0"
          >
            <span
              data-vt="shot"
              className="block"
              style={{ viewTransitionName: returnScreenTransitionName(app.id, f.index) }}
            >
              <PhoneFrame app={app} image={f.path} variant={i % 2 ? "screen" : "card"} />
            </span>
          </Link>
        ))}
      </div>
      <button
        onClick={scrollRight}
        className="absolute -right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 md:flex"
        aria-label="scroll"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <Link
          to={`/app/${encodeURIComponent(app.id)}`}
          className="flex items-center gap-2 hover:underline"
        >
          <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-secondary text-[9px] font-bold">
            {app.icon ? (
              <img src={app.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsFor(app.name)
            )}
          </span>
          <span className="font-medium">{app.name}</span>
        </Link>
      </div>
    </div>
  );
}

export function Flows() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") || "Onboarding";
  const cat = params.get("cat") || "";
  const catLabel = categories.find((c) => c.key === cat)?.label;

  function setParam(key: string, value: string | null) {
    const n = new URLSearchParams(params);
    if (value === null) n.delete(key);
    else n.set(key, value);
    setParams(n);
  }

  // Flows whose action matches the captured screen's tags; real screenshots first.
  const tags = FLOW_ACTION_TAGS[action] || [action];
  const matched = apps.filter(
    (a) => appHasTag(a.id, tags) && (!cat || a.categoryKey === cat)
  );
  const flowApps = [
    ...matched.filter((a) => screenFrames(a.id).length > 0),
    ...matched.filter((a) => screenFrames(a.id).length === 0),
  ].slice(0, 24);

  useHead({
    title: `${action} flows`,
    description: `${action} flows from ${flowApps.length} Solid apps — step-by-step screenshots of how each app handles ${action.toLowerCase()}.`,
    path: "/flows",
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
      <JsonLd data={itemListJsonLd(`${action} flows`, flowApps, `${location.origin}/flows`)} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                Categories <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {categories.map((c) => (
                <DropdownMenuItem key={c.key} onClick={() => setParam("cat", c.key)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {catLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-sm font-medium text-background">
              {catLabel}
              <button onClick={() => setParam("cat", null)} className="ml-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                {action}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {flowActionCounts().map((f) => (
                <DropdownMenuItem
                  key={f.action}
                  onClick={() => setParam("action", f.action)}
                >
                  {f.action}
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">
                    {f.count}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-8 space-y-12">
        {flowApps.map((app) => (
          <FlowRow key={app.id} app={app} tags={tags} />
        ))}
      </div>
    </div>
  );
}
