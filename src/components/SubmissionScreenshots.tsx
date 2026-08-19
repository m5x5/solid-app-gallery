import { useCallback, useEffect, useRef, useState } from "react";
import { usePasteImages } from "@/lib/use-paste-images";
import { useFormFactors } from "@/lib/use-form-factor";
import { UploadingCard } from "@/components/UploadingCard";
import { Upload, Trash2, GripVertical, Check, ListChecks, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  uploadScreenshot,
  listScreenshots,
  fetchImageObjectUrl,
  deleteUpload,
  reorderUploads,
  loadUploadTags,
  setUploadTags,
  replaceUpload,
} from "@/lib/solid-data";

const SCREEN_PATTERNS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

// The same upload / reorder / flow-tag flow as the "Screens" section on the
// app detail page (src/pages/AppDetail.tsx), scoped down for a submission
// that isn't in the catalog yet: no catalog-frame merge, no admin publish —
// just this uploader's own pod files, keyed by the submission's slug.
export function SubmissionScreenshots({
  appId,
  webId,
}: {
  appId: string;
  webId: string;
}) {
  const [shots, setShots] = useState<string[]>([]); // blob URLs (display)
  const [shotUrls, setShotUrls] = useState<string[]>([]); // pod source URLs
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [newTags, setNewTags] = useState<string[]>(["Dashboard"]);
  const [flowEditing, setFlowEditing] = useState(false);
  const [editingFlow, setEditingFlow] = useState<string>(SCREEN_PATTERNS[0]);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  async function load(fresh = false) {
    const [urls, tagMap] = await Promise.all([
      listScreenshots(webId, appId),
      loadUploadTags(webId, appId),
    ]);
    const objs = await Promise.all(
      urls.map(async (u) => ({ u, src: await fetchImageObjectUrl(u, fresh).catch(() => "") }))
    );
    const ok = objs.filter((o) => o.src);
    setShots(ok.map((o) => o.src));
    setShotUrls(ok.map((o) => o.u));
    setTagsMap(tagMap);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, webId]);

  function toggleNewTag(tag: string) {
    setNewTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // Files currently uploading, with local previews for their placeholder cards.
  const [uploading, setUploading] = useState<{ id: number; preview: string }[]>([]);
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const pending = files.map((f, k) => ({
        id: Date.now() + k,
        preview: URL.createObjectURL(f),
        file: f,
      }));
      setUploading((u) => [...u, ...pending]);
      setBusy(true);
      setStatus("Uploading…");
      try {
        for (const p of pending) {
          await uploadScreenshot(webId, appId, p.file, p.file.name || "screenshot.png", newTags);
        }
        await load();
        setStatus("Uploaded ✓");
      } catch (err) {
        setStatus(`Upload failed: ${(err as Error).message}`);
      } finally {
        setBusy(false);
        setUploading((u) => u.filter((x) => !pending.some((p) => p.id === x.id)));
        pending.forEach((p) => URL.revokeObjectURL(p.preview));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webId, appId, newTags]
  );

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    uploadFiles(Array.from(e.target.files)).finally(() => {
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  // Paste a screenshot (e.g. Cmd+V straight from the OS screenshot tool)
  // anywhere on the page while this section is mounted.
  usePasteImages(uploadFiles);

  // Replace: upload a new version of one screenshot in place (same URL, so its
  // order and flow tags stay).
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const [replacing, setReplacing] = useState<{ url: string; preview: string } | null>(null);
  function askReplace(url: string) {
    replaceTarget.current = url;
    replaceRef.current?.click();
  }
  async function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const url = replaceTarget.current;
    if (replaceRef.current) replaceRef.current.value = "";
    if (!file || !url) return;
    const preview = URL.createObjectURL(file);
    setReplacing({ url, preview });
    setBusy(true);
    setStatus("Uploading new version…");
    try {
      await replaceUpload(url, file);
      await load(true);
      setStatus("Screenshot replaced ✓");
    } catch (err) {
      setStatus(`Replace failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setReplacing(null);
      URL.revokeObjectURL(preview);
    }
  }

  async function removeShot(url: string) {
    if (!window.confirm("Delete this screenshot?")) return;
    setBusy(true);
    setStatus("Deleting…");
    try {
      await deleteUpload(url);
      await load();
      setStatus("Deleted ✓");
    } catch (err) {
      setStatus(`Delete failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(targetIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === targetIdx) return;
    const nextShots = shots.slice();
    const nextUrls = shotUrls.slice();
    const [movedShot] = nextShots.splice(from, 1);
    const [movedUrl] = nextUrls.splice(from, 1);
    nextShots.splice(targetIdx, 0, movedShot);
    nextUrls.splice(targetIdx, 0, movedUrl);
    setShots(nextShots);
    setShotUrls(nextUrls);
    reorderUploads(webId, appId, nextUrls).catch((err) =>
      setStatus(`Reorder failed: ${(err as Error).message}`)
    );
  }

  // Detect each screenshot's own aspect ratio (wide = desktop) so a landscape
  // capture gets the same wide, letterboxed treatment as desktop screenshots
  // elsewhere in the gallery, instead of being cropped into a portrait card.
  const formFactors = useFormFactors(shots);

  async function toggleFlowMembership(url: string) {
    const have = tagsMap[url] || [];
    const next = have.includes(editingFlow)
      ? have.filter((t) => t !== editingFlow)
      : [...have, editingFlow];
    setTagsMap((prev) => ({ ...prev, [url]: next }));
    try {
      await setUploadTags(webId, appId, url, next);
    } catch (err) {
      setTagsMap((prev) => ({ ...prev, [url]: have }));
      setStatus(`Tag failed: ${(err as Error).message}`);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Screenshots</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Flow tags for new uploads"
          >
            <span className="text-xs text-muted-foreground">Flows:</span>
            {SCREEN_PATTERNS.map((p) => {
              const active = newTags.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleNewTag(p)}
                  disabled={busy}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onFiles}
            data-testid="screenshot-input"
          />
          <input
            ref={replaceRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onReplaceFile}
            data-testid="screenshot-replace-input"
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="gap-2"
          >
            <Upload className="h-4 w-4" /> Upload screenshots
          </Button>
          {shotUrls.length > 0 && (
            <Button
              type="button"
              onClick={() => setFlowEditing((v) => !v)}
              disabled={busy}
              variant={flowEditing ? "secondary" : "outline"}
              className="gap-2"
            >
              <ListChecks className="h-4 w-4" />
              {flowEditing ? "Done" : "Assign flows"}
            </Button>
          )}
        </div>
      </div>

      {flowEditing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-sm text-muted-foreground">Editing:</span>
          {SCREEN_PATTERNS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setEditingFlow(p)}
              aria-pressed={editingFlow === p}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                editingFlow === p
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {p}
            </button>
          ))}
          <span className="text-xs text-muted-foreground sm:ml-auto">
            Click a screenshot to add or remove it from "{editingFlow}".
          </span>
        </div>
      )}
      {status && <p className="mt-2 text-sm text-muted-foreground">{status}</p>}

      {shotUrls.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No screenshots yet. Add one so reviewers can see the app in action —
          or just paste one (Cmd/Ctrl+V).
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {shotUrls.map((url, i) => {
          const selected = flowEditing && (tagsMap[url] || []).includes(editingFlow);
          const isDesktop = formFactors[shots[i]] === "desktop";
          return (
            <div
              key={url}
              className={cn("group relative", isDesktop && "col-span-2")}
              draggable={!flowEditing}
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => !flowEditing && e.preventDefault()}
              onDrop={() => !flowEditing && onDrop(i)}
            >
              <button
                type="button"
                onClick={() => flowEditing && toggleFlowMembership(url)}
                disabled={!flowEditing}
                aria-pressed={flowEditing ? selected : undefined}
                className={cn(
                  "block w-full overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10 transition",
                  isDesktop ? "aspect-[16/10]" : "aspect-[9/16] bg-zinc-900",
                  flowEditing ? "hover:opacity-90" : "cursor-grab active:cursor-grabbing"
                )}
              >
                <img
                  src={shots[i]}
                  alt=""
                  className={cn(
                    "h-full w-full",
                    isDesktop ? "object-contain" : "object-cover"
                  )}
                />
              </button>
              {replacing?.url === url && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/60 text-white backdrop-blur-sm">
                  <img
                    src={replacing.preview}
                    alt=""
                    className="absolute inset-0 -z-10 h-full w-full rounded-xl object-cover opacity-40"
                  />
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-medium">Uploading new version…</span>
                </div>
              )}
              {flowEditing ? (
                selected && (
                  <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow">
                    <Check className="h-4 w-4" />
                  </span>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => askReplace(url)}
                    disabled={busy}
                    title="Upload a new version"
                    aria-label="Upload a new version"
                    className="absolute right-11 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-black/80 group-hover:opacity-100 disabled:opacity-40"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <span
                    title="Drag to reorder"
                    className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => removeShot(url)}
                    title="Delete"
                    className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {uploading.map((u) => (
          <UploadingCard key={u.id} preview={u.preview} aspect="aspect-[9/16]" rounded="rounded-xl" />
        ))}
      </div>
    </div>
  );
}
