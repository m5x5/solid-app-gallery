// Prefill for the "Submit an app" form: given a landing page or repository
// URL, fetch it server-side (no CORS) and pull what the page says about
// itself — schema.org JSON-LD (SoftwareApplication/WebApplication/…), Open
// Graph, and plain <meta>/<title> as fallbacks. GitHub/GitLab repos go through
// their APIs (description, topics, homepage). Returns only what was found;
// the form fills empty fields from it and never overwrites what the user typed.
//
//   GET /api/prefill?url=https://…
//   → { name?, description?, subType?, technicalKeyword?, landingPage?, repository?, source }
export const config = { runtime: "edge" };

type Prefill = {
  name?: string;
  description?: string;
  subType?: string; // our category key
  technicalKeyword?: string;
  landingPage?: string;
  repository?: string;
  source: string; // host we learned it from
};

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

// schema.org applicationCategory / topics / free text → catalog category key.
// Deliberately conservative: only map when a keyword clearly points somewhere,
// otherwise leave the field for the submitter.
// Stems (leading word boundary only) so "authorization", "productivity",
// "messaging" etc. all match.
const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(pods?\b|storage|access[- ]control|manage access|acl\b|permission|authoriz|identity|webid|profile manag)/i, "PodApp"],
  [/\b(game|gaming|music|video|movie|media|photo|recipe|cook|travel|fitness|entertain|leisure|hobby)/i, "LeisureApp"],
  [/\b(productiv|todo|to-do|task|note|calendar|planner|schedul|bookmark|contact|document|editor|finance|budget)/i, "ProductivityApp"],
  [/\b(communit|social|chat|messag|forum|organi[sz]ation|team|collaborat|group|event|meetup)/i, "SpecializedPodService"],
];
function guessCategory(...texts: (string | undefined)[]): string | undefined {
  const hay = texts.filter(Boolean).join(" ");
  for (const [re, key] of CATEGORY_RULES) if (re.test(hay)) return key;
  return undefined;
}

const clean = (s?: string | null) =>
  s ? s.replace(/\s+/g, " ").trim().slice(0, 1000) || undefined : undefined;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function meta(html: string, name: string): string | undefined {
  // <meta property="og:title" content="…"> / <meta name="description" content="…">, either attribute order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
    "i"
  );
  const m = html.match(re);
  return clean(decodeEntities(m?.[1] || m?.[2] || ""));
}

// First schema.org object that looks like an app/website (walks @graph too).
function jsonLdApp(html: string): Record<string, unknown> | undefined {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const wanted = /SoftwareApplication|WebApplication|MobileApplication|WebSite|WebPage|CreativeWork|Product/;
  const visit = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = visit(n);
        if (r) return r;
      }
      return undefined;
    }
    const o = node as Record<string, unknown>;
    const type = ([] as unknown[]).concat(o["@type"] || []).join(" ");
    if (wanted.test(type)) return o;
    return visit(o["@graph"]);
  };
  for (const b of blocks) {
    try {
      const r = visit(JSON.parse(b[1]));
      if (r) return r;
    } catch {
      /* malformed block — skip */
    }
  }
  return undefined;
}

async function fetchText(url: string, accept: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": "SolidGalleryPrefill/1.0 (+/submit)" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      n += value.byteLength;
      if (n >= MAX_BYTES) break; // <head> is what we need; don't slurp huge pages
    }
    return new TextDecoder().decode(concat(chunks));
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

async function fromGitHub(u: URL): Promise<Prefill | null> {
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  const txt = await fetchText(
    `https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, "")}`,
    "application/vnd.github+json"
  );
  if (!txt) return null;
  try {
    const j = JSON.parse(txt);
    const topics: string[] = Array.isArray(j.topics) ? j.topics : [];
    return {
      name: clean(j.name),
      description: clean(j.description),
      technicalKeyword: topics.length ? topics.join(", ") : undefined,
      landingPage: clean(j.homepage) || undefined,
      repository: clean(j.html_url) || u.href,
      subType: guessCategory(j.description, topics.join(" "), j.name),
      source: "github.com",
    };
  } catch {
    return null;
  }
}

async function fromGitLab(u: URL): Promise<Prefill | null> {
  const path = u.pathname.replace(/^\/+|\/+$|\.git$/g, "");
  if (!path.includes("/")) return null;
  const txt = await fetchText(
    `${u.origin}/api/v4/projects/${encodeURIComponent(path)}`,
    "application/json"
  );
  if (!txt) return null;
  try {
    const j = JSON.parse(txt);
    const topics: string[] = Array.isArray(j.topics) ? j.topics : [];
    return {
      name: clean(j.name),
      description: clean(j.description),
      technicalKeyword: topics.length ? topics.join(", ") : undefined,
      repository: clean(j.web_url) || u.href,
      subType: guessCategory(j.description, topics.join(" "), j.name),
      source: u.host,
    };
  } catch {
    return null;
  }
}

async function fromPage(u: URL): Promise<Prefill | null> {
  const html = await fetchText(u.href, "text/html,application/xhtml+xml");
  if (!html) return null;
  const ld = jsonLdApp(html);
  const str = (v: unknown) => (typeof v === "string" ? clean(v) : undefined);
  const ldKeywords = ld?.keywords;
  const keywords = Array.isArray(ldKeywords)
    ? ldKeywords.filter((k) => typeof k === "string").join(", ")
    : str(ldKeywords);
  const ldCategory = str(ld?.applicationCategory) || str(ld?.applicationSubCategory);
  const title = clean(decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
  const name =
    str(ld?.name) ||
    meta(html, "og:site_name") ||
    meta(html, "og:title") ||
    meta(html, "application-name") ||
    (title ? title.split(/\s[|–—-]\s/)[0] : undefined);
  const description =
    str(ld?.description) || meta(html, "og:description") || meta(html, "description");
  const codeRepo = str(ld?.codeRepository);
  return {
    name,
    description,
    technicalKeyword: keywords || meta(html, "keywords"),
    subType: guessCategory(ldCategory, keywords, description, name),
    landingPage: u.href,
    repository: codeRepo,
    source: u.host,
  };
}

export async function prefill(rawUrl: string): Promise<Prefill | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  // Never let this be used to poke at internal networks.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\])/.test(u.hostname))
    return null;

  if (u.hostname === "github.com" || u.hostname === "www.github.com") {
    return (await fromGitHub(u)) || (await fromPage(u));
  }
  if (/(^|\.)gitlab\.(com|org)$|^git\./.test(u.hostname)) {
    return (await fromGitLab(u)) || (await fromPage(u));
  }
  return fromPage(u);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get("url") || "";
  const data = url ? await prefill(url) : null;
  return new Response(JSON.stringify(data || {}), {
    status: data ? 200 : 204,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
