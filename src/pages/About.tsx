import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ShieldCheck, Database, HeartHandshake, HelpCircle, ChevronDown } from "lucide-react";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { ModeratorRequest } from "@/components/ModeratorRequest";
import { loadAdmins } from "@/lib/solid-data";
import {
  useHead,
  JsonLd,
  siteJsonLd,
  webPageJsonLd,
  organizationJsonLd,
  catalogDatasetJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import { getProfileInfo } from "@/lib/avatars";
import { apps, participation, categories, screenFrames } from "@/lib/apps";
import {
  ADMIN_POD,
  ADMIN_WEBID,
  CATALOG_URL,
  GALLERY_ROOT,
  SCREENS_BASE,
  VIDEOS_BASE,
  ADMIN_INBOX,
} from "@/config";

type Moderator = { webId: string; name: string | null; isOwner: boolean };

// The gallery's own SHACL/LinkML shapes (api/shapes-gallery.ts serves both
// representations under this one URL).
const SHAPES_DOC = "/shapes/gallery-shacl";

// A vocabulary term that links to the shape defining it. `code` off for plain
// prose names — only the CURIEs are set in monospace.
function VocabLink({
  href,
  code = true,
  children,
}: {
  href: string;
  code?: boolean;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {code ? <code>{children}</code> : children}
    </a>
  );
}

// A pod resource the reader can open for themselves — the whole point of the
// page is that nothing here is hidden behind the app.
function PodLink({ href, label, children }: { href: string; label: string; children: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2.5 first:border-t-0">
      <span className="w-40 shrink-0 text-sm font-medium">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-flex min-w-0 items-center gap-1 break-all text-sm text-muted-foreground underline hover:text-foreground"
      >
        {children}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

// Answers reflect what the app actually does — keep them in step with the
// submission/moderation flow if that changes.
// `text` is the plain-text twin of `a`, used for the FAQPage markup —
// keep the two saying the same thing.
const FAQ: { q: string; text: string; a: React.ReactNode }[] = [
  {
    q: "How do I get my app into the gallery?",
    text:
      "Use the Submit an app form and paste its link — name, description, category and keywords are prefilled from the page where they are available. The submission is written to your own Solid Pod and announced to the moderators, who publish it into the shared catalog.",
    a: (
      <>
        Use{" "}
        <Link to="/submit" className="text-foreground underline">
          Submit an app
        </Link>{" "}
        and paste its link — name, description, category and keywords are
        prefilled from the page where they are available. The submission is
        written to your own pod and announced to the moderators, who publish it
        into the shared catalog.
      </>
    ),
  },
  {
    q: "What happens if I submit while logged out?",
    text:
      "The submission is kept on your device and sent automatically the next time you log in — nothing is lost. Until then it shows as \u201cWaiting for login\u201d under Your submissions, where you can still edit or cancel it.",
    a: (
      <>
        The submission is kept on your device and sent automatically the next
        time you log in — nothing is lost. Until then it shows as “Waiting for
        login” under{" "}
        <Link to="/participation" className="text-foreground underline">
          Your submissions
        </Link>
        , where you can still edit or cancel it.
      </>
    ),
  },
  {
    q: "Can I take a submission back?",
    text:
      "Yes. While it is still in review, its actions menu offers \u201cWithdraw submission\u201d: the record is deleted from your pod and the moderators are told, so it leaves the review queue. Once an app is published it belongs to the catalog — from its page you can suggest a removal instead, and a moderator acts on it.",
    a: (
      <>
        Yes. While it is still in review, its ⋯ menu offers “Withdraw
        submission”: the record is deleted from your pod and the moderators are
        told, so it leaves the review queue. Once an app is published it belongs
        to the catalog — from its page you can suggest a removal instead, and a
        moderator acts on it.
      </>
    ),
  },
  {
    q: "Who can see my private comments?",
    text:
      "Only you and the moderators. A private note is written to your own Solid Pod, not to the gallery pod, so it never becomes part of the shared catalog and no other visitor can read it. Switch a comment to public and it goes to the gallery pod instead, where everyone can see it.",
    a: (
      <>
        Only you and the moderators. A private note is written to your own pod,
        not to the gallery pod, so it never becomes part of the shared catalog
        and no other visitor can read it. Switch a comment to public and it goes
        to the gallery pod instead, where everyone can see it.
      </>
    ),
  },
  {
    q: "Why do some apps have no screenshot?",
    text:
      "Because nobody has contributed one yet. Those apps are collected under Help wanted — open one, sign in and upload a screenshot to bring it into the gallery.",
    a: (
      <>
        Because nobody has contributed one yet. Those apps are collected under{" "}
        <Link to="/participation" className="text-foreground underline">
          Help wanted
        </Link>{" "}
        — open one, sign in and upload a screenshot to bring it into the gallery.
      </>
    ),
  },
  {
    q: "Are the screens phone-only?",
    text:
      "No — each app can carry both phone and desktop screenshots. The phone/monitor switch in the header picks which set you are browsing, and the gallery only lists apps that have screenshots for the selected one.",
    a: (
      <>
        No — each app can carry both. The phone/monitor switch in the header
        picks which set you are browsing, and the gallery only lists apps that
        have screenshots for the selected one.
      </>
    ),
  },
  {
    q: "How do I become a moderator?",
    text:
      "Sign in and send a request from the \u201cBecome a moderator\u201d box on this page. Moderation is tied to your WebID and approved by hand, since moderators can publish into the shared catalog and remove records.",
    a: (
      <>
        Sign in and send a request from the box above. Moderation is tied to your
        WebID and approved by hand, since moderators can publish into the shared
        catalog and remove records.
      </>
    ),
  },
  {
    q: "Can I use this data in my own app?",
    text:
      "It is a public Solid Pod, so yes — read catalog.ttl and the media containers directly with any Solid client or plain HTTP. Nothing here requires this website.",
    a: (
      <>
        It is a public Solid pod, so yes — read{" "}
        <code className="text-foreground">catalog.ttl</code> and the media
        containers directly with any Solid client or plain HTTP. Nothing here
        requires this website.
      </>
    ),
  },
];

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="group border-t border-border py-3 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium marker:hidden hover:text-foreground">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 max-w-3xl pr-7 text-sm text-muted-foreground">{a}</p>
    </details>
  );
}

export function About() {
  const [mods, setMods] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadAdmins()
      .then(async (webIds) => {
        // The pod owner is a moderator by definition, whether or not they are
        // also listed in the admins group.
        const all = [ADMIN_WEBID, ...webIds.filter((w) => w !== ADMIN_WEBID)];
        const withNames = await Promise.all(
          all.map(async (webId) => ({
            webId,
            name: (await getProfileInfo(webId).catch(() => ({ name: null }))).name,
            isOwner: webId === ADMIN_WEBID,
          }))
        );
        if (!cancelled) setMods(withNames);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const screenCount = [...apps, ...participation].reduce(
    (sum, a) => sum + screenFrames(a.id).length,
    0
  );

  const description =
    "Who moderates the Solid Gallery, where its data lives (a public Solid Pod) and how to contribute an app or a screenshot.";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageUrl = `${origin}/about`;
  useHead({ title: "About", description, path: "/about" });

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 md:px-8">
      <JsonLd
        data={[
          // The fuller Organization below carries the same @id, so keep only
          // the WebSite node from the shared site graph.
          ...siteJsonLd().filter((n) => n["@type"] !== "Organization"),
          webPageJsonLd({ url: pageUrl, name: "About the Solid Gallery", description, type: "AboutPage" }),
          breadcrumbJsonLd([
            { name: "Solid Gallery", url: `${origin}/` },
            { name: "About", url: pageUrl },
          ]),
          // Moderators land in the graph as soon as they have loaded.
          organizationJsonLd(mods),
          catalogDatasetJsonLd({
            pageUrl,
            catalogUrl: CATALOG_URL,
            galleryRoot: GALLERY_ROOT,
            screensBase: SCREENS_BASE,
            videosBase: VIDEOS_BASE,
            appCount: apps.length,
            screenCount,
          }),
          faqJsonLd(FAQ, pageUrl),
        ]}
      />
      <h1 className="text-3xl font-bold">About the Solid Gallery</h1>
      <p className="mt-3 text-muted-foreground">
        A gallery of apps and services built on{" "}
        <a
          href="https://solidproject.org"
          target="_blank"
          rel="noopener"
          className="underline hover:text-foreground"
        >
          Solid
        </a>{" "}
        — what they look like, what they do, and who is building them. Anyone can
        submit an app or add a screenshot; moderators publish contributions into
        the shared catalog.
      </p>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
        {[
          { label: "Apps & services", value: apps.length },
          { label: "Screens", value: screenCount },
          { label: "Categories", value: categories.length },
          { label: "Awaiting a screenshot", value: participation.length },
        ].map((s) => (
          <div key={s.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Moderators */}
      <section className="mt-12">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="text-xl font-bold">Moderators</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Moderators review submitted apps and screenshots, publish them into the
          catalog and act on removal requests. The list is public — it lives in
          the pod as a vCard group.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : mods.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No moderators are listed yet.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mods.map((m) => (
              <li
                key={m.webId}
                className="flex items-center gap-3 rounded-xl bg-card p-3 transition hover:bg-foreground/[0.06]"
              >
                <AuthorAvatar
                  author={{ name: m.name || m.webId, webId: m.webId }}
                  className="h-10 w-10 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {m.name || new URL(m.webId).hostname}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.isOwner ? "Pod owner · admin" : "Moderator"}
                  </div>
                </div>
                <a
                  href={m.webId}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  WebID
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Where the data lives */}
      <section className="mt-12">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <h2 className="text-xl font-bold">Where the data comes from</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The pod is the database. This site ships no catalog of its own — it
          knows one address and reads everything from there at run time, so the
          data outlives the app and you can read it with any Solid client. Every
          resource below is public and can be opened directly.
        </p>
        <div className="mt-4 rounded-2xl bg-card p-4">
          <PodLink href={ADMIN_POD} label="Pod">
            {ADMIN_POD}
          </PodLink>
          <PodLink href={CATALOG_URL} label="Catalog (Turtle)">
            {CATALOG_URL}
          </PodLink>
          <PodLink href={SCREENS_BASE} label="Screenshots">
            {SCREENS_BASE}
          </PodLink>
          <PodLink href={VIDEOS_BASE} label="Videos">
            {VIDEOS_BASE}
          </PodLink>
          <PodLink href={GALLERY_ROOT} label="Gallery root">
            {GALLERY_ROOT}
          </PodLink>
          <PodLink href={ADMIN_INBOX} label="Notification inbox">
            {ADMIN_INBOX}
          </PodLink>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Apps are <VocabLink href={`${SHAPES_DOC}#AppAssetsShape`}>ex:Software</VocabLink>{" "}
          records, screenshots{" "}
          <VocabLink href={`${SHAPES_DOC}#ImageObjectShape`}>schema:ImageObject</VocabLink>,
          comments{" "}
          <VocabLink href={`${SHAPES_DOC}#AnnotationShape`} code={false}>
            W3C Web Annotations
          </VocabLink>.
          Each links to the shape that defines it — the same SHACL document the
          gallery publishes for validators (
          <a
            href={SHAPES_DOC}
            target="_blank"
            rel="noopener"
            className="underline hover:text-foreground"
          >
            all shapes
          </a>
          , also served as LinkML YAML by content negotiation). Your own
          submissions and uploads are written to <em>your</em> pod first and only
          copied into the shared catalog once a moderator publishes them.
        </p>
      </section>

      {/* Contributing */}
      <section className="mt-12">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5" />
          <h2 className="text-xl font-bold">Contributing</h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <Link to="/submit" className="font-medium text-foreground underline">
              Submit an app
            </Link>{" "}
            — paste a link and the form fills itself in from the page.
          </li>
          <li>
            <Link to="/participation" className="font-medium text-foreground underline">
              Help wanted
            </Link>{" "}
            — apps already in the catalog that still need a usable screenshot.
          </li>
          <li>
            Open any app and add a screenshot from its page; sign in with your
            Solid WebID to upload.
          </li>
        </ul>
      </section>

      {/* Moderator access */}
      <ModeratorRequest />

      {/* FAQ */}
      <section className="mt-12">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          <h2 className="text-xl font-bold">Frequently asked questions</h2>
        </div>
        <div className="mt-4 rounded-2xl bg-card px-4 py-2">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>
    </div>
  );
}
