import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, ExternalLink, Github } from "lucide-react";
import { needsContribution, initialsFor, type App } from "@/lib/apps";

function hostFor(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Apps with a landing page can be contributed to right away, apps with only
// a repository need a bit more digging, and apps with neither need the most
// work — so surface them in that order.
function linkRank(a: App): number {
  if (a.landingPage) return 0;
  if (a.repository) return 1;
  return 2;
}

export function Participation() {
  const sorted = useMemo(
    () => [...needsContribution].sort((a, b) => linkRank(a) - linkRank(b)),
    []
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      {/* Apps that need a working link or a real screenshot. */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Help wanted — apps to document</h1>
          <span className="text-sm text-muted-foreground">
            {needsContribution.length} apps need a working link or screenshot
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          These apps are in the catalog but don't yet have a usable app
          screenshot. Open one to add a screenshot (sign in to upload) or fix its
          link so it can join the gallery.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((a) => {
            const link = a.landingPage || a.repository;
            const host = hostFor(link);
            const isGithub = host === "github.com";
            return (
              <div
                key={a.id}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition hover:border-white/25"
              >
                <div className="flex items-center gap-3">
                  <Link
                    to={`/app/${encodeURIComponent(a.id)}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-[11px] font-bold">
                      {a.icon ? (
                        <img src={a.icon} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initialsFor(a.name)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.category}
                      </div>
                    </div>
                  </Link>
                  <Link to={`/app/${encodeURIComponent(a.id)}`} aria-label="Open app detail">
                    <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  </Link>
                </div>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    title={link}
                    className="flex w-fit items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-white/25 hover:text-foreground"
                  >
                    {isGithub ? (
                      <Github className="h-3 w-3" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    {host}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Submit your own app</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Built something on Solid? Add it to the gallery.
        </p>
        <Link
          to="/submit"
          className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
        >
          Submit an app
        </Link>
      </div>
    </div>
  );
}
