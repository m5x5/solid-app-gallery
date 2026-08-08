import { Bookmark } from "lucide-react";
import { useBookmarks } from "@/lib/bookmarks";
import { cn } from "@/lib/utils";

// Toggle button used on cards (overlay) and the detail page.
export function BookmarkButton({
  appId,
  className,
  variant = "overlay",
}: {
  appId: string;
  className?: string;
  variant?: "overlay" | "button";
}) {
  const { isBookmarked, toggle } = useBookmarks();
  const active = isBookmarked(appId);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle(appId);
  }

  if (variant === "button") {
    return (
      <button
        onClick={onClick}
        aria-pressed={active}
        aria-label={active ? "Remove bookmark" : "Add bookmark"}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent",
          className
        )}
      >
        <Bookmark className={cn("h-4 w-4", active && "fill-current")} />
        {active ? "Bookmarked" : "Bookmark"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "Remove bookmark" : "Add bookmark"}
      data-testid={`bookmark-${appId}`}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80",
        active && "bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
    >
      <Bookmark className={cn("h-4 w-4", active && "fill-current")} />
    </button>
  );
}
