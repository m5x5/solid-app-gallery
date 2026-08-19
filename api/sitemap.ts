// sitemap.xml, generated on request from the live catalog (the catalog lives in
// the admin pod and changes without a redeploy, so a build-time sitemap would
// go stale). Routed here from /sitemap.xml via vercel.json; cached at the edge
// for an hour. Self-contained on purpose: Vercel bundles api/* separately, so
// no "@/…" imports from src.
import { Parser, Store } from "n3";

export const config = { runtime: "nodejs" };

const ADMIN_POD = process.env.VITE_ADMIN_POD || "https://pod.mpeters.dev/test/";
const CATALOG_URL = `${ADMIN_POD}solid-gallery/catalog.ttl`;

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const EX = "http://example.org#";
const SCHEMA = "http://schema.org/";
const localName = (iri: string) => iri.split(/[#/]/).pop() || iri;

// Same visibility rules as the app (src/lib/apps.ts): no servers, nothing
// archived/discontinued, nothing soft-deleted.
const HIDDEN_IDS = new Set([
  "urn:uuid:692f351f-0e50-4274-9f3f-9d28d9bef6ba",
  "urn:uuid:75369102-594d-43e9-8618-9e2ba57b6e39",
  "urn:uuid:d785cb19-0d53-48f7-a92a-65d6b74a8388",
  "urn:uuid:65ec3b50-48c0-4d65-9670-13135addc3c5",
]);

type Url = { loc: string; lastmod?: string; changefreq?: string; priority?: string };

export function buildSitemap(ttl: string, origin: string): string {
  const store = new Store(new Parser().parse(ttl));
  const urls: Url[] = [
    { loc: `${origin}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${origin}/screens`, changefreq: "daily", priority: "0.9" },
    { loc: `${origin}/flows`, changefreq: "daily", priority: "0.8" },
    { loc: `${origin}/participation`, changefreq: "weekly", priority: "0.5" },
    { loc: `${origin}/submit`, changefreq: "monthly", priority: "0.3" },
  ];

  const authors = new Map<string, string | undefined>(); // id -> latest lastmod
  const subjects = [
    ...store.getSubjects(RDF_TYPE, EX + "Software", null),
    ...store.getSubjects(RDF_TYPE, EX + "Service", null),
  ];
  for (const s of subjects) {
    const id = s.value;
    if (HIDDEN_IDS.has(id)) continue;
    const status = localName(store.getObjects(id, EX + "status", null)[0]?.value || "");
    if (/archiv|discontinu|deprecat/i.test(status)) continue;
    if (store.getObjects(id, EX + "deleted", null).length) continue;
    if (store.getObjects(id, EX + "excluded", null).length) continue;
    const subType = localName(store.getObjects(id, EX + "subType", null)[0]?.value || "");
    if (subType === "PodServer") continue;
    if (!store.getObjects(id, EX + "name", null).length) continue;

    const lastmod = store.getObjects(id, EX + "modified", null)[0]?.value?.slice(0, 10);
    urls.push({ loc: `${origin}/app/${encodeURIComponent(id)}`, lastmod, changefreq: "weekly", priority: "0.7" });

    // A screen page per app that has published screenshots (its default frame;
    // the ?i= variants are the same page and don't need separate entries).
    const shots = store.getObjects(id, EX + "screenshot", null);
    if (shots.some((n) => store.getObjects(n.value, SCHEMA + "contentUrl", null).length))
      urls.push({ loc: `${origin}/screen/${encodeURIComponent(id)}`, lastmod, changefreq: "weekly", priority: "0.5" });

    for (const p of ["author", "maintainer"])
      for (const a of store.getObjects(id, EX + p, null)) {
        const prev = authors.get(a.value);
        if (!prev || (lastmod && lastmod > prev)) authors.set(a.value, lastmod);
      }
  }
  for (const [id, lastmod] of authors)
    urls.push({ loc: `${origin}/author/${encodeURIComponent(id)}`, lastmod, changefreq: "weekly", priority: "0.4" });

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${esc(u.loc)}</loc>` +
        (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "") +
        (u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : "") +
        (u.priority ? `<priority>${u.priority}</priority>` : "") +
        `</url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  let ttl: string;
  try {
    const res = await fetch(CATALOG_URL, { headers: { Accept: "text/turtle" } });
    if (!res.ok) throw new Error(String(res.status));
    ttl = await res.text();
  } catch {
    // Catalog unreachable: still return the static routes rather than a 5xx,
    // so crawlers keep the sitemap URL alive.
    ttl = "";
  }
  return new Response(buildSitemap(ttl, origin), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
