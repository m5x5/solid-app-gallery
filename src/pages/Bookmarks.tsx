import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { useBookmarks } from "@/lib/bookmarks";
import { getApp } from "@/lib/apps";
import { DiscoverCard } from "@/components/cards";

export function Bookmarks() {
  const { ids } = useBookmarks();
  const apps = ids.map((id) => getApp(id)).filter(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Bookmark className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        <span className="text-sm text-muted-foreground">{apps.length} saved</span>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No bookmarks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the bookmark icon on any app to save it here.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Browse apps
          </Link>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="bookmarks-grid"
        >
          {apps.map((a) => (
            <DiscoverCard key={a!.id} app={a!} />
          ))}
        </div>
      )}
    </div>
  );
}
