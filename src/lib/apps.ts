import { fetchCatalog } from "./catalog-loader";

export type App = {
  id: string;
  region: "apps" | "participation";
  name: string;
  description: string;
  category: string;
  categoryKey: string;
  landingPage?: string;
  repository?: string;
  status: string;
  programmingLanguage?: string;
  technicalKeyword?: string;
  socialKeyword?: string;
  modified?: string;
  domain?: string;
  icon?: string;
  isSoftware: boolean;
  authors?: Author[];
  // URL of the submission (.ttl in the submitter's pod) this record came from.
  source?: string;
  // Set (ISO date) when the admin soft-deleted the record; hidden everywhere
  // except direct links, where it renders as removed.
  deleted?: string;
  deletedReason?: string;
  // Reason the admin excluded it from the gallery ("Not an app: testing tool"…).
  excluded?: string;
  // Provenance recorded on publish (see publishSubmissionToCatalog).
  contributor?: string; // submitter WebID
  dateSubmitted?: string;
  // Turtle serialization of this record's direct triples in the catalog.
  rdf?: string;
};

// An app author / maintainer from the catalog (ex:author / ex:maintainer).
// `id` is the agent IRI (a WebID, or a urn:uuid agent node) and doubles as the
// stable key used in /author/:id routes.
export type Author = {
  id: string;
  name: string;
  type: "Person" | "Organization";
  webId?: string;
  role: "author" | "maintainer";
};

export type Category = { key: string; label: string; count: number };
export type Device = "mobile" | "desktop";
export type ScreenFrame = {
  path: string;
  tags: string[];
  formFactor?: Device;
  creator?: string; // uploader WebID (recorded on publish)
  created?: string;
};
export type ScreenVideo = { label: string; path: string };
export type ScreenEntry = {
  path: string;
  tags: string[];
  frames?: ScreenFrame[];
  video?: string; // legacy single video
  videos?: ScreenVideo[];
};

// Hide archived/discontinued apps from all listings.
const isArchived = (a: App) => /archiv|discontinu|deprecat/i.test(a.status || "");

// Manually hidden apps — broken/dead/typo landing pages that capture error or
// irrelevant content (e.g. "Service Unavailable", a parked domain, a cookie wall).
const HIDDEN_IDS = new Set<string>([
  "urn:uuid:692f351f-0e50-4274-9f3f-9d28d9bef6ba", // geopod (landing typo gihub.com)
  "urn:uuid:75369102-594d-43e9-8618-9e2ba57b6e39", // N. Kensington (demo down)
  "urn:uuid:d785cb19-0d53-48f7-a92a-65d6b74a8388", // N. Kensington (duplicate)
  "urn:uuid:65ec3b50-48c0-4d65-9670-13135addc3c5", // Solid Health AU (typo githu.com)
]);
const hidden = (a: App) => isArchived(a) || HIDDEN_IDS.has(a.id) || !!a.deleted || !!a.excluded;

// Solid servers are infrastructure, not apps — never shown.
const isServer = (a: App) => a.categoryKey === "PodServer";

// An entry only counts as a real "app" if its screenshot shows an actual app
// screen (one of these patterns). Repos / docs / marketing / no screenshot don't
// qualify — those go to Participation so the community can contribute one.
const APP_SCREEN_TAGS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];
function hasAppScreen(id: string): boolean {
  return (SCREENS[id]?.tags || []).some((t) => APP_SCREEN_TAGS.includes(t));
}

// --- mutable data store, populated from the admin pod by initCatalog() ---
let appsAll: App[] = []; // software-region records, unfiltered
let partAll: App[] = []; // participation-region records
let SCREENS: Record<string, ScreenEntry> = {};

// Filtered, view-ready lists (recomputed by rebuild()).
export let apps: App[] = [];
export let participation: App[] = [];
export let needsContribution: App[] = [];
export let categories: Category[] = [];

function rebuild() {
  const visible = appsAll.filter((a) => !hidden(a));
  apps = visible.filter((a) => !isServer(a) && hasAppScreen(a.id));
  needsContribution = visible.filter((a) => !isServer(a) && !hasAppScreen(a.id));
  participation = partAll.filter((a) => !hidden(a));
  // Categories derived from the loaded apps (key + label + count, desc).
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const a of apps) {
    const c = counts.get(a.categoryKey) || {
      key: a.categoryKey,
      label: a.category,
      count: 0,
    };
    c.count++;
    counts.set(a.categoryKey, c);
  }
  categories = [...counts.values()].sort((a, b) => b.count - a.count);
}

// Load the canonical catalog from the admin pod (the only source of truth).
// Call once before first render.
export async function initCatalog(): Promise<"pod" | "empty"> {
  const d = await fetchCatalog();
  if (d && d.apps.length) {
    appsAll = d.apps;
    partAll = d.participation;
    SCREENS = d.screens;
    rebuild();
    return "pod";
  }
  rebuild();
  return "empty";
}

// Re-fetch the catalog after an in-app publish (review queue, admin actions) so
// the new record/screens show up without a hard reload. Subscribers (App) re-key
// the page tree so every view recomputes from the fresh module-level lists.
const listeners = new Set<() => void>();
export function subscribeCatalog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export async function reloadCatalog(): Promise<void> {
  const d = await fetchCatalog();
  if (d && d.apps.length) {
    appsAll = d.apps;
    partAll = d.participation;
    SCREENS = d.screens;
    rebuild();
    listeners.forEach((fn) => fn());
  }
}

// The catalog record published from a given submission URL, if any.
export function appBySource(submissionUrl: string): App | undefined {
  return [...appsAll, ...partAll].find((a) => a.source === submissionUrl);
}

// getApp resolves ANY id (direct links / bookmarks), incl. servers/hidden.
export function getApp(id: string): App | undefined {
  return [...appsAll, ...partAll].find((a) => a.id === id);
}

// All visible apps this author created or maintains (for the author page), plus
// the resolved Author record itself. Hidden/archived apps are excluded.
export function appsByAuthor(authorId: string): { author?: Author; apps: App[] } {
  const all = [...appsAll, ...partAll].filter((a) => !hidden(a));
  const out = all.filter((a) => (a.authors || []).some((x) => x.id === authorId));
  const author = out
    .flatMap((a) => a.authors || [])
    .find((x) => x.id === authorId);
  return { author, apps: out };
}

// Everything a WebID contributed to the catalog: apps they submitted and
// screenshots they uploaded (only what was recorded on publish — older items
// have no provenance). Hidden apps are excluded, like everywhere else.
export function contributionsBy(webId: string): {
  submitted: App[];
  screenshots: { app: App; frame: ScreenFrame; index: number }[];
} {
  const visible = [...appsAll, ...partAll].filter((a) => !hidden(a));
  const submitted = visible.filter((a) => a.contributor === webId);
  const screenshots: { app: App; frame: ScreenFrame; index: number }[] = [];
  for (const a of visible) {
    (SCREENS[a.id]?.frames || []).forEach((frame, index) => {
      if (frame.creator === webId) screenshots.push({ app: a, frame, index });
    });
  }
  return { submitted, screenshots };
}

// Recorded flow videos (webm) for this app, each with a label.
export function screenVideos(id: string): ScreenVideo[] {
  const e = SCREENS[id];
  const out: ScreenVideo[] = [];
  if (e?.video) out.push({ label: "Onboarding flow", path: e.video });
  if (e?.videos) out.push(...e.videos);
  return out;
}

export function screenFor(id: string): string | undefined {
  return SCREENS[id]?.frames?.[0]?.path ?? SCREENS[id]?.path;
}
// Real captured frames for an app. Pass a device to get only that form factor's
// frames (no dimensions recorded => treated as mobile).
export function screenFrames(id: string, device?: Device): string[] {
  const e = SCREENS[id];
  if (e?.frames?.length) {
    const fs = device
      ? e.frames.filter((f) => (f.formFactor || "mobile") === device)
      : e.frames;
    return fs.map((f) => f.path);
  }
  return !device || device === "mobile" ? (e?.path ? [e.path] : []) : [];
}

// Does this app have at least one screenshot for the given viewport?
export function appHasDevice(id: string, device: Device): boolean {
  return screenFrames(id, device).length > 0;
}
export function screenTags(id: string): string[] {
  return SCREENS[id]?.tags || [];
}
// Tags for one specific published frame (by its content path), for per-image
// tag editing — screenTags() above is the app-wide union across all frames.
export function frameTags(id: string, path: string): string[] {
  return SCREENS[id]?.frames?.find((f) => f.path === path)?.tags || [];
}
// First captured frame whose tags include `tag` (so a pattern filter shows the
// matching screen, not just frame 0).
export function frameForTag(id: string, tag: string): string | undefined {
  const f = SCREENS[id]?.frames?.find((fr) => fr.tags.includes(tag));
  return f?.path ?? screenFor(id);
}

// Quality tier for ordering — lower = shown first:
// 0 real app UI (has screenshot, not a repo, not docs)
// 1 repository screenshot (not docs)
// 2 documentation/marketing screenshot
// 3 no screenshot at all
export function qualityRank(id: string): number {
  if (screenFrames(id).length === 0) return 3;
  const tags = screenTags(id);
  const doc = tags.includes("Documentation");
  const repo = tags.includes("Repository");
  if (!doc && !repo) return 0;
  if (!doc && repo) return 1;
  return 2;
}
// Flow actions map to one or more screen-pattern tags.
export const FLOW_ACTION_TAGS: Record<string, string[]> = {
  Onboarding: ["Onboarding"],
  Login: ["Login"],
  Signup: ["Signup"],
  Browsing: ["Dashboard"],
  Profile: ["Profile"],
};
export function appHasTag(id: string, tags: string[]): boolean {
  const have = screenTags(id);
  return tags.some((t) => have.includes(t));
}

// Screen patterns that actually appear in the captured set, with counts (desc).
export const SCREEN_PATTERNS = ["Onboarding", "Login", "Signup", "Dashboard", "Profile"];
export function screenPatternCounts(): { tag: string; count: number }[] {
  return SCREEN_PATTERNS.map((tag) => ({
    tag,
    count: apps.filter((a) => screenTags(a.id).includes(tag)).length,
  })).filter((p) => p.count > 0);
}
export function flowActionCounts(): { action: string; count: number }[] {
  return Object.entries(FLOW_ACTION_TAGS)
    .map(([action, tags]) => ({
      action,
      count: apps.filter((a) => appHasTag(a.id, tags)).length,
    }))
    .filter((p) => p.count > 0);
}

// Deterministic accent color per app (for synthetic phone screens).
const PALETTE = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
];
export function accentFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsFor(name: string): string {
  return name
    .replace(/[@/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
