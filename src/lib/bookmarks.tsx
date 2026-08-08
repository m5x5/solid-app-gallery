import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useSolid } from "./solid-context";
import { loadBookmarks, saveBookmarks } from "./solid-data";

const LS_KEY = "solid-gallery.bookmarks";

type Ctx = {
  ids: string[];
  isBookmarked: (id: string) => boolean;
  toggle: (id: string) => void;
  count: number;
};

const BookmarksContext = createContext<Ctx | null>(null);

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, webId } = useSolid();
  const [ids, setIds] = useState<string[]>(() => readLocal());

  // Persist locally on every change (source of truth that always works).
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, [ids]);

  // On login, merge the pod's bookmarks with local ones.
  useEffect(() => {
    if (!isLoggedIn || !webId) return;
    let cancelled = false;
    loadBookmarks(webId).then((remote) => {
      if (cancelled) return;
      setIds((local) => Array.from(new Set([...local, ...remote])));
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, webId]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id];
        // Best-effort pod persistence when logged in.
        if (isLoggedIn && webId) saveBookmarks(webId, next).catch(() => {});
        return next;
      });
    },
    [isLoggedIn, webId]
  );

  const value: Ctx = {
    ids,
    isBookmarked: (id) => ids.includes(id),
    toggle,
    count: ids.length,
  };
  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error("useBookmarks must be used within BookmarksProvider");
  return ctx;
}
