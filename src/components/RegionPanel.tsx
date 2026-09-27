import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Trash2, X, Loader2, SquareDashedMousePointer } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { addRegion, deleteRegion, regionsForImage, useRegions, type Region, type RegionRole } from "@/lib/regions";
import { curie, expandTerm, searchTerms, termColor, termInfo, type TermKind } from "@/lib/vocab";
import { deriveAppShape } from "@/lib/shapes";
import { ShapeFrame } from "@/components/ShapeFrame";
import type { Box } from "@/components/RegionOverlay";
import type { App } from "@/lib/apps";
import type { ShapeTerm } from "@/lib/app-shapes";
import { cn } from "@/lib/utils";

// Side panel of the screen detail: the data regions on this screenshot, the
// tool to add one (draw a box, pick the vocabulary term it shows or edits),
// and a preview of the app shape those annotations add up to.
export function RegionPanel({
  app,
  screenId,
  image,
  drawing,
  setDrawing,
  draft,
  setDraft,
  selectedId,
  setSelectedId,
  terms = [],
}: {
  app: App;
  screenId: string;
  image?: string;
  // Classes/properties from the app's own published shapes (lib/app-shapes),
  // offered first in the term picker.
  terms?: ShapeTerm[];
  drawing: boolean;
  setDrawing: (v: boolean) => void;
  draft: Box | null;
  setDraft: (b: Box | null) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const { isLoggedIn, webId, name: myName, isAdmin, login } = useSolid();
  const { regions: all, loading } = useRegions(app.id);
  const regions = useMemo(() => regionsForImage(all, image, screenId), [all, image, screenId]);
  const shape = useMemo(() => deriveAppShape(app, all), [app, all]);
  const [error, setError] = useState("");

  const canDelete = (r: Region) => isAdmin || (!!webId && r.author === webId);

  async function remove(r: Region) {
    if (!window.confirm(`Remove the ${curie(r.term)} box?`)) return;
    setError("");
    try {
      await deleteRegion(r);
      if (selectedId === r.id) setSelectedId(null);
    } catch (err) {
      setError((err as Error).message || "Could not remove the region.");
    }
  }

  function startDrawing() {
    if (!isLoggedIn) {
      login();
      return;
    }
    setSelectedId(null);
    setDraft(null);
    setDrawing(true);
  }
  function cancel() {
    setDraft(null);
    setDrawing(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Data on this screen</div>
          <div className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${regions.length} region${regions.length === 1 ? "" : "s"}`}
          </div>
        </div>
        {drawing ? (
          <button
            type="button"
            onClick={cancel}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={startDrawing}
            disabled={!image}
            title={isLoggedIn ? "Draw a box around a piece of data" : "Log in to mark data"}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Mark data
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {drawing && !draft && (
          <div className="m-4 flex items-start gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
            <SquareDashedMousePointer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              Drag a box around a piece of data on the screenshot — a name, an email, a list of things
              from the pod.
            </span>
          </div>
        )}
        {drawing && draft && image && webId && (
          <RegionForm
            app={app}
            screenId={screenId}
            image={image}
            box={draft}
            webId={webId}
            authorLabel={myName || webIdLabel(webId)}
            terms={terms}
            onDone={cancel}
          />
        )}

        {!loading && regions.length === 0 && !drawing && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No data marked on this screen yet.
            {isLoggedIn ? " Draw a box to say what the app shows here." : " Log in to mark what the app shows here."}
          </p>
        )}

        <ul className="divide-y divide-border">
          {regions.map((r) => (
            <li
              key={r.id}
              onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
              className={cn(
                "group flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60",
                selectedId === r.id && "bg-secondary"
              )}
            >
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: termColor(r.term) }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <code className="text-sm font-medium">{curie(r.term)}</code>
                  {r.termKind === "class" && (
                    <span className="rounded bg-secondary px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      class
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {r.role === "edits" ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {r.role === "edits" ? "edits" : "shows"}
                  </span>
                </div>
                {(r.shape || termInfo(r.term)?.label) && (
                  <div className="text-xs text-muted-foreground">
                    {r.shape ? `in ${curie(r.shape)}` : termInfo(r.term)!.label}
                  </div>
                )}
                {r.note && <div className="mt-0.5 text-sm">{r.note}</div>}
                <div className="mt-0.5 text-[11px] text-muted-foreground">by {r.authorLabel}</div>
              </div>
              {canDelete(r) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(r);
                  }}
                  aria-label="Remove region"
                  className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="px-4 py-2 text-sm text-destructive">{error}</p>}

        {/* what all of this app's regions add up to */}
        <details className="border-t border-border px-4 py-3" open={all.length > 0 && regions.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">
            App data shape
            <span className="ml-2 font-normal text-muted-foreground">
              {shape.properties.length} propert{shape.properties.length === 1 ? "y" : "ies"}
              {shape.classes.length ? `, ${shape.classes.length} class${shape.classes.length === 1 ? "" : "es"}` : ""}
            </span>
          </summary>
          <div className="mt-3">
            <ShapeFrame
              shape={shape}
              compact
              langSwitch
              copyable
              className="max-h-[40vh]"
              empty="Mark data on the app's screens and its shape appears here."
            />
          </div>
        </details>
      </div>
    </div>
  );
}

// Complete a freshly drawn box: which term, shown or edited, optional note.
function RegionForm({
  app,
  screenId,
  image,
  box,
  webId,
  authorLabel,
  terms,
  onDone,
}: {
  app: App;
  screenId: string;
  image: string;
  box: Box;
  webId: string;
  authorLabel: string;
  terms: ShapeTerm[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState<string | null>(null);
  const [shape, setShape] = useState<string | undefined>();
  const [kind, setKind] = useState<TermKind>("property");
  const [role, setRole] = useState<RegionRole>("shows");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggestions = useMemo(() => searchTerms(query, 12, terms), [query, terms]);
  // Typed something that isn't in the pick list — offer it as a custom term.
  const custom = query.trim() && !suggestions.some((t) => curie(t.iri) === query.trim()) ? expandTerm(query) : "";
  const customValid = /^https?:\/\/\S+[#/]\S+$/.test(custom);

  useEffect(() => {
    if (term) {
      const info = termInfo(term) || terms.find((t) => t.iri === term);
      if (info) setKind(info.kind);
    }
  }, [term, terms]);

  function pick(t: { iri: string; shape?: string }) {
    setTerm(t.iri);
    setShape(t.shape);
    setQuery(curie(t.iri));
  }

  async function save() {
    if (!term) return;
    setBusy(true);
    setError("");
    try {
      await addRegion(webId, authorLabel, {
        appId: app.id,
        screenId,
        image,
        ...box,
        term,
        termKind: kind,
        shape,
        role,
        note,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message || "Could not save the region.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-4 space-y-3 rounded-lg border border-border bg-background p-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">What does this region show?</label>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTerm(null);
          }}
          placeholder="vcard:fn, schema:name, ldp:contains …"
          className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {!term && (
          <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border">
            {suggestions.map((t) => (
              <li key={`${t.iri}|${"shapeName" in t ? "shape" : "vocab"}`}>
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-secondary"
                >
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: termColor(t.iri) }} />
                  <code className="shrink-0">{curie(t.iri)}</code>
                  <span className="truncate text-xs text-muted-foreground">{t.label}</span>
                  {"shapeName" in t && (
                    <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground">
                      {(t as ShapeTerm).shapeName}
                    </span>
                  )}
                  {t.kind === "class" && (
                    <span className={cn("shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground", !("shapeName" in t) && "ml-auto")}>class</span>
                  )}
                </button>
              </li>
            ))}
            {custom && (
              <li>
                <button
                  type="button"
                  disabled={!customValid}
                  onClick={() => pick({ iri: custom })}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
                >
                  <span className="text-xs text-muted-foreground">Use</span>
                  <code className="truncate">{custom}</code>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {term && !termInfo(term) && !terms.some((t) => t.iri === term) && (
        <div className="flex gap-3 text-sm">
          {(["property", "class"] as TermKind[]).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {k}
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-1 rounded-full bg-secondary p-1 text-xs font-medium">
        {(
          [
            { key: "shows", Icon: Eye, label: "App shows it" },
            { key: "edits", Icon: Pencil, label: "User can edit it" },
          ] as { key: RegionRole; Icon: typeof Eye; label: string }[]
        ).map(({ key, Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setRole(key)}
            aria-pressed={role === key}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition-colors",
              role === key ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. “from the user's profile card”"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-full px-3 py-1.5 text-xs font-medium hover:bg-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!term || busy}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save region
        </button>
      </div>
    </div>
  );
}

function webIdLabel(webId: string): string {
  try {
    const u = new URL(webId);
    return u.pathname.split("/").filter(Boolean)[0] || u.host;
  } catch {
    return "You";
  }
}
