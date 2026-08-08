import { Link, useNavigate } from "react-router-dom";
import { Search, Bookmark, Globe, Bell, Plus, LogOut, User, Menu } from "lucide-react";
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
import { useSolid } from "@/lib/solid-context";
import { useBookmarks } from "@/lib/bookmarks";
import { DEFAULT_IDP } from "@/lib/solid-auth";

export function TopNav() {
  const { isLoggedIn, webId, name, avatar, login, logout } = useSolid();
  const { count: bookmarkCount } = useBookmarks();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [idp, setIdp] = useState(DEFAULT_IDP);
  const [loginOpen, setLoginOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/screens?q=${encodeURIComponent(query)}`);
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
      <Link to="/" className="flex items-center gap-2 font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          ◆
        </span>
        <span className="hidden sm:inline">Solid Gallery</span>
      </Link>
      <nav className="ml-2 hidden items-center gap-4 text-sm font-medium text-muted-foreground md:flex">
        <Link to="/" className="text-foreground">
          Apps
        </Link>
        <Link to="/participation" className="hover:text-foreground">
          Participation
        </Link>
      </nav>

      <form
        onSubmit={onSearch}
        className="relative mx-auto flex w-full max-w-xl items-center"
      >
        <Search className="absolute left-4 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Solid apps & services…"
          className="h-11 rounded-full pl-11"
        />
      </form>

      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isLoggedIn && (
              <div className="flex items-center gap-2 px-2.5 py-2">
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
              </div>
            )}
            <div className="px-1 pb-1 pt-1">
              <DropdownMenuItem
                onClick={() => navigate("/submit")}
                className="justify-center bg-primary font-semibold text-primary-foreground hover:bg-primary/90 focus:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Submit app
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/bookmarks")}>
              <Bookmark className="h-4 w-4" />
              Bookmarks{bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Globe className="h-4 w-4" /> Language
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Bell className="h-4 w-4" /> Notifications
            </DropdownMenuItem>
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
        <Button variant="ghost" size="icon" className="hidden md:inline-flex">
          <Globe className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="hidden md:inline-flex">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Submit app / log in / log out live only in the burger menu above */}
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
            <Input value={idp} onChange={(e) => setIdp(e.target.value)} />
            <Button onClick={() => login(idp)} className="w-full">
              Continue to log in
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
