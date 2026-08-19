// Loads the canonical catalog from the ADMIN POD at runtime: fetches
// <admin>/solid-gallery/catalog.ttl, parses the ex:Software records + their
// schema.org assets, and reconstructs the App list + screen manifest. The pod
// owns the data; the repo only knows the pod's address (src/config.ts).
import { Parser, Store, Writer } from "n3";
import { CATALOG_URL } from "@/config";
import type { App, Author, ScreenEntry } from "./apps";

const EX = "http://example.org#";
const SCHEMA = "http://schema.org/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const PARTICIPATION_SUBTYPES = new Set([
  "GeneralPurposePodService",
  "CommunicationService",
]);
const APP_TAGS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

const localName = (iri: string) => iri.split(/[#/]/).pop() || iri;
function domainOf(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Turtle text for just this subject's direct triples, for the "view RDF" modal.
function serializeSubject(store: Store, subject: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ prefixes: { ex: EX, schema: SCHEMA, skos: SKOS } });
    writer.addQuads(store.getQuads(subject, null, null, null));
    writer.end((err, result) => (err ? reject(err) : resolve(result)));
  });
}

export type CatalogData = {
  apps: App[];
  participation: App[];
  screens: Record<string, ScreenEntry>;
};

export async function fetchCatalog(): Promise<CatalogData | null> {
  let ttl: string;
  try {
    const res = await fetch(CATALOG_URL, {
      headers: { Accept: "text/turtle" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    ttl = await res.text();
  } catch {
    return null;
  }

  let store: Store;
  try {
    store = new Store(new Parser().parse(ttl));
  } catch {
    return null;
  }

  // categoryKey -> label, straight from the pod's SKOS concepts.
  const LABELS: Record<string, string> = {};
  for (const q of store.getQuads(null, SKOS + "prefLabel", null, null))
    LABELS[localName(q.subject.value)] = q.object.value;

  const lit = (s: string, p: string) => store.getObjects(s, EX + p, null)[0]?.value;
  const iri = (s: string, p: string) => store.getObjects(s, EX + p, null)[0]?.value;

  // Resolve an app's authors + maintainers into Author records, reading each
  // agent's ex:name / type (Person|Organization) from the same catalog.
  const nameFromWebId = (id: string) => {
    try {
      return new URL(id).hostname.replace(/^www\./, "").split(".")[0];
    } catch {
      return localName(id);
    }
  };
  const authorsFor = (id: string): Author[] => {
    const seen = new Map<string, Author>();
    for (const role of ["author", "maintainer"] as const) {
      for (const o of store.getObjects(id, EX + role, null)) {
        const aid = o.value;
        if (seen.has(aid)) continue;
        const isOrg = store
          .getObjects(aid, RDF + "type", null)
          .some((t) => t.value === EX + "Organization");
        const name = store.getObjects(aid, EX + "name", null)[0]?.value || nameFromWebId(aid);
        seen.set(aid, {
          id: aid,
          name,
          type: isOrg ? "Organization" : "Person",
          webId: /^https?:\/\//.test(aid) ? aid : undefined,
          role,
        });
      }
    }
    return [...seen.values()];
  };

  const apps: App[] = [];
  const participation: App[] = [];
  const screens: Record<string, ScreenEntry> = {};

  const softwareSubjects = [
    ...store.getSubjects(RDF + "type", EX + "Software", null),
    ...store.getSubjects(RDF + "type", EX + "Service", null),
  ];

  for (const subj of softwareSubjects) {
    const id = subj.value;
    const name = lit(id, "name");
    if (!name) continue;
    const categoryKey = (() => {
      const st = store.getObjects(id, EX + "subType", null)[0]?.value;
      return st ? localName(st) : "";
    })();
    const status = (() => {
      const st = store.getObjects(id, EX + "status", null)[0]?.value;
      return st ? localName(st) : "";
    })();
    const landingPage = iri(id, "landingPage");
    const repository = iri(id, "repository");
    const domain = domainOf(landingPage || repository);
    const isSoftware =
      store.getObjects(id, RDF + "type", null).some((t) => t.value === EX + "Software");
    const region = PARTICIPATION_SUBTYPES.has(categoryKey)
      ? "participation"
      : "apps";

    const app: App = {
      id,
      region,
      name,
      description: lit(id, "description") || "",
      category: LABELS[categoryKey] || categoryKey,
      categoryKey,
      landingPage,
      repository,
      status,
      programmingLanguage: lit(id, "programmingLanguage"),
      technicalKeyword: lit(id, "technicalKeyword"),
      socialKeyword: lit(id, "socialKeyword"),
      modified: lit(id, "modified"),
      authors: authorsFor(id),
      domain,
      // Resolved server-side from the site's own manifest / apple-touch-icon /
      // favicon (api/icon.ts) — no third-party icon services, no 16px favicons.
      icon:
        landingPage || repository
          ? `/api/icon?url=${encodeURIComponent(landingPage || repository || "")}`
          : undefined,
      isSoftware,
      // The submitter's pod record this app was published from (if any) —
      // lets the app link a submission back to its live catalog entry.
      source: store.getObjects(id, "http://purl.org/dc/terms/source", null)[0]?.value,
      // Soft-deleted by the admin (see markAppDeleted) — hidden from listings.
      deleted: lit(id, "deleted") || undefined,
      deletedReason: lit(id, "deletedReason"),
      // Admin marked it as not an app (library / tool / spec) — not listed.
      excluded: lit(id, "excluded") || undefined,
      // Who submitted it and when (recorded on publish; absent for older records).
      contributor: store.getObjects(id, "http://purl.org/dc/terms/contributor", null)[0]?.value,
      dateSubmitted: store.getObjects(id, "http://purl.org/dc/terms/dateSubmitted", null)[0]?.value,
      rdf: await serializeSubject(store, id),
    };
    (region === "participation" ? participation : apps).push(app);

    // --- assets: screenshots (ordered by #screenshot-N) + videos ---
    const imgNodes = store.getObjects(id, EX + "screenshot", null).map((o) => o.value);
    const frames = imgNodes
      .map((img) => {
        const n = Number((img.match(/#screenshot-(\d+)/) || [])[1] || 0);
        const path = store.getObjects(img, SCHEMA + "contentUrl", null)[0]?.value;
        const tags = store
          .getObjects(img, SCHEMA + "keywords", null)
          .map((k) => localName(k.value).replace(/Screen$/, ""))
          .filter((t) => APP_TAGS.includes(t));
        // Form factor from stored dimensions (landscape = desktop); default
        // mobile when dimensions are absent.
        const w = Number(store.getObjects(img, SCHEMA + "width", null)[0]?.value || 0);
        const h = Number(store.getObjects(img, SCHEMA + "height", null)[0]?.value || 0);
        const formFactor: "mobile" | "desktop" = w > h ? "desktop" : "mobile";
        const creator = store.getObjects(img, SCHEMA + "creator", null)[0]?.value;
        const created = store.getObjects(img, SCHEMA + "dateCreated", null)[0]?.value;
        return { n, path, tags, formFactor, creator, created };
      })
      .filter((f) => f.path)
      .sort((x, y) => x.n - y.n)
      .map((f) => ({
        path: f.path as string,
        tags: f.tags,
        formFactor: f.formFactor,
        creator: f.creator,
        created: f.created,
      }));

    const videos = store.getObjects(id, SCHEMA + "video", null).map((v) => ({
      label: store.getObjects(v.value, SCHEMA + "name", null)[0]?.value || "Recording",
      path: store.getObjects(v.value, SCHEMA + "contentUrl", null)[0]?.value || "",
    })).filter((v) => v.path);

    if (frames.length || videos.length) {
      screens[id] = {
        path: frames[0]?.path || "",
        tags: [...new Set(frames.flatMap((f) => f.tags))],
        frames,
        videos: videos.length ? videos : undefined,
      };
    }
  }

  if (!apps.length) return null;
  apps.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  participation.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { apps, participation, screens };
}
