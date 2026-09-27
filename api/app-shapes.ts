// Published shapes resolver: GET /api/app-shapes?url=<landing page>
//
// Apps that follow the W3C Application Capability draft embed, as RDFa on
// their landing page, what they can do (ac:Capability) and the shapes of the
// data they read and write (ac:shape → SHACL / ShEx / LinkML documents). This
// fetches the page server-side (size-capped, CORS-free) and returns that
// description as JSON: the capabilities, and the shapes grouped by name with
// one URL per notation. Also proxies a single shape document
// (GET /api/app-shapes?shape=<url>) for apps whose hosts don't send CORS.
export const config = { runtime: "edge" };

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const UA = "SolidGalleryShapes/1.0 (+/api/app-shapes)";

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (ipv4?.length === 4 && ipv4.every((n) => n >= 0 && n <= 255)) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return host.includes(":") && (
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("::ffff:")
  );
}

export function safeHttpUrl(raw: string, base?: string): URL | null {
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || isPrivateHostname(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

type FetchTextResult =
  | { text: string; url: string; type: string }
  | { tooLarge: true };

async function fetchText(url: string, accept: string): Promise<FetchTextResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let current = safeHttpUrl(url);
    if (!current) return null;
    let res: Response | null = null;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      res = await fetch(current, {
        headers: { Accept: accept, "User-Agent": UA },
        redirect: "manual",
        signal: ctrl.signal,
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      current = location ? safeHttpUrl(location, current.href) : null;
      if (!current) return null;
      res = null;
    }
    if (!res) return null;
    if (!res.ok) return null;
    const declaredLength = Number(res.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      await res.body?.cancel();
      return { tooLarge: true };
    }
    const reader = res.body?.getReader();
    const type = res.headers.get("content-type") || "";
    if (!reader) return { text: await res.text(), url: res.url, type };
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      if (n + value.byteLength > MAX_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
      n += value.byteLength;
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) {
      out.set(c.subarray(0, Math.min(c.byteLength, n - o)), o);
      o += c.byteLength;
      if (o >= n) break;
    }
    return { text: new TextDecoder().decode(out), url: res.url, type };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type Capability = {
  id: string;
  name?: string;
  description?: string;
  actions: string[];
  accepts: string[];
  shapes: string[];
  resourceTypes: string[];
};
export type PublishedShape = {
  name: string; // "task" — from the file name
  formats: Partial<Record<"shacl" | "shex" | "linkml", string>>;
};
export type AppShapes = {
  source: string;
  capabilities: Capability[];
  shapes: PublishedShape[];
};

const unescape = (s: string) =>
  s
    .replace(/<!--.*?-->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
const text = (html: string) => unescape(html.replace(/<[^>]+>/g, " "));
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? unescape(m[1] ?? m[2] ?? m[3] ?? "") : undefined;
};

// Every property="…" / rel="…" carrier inside an element, in document order.
// RDFa lets the value sit in the element's text, its href/resource/content
// attribute — this reads all of those.
function values(block: string, prop: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(\\w+)([^>]*\\b(?:property|rel)\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["'][^>]*)>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const tag = m[0];
    const v = attr(tag, "content") ?? attr(tag, "resource") ?? attr(tag, "href") ?? attr(tag, "src");
    if (v !== undefined) {
      out.push(v);
      continue;
    }
    // Text content up to the matching close tag (no nesting of the same tag assumed).
    const close = block.indexOf(`</${m[1]}>`, m.index + tag.length);
    if (close > -1) out.push(text(block.slice(m.index + tag.length, close)));
  }
  return [...new Set(out.filter(Boolean))];
}

// Split the page into capability blocks: from each typeof="ac:Capability"
// opening tag to the next one (or the end). Good enough for the flat lists
// the spec's examples and the apps in the catalog use.
export function parseCapabilities(html: string): Capability[] {
  const re = /<(\w+)[^>]*\btypeof\s*=\s*["'][^"']*\bac:Capability\b[^"']*["'][^>]*>/gi;
  const starts: { idx: number; tag: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) starts.push({ idx: m.index, tag: m[0] });
  return starts.map(({ idx, tag }, i) => {
    const block = html.slice(idx, starts[i + 1]?.idx ?? html.length);
    return {
      id: attr(tag, "resource") || attr(tag, "about") || attr(tag, "id") || `#capability-${i + 1}`,
      name: values(block, "schema:name")[0] || values(block, "dcterms:title")[0],
      description: values(block, "schema:description")[0],
      actions: values(block, "ac:action"),
      accepts: values(block, "ac:accept"),
      shapes: values(block, "ac:shape"),
      resourceTypes: values(block, "ac:resourceType"),
    };
  });
}

// Group shape URLs by document name, one URL per notation, going by the file
// extension (…/task.shacl.ttl, task.shex, task.linkml.yaml).
export function groupShapes(urls: string[], base?: string): PublishedShape[] {
  const byName = new Map<string, PublishedShape>();
  for (const raw of urls) {
    const u = safeHttpUrl(raw, base)?.href;
    if (!u) continue;
    const file = u.split(/[?#]/)[0].split("/").pop() || u;
    const m = file.match(/^(.+?)\.(shacl\.ttl|ttl|shex|linkml\.ya?ml|ya?ml)$/i);
    // An extensionless ac:shape is still useful: treat its default
    // representation as SHACL instead of silently dropping it.
    const name = m?.[1] || new URL(u).hash.slice(1) || file || "shape";
    const fmt: "shacl" | "shex" | "linkml" = !m || /ttl$/i.test(m[2])
      ? "shacl"
      : /shex$/i.test(m[2])
        ? "shex"
        : "linkml";
    const s = byName.get(name) || { name, formats: {} };
    s.formats[fmt] = s.formats[fmt] || u;
    byName.set(name, s);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const json = (body: unknown, status = 200, maxAge = 3600) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}` },
  });

export default async function handler(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const shape = q.get("shape");
  if (shape) {
    if (!safeHttpUrl(shape)) return new Response("bad url", { status: 400 });
    const r = await fetchText(shape, "text/turtle, text/shex, application/yaml, text/plain;q=0.9, */*;q=0.5");
    if (!r) return new Response("not found", { status: 404 });
    if ("tooLarge" in r) return new Response("shape document too large", { status: 413 });
    return new Response(r.text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }
  const url = q.get("url");
  if (!url || !safeHttpUrl(url)) return json({ error: "valid public url required" }, 400, 0);
  const page = await fetchText(url, "text/html, application/xhtml+xml");
  if (!page) return json({ source: url, capabilities: [], shapes: [] }, 200, 600);
  if ("tooLarge" in page) return json({ error: "landing page too large" }, 413, 0);
  const baseTag = page.text.match(/<base\b[^>]*>/i)?.[0];
  const documentBase = (baseTag && safeHttpUrl(attr(baseTag, "href") || "", page.url)?.href) || page.url;
  const caps = parseCapabilities(page.text).map((cap) => ({
    ...cap,
    shapes: cap.shapes.flatMap((shapeUrl) => {
      const resolved = safeHttpUrl(shapeUrl, documentBase);
      return resolved ? [resolved.href] : [];
    }),
  }));
  // Shape documents linked anywhere on the page (Leptum, for one, also lists
  // them as schema:hasPart CreativeWorks, which is where the LinkML rendering
  // shows up) — not only the ones a capability points at.
  const linked = [...page.text.matchAll(/(?:href|resource|content)=["']([^"']+\.(?:shacl\.ttl|shex|linkml\.ya?ml))["']/gi)].map((m) =>
    unescape(m[1])
  );
  const out: AppShapes = {
    source: page.url,
    capabilities: caps,
    shapes: groupShapes([...caps.flatMap((c) => c.shapes), ...linked], documentBase),
  };
  return json(out);
}
