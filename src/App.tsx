import { Outlet, NavLink, useLocation, type RouteObject } from "react-router-dom";
import { Agentation } from "agentation";
import { TopNav } from "@/components/TopNav";
import { Discover } from "@/pages/Discover";
import { Screens } from "@/pages/Screens";
import { Flows } from "@/pages/Flows";
import { Submit } from "@/pages/Submit";
import { AppDetail } from "@/pages/AppDetail";
import { AuthorDetail } from "@/pages/AuthorDetail";
import { Participation } from "@/pages/Participation";
import { Bookmarks } from "@/pages/Bookmarks";
import { Inbox } from "@/pages/Inbox";
import { ScreenDetail } from "@/pages/ScreenDetail";
import { Review } from "@/pages/Review";
import { About } from "@/pages/About";
import { useSolid } from "@/lib/solid-context";
import { useEffect, useState } from "react";
import { useDevice, type Device } from "@/lib/device-context";
import { useShapeLang } from "@/lib/shape-lang-context";
import { SHAPE_LANGS } from "@/lib/shapes";
import { subscribeCatalog } from "@/lib/apps";
import { usePendingSubmissionFlush } from "@/lib/use-pending-flush";
import { Smartphone, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppErrorBoundary } from "@/components/ErrorBoundary";

const SUBNAV = [
  { to: "/", label: "Discover", end: true },
  { to: "/screens", label: "Screens" },
  { to: "/flows", label: "Flows" },
  { to: "/participation", label: "Participation" },
];

// Routes whose screenshots are actually split by device (Discover, Screens,
// and an author's screenshot grid) — everywhere else the toggle would be a
// no-op, so it's hidden there instead of sitting around doing nothing.
function deviceToggleApplies(pathname: string): boolean {
  return pathname === "/" || pathname === "/screens" || pathname.startsWith("/author/");
}

// App pages render data shapes; the screen detail carries an inline switch.
function shapeLangApplies(pathname: string): boolean {
  return pathname.startsWith("/app/");
}

function SubNav() {
  const { isAdmin } = useSolid();
  const { pathname } = useLocation();
  const items = isAdmin
    ? [...SUBNAV, { to: "/review", label: "Review" }]
    : SUBNAV;
  return (
    <div className="border-b border-border">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 overflow-x-auto px-4 md:px-8">
        {items.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={(s as { end?: boolean }).end}
            className={({ isActive }) =>
              cn(
                "relative shrink-0 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            {s.label}
          </NavLink>
        ))}
        {shapeLangApplies(pathname) && <ShapeLangToggle className="ml-auto" />}
        {deviceToggleApplies(pathname) && <DeviceToggle />}
      </div>
    </div>
  );
}

// Global shape-notation switch — LinkML / SHACL / ShEx for every shape panel.
function ShapeLangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useShapeLang();
  return (
    <div className={cn("flex shrink-0 items-center gap-1 rounded-full bg-secondary p-1", className)}>
      {SHAPE_LANGS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setLang(key)}
          aria-pressed={lang === key}
          title={`Show shapes as ${label}`}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
            lang === key
              ? "bg-background text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Global Mobile/Desktop switch — chooses which screenshots the gallery grids show.
function DeviceToggle() {
  const { device, setDevice } = useDevice();
  const opts: { key: Device; Icon: typeof Smartphone; label: string }[] = [
    { key: "mobile", Icon: Smartphone, label: "Mobile" },
    { key: "desktop", Icon: Monitor, label: "Desktop" },
  ];
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-secondary p-1">
      {opts.map(({ key, Icon, label }) => (
        <button
          key={key}
          onClick={() => setDevice(key)}
          aria-label={label}
          aria-pressed={device === key}
          title={label}
          className={cn(
            "flex h-7 w-8 items-center justify-center rounded-full transition-colors",
            device === key
              ? "bg-background text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

// The page routes, mounted as data routes under the App layout (main.tsx),
// so router features like <Link viewTransition> work from inside pages.
export const routes: RouteObject[] = [
  { path: "/", element: <Discover /> },
  { path: "/screens", element: <Screens /> },
  { path: "/flows", element: <Flows /> },
  { path: "/participation", element: <Participation /> },
  { path: "/submit", element: <Submit /> },
  { path: "/bookmarks", element: <Bookmarks /> },
  { path: "/inbox", element: <Inbox /> },
  { path: "/review", element: <Review /> },
  { path: "/about", element: <About /> },
  { path: "/app/:id", element: <AppDetail /> },
  { path: "/author/:id", element: <AuthorDetail /> },
  { path: "/screen/:id", element: <ScreenDetail /> },
];

export default function App() {
  // Flush submissions made while logged out as soon as a session exists.
  usePendingSubmissionFlush();
  // Bump on every in-app catalog reload; keying <main> remounts the current
  // page so it re-reads the (module-level) catalog lists.
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => subscribeCatalog(() => setCatalogVersion((v) => v + 1)), []);
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <SubNav />
      <main key={catalogVersion}>
        {/* A crashing page keeps the nav usable and recovers on navigation. */}
        <AppErrorBoundary>
          <Outlet />
        </AppErrorBoundary>
      </main>
      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
