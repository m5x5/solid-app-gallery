import { Link, useNavigate } from "react-router-dom";
import { Bookmark, Bell, Plus, LogOut, User, Menu } from "lucide-react";
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
import { SearchBox } from "@/components/SearchBox";
import { useSolid } from "@/lib/solid-context";
import { useBookmarks } from "@/lib/bookmarks";
import { useInbox } from "@/lib/inbox";
import { AuthDialog } from "@/components/AuthDialog";

const PROFILE_RDFA_PREFIXES =
  "foaf: http://xmlns.com/foaf/0.1/ vcard: http://www.w3.org/2006/vcard/ns#";

export function TopNav() {
  const { isLoggedIn, webId, name, nameProperty, avatar, avatarProperty, logout } = useSolid();
  const { count: bookmarkCount } = useBookmarks();
  const { unread } = useInbox();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
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
                <Avatar
                  about={webId}
                  typeof="foaf:Person"
                  prefix={PROFILE_RDFA_PREFIXES}
                  className="h-7 w-7"
                >
                  {avatar && !avatarError ? (
                    <img
                      property={avatarProperty}
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
                about={webId}
                typeof="foaf:Person"
                prefix={PROFILE_RDFA_PREFIXES}
                onClick={() => webId && navigate(`/author/${encodeURIComponent(webId)}`)}
                className="items-center gap-2 px-2.5 py-2 md:hidden"
                title="Your profile & activity"
              >
                <Avatar className="h-8 w-8">
                  {avatar && !avatarError ? (
                    <img
                      property={avatarProperty}
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
                  {name && (
                    <div property={nameProperty} className="truncate text-sm font-medium">
                      {name}
                    </div>
                  )}
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
            {isLoggedIn && (
              <DropdownMenuItem onClick={() => navigate("/inbox")}>
                <Bell className="h-4 w-4" />
                Inbox{unread > 0 ? ` (${unread} unread)` : ""}
              </DropdownMenuItem>
            )}
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
        {isLoggedIn && (
          <Button asChild variant="ghost" size="icon" className="relative">
            <Link to="/inbox" aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unread}
                </span>
              )}
            </Link>
          </Button>
        )}
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
                <Avatar
                  about={webId}
                  typeof="foaf:Person"
                  prefix={PROFILE_RDFA_PREFIXES}
                  className="h-7 w-7"
                >
                  {avatar && !avatarError ? (
                    <img
                      property={avatarProperty}
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
                about={webId}
                typeof="foaf:Person"
                prefix={PROFILE_RDFA_PREFIXES}
                onClick={() => webId && navigate(`/author/${encodeURIComponent(webId)}`)}
                className="flex-col items-start gap-0 px-2.5 py-2"
                title="Your profile & activity"
              >
                {name && (
                  <div property={nameProperty} className="truncate text-sm font-medium">
                    {name}
                  </div>
                )}
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
            className="ml-1 hidden bg-brand text-brand-foreground hover:bg-brand/90 md:inline-flex"
            onClick={() => setLoginOpen(true)}
          >
            <User className="h-4 w-4" /> Log in
          </Button>
        )}

        <AuthDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    </header>
  );
}
