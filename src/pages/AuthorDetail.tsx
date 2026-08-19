import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ExternalLink,
  Building2,
  User,
  FilePlus,
  ImagePlus,
  MessageCircle,
} from "lucide-react";
import { appsByAuthor, appHasDevice, contributionsBy, getApp, type App } from "@/lib/apps";
import { AuthorAvatar, authorTransitionName } from "@/components/AuthorAvatar";
import { AppIcon } from "@/components/AppIcon";
import { armAppTransition } from "@/lib/transitions";
import { useDevice } from "@/lib/device-context";
import { useProfileName } from "@/lib/avatars";
import { loadPublicCommentsBy, type Comment } from "@/lib/solid-data";
import { DiscoverCard } from "@/components/cards";
import { useHead, JsonLd, appUrl, authorUrl, itemListJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { Button } from "@/components/ui/button";

// One entry in the activity timeline.
type Activity =
  | { kind: "submitted"; at: string; app: App }
  | { kind: "screenshot"; at: string; app: App; path: string; index: number }
  | { kind: "comment"; at: string; comment: Comment; app?: App; screenIndex: number };

function when(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${Math.floor(days)} days ago`;
  return d.toLocaleDateString();
}

// A profile for any WebID (or catalog agent IRI): the apps they author or
// maintain (from the catalog), plus an activity feed of what they contributed —
// apps submitted, screenshots uploaded (both recorded on publish) and their
// public comments.
export function AuthorDetail() {
  const { id } = useParams();
  const authorId = id ? decodeURIComponent(id) : "";
  const { author, apps } = appsByAuthor(authorId);
  const { device } = useDevice();
  // Apps with a real screenshot (for the selected viewport) get gallery cards;
  // the rest are listed compactly below instead of as placeholder frames.
  const withShots = apps.filter((a) => appHasDevice(a.id, device));
  const withoutShots = apps.filter((a) => !appHasDevice(a.id, device));

  // Contributions are keyed by WebID; a catalog agent may be a urn:uuid with a
  // separate webId, so look up by whichever is the WebID.
  const webId = author?.webId || (/^https?:/.test(authorId) ? authorId : undefined);
  const { submitted, screenshots } = useMemo(
    () => (webId ? contributionsBy(webId) : { submitted: [], screenshots: [] }),
    [webId]
  );

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  useEffect(() => {
    if (!webId) return;
    let alive = true;
    setCommentsLoading(true);
    loadPublicCommentsBy(webId)
      .then((c) => alive && setComments(c))
      .finally(() => alive && setCommentsLoading(false));
    return () => {
      alive = false;
    };
  }, [webId]);

  const activity = useMemo<Activity[]>(() => {
    const items: Activity[] = [];
    for (const app of submitted)
      if (app.dateSubmitted) items.push({ kind: "submitted", at: app.dateSubmitted, app });
    for (const s of screenshots)
      if (s.frame.created)
        items.push({ kind: "screenshot", at: s.frame.created, app: s.app, path: s.frame.path, index: s.index });
    for (const c of comments) {
      // screenId is `${app.id}::${frameIndex}` (see ScreenDetail).
      const sep = c.screenId.lastIndexOf("::");
      const appId = sep > -1 ? c.screenId.slice(0, sep) : c.screenId;
      const screenIndex = sep > -1 ? Number(c.screenId.slice(sep + 2)) || 0 : 0;
      const app = getApp(appId);
      items.push({ kind: "comment", at: c.created, comment: c, app, screenIndex });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [submitted, screenshots, comments, apps]);

  // Where an activity card leads: the app for submissions, the exact screen for
  // screenshots, and the exact comment for comments.
  const hrefFor = (a: Activity): string | undefined => {
    if (a.kind === "submitted") return `/app/${encodeURIComponent(a.app.id)}`;
    if (a.kind === "screenshot")
      return `/screen/${encodeURIComponent(a.app.id)}?i=${a.index}`;
    if (a.app)
      return `/screen/${encodeURIComponent(a.app.id)}?i=${a.screenIndex}&c=${encodeURIComponent(a.comment.id)}`;
    return undefined;
  };

  // Name: catalog record, else the WebID profile (cached), else the IRI.
  const profileName = useProfileName(!author?.name ? webId : undefined);
  const name = author?.name || profileName || authorId;
  const isOrg = author?.type === "Organization";
  const isCatalogAuthor = apps.length > 0;

  const stats = [
    isCatalogAuthor && `${apps.length} ${apps.length === 1 ? "app" : "apps"}`,
    submitted.length > 0 && `${submitted.length} submitted`,
    screenshots.length > 0 && `${screenshots.length} ${screenshots.length === 1 ? "screenshot" : "screenshots"}`,
    comments.length > 0 && `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`,
  ].filter(Boolean) as string[];

  useHead({
    title: name,
    description: `${name} on Solid Gallery${apps.length ? ` — ${apps.length} ${apps.length === 1 ? "app" : "apps"}: ${apps.slice(0, 5).map((a) => a.name).join(", ")}` : ""}${comments.length ? `; ${comments.length} comments` : ""}.`,
    path: `/author/${encodeURIComponent(authorId)}`,
    type: "profile",
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <JsonLd
        data={[
          {
            "@type": "ProfilePage",
            "@id": `${location.origin}/author/${encodeURIComponent(authorId)}`,
            mainEntity: {
              "@type": isOrg ? "Organization" : "Person",
              "@id": authorUrl({ id: authorId }),
              name,
              url: authorUrl({ id: authorId }),
              ...(webId ? { sameAs: [webId] } : {}),
              ...(apps.length ? { owns: apps.map((a) => ({ "@type": "SoftwareApplication", "@id": appUrl(a), name: a.name, url: appUrl(a) })) } : {}),
            },
          },
          ...(apps.length ? [itemListJsonLd(`Apps by ${name}`, apps, `${location.origin}/author/${encodeURIComponent(authorId)}`)] : []),
          breadcrumbJsonLd([
            { name: "Solid Gallery", url: `${location.origin}/` },
            { name, url: authorUrl({ id: authorId }) },
          ]),
        ]}
      />
      <div className="flex flex-wrap items-center gap-4">
        <AuthorAvatar
          author={{ name, webId }}
          className="h-16 w-16 text-xl"
          transitionId={authorId}
        />
        <div className="min-w-0">
          <h1
            className="text-2xl font-bold"
            style={{ viewTransitionName: authorTransitionName(authorId, "name") }}
          >
            {name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {isOrg ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
            {isOrg ? "Organization" : isCatalogAuthor ? "Person" : "Contributor"}
            {stats.map((s) => (
              <span key={s}> · {s}</span>
            ))}
          </div>
        </div>
        {webId && (
          <Button asChild variant="outline" className="ml-auto">
            <a href={webId} target="_blank" rel="noopener">
              <ExternalLink className="h-4 w-4" />
              {/^https?:\/\/[^/]+\/profile\/card/.test(webId) ? "View Solid profile" : "View profile"}
            </a>
          </Button>
        )}
      </div>

      {apps.length > 0 && (
        <>
          {withShots.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {withShots.map((app) => (
                <DiscoverCard key={app.id} app={app} />
              ))}
            </div>
          )}
          {withoutShots.length > 0 && (
            <div className="mt-8">
              {withShots.length > 0 && (
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Without screenshots yet
                </h2>
              )}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {withoutShots.map((app) => (
                  <li key={app.id}>
                    <CompactApp app={app} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Activity — what this person contributed to the gallery */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold">Activity</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {commentsLoading
              ? "Loading…"
              : apps.length > 0
                ? "No recorded contributions yet — activity is tracked for submissions, screenshot uploads and public comments."
                : "Nothing here yet."}
          </p>
        ) : (
          <ol className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {activity.map((a, i) => (
              <li
                key={i}
                className="relative flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-white/25"
              >
                {/* Whole card is the link (stretched overlay); the app chip is a
                    separate link layered above it. */}
                {hrefFor(a) && (
                  <Link
                    to={hrefFor(a)!}
                    aria-label={
                      a.kind === "submitted"
                        ? `Open ${a.app.name}`
                        : a.kind === "screenshot"
                          ? `View screenshot of ${a.app.name}`
                          : "View comment"
                    }
                    className="absolute inset-0 z-0 rounded-xl"
                  />
                )}
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  {a.kind === "submitted" ? (
                    <FilePlus className="h-4 w-4" />
                  ) : a.kind === "screenshot" ? (
                    <ImagePlus className="h-4 w-4" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                </span>
                <div className="pointer-events-none relative z-[1] min-w-0 flex-1 text-sm">
                  {a.kind === "submitted" && (
                    <>
                      Submitted <AppLink app={a.app} />
                    </>
                  )}
                  {a.kind === "screenshot" && (
                    <>
                      Added a screenshot to <AppLink app={a.app} />
                    </>
                  )}
                  {a.kind === "comment" && (
                    <>
                      {a.comment.kind === "version" ? "Uploaded a new screenshot version for" : "Commented on"}{" "}
                      {a.app ? (
                        <Link
                          to={`/screen/${encodeURIComponent(a.app.id)}?i=${a.screenIndex}`}
                          className="pointer-events-auto relative z-10 ml-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 align-middle font-medium transition hover:bg-secondary/70"
                        >
                          <AppIcon app={a.app} size={16} rounded="rounded" />
                          {a.app.name}
                        </Link>
                      ) : (
                        <span className="font-medium">a screen</span>
                      )}
                      {a.comment.kind !== "version" && (
                        <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                          {a.comment.text.length > 240
                            ? a.comment.text.slice(0, 240) + "…"
                            : a.comment.text}
                        </p>
                      )}
                    </>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground" title={a.at}>
                    {when(a.at)}
                  </div>
                </div>
                {a.kind === "screenshot" && (
                  <img
                    src={a.path}
                    alt=""
                    className="h-16 w-auto max-w-[96px] shrink-0 rounded-md object-cover ring-1 ring-white/10"
                    loading="lazy"
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function AppLink({ app }: { app: App }) {
  return (
    <Link
      to={`/app/${encodeURIComponent(app.id)}`}
      viewTransition
      onClick={(e) => armAppTransition(e.currentTarget, app.id)}
      className="pointer-events-auto relative z-10 ml-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 align-middle font-medium transition hover:bg-secondary/70"
    >
      <span data-vt="icon" className="inline-flex">
        <AppIcon app={app} size={16} rounded="rounded" />
      </span>
      <span data-vt="name">{app.name}</span>
    </Link>
  );
}

function CompactApp({ app }: { app: App }) {
  return (
    <Link
      to={`/app/${encodeURIComponent(app.id)}`}
      viewTransition
      onClick={(e) => armAppTransition(e.currentTarget, app.id)}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-white/25"
    >
      <span data-vt="icon" className="flex shrink-0">
        <AppIcon app={app} size={36} rounded="rounded-lg" />
      </span>
      <div className="min-w-0">
        <div data-vt="name" className="truncate text-sm font-semibold">
          {app.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">{app.category}</div>
      </div>
    </Link>
  );
}
