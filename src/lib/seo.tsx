import { useEffect } from "react";
import { createPortal } from "react-dom";
import { screenFrames, screenVideos, frameTags, type App, type Author } from "@/lib/apps";

// Per-page <head> data for a client-rendered app: document title, meta
// description, canonical + Open Graph, and schema.org JSON-LD. Crawlers that
// execute JS (Google does) see it; the sitemap (api/sitemap.ts) gets them here.

const SITE_NAME = "Solid Gallery";
const DEFAULT_DESCRIPTION =
  "A gallery of Solid apps and services — screenshots, flows and details for apps built on Solid Pods.";

function origin(): string {
  return typeof location !== "undefined" ? location.origin : "";
}
function upsertMeta(attr: "name" | "property", key: string, content: string | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
function upsertLink(rel: string, href: string | undefined) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// Title / description / canonical / OG for the current page. Pass `path` for
// the canonical (defaults to the current pathname, no query).
export function useHead(opts: {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  type?: "website" | "article" | "profile";
}) {
  const { title, description, image, path, type } = opts;
  useEffect(() => {
    const full = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Apps & Services`;
    const desc = description || DEFAULT_DESCRIPTION;
    const url = origin() + (path ?? location.pathname);
    document.title = full;
    upsertMeta("name", "description", desc);
    upsertLink("canonical", url);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", full);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:type", type || "website");
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    return () => {
      document.title = `${SITE_NAME} — Apps & Services`;
    };
  }, [title, description, image, path, type]);
}

// Renders a schema.org JSON-LD script into <head> (portal), removed on unmount.
export function JsonLd({ data }: { data: object | object[] }) {
  const graph = Array.isArray(data) ? data : [data];
  return createPortal(
    <script
      type="application/ld+json"
      // JSON is safe here; escape "<" so a "</script>" inside a description can't break out.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c"),
      }}
    />,
    document.head
  );
}

// ---------- schema.org builders (kept in one place so pages stay small) ----------

export function siteJsonLd() {
  const o = origin();
  return [
    {
      "@type": "WebSite",
      "@id": `${o}/#website`,
      url: `${o}/`,
      name: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${o}/screens?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    { "@type": "Organization", "@id": `${o}/#org`, name: SITE_NAME, url: `${o}/` },
  ];
}

export function appUrl(app: App): string {
  return `${origin()}/app/${encodeURIComponent(app.id)}`;
}
export function authorUrl(a: Pick<Author, "id">): string {
  return `${origin()}/author/${encodeURIComponent(a.id)}`;
}

export function personJsonLd(a: Author) {
  return {
    "@type": a.type === "Organization" ? "Organization" : "Person",
    "@id": authorUrl(a),
    name: a.name,
    url: authorUrl(a),
    ...(a.webId ? { sameAs: [a.webId] } : {}),
  };
}

// SoftwareApplication (WebApplication) for an app record, with its published
// screenshots/videos and authors. Rich-result minimums (offers/price 0) are
// included since Solid apps in the catalog are free to use.
export function appJsonLd(app: App, opts: { full?: boolean } = {}) {
  const shots = screenFrames(app.id);
  const videos = screenVideos(app.id);
  const authors = (app.authors || []).filter((a) => a.role === "author");
  const maintainers = (app.authors || []).filter((a) => a.role === "maintainer");
  const base: Record<string, unknown> = {
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": appUrl(app),
    url: appUrl(app),
    name: app.name,
    ...(app.description ? { description: app.description } : {}),
    applicationCategory: app.category,
    operatingSystem: "Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(app.landingPage ? { installUrl: app.landingPage, sameAs: [app.landingPage, app.repository].filter(Boolean) } : app.repository ? { sameAs: [app.repository] } : {}),
    ...(app.technicalKeyword ? { keywords: app.technicalKeyword } : {}),
    ...(app.programmingLanguage ? { programmingLanguage: app.programmingLanguage } : {}),
    ...(app.modified ? { dateModified: app.modified } : {}),
    ...(shots.length
      ? {
          screenshot: shots.map((path) => ({
            "@type": "ImageObject",
            contentUrl: path,
            ...(frameTags(app.id, path).length ? { keywords: frameTags(app.id, path).join(", ") } : {}),
          })),
        }
      : {}),
    ...(shots[0] ? { image: shots[0] } : app.icon ? { image: app.icon } : {}),
  };
  if (opts.full) {
    if (authors.length) base.author = authors.map(personJsonLd);
    if (maintainers.length) base.maintainer = maintainers.map(personJsonLd);
    if (videos.length)
      base.video = videos.map((v) => ({ "@type": "VideoObject", name: v.label, contentUrl: v.path }));
    if (app.repository)
      base.subjectOf = { "@type": "SoftwareSourceCode", codeRepository: app.repository, ...(app.programmingLanguage ? { programmingLanguage: app.programmingLanguage } : {}) };
  }
  return base;
}

export function itemListJsonLd(name: string, apps: App[], pageUrl: string) {
  return {
    "@type": "ItemList",
    "@id": `${pageUrl}#list`,
    name,
    numberOfItems: apps.length,
    itemListElement: apps.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: appUrl(a),
      name: a.name,
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
