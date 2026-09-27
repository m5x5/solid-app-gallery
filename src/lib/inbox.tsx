import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useSolid } from "./solid-context";
import {
  loadActivities,
  loadCommentActivities,
  loadSeen,
  saveSeen,
  type Activity,
} from "./activity";

// How often the header badge re-checks the inbox while the tab is open.
const POLL_MS = 60_000;

type Ctx = {
  items: Activity[];
  unread: number;
  isUnread: (id: string) => boolean;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  refresh: () => void;
  loading: boolean;
  error: string;
};

const InboxContext = createContext<Ctx | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, webId } = useSolid();
  const [items, setItems] = useState<Activity[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!isLoggedIn || !webId) return;
    setLoading(true);
    // Two sources: notifications delivered to your pod inbox, and comments
    // derived from the public threads (which also covers everything from
    // before notifications existed). A comment with both shows once.
    Promise.allSettled([loadActivities(webId), loadCommentActivities(webId)])
      .then(([delivered, derived]) => {
        const notes = delivered.status === "fulfilled" ? delivered.value : [];
        const known = new Set(notes.map((a) => a.object).filter(Boolean));
        const extra =
          derived.status === "fulfilled" ? derived.value.filter((a) => !known.has(a.object)) : [];
        setItems([...notes, ...extra].sort((a, b) => b.published.localeCompare(a.published)));
        setError(
          delivered.status === "rejected"
            ? (delivered.reason as Error)?.message || "Couldn't read your inbox."
            : ""
        );
      })
      .finally(() => setLoading(false));
  }, [isLoggedIn, webId]);

  // On login: read state once, then the inbox now, on focus, and periodically.
  useEffect(() => {
    if (!isLoggedIn || !webId) {
      setItems([]);
      setSeen(new Set());
      return;
    }
    let cancelled = false;
    loadSeen(webId).then((s) => !cancelled && setSeen(new Set(s)));
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [isLoggedIn, webId, refresh]);

  const persist = useCallback(
    (next: Set<string>) => {
      // Only keep ids still in the inbox, so the file doesn't grow forever.
      const live = new Set(items.map((a) => a.id));
      if (webId) saveSeen(webId, [...next].filter((id) => live.has(id))).catch(() => {});
    },
    [items, webId]
  );

  const markRead = useCallback(
    (ids: string[]) => {
      setSeen((prev) => {
        if (ids.every((id) => prev.has(id))) return prev;
        const next = new Set([...prev, ...ids]);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const markAllRead = useCallback(() => markRead(items.map((a) => a.id)), [items, markRead]);

  const value: Ctx = {
    items,
    unread: items.filter((a) => !seen.has(a.id)).length,
    isUnread: (id) => !seen.has(id),
    markRead,
    markAllRead,
    refresh,
    loading,
    error,
  };
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used within InboxProvider");
  return ctx;
}
