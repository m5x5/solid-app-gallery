import * as React from "react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import {
  apps,
  categories,
  qualityRank,
  screenTags,
  frameTags,
  screenFrames,
} from "@/lib/apps";
import { ScreenCard } from "@/components/cards";
import { useDevice } from "@/lib/device-context";
import { useHead, JsonLd, itemListJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// The clickable variant is used as a Radix DropdownMenuTrigger via asChild, so
// it must forward both the ref and the injected handlers to the real <button>.
type PillProps = React.ComponentPropsWithoutRef<"button"> & {
  active?: boolean;
  onClear?: () => void;
};

const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { children, active, onClear, className: extraClassName, ...props },
  ref
) {
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-foreground",
    props.onClick && "hover:bg-secondary",
    extraClassName
  );

  if (onClear) {
    return (
      <span className={className}>
        {children}
        <button onClick={onClear} className="ml-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button type="button" ref={ref} className={className} {...props}>
      {children}
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
});

export function Screens() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.toLowerCase() || "";
  const cat = params.get("cat") || "";
  const pattern = params.get("pattern") || "";
  const { device } = useDevice();

  // One card per captured frame (not per app), for the selected viewport.
  const screens = useMemo(() => {
    // A frame's own tags; legacy entries without per-frame tags fall back to
    // the app-wide union so they still match a pattern filter.
    const tagsFor = (id: string, path: string) => {
      const t = frameTags(id, path);
      return t.length ? t : screenTags(id);
    };

    const matched = apps.filter((a) => {
      if (cat && a.categoryKey !== cat) return false;
      if (q) {
        const hay = `${a.name} ${a.description} ${a.technicalKeyword || ""} ${
          a.socialKeyword || ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Quality tiers first (real app UI → repository → docs), apps keep catalog
    // order within a tier, and each app's frames keep their captured order.
    return matched
      .map((a, idx) => ({ a, idx }))
      .sort((x, y) => qualityRank(x.a.id) - qualityRank(y.a.id) || x.idx - y.idx)
      .flatMap(({ a }) => {
        // ?i= in the detail view indexes the full frame list, so resolve each
        // visible frame's position there rather than within the filtered set.
        const all = screenFrames(a.id);
        const forDevice = new Set(screenFrames(a.id, device));
        return all
          .map((path, i) => ({ app: a, path, i }))
          .filter(
            (f) =>
              forDevice.has(f.path) &&
              (!pattern || tagsFor(a.id, f.path).includes(pattern))
          );
      });
  }, [q, cat, pattern, device]);

  const catLabel = categories.find((c) => c.key === cat)?.label;

  const headTitle = [catLabel, pattern && `${pattern} screens`, q && `“${q}”`]
    .filter(Boolean)
    .join(" · ");
  useHead({
    title: headTitle ? `Screens: ${headTitle}` : "Screens",
    description: `Browse ${screens.length} Solid app screens${catLabel ? ` in ${catLabel}` : ""}${pattern ? ` showing ${pattern.toLowerCase()}` : ""} — real captured screenshots.`,
    path: "/screens",
  });
  const listedApps = useMemo(() => {
    const seen = new Set<string>();
    return screens.map((s) => s.app).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }, [screens]);

  function clear(key: string) {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next);
  }

  function setCat(key: string) {
    const next = new URLSearchParams(params);
    next.set("cat", key);
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
      <JsonLd data={itemListJsonLd(headTitle || "All screens", listedApps, `${location.origin}/screens`)} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Pill active={!!cat}>Categories</Pill>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {categories.map((c) => (
                <DropdownMenuItem key={c.key} onClick={() => setCat(c.key)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {catLabel && (
            <Pill active onClear={() => clear("cat")}>
              {catLabel}
            </Pill>
          )}
          {pattern && (
            <Pill active onClear={() => clear("pattern")}>
              {pattern}
            </Pill>
          )}
          {q && (
            <Pill active onClear={() => clear("q")}>
              “{q}”
            </Pill>
          )}
        </div>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-x-4 gap-y-8",
          device === "desktop"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        )}
      >
        {screens.map(({ app, path, i }) => (
          <ScreenCard key={`${app.id}::${i}`} app={app} image={path} frameIndex={i} />
        ))}
      </div>
      {screens.length === 0 && (
        <p className="py-20 text-center text-muted-foreground">
          No screens match this filter.
        </p>
      )}
    </div>
  );
}
