import { Link, useNavigate } from "react-router-dom";
import { Bookmark, Plus, LogOut, User, Menu, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchBox } from "@/components/SearchBox";
import { useSolid } from "@/lib/solid-context";
import { useBookmarks } from "@/lib/bookmarks";
import { DEFAULT_IDP } from "@/lib/solid-auth";
import { cn } from "@/lib/utils";

// Well-known public Solid identity providers, offered as quick picks below
// the search field. The user's own pod (DEFAULT_IDP) is listed first.
const POD_PROVIDERS = [
  { label: "Solid Gallery Pod", url: DEFAULT_IDP },
  { label: "Solid Community", url: "https://solidcommunity.net/" },
  { label: "solidweb.org", url: "https://solidweb.org/" },
  { label: "Inrupt PodSpaces", url: "https://login.inrupt.com/" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}
function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostOf(url)}&sz=64`;
}

export function TopNav() {
  const { isLoggedIn, webId, name, avatar, login, logout } = useSolid();
  const { count: bookmarkCount } = useBookmarks();
  const navigate = useNavigate();
  // Starts empty so the picker's default state is the full provider list —
  // typing narrows it, it doesn't pre-fill a URL the filter has to undo.
  const [idp, setIdp] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  // Which provider URL the user just clicked — redirecting to an IdP can take
  // a moment, so that item shows a spinner instead of its favicon meanwhile.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Popular providers filtered by the typed query; if nothing typed yet,
  // the full list shows. A non-matching query gets a synthetic "custom"
  // result at the end so the user can pick their own pod straight from
  // the list, same as the presets. Query and provider hosts are both
  // normalized to bare hostnames so a pasted full URL still matches.
  const qRaw = idp.trim().toLowerCase();
  const qHost = qRaw ? hostOf(idp).toLowerCase() : "";
  const matches = !qRaw
    ? POD_PROVIDERS
    : POD_PROVIDERS.filter((p) => {
        const host = hostOf(p.url).toLowerCase();
        return (
          p.label.toLowerCase().includes(qRaw) ||
          host.includes(qHost) ||
          qHost.includes(host)
        );
      });
  const isKnownUrl = qRaw !== "" && POD_PROVIDERS.some((p) => hostOf(p.url).toLowerCase() === qHost);
  const providerResults =
    qRaw && !isKnownUrl
      ? [...matches, { label: idp, url: idp.startsWith("http") ? idp : `https://${idp}/` }]
      : matches;

  function pickProvider(url: string) {
    setPendingUrl(url);
    login(url).catch(() => setPendingUrl(null));
  }


  const initials = (() => {
    if (name) return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    if (!webId) return "ME";
    try {
      const u = new URL(webId);
      return (u.pathname.split("/").filter(Boolean)[0] || u.host).slice(0, 2).toUpperCase();
    } catch {
      return "ME";
    }
  })();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <Link to="/" className="flex shrink-0 items-center gap-2 font-bold">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <svg viewBox="146 146 220 220" className="h-4 w-4" aria-hidden="true">
            <path d="M256 146 L366 256 L256 366 L146 256 Z" fill="currentColor" />
          </svg>
        </span>
        <span className="hidden whitespace-nowrap sm:inline">Solid Gallery</span>
      </Link>
      <SearchBox />

      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Mobile menu trigger: the user's avatar when signed in (same menu),
                the burger otherwise. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label={isLoggedIn ? "Account menu" : "Menu"}
              className="md:hidden"
            >
              {isLoggedIn ? (
                <Avatar className="h-7 w-7">
                  {avatar && !avatarError ? (
                    <img
                      src={avatar}
                      alt=""
                      className="aspect-square h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <AvatarFallback>{initials}</AvatarFallback>
                  )}
                </Avatar>
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isLoggedIn && (
              <DropdownMenuItem
                onClick={() => webId && navigate(`/author/${encodeURIComponent(webId)}`)}
                className="items-center gap-2 px-2.5 py-2 md:hidden"
                title="Your profile & activity"
              >
                <Avatar className="h-8 w-8">
                  {avatar && !avatarError ? (
                    <img
                      src={avatar}
                      alt=""
                      className="aspect-square h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <AvatarFallback>{initials}</AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0">
                  {name && <div className="truncate text-sm font-medium">{name}</div>}
                  <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                    {webId}
                  </div>
                </div>
              </DropdownMenuItem>
            )}
            <div className="px-1 pb-1 pt-1 md:hidden">
              <DropdownMenuItem
                onClick={() => navigate("/submit")}
                className="justify-center bg-primary font-semibold text-primary-foreground hover:bg-primary/90 focus:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Submit app
              </DropdownMenuItem>
            </div>
            <div className="md:hidden">
              <DropdownMenuSeparator />
            </div>
            <DropdownMenuItem onClick={() => navigate("/bookmarks")}>
              <Bookmark className="h-4 w-4" />
              Bookmarks{bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}
            </DropdownMenuItem>
            <div className="md:hidden">
              <DropdownMenuSeparator />
              {isLoggedIn ? (
                <DropdownMenuItem className="text-destructive" onClick={() => logout()}>
                  <LogOut className="h-4 w-4" /> Log out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setLoginOpen(true)}>
                  <User className="h-4 w-4" /> Log in
                </DropdownMenuItem>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative hidden md:inline-flex"
        >
          <Link to="/bookmarks" aria-label="Bookmarks">
            <Bookmark className="h-5 w-5" />
            {bookmarkCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {bookmarkCount}
              </span>
            )}
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm" className="ml-1 hidden md:inline-flex">
          <Link to="/submit">
            <Plus className="h-4 w-4" /> Submit app
          </Link>
        </Button>
        {isLoggedIn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Account"
                className="hidden md:inline-flex"
              >
                <Avatar className="h-7 w-7">
                  {avatar && !avatarError ? (
                    <img
                      src={avatar}
                      alt=""
                      className="aspect-square h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <AvatarFallback>{initials}</AvatarFallback>
                  )}
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => webId && navigate(`/author/${encodeURIComponent(webId)}`)}
                className="flex-col items-start gap-0 px-2.5 py-2"
                title="Your profile & activity"
              >
                {name && <div className="truncate text-sm font-medium">{name}</div>}
                <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {webId}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => webId && navigate(`/author/${encodeURIComponent(webId)}`)}
              >
                <User className="h-4 w-4" /> Your activity
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => logout()}>
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            className="ml-1 hidden md:inline-flex"
            onClick={() => setLoginOpen(true)}
          >
            <User className="h-4 w-4" /> Log in
          </Button>
        )}

        {/* Log in / log out live only in the burger menu above; Submit app is
            promoted to the toolbar on desktop and stays in the menu on mobile. */}
        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log in with Solid</DialogTitle>
              <DialogDescription>
                Authenticate with your Solid Identity Provider to upload
                screenshots and submit apps.
              </DialogDescription>
            </DialogHeader>
            <label className="text-sm font-medium">Identity Provider</label>
            <Input
              value={idp}
              onChange={(e) => setIdp(e.target.value)}
              placeholder="https://your-pod-provider.com"
            />
            <ul className="-mx-2 max-h-64 overflow-y-auto">
              {providerResults.map((p) => (
                <li key={p.url}>
                  <button
                    type="button"
                    onClick={() => pickProvider(p.url)}
                    disabled={!!pendingUrl}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-secondary disabled:pointer-events-none",
                      pendingUrl && pendingUrl !== p.url && "opacity-40"
                    )}
                  >
                    {pendingUrl === p.url ? (
                      <Loader2 className="h-6 w-6 shrink-0 animate-spin" />
                    ) : (
                      <img
                        src={faviconFor(p.url)}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {hostOf(p.url)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
