import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSolid } from "@/lib/solid-context";
import { getApp, appBySource } from "@/lib/apps";
import { listMySubmissions, type MySubmission } from "@/lib/solid-data";
import { usePendingSubmissions } from "@/lib/use-pending-flush";

// What this visitor has submitted: entries still queued on this device (made
// while logged out) followed by the ones already written to their pod.
export function MySubmissions() {
  const { isLoggedIn, webId } = useSolid();
  const pending = usePendingSubmissions();
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !webId) {
      setMine([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listMySubmissions(webId)
      .then((list) => {
        if (!cancelled) setMine(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `pending.length` so the list refreshes once the login flush delivers a
    // queued submission.
  }, [isLoggedIn, webId, pending.length]);

  if (pending.length === 0 && mine.length === 0 && !loading) return null;

  return (
    <div data-testid="my-submissions">
      <h2 className="text-2xl font-bold">Your submissions</h2>
      {loading && mine.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      )}
      <ul className="mt-4 space-y-2">
        {pending.map((p) => (
          <li key={p.id}>
            <Link
              to={`/submit?pendingId=${encodeURIComponent(p.id)}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 transition hover:border-white/25"
            >
              <span className="font-medium">{p.sub.name}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {isLoggedIn ? "Sending…" : "Waiting for login"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(p.created).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
        {mine.map((m) => {
          const live = appBySource(m.url) || (m.sub.id ? getApp(m.sub.id) : undefined);
          return (
            <li
              key={m.url}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 transition hover:border-white/25"
            >
              <Link
                to={`/submit?url=${encodeURIComponent(m.url)}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="font-medium">{m.sub.name}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {live ? "Published ✓" : "Submitted — in review"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {m.created ? new Date(m.created).toLocaleString() : ""}
                </span>
              </Link>
              {live && (
                <Link
                  to={`/app/${encodeURIComponent(live.id)}`}
                  className="text-xs font-medium underline"
                >
                  View in gallery
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {!isLoggedIn && pending.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Saved on this device. Log in and these are sent automatically.
        </p>
      )}
    </div>
  );
}
