// App icon resolver: GET /api/icon?url=<landing page or repo>
//
// Fetches the site's own HTML (server-side, size-capped) and picks its best
// icon — web-manifest icons (largest, ideally 192/512), apple-touch-icon,
// then the largest <link rel="icon">, then /favicon.ico — and 302-redirects to
// it. No third-party icon services (Google/DuckDuckGo) and no low-res 16px
// favicons when the site ships something better. GitHub repo URLs resolve to
// the owner's avatar (a proper square image) rather than GitHub's own favicon.
// Cached at the edge for a day; a miss redirects to nothing (404) so the
// client falls back to initials.
export const config = { runtime: "edge" };

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 6000;

async function fetchText(url: string, accept: string): Promise<{ text: string; url: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": "SolidGalleryIcon/1.0 (+/api/icon)" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return { text: await res.text(), url: res.url };
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      n += value.byteLength;
      if (n >= MAX_BYTES) break;
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) {
      out.set(c.subarray(0, Math.min(c.byteLength, n - o)), o);
      o += c.byteLength;
      if (o >= n) break;
    }
    return { text: new TextDecoder().decode(out), url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return /image\//.test(res.headers.get("content-type") || "") || url.endsWith(".ico");
    // Some hosts reject HEAD; try a tiny GET.
    const g = await fetch(url, { headers: { Range: "bytes=0-0" }, redirect: "follow" });
    return g.ok || g.status === 206;
  } catch {
    return false;
  }
}

// Largest declared size ("192x192" → 192; "any" → 1024).
function sizeOf(sizes?: string | null): number {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 1024;
  return Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

type Candidate = { href: string; size: number; weight: number };

async function resolve(pageUrl: URL): Promise<string | null> {
  // GitHub / GitLab repos: the owner's avatar is the sensible "app icon".
  if (/^(www\.)?github\.com$/.test(pageUrl.hostname)) {
    const owner = pageUrl.pathname.split("/").filter(Boolean)[0];
    if (owner) return `https://github.com/${owner}.png?size=256`;
  }

  const page = await fetchText(pageUrl.href, "text/html,application/xhtml+xml");
  if (!page) return null;
  const base = new URL(page.url);
  const abs = (h: string) => {
    try {
      return new URL(h, base).href;
    } catch {
      return null;
    }
  };
  const cands: Candidate[] = [];

  // <link rel="…icon…"> variants
  for (const m of page.text.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") || "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    if (/apple-touch-icon/.test(rel)) {
      const u = abs(href);
      if (u) cands.push({ href: u, size: sizeOf(attr(tag, "sizes")) || 180, weight: 3 });
    } else if (/(^|\s)icon(\s|$)|shortcut icon/.test(rel)) {
      const u = abs(href);
      if (u) {
        const size = sizeOf(attr(tag, "sizes"));
        const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type") || "");
        cands.push({ href: u, size: svg ? 512 : size || 32, weight: 2 });
      }
    } else if (/manifest/.test(rel)) {
      const u = abs(href);
      if (u) {
        const man = await fetchText(u, "application/manifest+json,application/json");
        if (man) {
          try {
            const j = JSON.parse(man.text);
            const mbase = new URL(man.url);
            for (const ic of j.icons || []) {
              if (!ic?.src) continue;
              const purpose = String(ic.purpose || "any");
              if (/monochrome/.test(purpose) && !/any/.test(purpose)) continue;
              const iu = new URL(ic.src, mbase).href;
              cands.push({ href: iu, size: sizeOf(ic.sizes) || 192, weight: 4 });
            }
          } catch {
            /* bad manifest */
          }
        }
      }
    }
  }

  // Prefer big raster/SVG icons; among equals prefer manifest > apple-touch > link icon.
  cands.sort((a, b) => b.size - a.size || b.weight - a.weight);
  const best = cands.find((c) => c.size >= 96) || cands[0];
  if (best) return best.href;

  const fav = `${base.origin}/favicon.ico`;
  return (await exists(fav)) ? fav : null;
}

export default async function handler(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get("url") || "";
  let u: URL | null = null;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    u = null;
  }
  if (!u || !/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(u.hostname))
    return new Response("bad url", { status: 400 });

  const icon = await resolve(u);
  const cache = "public, s-maxage=86400, stale-while-revalidate=604800";
  if (!icon) return new Response("no icon", { status: 404, headers: { "Cache-Control": cache } });
  return new Response(null, { status: 302, headers: { Location: icon, "Cache-Control": cache } });
}
