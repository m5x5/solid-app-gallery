// robots.txt with an absolute Sitemap URL for whichever host serves it
// (production or a preview deployment). Routed from /robots.txt via vercel.json.
export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  const body = [
    "User-agent: *",
    "Allow: /",
    // Private / admin-only routes: nothing indexable there.
    "Disallow: /review",
    "Disallow: /submit",
    "Disallow: /bookmarks",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
