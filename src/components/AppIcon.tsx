import { useState, useEffect } from "react";
import { initialsFor, type App } from "@/lib/apps";
import { cn } from "@/lib/utils";

// App icon: the app's own icon as resolved by api/icon.ts (web-manifest icon,
// apple-touch-icon, or the largest favicon the site declares) — nothing from
// third-party favicon services. If the site has none, the app's initials.
function iconCandidates(app: Pick<App, "icon">): string[] {
  return app.icon ? [app.icon] : [];
}

export function AppIcon({
  app,
  size = 24,
  className,
  rounded = "rounded-md",
  style,
}: {
  app: Pick<App, "id" | "name" | "icon">;
  size?: number;
  className?: string;
  rounded?: string;
  style?: React.CSSProperties;
}) {
  const candidates = iconCandidates(app);
  const [idx, setIdx] = useState(0);
  // Reset when the app changes (candidates differ).
  useEffect(() => setIdx(0), [app.id]);

  const src = candidates[idx];
  return (
    <span
      className={cn(
        // White tile in both themes — most app icons are transparent PNGs drawn
        // for a light background — with a hairline border to define its edge.
        // The initials fallback needs its own dark text for the same reason.
        "flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white text-[10px] font-bold text-neutral-900",
        rounded,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32), ...style }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        initialsFor(app.name)
      )}
    </span>
  );
}
