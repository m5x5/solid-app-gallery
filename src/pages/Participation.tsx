import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImagePlus, ExternalLink, Github, Ban, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useSolid } from "@/lib/solid-context";
import { reloadCatalog } from "@/lib/apps";
import { setAppExcluded, requestAppDeletion } from "@/lib/solid-data";
import { needsContribution, initialsFor, type App } from "@/lib/apps";
import { MySubmissions } from "@/components/MySubmissions";
import { ModeratorRequest } from "@/components/ModeratorRequest";
import { armAppTransition } from "@/lib/transitions";

// Short label for a link chip: "owner/repo" for GitHub/GitLab/Codeberg repos,
// otherwise the hostname.
function linkLabel(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/^(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)$/.test(host)) {
      const [owner, repo] = u.pathname.split("/").filter(Boolean);
      if (owner && repo) return `${owner}/${repo.replace(/\.git$/, "")}`;
    }
    return host;
  } catch {
    return null;
  }
}

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
  const { isAdmin, isLoggedIn, webId, login } = useSolid();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string>("");
  // Non-admins: flag an entry as "not an app" for the admin (same channel as
  // "Suggest removal" on the app page). Signed out → log in first.
  async function suggestNotAnApp(a: App) {
    if (!isLoggedIn || !webId) {
      login();
      return;
    }
    const why = window.prompt(
      `Suggest that "${a.name}" is not an app (library, testing tool, spec…)? Add a short reason:`,
      "Not an app: "
    );
    if (why === null) return;
    setBusyId(a.id);
    const ok = await requestAppDeletion(webId, a.id, why.trim() || "Not an app");
    setBusyId(null);
    setNote(ok ? `Thanks — suggested "${a.name}" as not an app; the admin will review it.` : "Couldn't reach the admin inbox — please try again.");
  }
  async function excludeApp(a: App) {
    const reason = window.prompt(
      `Mark "${a.name}" as not an app? It disappears from the gallery (restorable from its page). Reason:`,
      "Not an app: library / testing tool"
    );
    if (reason === null) return;
    setBusyId(a.id);
    try {
      await setAppExcluded(a.id, reason.trim() || "Not an app");
      await reloadCatalog();
    } finally {
      setBusyId(null);
    }
  }
  const sorted = useMemo(
    () => [...needsContribution].sort((a, b) => linkRank(a) - linkRank(b)),
    []
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      {/* What this visitor has submitted, before the help-wanted list. */}
      <MySubmissions />

      {/* Apps that need a working link or a real screenshot. */}
      <div className="mt-12 first:mt-0">
        <h1 className="text-2xl font-bold">Help wanted — apps to document</h1>
        {note && (
          <p role="status" className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            {note}
          </p>
        )}
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
                    viewTransition
                    onClick={(e) => armAppTransition(e.currentTarget, a.id)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span
                      data-vt="icon"
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-[11px] font-bold"
                    >
                      {a.icon ? (
                        <img src={a.icon} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initialsFor(a.name)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div data-vt="name" className="truncate text-sm font-semibold">
                        {a.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.category}
                      </div>
                    </div>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${a.name}`}
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => navigate(`/app/${encodeURIComponent(a.id)}`)}>
                        <ImagePlus className="h-4 w-4" /> Add a screenshot
                      </DropdownMenuItem>
                      {link && (
                        <DropdownMenuItem onSelect={() => window.open(link, "_blank", "noopener")}>
                          <ExternalLink className="h-4 w-4" /> Open {isGithub ? "repository" : "site"}
                        </DropdownMenuItem>
                      )}
                      {isAdmin ? (
                        <DropdownMenuItem
                          onSelect={() => excludeApp(a)}
                          disabled={busyId === a.id}
                          className="text-destructive"
                        >
                          <Ban className="h-4 w-4" /> Not an app — exclude
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => suggestNotAnApp(a)} disabled={busyId === a.id}>
                          <Ban className="h-4 w-4" /> Suggest: not an app
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                    {linkLabel(link)}
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

      <ModeratorRequest />
    </div>
  );
}
