import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import {
  apps,
  categories,
  qualityRank,
  appHasDevice,
  screenPatternCounts,
  flowActionCounts,
} from "@/lib/apps";
import { DiscoverCard } from "@/components/cards";
import { useDevice } from "@/lib/device-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const TABS = ["Latest", "Most popular", "Top rated"] as const;
type Tab = (typeof TABS)[number];

const FLOW_ACTION_LABELS: Record<string, string> = {
  Onboarding: "Onboarding",
  Login: "Logging In",
  Signup: "Creating Account",
  Browsing: "Browsing",
  Profile: "Editing Profile",
};

function QuickLinks() {
  const cols: { title: string; links: { label: string; to: string }[] }[] = [
    {
      title: "Categories",
      links: categories
        .slice(0, 5)
        .map((c) => ({ label: c.label, to: `/screens?cat=${c.key}` })),
    },
    {
      title: "Screens",
      // Only patterns that actually exist in the captured/tagged screenshots.
      links: screenPatternCounts().map((p) => ({
        label: p.tag,
        to: `/screens?pattern=${p.tag}`,
      })),
    },
    {
      title: "Flows",
      links: flowActionCounts().map((p) => ({
        label: FLOW_ACTION_LABELS[p.action] || p.action,
        to: `/flows?action=${p.action}`,
      })),
    },
    {
      title: "Participate",
      links: [
        { label: "Get a Pod", to: "/participation" },
        { label: "Join a Discussion", to: "/participation" },
        { label: "Submit your app", to: "/submit" },
      ],
    },
  ];
  return (
    <div className="hidden gap-x-6 gap-y-8 md:grid md:grid-cols-4 md:gap-x-10">
      {cols.map((col) => (
        <div key={col.title}>
          <div className="mb-3 text-sm text-muted-foreground">{col.title}</div>
          <ul className="space-y-2">
            {col.links.map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  className="text-lg font-semibold leading-tight hover:underline md:text-xl"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Machine-readable description of what this app can do, per the W3C
// Application Capability spec (https://dokieli.github.io/application-capability/):
// affordances (actions), how to invoke them (a URI template), and what they
// need. Marked up as RDFa directly on the visible text — the same content a
// person reads is what an agent parses, no separate JSON-LD side-channel.
function CapabilityFooter() {
  return (
    <footer
      vocab="https://www.w3.org/ns/ac#"
      prefix="hydra: http://www.w3.org/ns/hydra/core# as: https://www.w3.org/ns/activitystreams#"
      resource="/"
      typeof="Application"
      className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground">Application Capability</p>
      <p className="mt-2 max-w-2xl">
        This page describes what it can do using the{" "}
        <a
          href="https://dokieli.github.io/application-capability/"
          target="_blank"
          rel="noopener"
          className="underline hover:text-foreground"
        >
          Application Capability
        </a>{" "}
        vocabulary, marked up here as RDFa so other apps and agents can
        discover and invoke it directly.
      </p>
      <ul className="mt-3 max-w-2xl space-y-2">
        <li property="capability" typeof="Capability" resource="#capability-open">
          <link property="action" href="as:View" />
          <meta property="output" content="text/html" />
          Open a specific app's page at{" "}
          <code
            property="invocation"
            typeof="hydra:IriTemplate"
            resource="#invocation-open"
          >
            <span property="hydra:template" content="/app/{open}">
              /app/{"{open}"}
            </span>
            <span
              property="hydra:mapping"
              typeof="hydra:IriTemplateMapping"
              resource="#mapping-open"
              className="hidden"
            >
              <meta property="hydra:variable" content="open" />
              <link property="hydra:property" href="open" />
            </span>
          </code>
          .
        </li>
        <li property="capability" typeof="Capability" resource="#capability-search">
          <link property="action" href="as:View" />
          <meta property="output" content="text/html" />
          Search apps at{" "}
          <code
            property="invocation"
            typeof="hydra:IriTemplate"
            resource="#invocation-search"
          >
            <span property="hydra:template" content="/screens?q={search}">
              /screens?q={"{search}"}
            </span>
            <span
              property="hydra:mapping"
              typeof="hydra:IriTemplateMapping"
              resource="#mapping-search"
              className="hidden"
            >
              <meta property="hydra:variable" content="search" />
              <link property="hydra:property" href="search" />
            </span>
          </code>
          .
        </li>
      </ul>
    </footer>
  );
}

export function Discover() {
  const [tab, setTab] = useState<Tab>("Latest");
  const [cat, setCat] = useState("");
  const { device } = useDevice();
  const catLabel = categories.find((c) => c.key === cat)?.label;

  const sorted = useMemo(() => {
    // Only apps that have a screenshot for the selected viewport.
    const list = apps.filter(
      (a) => appHasDevice(a.id, device) && (!cat || a.categoryKey === cat)
    );
    if (tab === "Latest") {
      list.sort(
        (a, b) =>
          new Date(b.modified || 0).getTime() -
          new Date(a.modified || 0).getTime()
      );
    } else if (tab === "Top rated") {
      list.sort((a, b) =>
        (a.status === "Production" ? -1 : 1) -
        (b.status === "Production" ? -1 : 1)
      );
    } else {
      list.sort((a, b) => (b.description.length || 0) - (a.description.length || 0));
    }
    // Quality tiers first (real app UI → repository → docs → no screenshot),
    // preserving the tab's ordering within each tier (stable sort).
    return list
      .map((a, idx) => ({ a, idx }))
      .sort((x, y) => qualityRank(x.a.id) - qualityRank(y.a.id) || x.idx - y.idx)
      .map((e) => e.a);
  }, [tab, device, cat]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-8 md:px-8 md:py-8">
      <QuickLinks />

      <div className="mt-0 flex items-center justify-between border-b border-border md:mt-12">
        <div className="flex items-center gap-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative py-3 text-sm font-medium transition-colors",
                tab === t
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 text-sm hover:text-foreground",
                cat ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {catLabel ? `Filter: ${catLabel}` : "Filter"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setCat("")}>All categories</DropdownMenuItem>
            {categories.map((c) => (
              <DropdownMenuItem key={c.key} onClick={() => setCat(c.key)}>
                {c.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-5",
          device === "desktop"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}
      >
        {sorted.map((app) => (
          <DiscoverCard key={app.id} app={app} />
        ))}
      </div>

      <CapabilityFooter />
    </div>
  );
}
