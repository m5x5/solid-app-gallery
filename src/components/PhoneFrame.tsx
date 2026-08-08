import { Wifi, BatteryFull, Signal } from "lucide-react";
import { accentFor, initialsFor, type App } from "@/lib/apps";
import { cn } from "@/lib/utils";

// A phone mockup. If `image` is given it shows a real screenshot; otherwise a
// synthetic "screen" generated from the app's identity (Mobbin-style placeholder).
// `step` selects between a few synthetic layouts so a carousel has distinct pages.
export function PhoneFrame({
  app,
  image,
  className,
  variant = "screen",
  step = 0,
}: {
  app: App;
  image?: string;
  className?: string;
  variant?: "screen" | "card";
  step?: number;
}) {
  const accent = accentFor(app.id);
  return (
    <div
      className={cn(
        "relative aspect-[9/19.5] w-full overflow-hidden rounded-[1.6rem] bg-zinc-900 ring-1 ring-white/10",
        className
      )}
    >
      {image ? (
        <img
          src={image}
          alt={app.name}
          width={180}
          height={390}
          className="h-full w-full object-cover"
        />
      ) : (
        <SyntheticScreen app={app} accent={accent} variant={variant} step={step} />
      )}
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pt-3 text-[10px] font-semibold text-white/80">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <Signal className="h-3 w-3" />
        <Wifi className="h-3 w-3" />
        <BatteryFull className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function SyntheticScreen({
  app,
  accent,
  variant,
  step,
}: {
  app: App;
  accent: string;
  variant: "screen" | "card";
  step: number;
}) {
  const layout = ((step % 3) + 3) % 3; // 0 hero, 1 list/feed, 2 detail/form
  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: `linear-gradient(160deg, ${accent}22, #0b0b0b 55%)` }}
    >
      <StatusBar />

      {layout === 0 && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-lg font-bold text-white shadow-lg"
              style={{ background: accent }}
            >
              {app.icon ? (
                <img src={app.icon} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsFor(app.name)
              )}
            </div>
            <div className="text-sm font-semibold leading-tight text-white">
              {app.name}
            </div>
            <div className="line-clamp-3 text-[10px] leading-snug text-white/60">
              {app.description || app.category}
            </div>
          </div>
          {variant === "screen" && (
            <div className="space-y-2 px-4 pb-6">
              <div className="h-9 rounded-xl bg-white/10" />
              <div className="h-3 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-2/3 rounded bg-white/10" />
              <div className="mt-3 h-9 rounded-full" style={{ background: accent }} />
            </div>
          )}
        </>
      )}

      {layout === 1 && (
        <div className="flex flex-1 flex-col gap-3 px-4 pt-5">
          <div className="text-sm font-semibold text-white">{app.name}</div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{ background: `${accent}${i % 2 ? "55" : "aa"}` }}
              />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-2/3 rounded bg-white/15" />
                <div className="h-2 w-5/6 rounded bg-white/10" />
              </div>
            </div>
          ))}
          <div className="mt-auto mb-5 h-10 rounded-full" style={{ background: accent }} />
        </div>
      )}

      {layout === 2 && (
        <div className="flex flex-1 flex-col gap-3 px-4 pt-5">
          <div className="text-xs text-white/50">{app.category}</div>
          <div className="text-sm font-semibold leading-tight text-white">
            {app.name}
          </div>
          <div
            className="h-28 w-full rounded-xl"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}33)` }}
          />
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded bg-white/12" />
            <div className="h-2.5 w-11/12 rounded bg-white/10" />
            <div className="h-2.5 w-3/4 rounded bg-white/10" />
          </div>
          <div className="mt-auto mb-5 flex gap-2">
            <div className="h-10 flex-1 rounded-full bg-white/10" />
            <div className="h-10 flex-1 rounded-full" style={{ background: accent }} />
          </div>
        </div>
      )}
    </div>
  );
}
