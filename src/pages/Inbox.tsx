import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, MessageSquare, Check, X, Trash2, ShieldCheck } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { useInbox } from "@/lib/inbox";
import type { Activity, ActivityKind } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICON: Record<ActivityKind, typeof Bell> = {
  comment: MessageSquare,
  published: Check,
  dismissed: X,
  deleted: Trash2,
  moderator: ShieldCheck,
};

export function Inbox() {
  const { isLoggedIn, login } = useSolid();
  const { items, unread, isUnread, markRead, markAllRead, loading, error } = useInbox();
  const navigate = useNavigate();

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-16 text-center text-muted-foreground">
        <Bell className="mx-auto mb-3 h-8 w-8" />
        <p>Log in to see comments and other activity on your apps.</p>
        <Button onClick={() => login()} className="mt-4">
          Log in
        </Button>
      </div>
    );
  }

  function open(a: Activity) {
    markRead([a.id]);
    if (a.path) navigate(a.path);
  }

  return (
    <div className="mx-auto max-w-[800px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Bell className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Inbox</h1>
        <span className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} unread` : loading && items.length === 0 ? "" : "All caught up"}
        </span>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="ml-auto gap-1.5">
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Couldn't read your inbox: {error}
        </div>
      )}

      {items.length === 0 ? (
        !error && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{loading ? "Checking your inbox…" : "Nothing here yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Comments on your apps and screenshots, replies in threads you joined, and
              updates on what you submitted show up here.
            </p>
          </div>
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((a) => {
            const Icon = ICON[a.kind];
            const fresh = isUnread(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => open(a)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-secondary/60",
                    fresh && "bg-primary/5"
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", fresh && "font-semibold")}>
                      {a.actorName} {a.summary}
                    </p>
                    {a.content && (
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {a.content}
                      </p>
                    )}
                    {a.published && (
                      <time dateTime={a.published} className="mt-1 block text-xs text-muted-foreground">
                        {new Date(a.published).toLocaleString()}
                      </time>
                    )}
                  </div>
                  {fresh && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
