import { useState, useEffect } from "react";
import { initialsFor, type App } from "@/lib/apps";
import { cn } from "@/lib/utils";

// App icon with a quality-first fallback chain. DuckDuckGo's icon service
// resolves the site's best icon server-side (apple-touch-icon / web-manifest
// icons / high-res favicon), which is sharper than a bare favicon; we fall back
// to the domain favicon (Google s2), then the app's initials. <img> loads
// cross-origin without CORS, so onError just walks down the list.
function iconCandidates(app: App): string[] {
  const out: string[] = [];
  if (app.domain) out.push(`https://icons.duckduckgo.com/ip3/${app.domain}.ico`);
  if (app.icon) out.push(app.icon); // favicon (Google s2) fallback
  return out;
}

export function AppIcon({
  app,
  size = 24,
  className,
  rounded = "rounded-md",
}: {
  app: App;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const candidates = iconCandidates(app);
  const [idx, setIdx] = useState(0);
  // Reset when the app changes (candidates differ).
  useEffect(() => setIdx(0), [app.id]);

  const src = candidates[idx];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-secondary text-[10px] font-bold",
        rounded,
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        initialsFor(app.name)
      )}
    </span>
  );
}
