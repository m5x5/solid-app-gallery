import { Routes, Route, NavLink } from "react-router-dom";
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
import { ScreenDetail } from "@/pages/ScreenDetail";
import { Review } from "@/pages/Review";
import { useSolid } from "@/lib/solid-context";
import { useDevice, type Device } from "@/lib/device-context";
import { Smartphone, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBNAV = [
  { to: "/", label: "Discover", end: true },
  { to: "/screens", label: "Screens" },
  { to: "/flows", label: "Flows" },
  { to: "/participation", label: "Participation" },
];

function SubNav() {
  const { isAdmin } = useSolid();
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
        <DeviceToggle />
      </div>
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

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <SubNav />
      <main>
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/screens" element={<Screens />} />
          <Route path="/flows" element={<Flows />} />
          <Route path="/participation" element={<Participation />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/review" element={<Review />} />
          <Route path="/app/:id" element={<AppDetail />} />
          <Route path="/author/:id" element={<AuthorDetail />} />
          <Route path="/screen/:id" element={<ScreenDetail />} />
        </Routes>
      </main>
      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
