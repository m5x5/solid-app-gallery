import { useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSolid } from "@/lib/solid-context";
import { cn } from "@/lib/utils";

// Public Solid identity providers offered as quick picks below the search field.
const POD_PROVIDERS = [
  { label: "Solid Community", url: "https://solidcommunity.net/" },
  { label: "solidweb.org", url: "https://solidweb.org/" },
  { label: "Inrupt PodSpaces", url: "https://login.inrupt.com/" },
];
const IDP_STORAGE_KEY = "solid-gallery.identity-provider";

function readSavedIdp(): string {
  try {
    return window.localStorage.getItem(IDP_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveIdp(value: string) {
  try {
    if (value.trim()) window.localStorage.setItem(IDP_STORAGE_KEY, value);
    else window.localStorage.removeItem(IDP_STORAGE_KEY);
  } catch {
    // The sign-in picker still works if browser storage is unavailable.
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function ProviderIcon({ url, custom }: { url: string; custom: boolean }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let image: HTMLImageElement | undefined;
    const timer = window.setTimeout(() => {
      image = new Image();
      image.onload = () => {
        if (!cancelled) setLoadedUrl(url);
      };
      image.src = `/api/icon?url=${encodeURIComponent(url)}`;
    }, custom ? 400 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (image) image.onload = null;
    };
  }, [url, custom]);

  return loadedUrl === url ? (
    <img
      src={`/api/icon?url=${encodeURIComponent(url)}`}
      alt=""
      className="h-6 w-6 shrink-0 object-contain"
    />
  ) : (
    <Globe aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" />
  );
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { login } = useSolid();
  // Remember a custom provider/WebID between visits while keeping the default
  // picker state empty for users who have not entered one.
  const [idp, setIdp] = useState(readSavedIdp);
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
  const providerResults: { label: string; url: string; custom?: boolean }[] =
    qRaw && !isKnownUrl
      ? [...matches, { label: idp.trim(), url: /^https?:\/\//i.test(idp.trim()) ? idp.trim() : `https://${idp.trim()}`, custom: true }]
      : matches;

  function pickProvider(url: string) {
    setPendingUrl(url);
    login(url).catch(() => setPendingUrl(null));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in with Solid</DialogTitle>
          <DialogDescription>
            Authenticate with your Solid Identity Provider to upload
            screenshots and submit apps.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor="identity-provider" className="text-sm font-medium">Identity Provider or WebID</label>
          <Input
            id="identity-provider"
            value={idp}
            onChange={(e) => {
              const value = e.target.value;
              setIdp(value);
              saveIdp(value);
            }}
            placeholder="your-pod-provider.com"
          />
        </div>
        {/* Keep space for three provider rows so filtering doesn't move the dialog. */}
        <ul className="-mx-2 h-[10.5rem] overflow-y-auto">
          {providerResults.map((p) => (
            <li key={p.custom ? "custom-provider" : p.url}>
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
                  <ProviderIcon url={p.url} custom={!!p.custom} />
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
  );
}
