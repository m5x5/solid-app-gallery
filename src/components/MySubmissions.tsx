import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useSolid } from "@/lib/solid-context";
import { getApp, appBySource } from "@/lib/apps";
import { listMySubmissions, withdrawMySubmission, type MySubmission } from "@/lib/solid-data";
import { usePendingSubmissions } from "@/lib/use-pending-flush";
import { removePending } from "@/lib/pending-submissions";

// What this visitor has submitted: entries still queued on this device (made
// while logged out) followed by the ones already written to their pod.
export function MySubmissions() {
  const { isLoggedIn, webId } = useSolid();
  const navigate = useNavigate();
  const pending = usePendingSubmissions();
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Queued on this device only — cancelling just drops it from the queue.
  function cancelPending(id: string, name: string) {
    if (!window.confirm(`Cancel the queued submission for "${name}"? It is only stored on this device and will be discarded.`))
      return;
    removePending(id);
  }

  // Already in the submitter's pod: delete the record and tell the admin so it
  // leaves the review queue too.
  async function withdraw(m: MySubmission) {
    if (!webId) return;
    if (!window.confirm(`Withdraw "${m.sub.name}" from review? The submission is deleted from your pod.`))
      return;
    setBusy(m.url);
    try {
      await withdrawMySubmission(m.url, webId, m.sub.name);
      setMine((list) => list.filter((x) => x.url !== m.url));
      setNote(`Withdrew "${m.sub.name}".`);
    } catch {
      setNote(`Couldn't withdraw "${m.sub.name}" — please try again.`);
    } finally {
      setBusy(null);
    }
  }

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
      {note && (
        <p role="status" className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {note}
        </p>
      )}
      {loading && mine.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      )}
      <ul className="mt-4 space-y-2">
        {pending.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 transition hover:bg-foreground/[0.06]"
          >
            <Link
              to={`/submit?pendingId=${encodeURIComponent(p.id)}`}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span className="font-medium">{p.sub.name}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {isLoggedIn ? "Sending…" : "Waiting for login"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(p.created).toLocaleString()}
              </span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${p.sub.name}`}
                  className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => navigate(`/submit?pendingId=${encodeURIComponent(p.id)}`)}
                >
                  <Pencil className="h-4 w-4" /> Edit submission
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => cancelPending(p.id, p.sub.name)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Cancel submission
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {mine.map((m) => {
          const live = appBySource(m.url) || (m.sub.id ? getApp(m.sub.id) : undefined);
          return (
            <li
              key={m.url}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 transition hover:bg-foreground/[0.06]"
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions for ${m.sub.name}`}
                    className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => navigate(`/submit?url=${encodeURIComponent(m.url)}`)}
                  >
                    <Pencil className="h-4 w-4" /> Edit submission
                  </DropdownMenuItem>
                  {live && (
                    <DropdownMenuItem
                      onSelect={() => navigate(`/app/${encodeURIComponent(live.id)}`)}
                    >
                      <ExternalLink className="h-4 w-4" /> View in gallery
                    </DropdownMenuItem>
                  )}
                  {/* Published records belong to the catalog now — withdrawing
                      only applies while the submission is still in review. */}
                  {!live && (
                    <DropdownMenuItem
                      onSelect={() => withdraw(m)}
                      disabled={busy === m.url}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Withdraw submission
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
