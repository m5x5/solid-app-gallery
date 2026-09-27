// Data regions: rectangles drawn on a screenshot that say which vocabulary
// term (vcard:fn, schema:name, ldp:Container, …) the app shows or edits
// there. Each region is a W3C Web Annotation with a media-fragment selector,
// stored as its own JSON-LD resource in the admin pod — one container per
// app, next to the public comments — so anyone logged in can add one and the
// gallery can derive an app's data shape (lib/shapes) from the whole set.
import { useEffect, useState } from "react";
import { getSolidDataset, getContainedResourceUrlAll } from "@inrupt/solid-client";
import { solidFetch } from "./solid-auth";
import { appSlug, ensureContainer, postToInbox } from "./solid-data";
import { GALLERY_ROOT } from "@/config";
import type { TermKind } from "./vocab";

export type RegionRole = "shows" | "edits";

export type Region = {
  id: string; // annotation resource URL
  appId: string;
  screenId: string; // `${appId}::${index}` — same key the comments use
  image: string; // schema:contentUrl of the screenshot the box was drawn on
  // Box in percent of the image (0–100), so it survives any rendering size.
  x: number;
  y: number;
  w: number;
  h: number;
  term: string; // full IRI of the vocabulary term
  termKind: TermKind;
  shape?: string; // IRI of the app's published shape the term belongs to, if picked from one
  role: RegionRole;
  note?: string;
  author?: string; // WebID
  authorLabel: string;
  created: string;
};

const REGIONS_ROOT = `${GALLERY_ROOT}regions/`;
const GS = "https://solidproject.solidcommunity.net/catalog/gallery-shapes#";
const regionsDir = (appId: string) => `${REGIONS_ROOT}${appSlug(appId)}/`;

const ANNO_CONTEXT = [
  "http://www.w3.org/ns/anno.jsonld",
  { as: "https://www.w3.org/ns/activitystreams#", gs: GS },
];

const fmt = (n: number) => Math.round(n * 100) / 100;

function toAnnotationJsonLd(r: Region) {
  return {
    "@context": ANNO_CONTEXT,
    type: "Annotation",
    // "describing": the region shows this data; "editing": the user can change it here.
    motivation: r.role === "edits" ? "editing" : "describing",
    target: {
      type: "SpecificResource",
      id: r.screenId,
      source: r.image,
      scope: r.appId,
      selector: {
        type: "FragmentSelector",
        conformsTo: "http://www.w3.org/TR/media-frags/",
        value: `xywh=percent:${fmt(r.x)},${fmt(r.y)},${fmt(r.w)},${fmt(r.h)}`,
      },
    },
    body: [
      { type: "SpecificResource", source: r.term, purpose: "identifying", "gs:termKind": r.termKind },
      ...(r.shape ? [{ type: "SpecificResource", source: r.shape, purpose: "classifying" }] : []),
      ...(r.note ? [{ type: "TextualBody", value: r.note, format: "text/plain", purpose: "describing" }] : []),
    ],
    creator: { id: r.author, name: r.authorLabel },
    created: r.created,
    audience: "as:Public",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAnnotation(json: any, url: string): Region | null {
  if (!json || !json.target || typeof json.target !== "object") return null;
  const sel = json.target.selector?.value as string | undefined;
  const m = sel?.match(/xywh=percent:([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
  if (!m) return null;
  const bodies = Array.isArray(json.body) ? json.body : [json.body];
  const termBody = bodies.find((b: { purpose?: string; source?: string }) => b?.purpose === "identifying" && b.source);
  if (!termBody) return null;
  const noteBody = bodies.find((b: { purpose?: string; value?: string }) => b?.purpose === "describing" && b.value);
  const shapeBody = bodies.find((b: { purpose?: string; source?: string }) => b?.purpose === "classifying" && b.source);
  const creator = json.creator || {};
  return {
    id: url,
    appId: json.target.scope || "",
    screenId: json.target.id || "",
    image: json.target.source || "",
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
    term: termBody.source,
    termKind: termBody["gs:termKind"] === "class" ? "class" : "property",
    shape: shapeBody?.source,
    role: json.motivation === "editing" ? "edits" : "shows",
    note: noteBody?.value,
    author: typeof creator === "string" ? creator : creator.id,
    authorLabel: (typeof creator === "object" && creator.name) || "Someone",
    created: json.created || new Date(0).toISOString(),
  };
}

async function readRegionsIn(dir: string): Promise<Region[]> {
  try {
    const ds = await getSolidDataset(dir);
    const urls = getContainedResourceUrlAll(ds).filter((u) => !u.endsWith("/"));
    const out = await Promise.all(
      urls.map(async (u) => {
        try {
          const res = await fetch(u, { headers: { Accept: "application/ld+json" } });
          if (!res.ok) return null;
          return fromAnnotation(await res.json(), u);
        } catch {
          return null;
        }
      })
    );
    return out.filter((r): r is Region => !!r).sort((a, b) => a.created.localeCompare(b.created));
  } catch {
    return []; // no container yet — nothing annotated
  }
}

// --- in-memory store: one list per app, shared by cards, detail views and
// the annotation tool, refreshed after every write ---
const cache = new Map<string, Region[]>();
const inflight = new Map<string, Promise<Region[]>>();
const listeners = new Set<(appId: string) => void>();
let allPromise: Promise<Region[]> | null = null;
let allLoaded = false;

const cachedRegions = () => [...cache.values()].flat();

function emit(appId: string) {
  // Keep the gallery-wide snapshot coherent after per-app refreshes and
  // local writes, so returning from an annotation immediately updates term
  // quick links and filters without requiring a page reload.
  if (allLoaded) allPromise = Promise.resolve(cachedRegions());
  listeners.forEach((fn) => fn(appId));
}

export function loadRegions(appId: string, fresh = false): Promise<Region[]> {
  if (!fresh && cache.has(appId)) return Promise.resolve(cache.get(appId)!);
  if (!fresh && inflight.has(appId)) return inflight.get(appId)!;
  const p = readRegionsIn(regionsDir(appId)).then((rs) => {
    cache.set(appId, rs);
    inflight.delete(appId);
    emit(appId);
    return rs;
  });
  inflight.set(appId, p);
  return p;
}

export function peekRegions(appId: string): Region[] {
  return cache.get(appId) || [];
}

// Regions for one screenshot. Matched on the image URL first (stable when
// screens get reordered), then on the index-based screen id as a fallback for
// boxes drawn on an image that has since been replaced.
export function regionsForImage(all: Region[], image?: string, screenId?: string): Region[] {
  const byImage = image ? all.filter((r) => r.image === image) : [];
  if (byImage.length || !screenId) return byImage;
  return all.filter((r) => r.screenId === screenId && !r.image);
}

// All regions across every app — one listing of regions/, then each app's
// container. Cheap at the gallery's scale (only annotated apps have a dir);
// fills the per-app cache as a side effect, so cards need no second fetch.
export function loadAllRegions(fresh = false): Promise<Region[]> {
  if (allPromise && !fresh) return allPromise;
  if (fresh) allLoaded = false;
  allPromise = (async () => {
    let dirs: string[] = [];
    try {
      const ds = await getSolidDataset(REGIONS_ROOT);
      dirs = getContainedResourceUrlAll(ds).filter((u) => u.endsWith("/"));
    } catch {
      allLoaded = true;
      return [];
    }
    const lists = await Promise.all(dirs.map(readRegionsIn));
    for (const rs of lists) {
      const appId = rs.find((r) => r.appId)?.appId;
      if (appId) {
        cache.set(appId, rs);
        emit(appId);
      }
    }
    allLoaded = true;
    return lists.flat();
  })();
  return allPromise;
}

// Live view of every region in the gallery (Discover's shape column, term filters).
export function useAllRegions(): { regions: Region[]; loading: boolean } {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const sync = () => {
      if (alive && allLoaded) setRegions(cachedRegions());
    };
    listeners.add(sync);
    loadAllRegions()
      .then((rs) => alive && setRegions(rs))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, []);
  return { regions, loading };
}

// The most widespread terms across apps: classes first (what kind of data),
// then properties, each counted by how many different apps carry a region
// with it.
export function topTerms(regions: Region[], limit = 5): { term: string; kind: TermKind; apps: number }[] {
  const byTerm = new Map<string, { kind: TermKind; apps: Set<string> }>();
  for (const r of regions) {
    const cur = byTerm.get(r.term) || { kind: r.termKind, apps: new Set<string>() };
    cur.apps.add(r.appId || r.screenId);
    byTerm.set(r.term, cur);
  }
  const rows = [...byTerm.entries()].map(([term, v]) => ({ term, kind: v.kind, apps: v.apps.size }));
  rows.sort((a, b) => (a.kind === b.kind ? b.apps - a.apps : a.kind === "class" ? -1 : 1));
  return rows.slice(0, limit);
}

// Live view of an app's regions; fetches on first use.
export function useRegions(appId?: string): { regions: Region[]; loading: boolean; refresh: () => void } {
  const [, bump] = useState(0);
  const [loading, setLoading] = useState(!!appId && !cache.has(appId));
  useEffect(() => {
    if (!appId) return;
    const fn = (id: string) => id === appId && bump((v) => v + 1);
    listeners.add(fn);
    if (!cache.has(appId)) {
      setLoading(true);
      loadRegions(appId).finally(() => setLoading(false));
    }
    return () => {
      listeners.delete(fn);
    };
  }, [appId]);
  return {
    regions: appId ? peekRegions(appId) : [],
    loading,
    refresh: () => {
      if (!appId) return;
      setLoading(true);
      loadRegions(appId, true).finally(() => setLoading(false));
    },
  };
}

export async function addRegion(
  webId: string,
  authorLabel: string,
  draft: Omit<Region, "id" | "author" | "authorLabel" | "created">
): Promise<Region> {
  const region: Region = {
    ...draft,
    id: "",
    author: webId,
    authorLabel,
    created: new Date().toISOString(),
    note: draft.note?.trim() || undefined,
  };
  const dir = regionsDir(region.appId);
  await ensureContainer(dir);
  const res = await solidFetch(dir, {
    method: "POST",
    headers: { "Content-Type": "application/ld+json" },
    body: JSON.stringify(toAnnotationJsonLd(region)),
  });
  if (res.status === 401 || res.status === 403)
    throw new Error(
      "The gallery pod refused the write — the regions/ container may not be set up yet (admin: run scripts/setup-regions.mjs), or your login has expired."
    );
  if (!res.ok) throw new Error(`Saving region failed: ${res.status} ${res.statusText}`);
  const loc = res.headers.get("Location") || res.url;
  region.id = loc.startsWith("http") ? loc : new URL(loc, dir).href;
  cache.set(region.appId, [...peekRegions(region.appId), region]);
  emit(region.appId);
  // Let the admin know, same as for comments — best-effort.
  postToInbox({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Announce",
    summary: `New data region (${region.term})`,
    actor: webId,
    object: region.id,
    target: region.screenId,
    published: region.created,
  }).catch(() => {});
  return region;
}

// The author may remove their own box; the admin any. The pod's ACL decides.
export async function deleteRegion(region: Region): Promise<void> {
  const res = await solidFetch(region.id, { method: "DELETE" });
  if (!res.ok && res.status !== 404)
    throw new Error(`Deleting region failed: ${res.status} ${res.statusText}`);
  cache.set(
    region.appId,
    peekRegions(region.appId).filter((r) => r.id !== region.id)
  );
  emit(region.appId);
}
