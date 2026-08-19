import {
  overwriteFile,
  getSolidDataset,
  getContainedResourceUrlAll,
  getFile,
  createContainerAt,
  getThing,
  getStringNoLocale,
  getUrl,
} from "@inrupt/solid-client";
import { Parser, Store, Writer, DataFactory } from "n3";
import { solidFetch } from "./solid-auth";
import { getProfileInfo } from "./avatars";
import {
  ADMIN_POD,
  ADMIN_INBOX,
  ADMIN_WEBID,
  GALLERY_ROOT,
  CATALOG_URL,
  SCREENS_BASE,
} from "@/config";

// Public submission inbox of the official Solid Catalog (LDP container — open PUT).
export const CATALOG_NEW_DATA =
  "https://solidproject.solidcommunity.net/catalog/new-data/";
const EX = "http://example.org#";
const CON = "https://solidproject.solidcommunity.net/catalog/taxonomy#";

// Screen-pattern tags a screenshot can be assigned to. A single image may
// belong to multiple flows (e.g. a combined login/signup screen).
export const PATTERN_TAGS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

// Derive the pod storage root from a CSS-style WebID.
// e.g. https://host:3100/alice/profile/card#me -> https://host:3100/alice/
export function podRootFromWebId(webId: string): string {
  const u = new URL(webId);
  const seg = u.pathname.split("/").filter(Boolean)[0] || "";
  return `${u.origin}/${seg}/`;
}

export function appSlug(appId: string): string {
  return appId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function galleryRoot(webId: string) {
  return `${podRootFromWebId(webId)}solid-gallery/`;
}
function screensContainer(webId: string, appId: string) {
  return `${galleryRoot(webId)}screens/${appSlug(appId)}/`;
}

async function ensureContainer(url: string) {
  try {
    await getSolidDataset(url, { fetch: solidFetch });
  } catch {
    await createContainerAt(url, { fetch: solidFetch });
  }
}

// Grant world-read (owner keeps full control) on a container, so published /
// submitted screenshots can be fetched by the admin and shown to everyone.
// acl:default propagates to the files inside. Best-effort.
async function ensurePublicRead(containerUrl: string, ownerWebId: string) {
  const acl =
    `@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n` +
    `@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n` +
    `<#owner> a acl:Authorization; acl:agent <${ownerWebId}>;\n` +
    `  acl:accessTo <./>; acl:default <./>; acl:mode acl:Read, acl:Write, acl:Control.\n` +
    `<#public> a acl:Authorization; acl:agentClass foaf:Agent;\n` +
    `  acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.\n`;
  try {
    await solidFetch(`${containerUrl}.acl`, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: acl,
    });
  } catch {
    /* some servers manage ACLs differently — best-effort */
  }
}

// POST an ActivityStreams notification to the admin inbox. The inbox grants
// AuthenticatedAgent acl:Append, so we POST directly — never GET/create it
// first (that would 403 for non-admins and silently drop the notification).
async function postToInbox(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await solidFetch(ADMIN_INBOX, {
      method: "POST",
      headers: { "Content-Type": "application/ld+json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false; // notification is best-effort
  }
}

// Fire a Linked Data Notification to the admin inbox announcing a screenshot
// upload, so the admin can review and publish it into the shared catalog. The
// uploader's proposed flow tags travel with the notification (embedded, like
// app submissions) so the reviewer starts from what the submitter intended
// instead of guessing from scratch.
async function notifyAdminUpload(
  actor: string,
  appId: string,
  imageUrl: string,
  tags: string[] = []
) {
  await postToInbox({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Announce",
    summary: "New screenshot upload",
    actor,
    object: { id: imageUrl, tags: tags.filter((t) => PATTERN_TAGS.includes(t)) },
    target: appId,
    published: new Date().toISOString(),
  });
}

// Fire a Linked Data Notification announcing a new app submission. The
// submission's own Turtle file lives in the submitter's pod (which the admin
// can't necessarily read), so the fields are embedded directly in the
// notification — the admin review queue never needs to fetch it back.
async function notifyAdminSubmission(
  actor: string,
  sub: AppSubmission,
  submissionUrl: string,
  isUpdate = false
) {
  await postToInbox({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: isUpdate ? "Update" : "Announce",
    summary: isUpdate ? "Updated app submission" : "New app submission",
    actor,
    object: { ...sub, submissionUrl },
    published: new Date().toISOString(),
  });
}

// --- Comments on screens/flows ---
// Public comments live in the admin pod's world-readable container so everyone
// sees them; private comments live in the author's own pod. Every comment also
// fires a Linked Data Notification to the admin's inbox.
export const ADMIN_POD_ROOT = ADMIN_POD;
const ADMIN_PUBLIC_COMMENTS = `${GALLERY_ROOT}comments/`;

export type Comment = {
  id: string;
  screenId: string;
  text: string;
  author?: string; // WebID
  authorLabel: string;
  visibility: "public" | "private";
  created: string;
  // "version": a system note in the thread that the screenshot was replaced
  // (motivation "editing"), rendered as a divider rather than a bubble.
  kind?: "comment" | "version";
};

// Each comment is a W3C Web Annotation (oa:Annotation) stored as its own JSON-LD
// LDP resource inside a per-screen container — back-linked to the screen via
// oa:hasTarget. Public ones live in the admin pod (world-readable); private ones
// in the author's pod. One-resource-per-comment avoids read-modify-write races.
function commentKey(screenId: string): string {
  return screenId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function privateCommentsDir(webId: string, screenId: string) {
  return `${galleryRoot(webId)}private-comments/${commentKey(screenId)}/`;
}
function publicCommentsDir(screenId: string) {
  return `${ADMIN_PUBLIC_COMMENTS}${commentKey(screenId)}/`;
}

const ANNO_CONTEXT = [
  "http://www.w3.org/ns/anno.jsonld",
  {
    as: "https://www.w3.org/ns/activitystreams#",
    schema: "http://schema.org/",
  },
];

function toAnnotationJsonLd(c: Comment) {
  return {
    "@context": ANNO_CONTEXT,
    type: "Annotation",
    motivation: c.kind === "version" ? "editing" : "commenting",
    target: c.screenId,
    body: { type: "TextualBody", value: c.text, format: "text/plain" },
    creator: { id: c.author, name: c.authorLabel },
    created: c.created,
    audience: c.visibility === "public" ? "as:Public" : "as:Private",
  };
}

// Parse a JSON-LD annotation resource back into a Comment.
function fromAnnotation(json: any, url: string): Comment | null {
  if (!json) return null;
  const bodyVal = Array.isArray(json.body)
    ? json.body[0]?.value
    : json.body?.value ?? json.body;
  const creator = json.creator || {};
  const audience = json.audience || "";
  return {
    id: url,
    screenId: json.target || "",
    text: typeof bodyVal === "string" ? bodyVal : "",
    author: typeof creator === "string" ? creator : creator.id,
    authorLabel:
      (typeof creator === "object" && creator.name) ||
      "Someone",
    visibility: /Public/i.test(audience) ? "public" : "private",
    created: json.created || new Date(0).toISOString(),
    kind: json.motivation === "editing" ? "version" : "comment",
  };
}

async function readAnnotationsIn(dir: string, authed: boolean): Promise<Comment[]> {
  try {
    const ds = await getSolidDataset(dir, {
      fetch: authed ? solidFetch : undefined,
    });
    const urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
    const results = await Promise.all(
      urls.map(async (u) => {
        try {
          const res = await (authed ? solidFetch : fetch)(u, {
            headers: { Accept: "application/ld+json" },
          });
          if (!res.ok) return null;
          return fromAnnotation(await res.json(), u);
        } catch {
          return null;
        }
      })
    );
    return results.filter((c): c is Comment => !!c && !!c.text);
  } catch {
    return [];
  }
}

// Fire a Linked Data Notification about a new comment to the admin's inbox.
async function notifyAdmin(c: Comment, annotationUrl: string) {
  const body = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Announce",
    summary: `New ${c.visibility} comment`,
    actor: c.author || c.authorLabel,
    object: annotationUrl,
    target: c.screenId,
    published: c.created,
  };
  // POST directly: the inbox grants AuthenticatedAgent Append (not Read), so a
  // GET/ensureContainer would 403 and drop the notification.
  await postToInbox(body);
}

export async function loadComments(
  screenId: string,
  webId?: string
): Promise<Comment[]> {
  const publicC = await readAnnotationsIn(publicCommentsDir(screenId), !!webId);
  const privateC = webId
    ? await readAnnotationsIn(privateCommentsDir(webId, screenId), true)
    : [];
  const seen = new Set<string>();
  return [...publicC, ...privateC]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort((a, b) => a.created.localeCompare(b.created));
}

// All public comments a WebID wrote, across every screen — for the profile
// page's activity feed. Public comments live one container per screen under
// the admin pod, so this lists the parent and reads each child (unauth reads:
// the containers are world-readable). Fine at the gallery's scale; if it ever
// gets slow, addComment can also append to a per-user index.
export async function loadPublicCommentsBy(webId: string): Promise<Comment[]> {
  let dirs: string[] = [];
  try {
    const ds = await getSolidDataset(ADMIN_PUBLIC_COMMENTS);
    dirs = getContainedResourceUrlAll(ds).filter((u) => u.endsWith("/"));
  } catch {
    return [];
  }
  const all = await Promise.all(dirs.map((d) => readAnnotationsIn(d, false)));
  return all
    .flat()
    .filter((c) => c.author === webId && c.visibility === "public")
    .sort((a, b) => b.created.localeCompare(a.created));
}

// Post the "new version uploaded" marker into a screen's public thread so
// readers can tell which comments predate the current image. Best-effort.
export async function addVersionNote(
  webId: string,
  authorLabel: string,
  screenId: string
): Promise<void> {
  try {
    await addComment(webId, authorLabel, screenId, "uploaded a new version of this screenshot", "public", "version");
  } catch {
    /* the replacement itself succeeded; the marker is a courtesy */
  }
}

// Delete a comment resource. Who may: the author for their own private notes
// (their pod), and the admin for public comments (the admin pod). Callers gate
// the button on that; the server's ACL is the real check.
export async function deleteComment(commentUrl: string): Promise<void> {
  const res = await solidFetch(commentUrl, { method: "DELETE" });
  if (!res.ok && res.status !== 404)
    throw new Error(`Deleting comment failed: ${res.status} ${res.statusText}`);
}

export async function addComment(
  webId: string,
  authorLabel: string,
  screenId: string,
  text: string,
  visibility: "public" | "private",
  kind: "comment" | "version" = "comment"
): Promise<Comment> {
  const comment: Comment = {
    id: "",
    screenId,
    text: text.trim(),
    author: webId,
    authorLabel,
    visibility,
    created: new Date().toISOString(),
    kind,
  };
  await ensureContainer(galleryRoot(webId));
  const dir =
    visibility === "public"
      ? publicCommentsDir(screenId)
      : privateCommentsDir(webId, screenId);
  await ensureContainer(dir);
  // POST creates a new contained resource (its URL becomes the comment id).
  const res = await solidFetch(dir, {
    method: "POST",
    headers: { "Content-Type": "application/ld+json" },
    body: JSON.stringify(toAnnotationJsonLd(comment)),
  });
  if (!res.ok)
    throw new Error(`Saving comment failed: ${res.status} ${res.statusText}`);
  const loc = res.headers.get("Location") || res.url;
  comment.id = loc.startsWith("http") ? loc : new URL(loc, dir).href;
  await notifyAdmin(comment, comment.id);
  return comment;
}

// --- Bookmarks (stored as JSON in the user's pod) ---
function bookmarksUrl(webId: string) {
  return `${galleryRoot(webId)}bookmarks.json`;
}

// Load the user's bookmarked app ids from their pod (empty if none/unreadable).
export async function loadBookmarks(webId: string): Promise<string[]> {
  try {
    const res = await solidFetch(bookmarksUrl(webId), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.bookmarks) ? data.bookmarks : [];
  } catch {
    return [];
  }
}

// Persist the user's bookmarked app ids to their pod.
export async function saveBookmarks(
  webId: string,
  ids: string[]
): Promise<void> {
  await ensureContainer(galleryRoot(webId));
  const res = await solidFetch(bookmarksUrl(webId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookmarks: ids, modified: new Date().toISOString() }),
  });
  if (!res.ok)
    throw new Error(`Saving bookmarks failed: ${res.status} ${res.statusText}`);
}

// Upload a screenshot for an app to the user's pod. Returns the file URL.
// `tags` are the uploader's proposed flow pattern(s) for this screenshot
// (e.g. a single screen can belong to both "Login" and "Onboarding") — carried
// along on the review notification for the admin to confirm or change.
export async function uploadScreenshot(
  webId: string,
  appId: string,
  file: File | Blob,
  filename: string,
  tags: string[] = []
): Promise<string> {
  await ensureContainer(galleryRoot(webId));
  const container = screensContainer(webId, appId);
  await ensureContainer(container);
  // Screenshots are meant to be shared (and reviewed by the admin), so make the
  // container world-readable once.
  await ensurePublicRead(container, webId);
  // Unique, sanitized target name; overwriteFile (PUT) is idempotent and avoids
  // Slug collisions with previously uploaded files.
  const ext = (filename.match(/\.[a-z0-9]+$/i) || [".png"])[0];
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9-]+/g, "-");
  const unique = `${base}-${Date.now().toString(36)}${ext}`;
  const target = container + unique;
  const saved = await overwriteFile(target, file as Blob, {
    contentType: (file as File).type || "image/png",
    fetch: solidFetch,
  });
  const url =
    (saved as unknown as { internal_resourceInfo: { sourceIri: string } })
      .internal_resourceInfo?.sourceIri || target;
  // Announce the upload to the admin's inbox (LDN) for review/publishing.
  await notifyAdminUpload(webId, appId, url, tags);
  // Also persist the tags in the uploader's own pod (keyed by file URL) so
  // they can be edited later — the inbox notification is a one-shot snapshot.
  await setUploadTags(webId, appId, url, tags).catch(() => {});
  return url;
}

const ORDER_FILE = "order.json"; // explicit upload order, per screens container
const TAGS_FILE = "tags.json"; // { [fileUrl]: string[] } flow-tag map, per screens container

// Current flow tags for each of this app's pending (unpublished) uploads,
// keyed by file URL. Public-read (same container as the images).
export async function loadUploadTags(
  webId: string,
  appId: string
): Promise<Record<string, string[]>> {
  const container = screensContainer(webId, appId);
  try {
    const res = await solidFetch(container + TAGS_FILE);
    if (!res.ok) return {};
    const j = await res.json();
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

// Set/replace the flow tags for a single pending upload (read-modify-write on
// the shared per-app tags.json). Owner or admin only, gated by the caller.
export async function setUploadTags(
  webId: string,
  appId: string,
  url: string,
  tags: string[]
): Promise<void> {
  const container = screensContainer(webId, appId);
  const map = await loadUploadTags(webId, appId);
  map[url] = tags.filter((t) => PATTERN_TAGS.includes(t));
  const res = await solidFetch(container + TAGS_FILE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(map),
  });
  if (!res.ok)
    throw new Error(`Saving tags failed: ${res.status} ${res.statusText}`);
}

// List screenshot URLs uploaded for an app, honoring a saved drag order.
export async function listScreenshots(
  webId: string,
  appId: string
): Promise<string[]> {
  const container = screensContainer(webId, appId);
  try {
    const ds = await getSolidDataset(container, { fetch: solidFetch });
    const files = getContainedResourceUrlAll(ds).filter(
      (u) => !u.endsWith("/") && !u.endsWith(ORDER_FILE) && !u.endsWith(TAGS_FILE)
    );
    // Sort by the saved order (filenames); anything not listed falls to the end.
    // Guard against a 404 whose JSON body is an error object, not an array.
    let order: string[] = [];
    try {
      const r = await solidFetch(container + ORDER_FILE);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) order = j;
      }
    } catch {
      /* no saved order */
    }
    const rank = (u: string) => {
      const i = order.indexOf(u.split("/").pop() || "");
      return i === -1 ? order.length : i;
    };
    return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  } catch {
    return [];
  }
}

// Persist the upload display order (array of full file URLs) for an app.
export async function reorderUploads(
  webId: string,
  appId: string,
  orderedUrls: string[]
): Promise<void> {
  const container = screensContainer(webId, appId);
  const names = orderedUrls.map((u) => u.split("/").pop());
  const res = await solidFetch(container + ORDER_FILE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(names),
  });
  if (!res.ok) throw new Error(`Reorder failed (${res.status})`);
}

export async function fetchImageObjectUrl(url: string, fresh = false): Promise<string> {
  // `fresh` bypasses the HTTP cache — used right after a file was replaced in place.
  const f = fresh
    ? (input: RequestInfo | URL, init?: RequestInit) =>
        solidFetch(input, { ...init, cache: "reload" })
    : solidFetch;
  const blob = await getFile(url, { fetch: f });
  return URL.createObjectURL(blob as Blob);
}

// Upload a new version of one of the user's own screenshots: overwrite the
// file at the same URL, so its position (order.json), flow tags (tags.json)
// and any comment thread keyed on the app+index all stay put.
export async function replaceUpload(url: string, file: File | Blob): Promise<void> {
  await overwriteFile(url, file, {
    contentType: file.type || "image/png",
    fetch: solidFetch,
  });
}

// Admin: upload a new version of a published screenshot. The image is stored
// under a new filename (so no cache anywhere serves the old pixels), the
// ImageObject node keeps its id/position/keywords and just points at the new
// file with fresh format + dimensions, and the old file is deleted if it lives
// in the admin pod. Returns the new contentUrl.
export async function replaceCatalogScreenshot(
  appId: string,
  contentUrl: string,
  file: File | Blob
): Promise<string> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const nodes = store
    .getObjects(appId, EX + "screenshot", null)
    .map((o) => o.value)
    .filter((n) => store.getObjects(n, SCHEMA + "contentUrl", null).some((o) => o.value === contentUrl));
  if (!nodes.length) throw new Error("Screenshot not found in catalog");

  const ct = file.type || "image/png";
  const ext = (ct.split("/")[1] || "png").replace("+xml", "");
  const n = Number((nodes[0].match(/#screenshot-(\d+)$/) || [])[1] || 0);
  const dest = `${SCREENS_BASE}${appSlug(appId)}-${n || "x"}-${Date.now().toString(36)}.${ext}`;
  await overwriteFile(dest, file, { contentType: ct, fetch: solidFetch });
  const dims = await imageDimensions(file as Blob);

  const { namedNode, literal } = DataFactory;
  const int = (v: number) =>
    literal(String(v), namedNode("http://www.w3.org/2001/XMLSchema#integer"));
  for (const node of nodes) {
    for (const p of ["contentUrl", "encodingFormat", "width", "height"])
      store.removeQuads(store.getQuads(node, SCHEMA + p, null, null));
    store.addQuad(namedNode(node), namedNode(SCHEMA + "contentUrl"), namedNode(dest));
    store.addQuad(namedNode(node), namedNode(SCHEMA + "encodingFormat"), literal(ct));
    if (dims) {
      store.addQuad(namedNode(node), namedNode(SCHEMA + "width"), int(dims.width));
      store.addQuad(namedNode(node), namedNode(SCHEMA + "height"), int(dims.height));
    }
  }
  await writeCatalogStore(store);
  if (contentUrl.startsWith(SCREENS_BASE) && contentUrl !== dest)
    await deleteUpload(contentUrl).catch(() => {});
  return dest;
}

// Admin = anyone the server reports has write access to the catalog. This makes
// granting publish rights a pure ACL/group change — no hardcoded list, no code.
// The catalog's WAC grants write to the admins group (acl:agentGroup), so adding
// a member to that group is all it takes. Falls back to the bootstrap owner.
export async function isAdmin(webId?: string | null): Promise<boolean> {
  if (!webId) return false;
  if (webId === ADMIN_WEBID) return true;
  try {
    const res = await solidFetch(CATALOG_URL, { method: "HEAD" });
    const user = /user="([^"]*)"/.exec(res.headers.get("wac-allow") || "")?.[1] || "";
    return /\bwrite\b/.test(user);
  } catch {
    return false;
  }
}

const FOAF = "http://xmlns.com/foaf/0.1/";

// Display name + avatar from the user's own WebID profile document (may be
// Turtle or JSON-LD — solid-client content-negotiates and parses either).
export async function getProfile(
  webId: string
): Promise<{ name?: string; avatar?: string }> {
  try {
    const dataset = await getSolidDataset(webId, { fetch: solidFetch });
    const me = getThing(dataset, webId);
    if (!me) return {};
    // vcard:fn is the properly formatted display name (e.g. "Michael Peters");
    // foaf:name is often just a lowercase handle, so it's only the fallback.
    const name =
      getStringNoLocale(me, `${VCARD}fn`) ||
      getStringNoLocale(me, `${FOAF}name`) ||
      undefined;
    const avatar = getUrl(me, `${FOAF}img`) || getUrl(me, `${VCARD}hasPhoto`) || undefined;
    return { name, avatar };
  } catch {
    return {};
  }
}

// --- Admin group management (the acl:agentGroup the catalog grants write to) ---
const VCARD = "http://www.w3.org/2006/vcard/ns#";
export const ADMINS_DOC = `${GALLERY_ROOT}admins.ttl`;
const ADMINS_GROUP = `${ADMINS_DOC}#group`;

// Current admin WebIDs (members of the vcard:Group).
// --- Moderator requests: a signed-in user asks to join the admins group ---
// ActivityStreams "Join" (actor → the admins group) in the admin inbox; the
// admin approves from the review queue (addAdmin) or dismisses.
export async function requestModerator(actor: string, message: string): Promise<boolean> {
  return postToInbox({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Join",
    summary: "Moderator request",
    actor,
    object: ADMINS_GROUP,
    content: message,
    published: new Date().toISOString(),
  });
}
export type ModeratorRequest = { id: string; actor: string; message: string; published: string };
export async function loadModeratorInbox(): Promise<ModeratorRequest[]> {
  let urls: string[] = [];
  try {
    const ds = await getSolidDataset(ADMIN_INBOX, { fetch: solidFetch });
    urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
  } catch {
    return [];
  }
  const out = await Promise.all(
    urls.map(async (u) => {
      try {
        const n = await (await solidFetch(u)).json();
        if (n?.type !== "Join" || !/moderator/i.test(n?.summary || "") || !n.actor) return null;
        return { id: u, actor: n.actor, message: n.content || "", published: n.published || "" } as ModeratorRequest;
      } catch {
        return null;
      }
    })
  );
  return (out.filter(Boolean) as ModeratorRequest[]).sort((a, b) => b.published.localeCompare(a.published));
}

export async function loadAdmins(): Promise<string[]> {
  try {
    const ttl = await (await solidFetch(ADMINS_DOC)).text();
    // baseIRI so the relative <#group> subject resolves to ADMINS_GROUP.
    const store = new Store(new Parser({ baseIRI: ADMINS_DOC }).parse(ttl));
    return store.getObjects(ADMINS_GROUP, VCARD + "hasMember", null).map((o) => o.value);
  } catch {
    return [];
  }
}

// Add / remove a moderator by editing the group document (vcard:hasMember).
// Only the catalog owner may do this: the UI gates it on isOwner, and the
// group doc carries its own ACL — owner Write/Control, everyone Read (the
// server needs to read it to evaluate acl:agentGroup, and members' pods do
// too) — so a moderator's catalog-write grant does not extend to the group.
async function ensureAdminsAcl(): Promise<void> {
  const acl =
    `@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n` +
    `@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n` +
    `<#owner> a acl:Authorization; acl:agent <${ADMIN_WEBID}>;\n` +
    `  acl:accessTo <./admins.ttl>; acl:mode acl:Read, acl:Write, acl:Control.\n` +
    `<#public> a acl:Authorization; acl:agentClass foaf:Agent;\n` +
    `  acl:accessTo <./admins.ttl>; acl:mode acl:Read.\n`;
  try {
    await solidFetch(`${ADMINS_DOC}.acl`, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: acl,
    });
  } catch {
    /* best-effort; the UI gate still applies */
  }
}
async function writeAdmins(members: string[]): Promise<void> {
  const ttl =
    `@prefix vcard: <${VCARD}>.\n<#group> a vcard:Group` +
    (members.length
      ? `;\n  vcard:hasMember ${members.map((m) => `<${m}>`).join(", ")}.\n`
      : `.\n`);
  const res = await solidFetch(ADMINS_DOC, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: ttl,
  });
  if (!res.ok) throw new Error(`Admins update failed (${res.status})`);
  await ensureAdminsAcl();
}

export async function addAdmin(webId: string): Promise<void> {
  const members = new Set(await loadAdmins());
  members.add(webId.trim());
  await writeAdmins([...members]);
}

export async function removeAdmin(webId: string): Promise<void> {
  const members = (await loadAdmins()).filter((m) => m !== webId);
  await writeAdmins(members);
}

// Promote uploaded screenshots into the canonical catalog so the app surfaces on
// the homepage. For each source image we (1) copy the bytes into the admin pod's
// flat screens/ dir (where catalog contentUrls live) and (2) append schema.org
// ImageObject triples to catalog.ttl, tagged with one or more screen patterns
// (a single screenshot can belong to several flows). Admin only.
// Natural pixel size of an image blob (browser only). The loader decides a
// screenshot's form factor from schema:width/height — landscape = desktop — so
// every published image needs them or it silently renders as mobile.
async function imageDimensions(
  blob: Blob
): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(blob);
      const d = { width: bmp.width, height: bmp.height };
      bmp.close();
      return d;
    }
  } catch {
    /* fall through to <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Provenance kept on published records (who contributed what, when) — the
// LDN notices are deleted once reviewed, so this is the only durable trace:
//   app record:  dcterms:contributor <submitter WebID> ; dcterms:dateSubmitted
//   screenshot:  schema:creator <uploader WebID> ; schema:dateCreated
const DCTERMS = "http://purl.org/dc/terms/";

export async function publishScreenshotsToCatalog(
  appId: string,
  sources: { url: string; tags?: string[]; by?: string; at?: string }[]
): Promise<number> {
  if (!sources.length) return 0;

  // Current catalog — used to number new screenshots after any existing ones.
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  let n = store.getObjects(appId, EX + "screenshot", null).length;

  const lines: string[] = [];
  for (const { url, tags, by, at } of sources) {
    const blob = (await getFile(url, { fetch: solidFetch })) as Blob;
    const ct = blob.type || "image/png";
    const ext = (ct.split("/")[1] || "png").replace("+xml", "");
    n += 1;
    const filename = `${appSlug(appId)}-${n}-${Date.now().toString(36)}.${ext}`;
    const dest = `${SCREENS_BASE}${filename}`;
    await overwriteFile(dest, blob, { contentType: ct, fetch: solidFetch });

    const node = `<${appId}#screenshot-${n}>`;
    const valid = [...new Set((tags || []).filter((t) => PATTERN_TAGS.includes(t)))];
    const patterns = valid.length ? valid : ["Dashboard"];
    const keywords = patterns.map((p) => `con:${p}Screen`).join(", ");
    const dims = await imageDimensions(blob);
    lines.push(`<${appId}> ex:screenshot ${node} .`);
    lines.push(
      `${node} a schema:ImageObject ;\n` +
        `  schema:contentUrl <${dest}> ;\n` +
        `  schema:encodingFormat "${ct}" ;\n` +
        (dims ? `  schema:width ${dims.width} ;\n  schema:height ${dims.height} ;\n` : "") +
        (by ? `  schema:creator <${by}> ;\n` : "") +
        `  schema:dateCreated "${at || new Date().toISOString()}"^^xsd:dateTime ;\n` +
        `  schema:keywords ${keywords} .`
    );
  }

  // Append new triples. Turtle merges by triple, and ex:/schema:/con: are already
  // declared at the top of catalog.ttl and remain in scope for the whole document.
  const next = `${ttl}\n# --- published screenshots ---\n${lines.join("\n")}\n`;
  const res = await solidFetch(CATALOG_URL, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: next,
  });
  if (!res.ok) throw new Error(`Catalog update failed (${res.status})`);
  return sources.length;
}

// Delete a screenshot from the pod (the uploader's own file). Callers gate this
// to the uploader (their own pod) or the admin.
export async function deleteUpload(url: string): Promise<void> {
  const res = await solidFetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404)
    throw new Error(`Delete failed (${res.status})`);
}

const SCHEMA = "http://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

// Serialize an n3 Store back to catalog.ttl and PUT it (admin write).
async function writeCatalogStore(store: Store): Promise<void> {
  const body = await new Promise<string>((resolve, reject) => {
    const w = new Writer({
      prefixes: {
        ex: EX,
        schema: SCHEMA,
        con: CON,
        skos: "http://www.w3.org/2004/02/skos/core#",
        dcterms: "http://purl.org/dc/terms/",
        xsd: "http://www.w3.org/2001/XMLSchema#",
      },
    });
    w.addQuads(store.getQuads(null, null, null, null));
    w.end((err, result) => (err ? reject(err) : resolve(result)));
  });
  const res = await solidFetch(CATALOG_URL, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body,
  });
  if (!res.ok) throw new Error(`Catalog update failed (${res.status})`);
}

// Reorder an app's published screenshots: the loader orders frames by the
// #screenshot-N suffix, so we renumber the nodes 1..N in the requested order
// (matching by contentUrl), preserving each image's format + keyword tags. Admin.
export async function reorderCatalogScreenshots(
  appId: string,
  orderedContentUrls: string[]
): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const nodes = store.getObjects(appId, EX + "screenshot", null).map((o) => o.value);
  if (nodes.length < 2) return;

  // Carry over everything on the node except its type/contentUrl (re-added
  // below) — encodingFormat, keywords, and width/height (form factor).
  const byUrl = new Map<string, { extra: { p: string; o: import("n3").Quad_Object }[] }>();
  for (const n of nodes) {
    const cu = store.getObjects(n, SCHEMA + "contentUrl", null)[0]?.value;
    if (cu)
      byUrl.set(cu, {
        extra: store
          .getQuads(n, null, null, null)
          .filter(
            (q) => q.predicate.value !== RDF_TYPE && q.predicate.value !== SCHEMA + "contentUrl"
          )
          .map((q) => ({ p: q.predicate.value, o: q.object })),
      });
    store.removeQuads(store.getQuads(appId, EX + "screenshot", n, null));
    store.removeQuads(store.getQuads(n, null, null, null));
  }
  // Requested order first; any unlisted contentUrls keep their place at the end.
  const ordered = [
    ...orderedContentUrls.filter((u) => byUrl.has(u)),
    ...[...byUrl.keys()].filter((u) => !orderedContentUrls.includes(u)),
  ];
  const { namedNode } = DataFactory;
  ordered.forEach((cu, idx) => {
    const node = namedNode(`${appId}#screenshot-${idx + 1}`);
    const meta = byUrl.get(cu)!;
    store.addQuad(namedNode(appId), namedNode(EX + "screenshot"), node);
    store.addQuad(node, namedNode(RDF_TYPE), namedNode(SCHEMA + "ImageObject"));
    store.addQuad(node, namedNode(SCHEMA + "contentUrl"), namedNode(cu));
    for (const { p, o } of meta.extra) store.addQuad(node, namedNode(p), o);
  });
  await writeCatalogStore(store);
}

// Remove a published screenshot from the catalog (admin un-publish): drop the
// app's ex:screenshot link + the ImageObject triples whose contentUrl matches,
// rewrite catalog.ttl, and delete the file if it lives in the admin pod.
// Returns true if something was removed.
export async function removeScreenshotFromCatalog(
  appId: string,
  contentUrl: string
): Promise<boolean> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const nodes = store
    .getObjects(appId, EX + "screenshot", null)
    .map((o) => o.value)
    .filter((n) =>
      store
        .getObjects(n, SCHEMA + "contentUrl", null)
        .some((o) => o.value === contentUrl)
    );
  if (!nodes.length) return false;
  for (const n of nodes) {
    store.removeQuads(store.getQuads(appId, EX + "screenshot", n, null));
    store.removeQuads(store.getQuads(n, null, null, null));
  }
  await writeCatalogStore(store);
  // Clean up the admin-pod copy of the image (best-effort).
  if (contentUrl.startsWith(SCREENS_BASE))
    await solidFetch(contentUrl, { method: "DELETE" }).catch(() => {});
  return true;
}

// Re-tag an already-published screenshot's flow pattern(s) — replaces its
// schema:keywords triples entirely. Direct catalog write, no review queue
// (mirrors publish/remove/reorder: admin edits apply immediately). Returns
// true if a matching screenshot was found and updated.
export async function retagCatalogScreenshot(
  appId: string,
  contentUrl: string,
  tags: string[]
): Promise<boolean> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const nodes = store
    .getObjects(appId, EX + "screenshot", null)
    .map((o) => o.value)
    .filter((n) =>
      store
        .getObjects(n, SCHEMA + "contentUrl", null)
        .some((o) => o.value === contentUrl)
    );
  if (!nodes.length) return false;
  const valid = [...new Set(tags.filter((t) => PATTERN_TAGS.includes(t)))];
  const patterns = valid.length ? valid : ["Dashboard"];
  const { namedNode } = DataFactory;
  for (const n of nodes) {
    store.removeQuads(store.getQuads(n, SCHEMA + "keywords", null, null));
    for (const p of patterns)
      store.addQuad(namedNode(n), namedNode(SCHEMA + "keywords"), namedNode(`${CON}${p}Screen`));
  }
  await writeCatalogStore(store);
  return true;
}

// --- Admin review queue: upload notifications from the LDN inbox ---
export type UploadNotice = {
  id: string; // the notification resource URL (delete to dismiss)
  actor: string; // uploader WebID
  appId: string;
  imageUrl: string; // image in the uploader's pod
  tags: string[]; // uploader's proposed flow pattern(s), may be empty
  published: string;
};

// Read the admin inbox and return pending screenshot-upload announcements
// (newest first). Admin-only — relies on owner read access to the inbox.
export async function loadUploadInbox(): Promise<UploadNotice[]> {
  let urls: string[] = [];
  try {
    const ds = await getSolidDataset(ADMIN_INBOX, { fetch: solidFetch });
    urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
  } catch {
    return [];
  }
  const notices = await Promise.all(
    urls.map(async (u) => {
      try {
        const n = await (await solidFetch(u)).json();
        if (n?.type !== "Announce" || !/screenshot/i.test(n?.summary || ""))
          return null;
        const obj = n.object || {};
        const rawTags: string[] = Array.isArray(obj?.tags) ? obj.tags : [];
        return {
          id: u,
          actor: n.actor || "",
          appId: n.target || "",
          imageUrl: typeof n.object === "string" ? n.object : obj.id || "",
          tags: rawTags.filter((t) => PATTERN_TAGS.includes(t)),
          published: n.published || "",
        } as UploadNotice;
      } catch {
        return null;
      }
    })
  );
  return notices
    .filter((n): n is UploadNotice => !!n && !!n.imageUrl && !!n.appId)
    .sort((a, b) => b.published.localeCompare(a.published));
}

// Remove a processed notification from the inbox.
export async function dismissNotice(noticeUrl: string): Promise<void> {
  await solidFetch(noticeUrl, { method: "DELETE" });
}

export type AppSubmission = {
  // Stable identity, minted when the submission is first created and reused
  // as the catalog record's IRI when the admin publishes it. Screenshots
  // uploaded for the submission are keyed by it too, so they attach to the
  // right record regardless of the order the admin reviews things in.
  id?: string;
  name: string;
  description?: string;
  landingPage?: string;
  repository?: string;
  subType: string; // e.g. ProductivityApp
  status?: string; // e.g. Production / Development
  technicalKeyword?: string;
  // WebID of the app's author/maintainer (optional; becomes ex:author).
  authorWebId?: string;
};

function ttlEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// Build a Turtle record and PUT it into the submission inbox.
// We write to the authenticated user's OWN pod (<root>solid-gallery/submissions/)
// because a pod's DPoP token only authorizes writes to that same pod — the
// public catalog inbox lives on a different origin and would reject our token.
// Submissions written before ids were minted used the bare `cdata:<Name>`
// subject — not unique, and not what any published record is called.
export function isLegacySubmissionId(id: string | undefined, name: string): boolean {
  return (
    !id ||
    id === `https://solidproject.solidcommunity.net/catalog/data#${name.replace(/\s+/g, "_")}`
  );
}

export function newSubmissionId(name: string): string {
  return `https://solidproject.solidcommunity.net/catalog/data#${name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")}_${Date.now().toString(36)}`;
}

function submissionTurtle(sub: AppSubmission): string {
  const subj = sub.id ? `<${sub.id}>` : `cdata:${sub.name.replace(/\s+/g, "_")}`;
  let ttl =
    `@prefix cdata: <https://solidproject.solidcommunity.net/catalog/data#> .\n` +
    `@prefix ex: <${EX}> .\n` +
    `@prefix con: <${CON}> .\n` +
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n` +
    `${subj} a ex:Software ;\n` +
    `  ex:name "${ttlEscape(sub.name)}" ;\n` +
    `  ex:subType con:${sub.subType} ;\n`;
  if (sub.description)
    ttl += `  ex:description "${ttlEscape(sub.description)}" ;\n`;
  if (sub.landingPage) ttl += `  ex:landingPage <${sub.landingPage}> ;\n`;
  if (sub.repository) ttl += `  ex:repository <${sub.repository}> ;\n`;
  if (sub.status) ttl += `  ex:status con:${sub.status} ;\n`;
  if (sub.technicalKeyword)
    ttl += `  ex:technicalKeyword "${ttlEscape(sub.technicalKeyword)}" ;\n`;
  if (sub.authorWebId) ttl += `  ex:author <${sub.authorWebId}> ;\n`;
  ttl += `  ex:modified "${new Date().toISOString()}"^^xsd:dateTime .\n`;
  return ttl;
}

export async function submitApp(
  sub: AppSubmission,
  webId: string
): Promise<string> {
  if (!sub.id) sub = { ...sub, id: newSubmissionId(sub.name) };
  const ttl = submissionTurtle(sub);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${date}-${sub.name.replace(/\s+/g, "_")}.ttl`;
  const submissions = `${galleryRoot(webId)}submissions/`;
  await ensureContainer(galleryRoot(webId));
  await ensureContainer(submissions);
  const url = submissions + encodeURIComponent(fileName);
  const res = await solidFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: ttl,
  });
  if (!res.ok)
    throw new Error(`Submission failed: ${res.status} ${res.statusText}`);
  await notifyAdminSubmission(webId, sub, url);
  return url;
}

// Overwrite an earlier submission in place (same .ttl) and tell the admin the
// details changed. The review queue embeds a snapshot of the fields, so an
// edit has to send a fresh notification to be seen — it shows up as a second,
// newer entry that supersedes the original.
export async function updateMySubmission(
  url: string,
  sub: AppSubmission,
  webId: string
): Promise<void> {
  const res = await solidFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: submissionTurtle(sub),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${res.statusText}`);
  await notifyAdminSubmission(webId, sub, url, true);
}

// --- The signed-in user's own submissions (their pod, not the review queue) ---
export type MySubmission = {
  url: string; // the .ttl in the user's pod
  sub: AppSubmission;
  created?: string; // ex:modified, when present
};

// Read back everything submitApp() has written to this pod. The review queue
// lives in the admin's inbox and is not readable by a normal user, so this is
// the submitter's own record of what they sent.
export async function listMySubmissions(webId: string): Promise<MySubmission[]> {
  const container = `${galleryRoot(webId)}submissions/`;
  let urls: string[] = [];
  try {
    const ds = await getSolidDataset(container, { fetch: solidFetch });
    urls = getContainedResourceUrlAll(ds).filter((u) => u.endsWith(".ttl"));
  } catch {
    return []; // nothing submitted yet (container absent) or unreadable
  }

  const out = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await solidFetch(url);
        if (!res.ok) return null;
        const store = new Store(new Parser({ baseIRI: url }).parse(await res.text()));
        const lit = (pred: string) =>
          store.getObjects(null, `${EX}${pred}`, null)[0]?.value || "";
        const name = lit("name");
        if (!name) return null;
        const subject = store.getSubjects(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          `${EX}Software`,
          null
        )[0]?.value;
        const sub: AppSubmission = {
          id: subject || undefined,
          name,
          description: lit("description"),
          landingPage: lit("landingPage"),
          repository: lit("repository"),
          // Stored as taxonomy IRIs — keep just the fragment (e.g. "PodApp").
          subType: lit("subType").split("#").pop() || "",
          status: lit("status").split("#").pop() || "",
          technicalKeyword: lit("technicalKeyword"),
          authorWebId: lit("author") || undefined,
        };
        return { url, sub, created: lit("modified") || undefined };
      } catch {
        return null;
      }
    })
  );

  return (out.filter(Boolean) as MySubmission[]).sort((a, b) =>
    (b.created || "").localeCompare(a.created || "")
  );
}

// --- Deletion requests: any signed-in user can flag an app for removal ---
// The request is an ActivityStreams Flag in the admin inbox; the admin then
// soft-deletes the record (ex:deleted) so it drops out of every listing but
// keeps its history, screenshots and direct links.
export async function requestAppDeletion(
  actor: string,
  appId: string,
  reason: string
): Promise<boolean> {
  return postToInbox({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Flag",
    summary: "Deletion request",
    actor,
    object: appId,
    content: reason,
    published: new Date().toISOString(),
  });
}

export type DeletionNotice = {
  id: string; // the notification resource URL (delete to dismiss)
  actor: string;
  appId: string;
  reason: string;
  published: string;
};

export async function loadDeletionInbox(): Promise<DeletionNotice[]> {
  let urls: string[] = [];
  try {
    const ds = await getSolidDataset(ADMIN_INBOX, { fetch: solidFetch });
    urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
  } catch {
    return [];
  }
  const notices = await Promise.all(
    urls.map(async (u) => {
      try {
        const n = await (await solidFetch(u)).json();
        if (n?.type !== "Flag" || !/deletion/i.test(n?.summary || "")) return null;
        const appId = typeof n.object === "string" ? n.object : n.object?.id;
        if (!appId) return null;
        return {
          id: u,
          actor: n.actor || "",
          appId,
          reason: n.content || "",
          published: n.published || "",
        } as DeletionNotice;
      } catch {
        return null;
      }
    })
  );
  return (notices.filter(Boolean) as DeletionNotice[]).sort((a, b) =>
    b.published.localeCompare(a.published)
  );
}

// Soft-delete: the loader hides anything with ex:deleted from all listings.
// The record itself (and its screenshots) stays, so getApp() still resolves
// direct links and the admin can restore it.
export async function markAppDeleted(appId: string, reason: string): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const { namedNode, literal } = DataFactory;
  const S = namedNode(appId);
  store.removeQuads(store.getQuads(appId, EX + "deleted", null, null));
  store.removeQuads(store.getQuads(appId, EX + "deletedReason", null, null));
  store.addQuad(
    S,
    namedNode(EX + "deleted"),
    literal(new Date().toISOString(), namedNode("http://www.w3.org/2001/XMLSchema#dateTime"))
  );
  if (reason) store.addQuad(S, namedNode(EX + "deletedReason"), literal(reason));
  await writeCatalogStore(store);
}

// Admin: exclude a record from the gallery because it isn't an app with a UI
// (library, testing tool, spec, server…). Distinct from soft-delete so the
// reason is explicit and it can be listed again. Hidden from all listings;
// the detail page stays reachable and says why.
export async function setAppExcluded(appId: string, reason: string | null): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const { namedNode, literal } = DataFactory;
  store.removeQuads(store.getQuads(appId, EX + "excluded", null, null));
  if (reason) store.addQuad(namedNode(appId), namedNode(EX + "excluded"), literal(reason));
  await writeCatalogStore(store);
}

export async function restoreApp(appId: string): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  store.removeQuads(store.getQuads(appId, EX + "deleted", null, null));
  store.removeQuads(store.getQuads(appId, EX + "deletedReason", null, null));
  await writeCatalogStore(store);
}

// --- Admin review queue: new app submissions from the LDN inbox ---
export type SubmissionNotice = {
  id: string; // the notification resource URL (delete to dismiss)
  actor: string; // submitter WebID
  published: string;
  sub: AppSubmission;
  isUpdate: boolean; // an edit of an earlier submission (same sub.id)
  submissionUrl?: string; // the .ttl in the submitter's pod
};

// Read the admin inbox and return pending app-submission announcements
// (newest first). The submission fields are embedded in the notification
// itself, so this never needs to read the submitter's own pod.
export async function loadSubmissionInbox(): Promise<SubmissionNotice[]> {
  let urls: string[] = [];
  try {
    const ds = await getSolidDataset(ADMIN_INBOX, { fetch: solidFetch });
    urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
  } catch {
    return [];
  }
  const notices = await Promise.all(
    urls.map(async (u) => {
      try {
        const n = await (await solidFetch(u)).json();
        const isUpdate = n?.type === "Update";
        if (
          (n?.type !== "Announce" && !isUpdate) ||
          !/app submission/i.test(n?.summary || "")
        )
          return null;
        const obj = n.object || {};
        if (!obj.name || !obj.subType) return null;
        return {
          id: u,
          actor: n.actor || "",
          published: n.published || "",
          isUpdate,
          submissionUrl: obj.submissionUrl,
          sub: {
            id: obj.id,
            name: obj.name,
            description: obj.description,
            landingPage: obj.landingPage,
            repository: obj.repository,
            subType: obj.subType,
            status: obj.status,
            technicalKeyword: obj.technicalKeyword,
            authorWebId: obj.authorWebId,
          },
        } as SubmissionNotice;
      } catch {
        return null;
      }
    })
  );
  return notices
    .filter((n): n is SubmissionNotice => !!n)
    .sort((a, b) => b.published.localeCompare(a.published));
}

// Write a submitted app into the shared catalog as a new ex:Software record.
// Mirrors publishScreenshotsToCatalog's append-only Turtle pattern.
const DCTERMS_SOURCE = "http://purl.org/dc/terms/source";

// The catalog names agents with `<webid> a ex:Person ; ex:name "…"`. When an
// author is added by WebID, look the name up in their profile (best-effort) so
// the chip doesn't fall back to the hostname. Store variant + Turtle variant.
async function agentName(webId: string): Promise<string | undefined> {
  try {
    return (await getProfileInfo(webId)).name || undefined;
  } catch {
    return undefined;
  }
}
async function ensureAgentRecord(store: Store, webId: string): Promise<void> {
  if (store.getQuads(webId, RDF_TYPE, null, null).length) return;
  const { namedNode, literal } = DataFactory;
  store.addQuad(namedNode(webId), namedNode(RDF_TYPE), namedNode(EX + "Person"));
  const name = await agentName(webId);
  if (name) store.addQuad(namedNode(webId), namedNode(EX + "name"), literal(name));
}
async function agentRecordTurtle(webId: string, existingTtl: string): Promise<string> {
  if (existingTtl.includes(`<${webId}> a ex:Person`) || existingTtl.includes(`<${webId}> a ex:Organization`))
    return "";
  const name = await agentName(webId);
  return `<${webId}> a ex:Person${name ? ` ;\n  ex:name "${ttlEscape(name)}"` : ""} .\n`;
}

// Admin: attach an author/maintainer (by WebID) to an existing catalog record.
export async function addAppAuthor(
  appId: string,
  webId: string,
  role: "author" | "maintainer" = "author"
): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const { namedNode } = DataFactory;
  if (!store.getQuads(appId, null, null, null).length) throw new Error("App not found in catalog");
  store.addQuad(namedNode(appId), namedNode(EX + role), namedNode(webId));
  await ensureAgentRecord(store, webId);
  await writeCatalogStore(store);
}
// Admin: set/replace the landing page and repository of a catalog record
// (records submitted without them can't resolve an icon or "Open" link).
export async function setAppLinks(
  appId: string,
  links: { landingPage?: string; repository?: string }
): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const { namedNode } = DataFactory;
  if (!store.getQuads(appId, null, null, null).length) throw new Error("App not found in catalog");
  for (const [pred, val] of [
    ["landingPage", links.landingPage],
    ["repository", links.repository],
  ] as const) {
    if (val === undefined) continue;
    store.removeQuads(store.getQuads(appId, EX + pred, null, null));
    if (val) store.addQuad(namedNode(appId), namedNode(EX + pred), namedNode(val));
  }
  await writeCatalogStore(store);
}

export async function removeAppAuthor(appId: string, agentId: string): Promise<void> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));
  const { namedNode } = DataFactory;
  for (const role of ["author", "maintainer"])
    store.removeQuads(store.getQuads(appId, EX + role, namedNode(agentId), null));
  await writeCatalogStore(store);
}

export async function publishSubmissionToCatalog(
  sub: AppSubmission,
  submissionUrl?: string,
  provenance?: { by?: string; at?: string }
): Promise<string> {
  const ttl = await (await solidFetch(CATALOG_URL)).text();
  const store = new Store(new Parser().parse(ttl));

  // Reuse the submission's own id so screenshots uploaded against it (and any
  // later edits) land on this same record. Notices without a usable id fall
  // back to the record already published from the same submission URL, so a
  // re-review of an old submission updates rather than duplicates. Only a
  // never-seen submission mints a fresh id.
  const bySource = submissionUrl
    ? store.getSubjects(DCTERMS_SOURCE, submissionUrl, null)[0]?.value
    : undefined;
  const id =
    (!isLegacySubmissionId(sub.id, sub.name) && sub.id) ||
    bySource ||
    newSubmissionId(sub.name);

  const exists = store.getQuads(id, null, null, null).length > 0;

  if (exists) {
    // Republish (the submitter edited it): swap the descriptive triples but keep
    // everything hanging off the record that isn't part of the form — published
    // screenshots/videos and their ordering.
    const keep = new Set([EX + "screenshot", SCHEMA + "video"]);
    for (const q of store.getQuads(id, null, null, null))
      if (!keep.has(q.predicate.value)) store.removeQuad(q);
    const { namedNode, literal } = DataFactory;
    const S = namedNode(id);
    const add = (p: string, o: ReturnType<typeof namedNode> | ReturnType<typeof literal>) =>
      store.addQuad(S, namedNode(p), o);
    add(RDF_TYPE, namedNode(EX + "Software"));
    add(EX + "name", literal(sub.name));
    add(EX + "subType", namedNode(CON + sub.subType));
    if (sub.description) add(EX + "description", literal(sub.description));
    if (sub.landingPage) add(EX + "landingPage", namedNode(sub.landingPage));
    if (sub.repository) add(EX + "repository", namedNode(sub.repository));
    if (sub.status) add(EX + "status", namedNode(CON + sub.status));
    if (sub.technicalKeyword) add(EX + "technicalKeyword", literal(sub.technicalKeyword));
    if (sub.authorWebId) {
      add(EX + "author", namedNode(sub.authorWebId));
      await ensureAgentRecord(store, sub.authorWebId);
    }
    if (submissionUrl) add(DCTERMS_SOURCE, namedNode(submissionUrl));
    // Contributor/dateSubmitted describe the *first* submission; keep the
    // existing ones on a republish and only add when absent.
    if (provenance?.by && !store.getObjects(id, DCTERMS + "contributor", null).length)
      add(DCTERMS + "contributor", namedNode(provenance.by));
    if (!store.getObjects(id, DCTERMS + "dateSubmitted", null).length)
      add(
        DCTERMS + "dateSubmitted",
        literal(provenance?.at || new Date().toISOString(), namedNode("http://www.w3.org/2001/XMLSchema#dateTime"))
      );
    await writeCatalogStore(store);
    return id;
  }

  let lines = `<${id}> a ex:Software ;\n  ex:name "${ttlEscape(sub.name)}" ;\n  ex:subType con:${sub.subType} ;\n`;
  if (sub.description) lines += `  ex:description "${ttlEscape(sub.description)}" ;\n`;
  if (sub.landingPage) lines += `  ex:landingPage <${sub.landingPage}> ;\n`;
  if (sub.repository) lines += `  ex:repository <${sub.repository}> ;\n`;
  if (sub.status) lines += `  ex:status con:${sub.status} ;\n`;
  if (sub.technicalKeyword)
    lines += `  ex:technicalKeyword "${ttlEscape(sub.technicalKeyword)}" ;\n`;
  if (sub.authorWebId) lines += `  ex:author <${sub.authorWebId}> ;\n`;
  if (submissionUrl) lines += `  dcterms:source <${submissionUrl}> ;\n`;
  if (provenance?.by) lines += `  dcterms:contributor <${provenance.by}> ;\n`;
  lines += `  dcterms:dateSubmitted "${provenance?.at || new Date().toISOString()}"^^xsd:dateTime ;\n`;
  lines += `  ex:modified "${new Date().toISOString()}"^^xsd:dateTime .\n`;

  if (sub.authorWebId) lines += await agentRecordTurtle(sub.authorWebId, ttl);
  const next = `${ttl}\n# --- submitted app ---\n${lines}`;
  const res = await solidFetch(CATALOG_URL, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: next,
  });
  if (!res.ok) throw new Error(`Catalog update failed (${res.status})`);
  return id;
}
