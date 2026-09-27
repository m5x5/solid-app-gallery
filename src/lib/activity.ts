import {
  getSolidDataset,
  getContainedResourceUrlAll,
  getThing,
  getUrl,
  getDatetime,
} from "@inrupt/solid-client";
import { solidFetch } from "./solid-auth";
import { galleryStorageRoot } from "./sai-storage";
import {
  podRootFromWebId,
  ensureContainer,
  listPublicCommentUrls,
  readComment,
  type Comment,
} from "./solid-data";
import { frameCreator, getApp, type App } from "./apps";

// --- Personal activity inbox ---
// Everyone gets told about activity that concerns them (a comment on their
// app, a reply in a thread they joined, a moderator acting on something they
// sent) through the Solid-native channel: an ActivityStreams notification
// POSTed to the recipient's own LDN inbox, found via ldp:inbox on their
// profile. The inbox page reads the signed-in person's inbox back, keeping only
// notifications this gallery generated (other apps share the same inbox).

const LDP_INBOX = "http://www.w3.org/ns/ldp#inbox";
const DCTERMS_MODIFIED = "http://purl.org/dc/terms/modified";

// A shared inbox (the owner's is also the admin review inbox) can hold
// hundreds of notices; only the newest this many are opened.
const MAX_ITEMS = 100;

// Marks a notification as ours. Deployment-independent on purpose, so a
// notification sent from localhost still shows up on the live site.
export const GALLERY_GENERATOR = "https://solid-app-gallery.mpeters.dev/";

export type ActivityKind =
  | "comment" // someone commented on a screen you're involved with
  | "published" // your submission/upload went live
  | "dismissed" // a moderator dismissed something you sent
  | "deleted" // an app you flagged was removed
  | "moderator"; // you were made a moderator

export type Activity = {
  id: string; // the notification resource in the inbox
  kind: ActivityKind;
  actor: string; // WebID
  actorName: string;
  summary: string; // one line, e.g. "commented on Foo"
  content?: string; // the comment text, a reason, …
  path?: string; // in-app route to open, e.g. /screen/foo?i=0&c=…
  object?: string; // what it's about (for a comment: the comment resource)
  published: string;
};

// AS2 types per kind. None of these are Announce/Update/Flag/Join/Undo, which
// the admin review queue parses — the owner's personal inbox *is* the admin
// inbox, so personal notices must never be mistaken for review items.
const AS_TYPE: Record<ActivityKind, string> = {
  comment: "Create",
  published: "Accept",
  dismissed: "Reject",
  deleted: "Remove",
  moderator: "Add",
};

const KIND_OF: Record<string, ActivityKind> = Object.fromEntries(
  Object.entries(AS_TYPE).map(([k, t]) => [t, k as ActivityKind])
);

const inboxCache = new Map<string, Promise<string | undefined>>();

// The LDN inbox a WebID's profile advertises (ldp:inbox), if any.
export function inboxOf(webId: string): Promise<string | undefined> {
  let p = inboxCache.get(webId);
  if (!p) {
    p = getSolidDataset(webId.split("#")[0], { fetch: solidFetch })
      .then((ds) => {
        const me = getThing(ds, webId);
        return (me && getUrl(me, LDP_INBOX)) || undefined;
      })
      .catch(() => undefined);
    inboxCache.set(webId, p);
  }
  return p;
}

// Deliver one activity to each recipient's inbox — never to the actor, never
// twice. Best-effort: someone without a (writable) inbox just isn't notified.
export async function notifyPeople(
  recipients: (string | undefined)[],
  actor: { webId: string; name: string },
  kind: ActivityKind,
  fields: { summary: string; content?: string; object?: string; path?: string }
): Promise<void> {
  const to = [...new Set(recipients.filter((r): r is string => !!r && /^https?:/.test(r)))].filter(
    (r) => r !== actor.webId
  );
  const body = JSON.stringify({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: AS_TYPE[kind],
    generator: GALLERY_GENERATOR,
    actor: { type: "Person", id: actor.webId, name: actor.name },
    summary: fields.summary,
    ...(fields.content ? { content: fields.content } : {}),
    ...(fields.object ? { object: fields.object } : {}),
    ...(fields.path ? { url: new URL(fields.path, window.location.origin).href } : {}),
    published: new Date().toISOString(),
  });
  await Promise.all(
    to.map(async (webId) => {
      const inbox = await inboxOf(webId);
      if (!inbox) return;
      const init = { method: "POST", headers: { "Content-Type": "application/ld+json" }, body };
      try {
        // Authenticated first (inboxes often grant Append to AuthenticatedAgent);
        // fall back to anonymous for servers that reject a foreign token.
        const res = await solidFetch(inbox, init);
        if (!res.ok) await fetch(inbox, init);
      } catch {
        /* best-effort */
      }
    })
  );
}

// Everyone with a stake in a screen's comment thread: the app's submitter and
// authors, whoever uploaded that screenshot, and everyone who has commented
// publicly on it before.
export function threadAudience(app: App, screenIndex: number, thread: Comment[]): string[] {
  return [
    app.contributor,
    ...(app.authors || []).map((a) => a.webId || a.id),
    frameCreator(app.id, screenIndex),
    ...thread.filter((c) => c.visibility === "public").map((c) => c.author),
  ].filter((w): w is string => !!w);
}

// --- Reading the signed-in person's inbox ---

// Notifications never change once posted, so each is fetched once and its
// parsed form (or null: not ours) remembered in this browser. A shared inbox
// full of review notices then costs one listing per refresh, not one request
// per notice.
const LS_PARSED = "solid-gallery.inbox-parsed";
let parsed: Map<string, Activity | null> | undefined;
const inflight = new Map<string, Promise<void>>();

function parsedCache(): Map<string, Activity | null> {
  if (!parsed) {
    try {
      parsed = new Map(JSON.parse(localStorage.getItem(LS_PARSED) || "[]"));
    } catch {
      parsed = new Map();
    }
  }
  return parsed;
}

// Persist only what's still in the inbox, so the cache can't outgrow it.
function saveParsedCache(live: string[]) {
  const cache = parsedCache();
  try {
    localStorage.setItem(LS_PARSED, JSON.stringify(live.filter((u) => cache.has(u)).map((u) => [u, cache.get(u)])));
  } catch {
    /* storage full or blocked — the in-memory cache still works */
  }
}

function fetchNotice(u: string): Promise<void> {
  let p = inflight.get(u);
  if (!p) {
    p = solidFetch(u, { headers: { Accept: "application/ld+json" } })
      .then(async (res) => {
        if (res.ok) parsedCache().set(u, toActivity(await res.json().catch(() => null), u));
      })
      .catch(() => {
        /* transient — retried on the next refresh */
      })
      .finally(() => inflight.delete(u));
    inflight.set(u, p);
  }
  return p;
}

function toActivity(n: any, url: string): Activity | null {
  if (n?.generator !== GALLERY_GENERATOR) return null;
  const kind = KIND_OF[n.type];
  if (!kind) return null;
  const actor = typeof n.actor === "string" ? { id: n.actor } : n.actor || {};
  let path: string | undefined;
  try {
    const u = new URL(n.url);
    path = u.pathname + u.search;
  } catch {
    /* no link */
  }
  return {
    id: url,
    kind,
    actor: actor.id || "",
    actorName: actor.name || "Someone",
    summary: n.summary || "",
    content: typeof n.content === "string" ? n.content : undefined,
    path,
    object: typeof n.object === "string" ? n.object : n.object?.id,
    published: n.published || "",
  };
}

// Gallery activities in the person's own inbox, newest first. Throws if the
// inbox can't be read, so the page can say so rather than look empty.
export async function loadActivities(webId: string): Promise<Activity[]> {
  const inbox = await inboxOf(webId);
  if (!inbox) throw new Error("Your profile doesn't list an inbox (ldp:inbox).");
  const ds = await getSolidDataset(inbox, { fetch: solidFetch });
  // The listing carries each resource's dcterms:modified, so the newest can be
  // picked without opening every notice.
  const modified = (u: string) => {
    const t = getThing(ds, u);
    return (t && getDatetime(t, DCTERMS_MODIFIED)?.getTime()) || 0;
  };
  const urls = getContainedResourceUrlAll(ds)
    .filter((u) => !u.endsWith("/"))
    .sort((a, b) => modified(b) - modified(a))
    .slice(0, MAX_ITEMS);
  const cache = parsedCache();
  await Promise.all(urls.filter((u) => !cache.has(u)).map(fetchNotice));
  saveParsedCache(urls);
  return urls
    .map((u) => cache.get(u))
    .filter((a): a is Activity => !!a)
    .sort((a, b) => b.published.localeCompare(a.published));
}

// --- Seen state, per person, in their own pod ---
// A plain list of notification URLs they've opened, next to bookmarks.json,
// so "unread" follows them across devices.
async function seenUrl(webId: string) {
  return `${await galleryStorageRoot(webId, podRootFromWebId(webId))}inbox-seen.json`;
}

export async function loadSeen(webId: string): Promise<string[]> {
  try {
    const res = await solidFetch(await seenUrl(webId), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.seen) ? data.seen : [];
  } catch {
    return [];
  }
}

export async function saveSeen(webId: string, seen: string[]): Promise<void> {
  const url = await seenUrl(webId);
  await ensureContainer(url.slice(0, url.lastIndexOf("/") + 1));
  const res = await solidFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seen, modified: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Saving read state failed: ${res.status} ${res.statusText}`);
}

// --- Comments that concern you, read straight from the public threads ---
// Notifications only exist for comments posted since the inbox was built, and
// only reach people whose inbox accepted them. Deriving from the threads too
// covers everything before that, and anyone a delivery missed.
const LS_COMMENTS = "solid-gallery.inbox-comments";
let comments: Map<string, Comment | null> | undefined;

function commentCache(): Map<string, Comment | null> {
  if (!comments) {
    try {
      comments = new Map(JSON.parse(localStorage.getItem(LS_COMMENTS) || "[]"));
    } catch {
      comments = new Map();
    }
  }
  return comments;
}

export async function loadCommentActivities(webId: string): Promise<Activity[]> {
  const urls = await listPublicCommentUrls();
  const cache = commentCache();
  await Promise.all(
    urls
      .filter((u) => !cache.has(u))
      .map((u) =>
        readComment(u)
          .then((c) => void cache.set(u, c))
          .catch(() => {})
      )
  );
  try {
    localStorage.setItem(LS_COMMENTS, JSON.stringify(urls.filter((u) => cache.has(u)).map((u) => [u, cache.get(u)])));
  } catch {
    /* in-memory cache still works */
  }

  const threads = new Map<string, Comment[]>();
  for (const u of urls) {
    const c = cache.get(u);
    if (!c || c.visibility !== "public" || c.kind === "version") continue;
    threads.set(c.screenId, [...(threads.get(c.screenId) || []), c]);
  }
  const out: Activity[] = [];
  for (const [screenId, thread] of threads) {
    const cut = screenId.lastIndexOf("::");
    const app = getApp(screenId.slice(0, cut));
    if (!app) continue;
    const idx = Number(screenId.slice(cut + 2)) || 0;
    thread.sort((a, b) => a.created.localeCompare(b.created));
    thread.forEach((c, i) => {
      if (!c.author || c.author === webId) return;
      // Same audience a live notification would have had at the time.
      if (!threadAudience(app, idx, thread.slice(0, i)).includes(webId)) return;
      out.push({
        id: c.id,
        kind: "comment",
        actor: c.author,
        actorName: c.authorLabel,
        summary: c.kind === "issue" ? `linked a GitHub issue on ${app.name}` : `commented on ${app.name}`,
        content: c.text,
        path: `/screen/${encodeURIComponent(app.id)}?i=${idx}&c=${encodeURIComponent(c.id)}`,
        object: c.id,
        published: c.created,
      });
    });
  }
  return out;
}
