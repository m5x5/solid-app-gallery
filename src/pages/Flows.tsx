import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  apps,
  initialsFor,
  screenFrames,
  appHasTag,
  FLOW_ACTION_TAGS,
  type App,
} from "@/lib/apps";
import { PhoneFrame } from "@/components/PhoneFrame";

// A flow = the app's ordered, real captured screens. Only synthetic frames are
// used as a fallback when an app has no captured screenshots yet.
function FlowRow({ app, action }: { app: App; action: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const real = screenFrames(app.id);
  const frames: (string | undefined)[] = real.length ? real : [undefined, undefined, undefined];
  const steps = frames.length;

  function scrollRight() {
    scroller.current?.scrollBy({ left: 360, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth pb-1"
      >
        {frames.map((img, i) => (
          <Link
            key={i}
            to={`/screen/${encodeURIComponent(app.id)}?i=${real.length ? i : 0}`}
            className="w-[160px] shrink-0"
          >
            <PhoneFrame app={app} image={img} variant={i % 2 ? "screen" : "card"} />
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
        <span className="font-semibold">{action}</span>
        <span className="text-muted-foreground">in</span>
        <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-secondary text-[9px] font-bold">
          {app.icon ? (
            <img src={app.icon} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFor(app.name)
          )}
        </span>
        <span className="font-medium">{app.name}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{steps} screens</div>
    </div>
  );
}

export function Flows() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") || "Onboarding";

  // Flows whose action matches the captured screen's tags; real screenshots first.
  const tags = FLOW_ACTION_TAGS[action] || [action];
  const matched = apps.filter((a) => appHasTag(a.id, tags));
  const flowApps = [
    ...matched.filter((a) => screenFrames(a.id).length > 0),
    ...matched.filter((a) => screenFrames(a.id).length === 0),
  ].slice(0, 24);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium">
            Categories <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-sm font-medium text-background">
            {action}
            <button
              onClick={() => {
                const n = new URLSearchParams(params);
                n.set("action", "Onboarding");
                setParams(n);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      </div>

      <div className="mt-8 space-y-12">
        {flowApps.map((app) => (
          <FlowRow key={app.id} app={app} action={action} />
        ))}
      </div>
    </div>
  );
}
