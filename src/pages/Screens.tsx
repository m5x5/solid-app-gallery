import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import {
  apps,
  categories,
  qualityRank,
  screenTags,
  frameForTag,
  appHasDevice,
} from "@/lib/apps";
import { ScreenCard } from "@/components/cards";
import { useDevice } from "@/lib/device-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

function Pill({
  children,
  active,
  onClear,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClear?: () => void;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-foreground",
    onClick && "hover:bg-secondary"
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
    <button type="button" onClick={onClick} className={className}>
      {children}
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

export function Screens() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.toLowerCase() || "";
  const cat = params.get("cat") || "";
  const pattern = params.get("pattern") || "";
  const { device } = useDevice();

  const filtered = useMemo(() => {
    const matched = apps.filter((a) => {
      // Only apps that have a screenshot for the selected viewport.
      if (!appHasDevice(a.id, device)) return false;
      if (cat && a.categoryKey !== cat) return false;
      // A screen-pattern filter matches the captured screenshot's tags.
      if (pattern && !screenTags(a.id).includes(pattern)) return false;
      if (q) {
        const hay = `${a.name} ${a.description} ${a.technicalKeyword || ""} ${
          a.socialKeyword || ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Quality tiers first (real app UI → repository → docs → no screenshot).
    return matched
      .map((a, idx) => ({ a, idx }))
      .sort((x, y) => qualityRank(x.a.id) - qualityRank(y.a.id) || x.idx - y.idx)
      .map((e) => e.a);
  }, [q, cat, pattern, device]);

  const catLabel = categories.find((c) => c.key === cat)?.label;

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
        {filtered.map((app) => (
          <ScreenCard
            key={app.id}
            app={app}
            image={pattern ? frameForTag(app.id, pattern) : undefined}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-20 text-center text-muted-foreground">
          No screens match this filter.
        </p>
      )}
    </div>
  );
}
