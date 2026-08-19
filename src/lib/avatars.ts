import { useEffect, useState } from "react";
import { Parser, Store } from "n3";

const FOAF_IMG = "http://xmlns.com/foaf/0.1/img";
const FOAF_DEPICTION = "http://xmlns.com/foaf/0.1/depiction";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const VCARD_PHOTO = "http://www.w3.org/2006/vcard/ns#hasPhoto";
const VCARD_FN = "http://www.w3.org/2006/vcard/ns#fn";

// Avatar URL for a WebID, from foaf:img / vcard:hasPhoto / foaf:depiction in
// the profile document. Resolved once per WebID and remembered:
//   - in memory for the session (one profile fetch per WebID, shared by every
//     chip on every page), and
//   - in localStorage for a week, so a returning visitor doesn't re-fetch
//     profiles at all — the image itself is then served from the browser's
//     HTTP cache. Negative results are cached too (no repeated 404s).
const LS_KEY = "solid-gallery.avatars";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { url: string | null; name?: string | null; at: number };
let disk: Record<string, Entry> | null = null;
function readDisk(): Record<string, Entry> {
  if (disk) return disk;
  try {
    disk = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
  } catch {
    disk = {};
  }
  return disk!;
}
function writeDisk() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(disk || {}));
  } catch {
    /* quota / private mode — memory cache still applies */
  }
}

type Profile = { url: string | null; name: string | null };
const inflight = new Map<string, Promise<Profile>>();

// One profile-document fetch yields both the avatar and the display name
// (vcard:fn preferred — foaf:name is often just a handle).
async function fetchProfile(webId: string): Promise<Profile> {
  const docUrl = webId.split("#")[0];
  const res = await fetch(docUrl, { headers: { Accept: "text/turtle" } });
  if (!res.ok) return { url: null, name: null };
  const store = new Store(new Parser({ baseIRI: docUrl }).parse(await res.text()));
  let url: string | null = null;
  for (const p of [FOAF_IMG, VCARD_PHOTO, FOAF_DEPICTION]) {
    const img = store.getObjects(webId, p, null)[0]?.value;
    if (img) {
      url = img;
      break;
    }
  }
  const name =
    store.getObjects(webId, VCARD_FN, null)[0]?.value ||
    store.getObjects(webId, FOAF_NAME, null)[0]?.value ||
    null;
  return { url, name };
}

export function getProfileInfo(webId: string): Promise<Profile> {
  const cached = readDisk()[webId];
  if (cached && cached.name !== undefined && Date.now() - cached.at < TTL_MS)
    return Promise.resolve({ url: cached.url, name: cached.name ?? null });
  let p = inflight.get(webId);
  if (!p) {
    p = fetchProfile(webId)
      .catch(() => ({ url: null, name: null }) as Profile)
      .then((prof) => {
        readDisk()[webId] = { url: prof.url, name: prof.name, at: Date.now() };
        writeDisk();
        inflight.delete(webId);
        return prof;
      });
    inflight.set(webId, p);
  }
  return p;
}

export function getAvatar(webId: string): Promise<string | null> {
  return getProfileInfo(webId).then((p) => p.url);
}

// Display name from the WebID profile (cached alongside the avatar).
export function useProfileName(webId?: string): string | undefined {
  const [name, setName] = useState<string | undefined>(() =>
    webId ? readDisk()[webId]?.name || undefined : undefined
  );
  useEffect(() => {
    if (!webId) {
      setName(undefined);
      return;
    }
    let alive = true;
    setName(readDisk()[webId]?.name || undefined);
    getProfileInfo(webId).then((p) => alive && setName(p.name || undefined));
    return () => {
      alive = false;
    };
  }, [webId]);
  return name;
}

// Synchronous read for first paint (avoids an initials→image flash when the
// avatar is already known).
export function peekAvatar(webId?: string): string | undefined {
  if (!webId) return undefined;
  const c = readDisk()[webId];
  return c && Date.now() - c.at < TTL_MS ? c.url || undefined : undefined;
}

export function useAvatar(webId?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => peekAvatar(webId));
  useEffect(() => {
    if (!webId) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    setUrl(peekAvatar(webId));
    getAvatar(webId).then((u) => alive && setUrl(u || undefined));
    return () => {
      alive = false;
    };
  }, [webId]);
  return url;
}
