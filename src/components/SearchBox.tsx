import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppIcon } from "@/components/AppIcon";
import { apps, categories, type App } from "@/lib/apps";
import { armAppTransition } from "@/lib/transitions";
import { cn } from "@/lib/utils";

const MAX = 7;

// Rank apps for a query: name prefix > name contains > keyword/category >
// description. Cheap enough to run on every keystroke over the in-memory
// catalog (a few hundred records).
function suggest(q: string): App[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (a: App): number => {
    const name = a.name.toLowerCase();
    if (name.startsWith(s)) return 4;
    if (name.includes(s)) return 3;
    const kw = `${a.technicalKeyword || ""} ${a.socialKeyword || ""} ${a.category}`.toLowerCase();
    if (kw.includes(s)) return 2;
    if (a.description.toLowerCase().includes(s)) return 1;
    return 0;
  };
  return apps
    .map((a) => ({ a, sc: score(a) }))
    .filter((x) => x.sc > 0)
    .sort((x, y) => y.sc - x.sc || x.a.name.localeCompare(y.a.name))
    .slice(0, MAX)
    .map((x) => x.a);
}

// Global search: type-ahead suggestions (app icon + name + category) with
// keyboard navigation; Enter with nothing highlighted searches the Screens
// grid, an arrow-selected or clicked suggestion opens the app.
export function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLFormElement>(null);
  const listId = "search-suggestions";

  const hits = useMemo(() => suggest(query), [query]);
  // A matching category is offered too ("Pod Management Apps" → filtered grid).
  const catHit = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? categories.find((c) => c.label.toLowerCase().includes(s)) : undefined;
  }, [query]);
  const rows = hits.length + (catHit ? 1 : 0);

  useEffect(() => setActive(-1), [query]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function goSearch() {
    setOpen(false);
    navigate(`/screens?q=${encodeURIComponent(query.trim())}`);
  }
  function goApp(a: App, el?: HTMLElement) {
    setOpen(false);
    setQuery("");
    if (el) armAppTransition(el, a.id);
    navigate(`/app/${encodeURIComponent(a.id)}`, { viewTransition: true });
  }
  function goCategory() {
    if (!catHit) return;
    setOpen(false);
    setQuery("");
    navigate(`/screens?cat=${encodeURIComponent(catHit.key)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || rows === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? rows - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      if (active < hits.length) goApp(hits[active], document.getElementById(`${listId}-${active}`) || undefined);
      else goCategory();
    }
  }

  return (
    <form
      ref={wrap}
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim()) goSearch();
      }}
      className={cn("relative mx-auto flex w-full max-w-xl items-center", className)}
      role="search"
    >
      <Search className="pointer-events-none absolute left-4 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search"
        className="h-11 rounded-full pl-11"
        role="combobox"
        aria-expanded={open && rows > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {open && query.trim() && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl"
        >
          {rows === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">
              No apps match “{query.trim()}” — press Enter to search screens.
            </div>
          ) : (
            <>
              {hits.map((a, i) => (
                <button
                  key={a.id}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => goApp(a, e.currentTarget)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    active === i ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <span data-vt="icon" className="flex shrink-0">
                    <AppIcon app={a} size={28} rounded="rounded-lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span data-vt="name" className="block truncate font-medium">
                      {a.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.category}
                    </span>
                  </span>
                </button>
              ))}
              {catHit && (
                <button
                  id={`${listId}-${hits.length}`}
                  type="button"
                  role="option"
                  aria-selected={active === hits.length}
                  onMouseEnter={() => setActive(hits.length)}
                  onClick={goCategory}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    active === hits.length ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{catHit.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Category · {catHit.count} apps
                    </span>
                  </span>
                </button>
              )}
              <div className="mt-1 border-t border-border px-3 pb-1 pt-2 text-xs text-muted-foreground">
                Enter to search all screens for “{query.trim()}”
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
}
