// Content negotiation for the gallery's shapes: one logical resource
// (/shapes/gallery-shacl, routed here via vercel.json) serving SHACL Turtle
// by default and the LinkML YAML rendering when the client prefers it.
// Proxies the two static files under public/shapes/ so they stay the single
// source of truth — this is just the conneg layer on top.
export const config = { runtime: "edge" };

const TTL_PATH = "/shapes/gallery-shacl.ttl";
const YAML_PATH = "/shapes/gallery-shapes.linkml.yaml";

// Crude but sufficient Accept-header preference check: walk the comma-
// separated list in order and return on the first turtle/yaml match (or
// wildcard, which defaults to turtle).
function prefersYaml(accept: string): boolean {
  const types = accept
    .split(",")
    .map((t) => t.trim().split(";")[0].toLowerCase());
  for (const t of types) {
    if (t === "text/turtle" || t === "*/*") return false;
    if (
      t === "application/yaml" ||
      t === "text/yaml" ||
      t === "application/x-yaml" ||
      t.includes("linkml")
    )
      return true;
  }
  return false;
}

export default async function handler(req: Request): Promise<Response> {
  const accept = req.headers.get("accept") || "";
  const yaml = prefersYaml(accept);
  const origin = new URL(req.url).origin;
  const upstream = await fetch(`${origin}${yaml ? YAML_PATH : TTL_PATH}`);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": yaml
        ? "application/yaml; charset=utf-8"
        : "text/turtle; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
