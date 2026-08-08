import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ExternalLink,
  Github,
  Upload,
  ArrowLeft,
  ImagePlus,
  Trash2,
  GripVertical,
  Braces,
  Tag,
  ListChecks,
  Check,
} from "lucide-react";
import { getApp, initialsFor, screenFrames, screenVideos, frameTags } from "@/lib/apps";
import { PhoneFrame } from "@/components/PhoneFrame";
import { DesktopFrame } from "@/components/DesktopFrame";
import { AppIcon } from "@/components/AppIcon";
import { BookmarkButton } from "@/components/BookmarkButton";
import { useFormFactors, type FormFactor } from "@/lib/use-form-factor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSolid } from "@/lib/solid-context";
import {
  uploadScreenshot,
  listScreenshots,
  fetchImageObjectUrl,
  publishScreenshotsToCatalog,
  deleteUpload,
  removeScreenshotFromCatalog,
  reorderUploads,
  reorderCatalogScreenshots,
  loadUploadTags,
  setUploadTags,
  retagCatalogScreenshot,
} from "@/lib/solid-data";

const SCREEN_PATTERNS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

type Preview = { src: string; kind: "catalog" | "upload"; source: string };

export function AppDetail() {
  const { id } = useParams();
  const app = id ? getApp(decodeURIComponent(id)) : undefined;
  const { isLoggedIn, webId, isAdmin } = useSolid();
  const [shots, setShots] = useState<string[]>([]); // blob URLs (display)
  const [shotUrls, setShotUrls] = useState<string[]>([]); // pod source URLs
  const [uploadTagsMap, setUploadTagsMap] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // A screenshot can show more than one flow (e.g. a combined login/signup
  // screen), so tag selection is multi-select rather than a single pattern.
  const [tags, setTags] = useState<string[]>(["Dashboard"]);
  const [items, setItems] = useState<Preview[]>([]);
  const dragIdx = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-image flow-tag editing (works for both pending uploads and already
  // published catalog frames — the same picker, different persistence).
  const [editing, setEditing] = useState<Preview | null>(null);
  const [editSel, setEditSel] = useState<string[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  // Bulk mode: pick one flow, then click screenshots to add/remove them from
  // it. Catalog edits write straight through and are held in a local
  // override so the grid updates instantly without a full page reload.
  const [flowEditing, setFlowEditing] = useState(false);
  const [editingFlow, setEditingFlow] = useState<string>(SCREEN_PATTERNS[0]);
  const [catalogTagOverrides, setCatalogTagOverrides] = useState<Record<string, string[]>>({});

  async function loadShots(id: string, wid: string) {
    const urls = await listScreenshots(wid, id);
    const [objs, tagMap] = await Promise.all([
      Promise.all(
        urls.map((u) =>
          fetchImageObjectUrl(u)
            .then((src) => ({ u, src }))
            .catch(() => ({ u, src: "" }))
        )
      ),
      loadUploadTags(wid, id),
    ]);
    const ok = objs.filter((o) => o.src);
    setShots(ok.map((o) => o.src));
    setShotUrls(ok.map((o) => o.u));
    setUploadTagsMap(tagMap);
  }

  useEffect(() => {
    if (!app || !isLoggedIn || !webId) return;
    loadShots(app.id, webId);
  }, [app, isLoggedIn, webId]);

  if (!app) {
    return (
      <div className="p-10 text-center text-muted-foreground">App not found.</div>
    );
  }

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!webId || !app || !e.target.files?.length) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      for (const f of Array.from(e.target.files)) {
        await uploadScreenshot(webId, app.id, f, f.name, tags);
      }
      await loadShots(app.id, webId);
      setStatus("Uploaded ✓");
    } catch (err) {
      setStatus(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!app || !shotUrls.length) return;
    setBusy(true);
    setStatus("Publishing to catalog…");
    try {
      const n = await publishScreenshotsToCatalog(
        app.id,
        shotUrls.map((url) => ({ url, tags }))
      );
      // The catalog now owns a copy of these images — remove the uploader's
      // originals so the same screenshot doesn't show up twice after reload.
      await Promise.all(shotUrls.map((url) => deleteUpload(url).catch(() => {})));
      setStatus(`Published ${n} screenshot${n === 1 ? "" : "s"} ✓ Reloading…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setStatus(`Publish failed: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  // Real screenshots — published catalog frames + the current user's own pod
  // uploads. No synthetic placeholders. Each entry tracks its origin so it can
  // be removed/reordered: uploads by their uploader, catalog frames by the admin.
  const previews: Preview[] = [
    ...screenFrames(app.id).map((u) => ({
      src: u,
      kind: "catalog" as const,
      source: u,
    })),
    ...shots.map((blob, idx) => ({
      src: blob,
      kind: "upload" as const,
      source: shotUrls[idx],
    })),
  ];

  // Local, drag-reorderable copy. Re-synced whenever the underlying set changes.
  const sourcesKey = previews.map((p) => p.source).join("|");
  useEffect(() => {
    setItems(previews);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey]);

  const canManage = (p: Preview) => p.kind === "upload" || isAdmin;

  // Auto-detect each screenshot's form factor (wide = desktop) and offer a
  // Mobile/Desktop toggle when both exist.
  const formFactors = useFormFactors(items.map((p) => p.src));
  const ffOf = (p: Preview): FormFactor => formFactors[p.src] || "mobile";
  const hasDesktop = items.some((p) => ffOf(p) === "desktop");
  const hasMobile = items.some((p) => ffOf(p) === "mobile");
  const [view, setView] = useState<FormFactor>("mobile");
  useEffect(() => {
    // Default to whichever exists if the current view has nothing.
    if (view === "mobile" && !hasMobile && hasDesktop) setView("desktop");
    if (view === "desktop" && !hasDesktop && hasMobile) setView("mobile");
  }, [hasMobile, hasDesktop, view]);

  function onDrop(targetIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === targetIdx) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    setItems(next);
    persistOrder(next);
  }

  async function persistOrder(ordered: Preview[]) {
    if (!app) return;
    setStatus("Saving order…");
    try {
      const uploads = ordered.filter((p) => p.kind === "upload").map((p) => p.source);
      const catalog = ordered.filter((p) => p.kind === "catalog").map((p) => p.source);
      if (uploads.length && webId) await reorderUploads(webId, app.id, uploads);
      if (catalog.length > 1 && isAdmin)
        await reorderCatalogScreenshots(app.id, catalog);
      setStatus("Order saved ✓");
    } catch (err) {
      setStatus(`Reorder failed: ${(err as Error).message}`);
    }
  }

  async function removePreview(p: { kind: "catalog" | "upload"; source: string }) {
    if (!app) return;
    const label =
      p.kind === "catalog" ? "Remove this screenshot from the catalog?" : "Delete this screenshot?";
    if (!window.confirm(label)) return;
    setBusy(true);
    setStatus(p.kind === "catalog" ? "Removing from catalog…" : "Deleting…");
    try {
      if (p.kind === "upload") {
        await deleteUpload(p.source);
        if (webId) await loadShots(app.id, webId);
        setStatus("Deleted ✓");
        setBusy(false);
      } else {
        await removeScreenshotFromCatalog(app.id, p.source);
        setStatus("Removed ✓ Reloading…");
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err) {
      setStatus(`Remove failed: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  function currentTags(p: Preview): string[] {
    return p.kind === "upload"
      ? uploadTagsMap[p.source] || []
      : catalogTagOverrides[p.source] ?? frameTags(app!.id, p.source);
  }

  // Add/remove a single flow for one screenshot, optimistically, without
  // disturbing its other flow tags.
  async function toggleFlowMembership(p: Preview) {
    if (!app) return;
    const have = currentTags(p);
    const next = have.includes(editingFlow)
      ? have.filter((t) => t !== editingFlow)
      : [...have, editingFlow];
    if (p.kind === "upload") {
      if (!webId) return;
      setUploadTagsMap((prev) => ({ ...prev, [p.source]: next }));
      try {
        await setUploadTags(webId, app.id, p.source, next);
      } catch (err) {
        setUploadTagsMap((prev) => ({ ...prev, [p.source]: have }));
        setStatus(`Updating flows failed: ${(err as Error).message}`);
      }
    } else {
      setCatalogTagOverrides((prev) => ({ ...prev, [p.source]: next }));
      try {
        await retagCatalogScreenshot(app.id, p.source, next);
      } catch (err) {
        setCatalogTagOverrides((prev) => ({ ...prev, [p.source]: have }));
        setStatus(`Updating flows failed: ${(err as Error).message}`);
      }
    }
  }

  function openEdit(p: Preview) {
    setEditing(p);
    setEditSel(currentTags(p));
  }

  function toggleEditTag(tag: string) {
    setEditSel((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function saveEdit() {
    if (!editing || !app) return;
    setEditBusy(true);
    try {
      if (editing.kind === "upload") {
        if (!webId) return;
        await setUploadTags(webId, app.id, editing.source, editSel);
        setUploadTagsMap((prev) => ({ ...prev, [editing.source]: editSel }));
        setEditing(null);
      } else {
        await retagCatalogScreenshot(app.id, editing.source, editSel);
        setEditing(null);
        setStatus("Flows updated ✓ Reloading…");
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err) {
      setStatus(`Updating flows failed: ${(err as Error).message}`);
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8">
      <Link
        to="/screens"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <AppIcon app={app} size={64} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{app.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{app.category}</Badge>
            {app.status && <Badge>{app.status}</Badge>}
            {app.programmingLanguage && (
              <Badge>{app.programmingLanguage}</Badge>
            )}
          </div>
          {app.description && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              {app.description}
            </p>
          )}
          {app.authors && app.authors.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>By</span>
              {app.authors.map((au) => (
                <Link
                  key={au.id}
                  to={`/author/${encodeURIComponent(au.id)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-medium text-foreground transition hover:border-white/30 hover:bg-secondary"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-bold">
                    {initialsFor(au.name)}
                  </span>
                  {au.name}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <BookmarkButton appId={app.id} variant="button" />
            {app.landingPage && (
              <Button asChild variant="secondary">
                <a href={app.landingPage} target="_blank" rel="noopener">
                  <ExternalLink className="h-4 w-4" /> Open / Sign in
                </a>
              </Button>
            )}
            {app.repository && (
              <Button asChild variant="outline">
                <a href={app.repository} target="_blank" rel="noopener">
                  <Github className="h-4 w-4" /> Repository
                </a>
              </Button>
            )}
            {app.rdf && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Braces className="h-4 w-4" /> View RDF
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>RDF for {app.name}</DialogTitle>
                  </DialogHeader>
                  <pre className="max-h-[60vh] overflow-auto rounded-lg bg-secondary p-4 text-xs">
                    {app.rdf}
                  </pre>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {screenVideos(app.id).length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">Recordings</h2>
          <div className="flex flex-wrap gap-6">
            {screenVideos(app.id).map((v) => (
              <div key={v.path}>
                <video
                  controls
                  playsInline
                  muted
                  loop
                  className="aspect-[9/19.5] w-full max-w-[260px] overflow-hidden rounded-[1.6rem] bg-zinc-900 ring-1 ring-white/10"
                  src={v.path}
                />
                <div className="mt-2 text-sm text-muted-foreground">{v.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Screens</h2>
        {isLoggedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Flow tags for these screenshots"
            >
              <span className="text-xs text-muted-foreground">Flows:</span>
              {SCREEN_PATTERNS.map((p) => {
                const active = tags.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleTag(p)}
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
            {/* Admin: promote their own uploaded screenshots straight into the
                shared catalog (no review queue) — the flows selected above are
                applied as this screenshot's tags. */}
            {isAdmin && shotUrls.length > 0 && (
              <Button
                onClick={publish}
                disabled={busy}
                variant="secondary"
                className="gap-2"
              >
                <ImagePlus className="h-4 w-4" /> Publish to catalog
              </Button>
            )}
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="gap-2"
            >
              <Upload className="h-4 w-4" /> Upload screenshots
            </Button>
            {items.length > 0 && (
              <Button
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
        ) : (
          <span className="text-sm text-muted-foreground">
            Log in to upload screenshots to your pod
          </span>
        )}
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

      {items.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No screenshots yet.{" "}
          {isLoggedIn
            ? "Add the first one below."
            : "Log in to add the first one."}
        </p>
      )}

      {hasDesktop && hasMobile && (
        <div className="mt-4 inline-flex rounded-full bg-secondary p-1 text-sm">
          {(["mobile", "desktop"] as FormFactor[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium capitalize transition-colors",
                view === v
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          "mt-5 grid gap-4",
          view === "desktop"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        )}
      >
        {items.map((p, i) => {
          // Only the active form factor is shown; the other is on the toggle.
          if (ffOf(p) !== view) return null;
          // Uploads are the user's own pod files (the user manages them); catalog
          // frames are managed only by the admin (un-publish / reorder).
          const manage = canManage(p);
          const selected = flowEditing && currentTags(p).includes(editingFlow);
          const frame =
            view === "desktop" ? (
              <DesktopFrame app={app} image={p.src} />
            ) : (
              <PhoneFrame app={app} image={p.src} />
            );
          return (
            <div
              key={p.source || i}
              className="group relative"
              draggable={manage && !flowEditing}
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => manage && !flowEditing && e.preventDefault()}
              onDrop={() => manage && !flowEditing && onDrop(i)}
            >
              {flowEditing ? (
                <button
                  type="button"
                  onClick={() => manage && toggleFlowMembership(p)}
                  disabled={!manage}
                  aria-pressed={selected}
                  className={cn(
                    "block w-full text-left transition",
                    manage ? "hover:opacity-90" : "cursor-not-allowed opacity-50"
                  )}
                >
                  {frame}
                </button>
              ) : (
                <Link
                  to={`/screen/${encodeURIComponent(app.id)}?i=${i}`}
                  className="block transition hover:opacity-90"
                >
                  {frame}
                </Link>
              )}
              {flowEditing
                ? selected && (
                    <span className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow">
                      <Check className="h-4 w-4" />
                    </span>
                  )
                : manage && (
                    <>
                      <span
                        title="Drag to reorder"
                        className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button
                        onClick={() => openEdit(p)}
                        disabled={busy}
                        aria-label="Edit flows"
                        title="Edit flows"
                        className="absolute right-11 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-black/80 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <Tag className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removePreview(p)}
                        disabled={busy}
                        aria-label={
                          p.kind === "catalog" ? "Remove from catalog" : "Delete screenshot"
                        }
                        title={
                          p.kind === "catalog" ? "Remove from catalog" : "Delete screenshot"
                        }
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
            </div>
          );
        })}
        {isLoggedIn && (
          <button
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-2 border border-dashed border-border text-muted-foreground hover:border-white/30 hover:text-foreground",
              view === "desktop" ? "aspect-[16/10] rounded-xl" : "aspect-[9/19.5] rounded-[1.6rem]"
            )}
          >
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">Add</span>
          </button>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit flows</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Flow tags">
            {SCREEN_PATTERNS.map((p) => {
              const active = editSel.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleEditTag(p)}
                  disabled={editBusy}
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
          <Button onClick={saveEdit} disabled={editBusy} className="mt-2 gap-2">
            <Tag className="h-4 w-4" /> Save
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
