import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useAppShapes, useShapeText, type Capability } from "@/lib/app-shapes";
import { useShapeLang } from "@/lib/shape-lang-context";
import { SHAPE_LANGS, type ShapeLang } from "@/lib/shapes";
import { ShapeFrame } from "@/components/ShapeFrame";
import { curie } from "@/lib/vocab";
import type { App } from "@/lib/apps";
import { cn } from "@/lib/utils";

// The shapes an app publishes on its own landing page (W3C Application
// Capability RDFa, read via api/app-shapes): one chip per shape, the chosen
// one shown in the visitor's notation — or the nearest the app provides —
// plus the capabilities that reference them (read/write, accepted types).
export function PublishedShapes({ app, className }: { app: App; className?: string }) {
  const { data, loading } = useAppShapes(app);
  const { lang } = useShapeLang();
  const [selected, setSelected] = useState<string | null>(null);
  const shape = data.shapes.find((s) => s.name === selected) || data.shapes[0];
  useEffect(() => {
    if (!selected && data.shapes[0]) setSelected(data.shapes[0].name);
  }, [data.shapes, selected]);

  // The requested notation when the app ships it, otherwise the first it does.
  const available = shape ? (Object.keys(shape.formats) as ShapeLang[]) : [];
  const shown: ShapeLang | undefined = shape ? (shape.formats[lang] ? lang : available[0]) : undefined;
  const url = shape && shown ? shape.formats[shown] : undefined;
  const { text, loading: textLoading } = useShapeText(url);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking {app.domain || "the app"} for published shapes…
      </div>
    );
  }
  if (!data.shapes.length && !data.capabilities.length) return null;

  const shapeCaps = data.capabilities.filter((c) => c.shapes.length || c.resourceTypes.length);

  return (
    <section className={className}>
      <h2 className="mb-1 text-lg font-semibold">Published shapes</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        The shapes {app.name} declares on its own site (Application Capability RDFa) for the data it
        reads and writes. Switch the notation in the bar above.
      </p>
      {data.shapes.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.shapes.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelected(s.name)}
                aria-pressed={shape?.name === s.name}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                  shape?.name === s.name
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          {shape && (
            <ShapeFrame
              text={textLoading ? "" : text}
              title={url ? url.split("/").pop() : shape.name}
              lang={shown}
              available={available}
              langSwitch
              copyable
              className="max-h-[70vh]"
              empty={textLoading ? "Loading…" : "Could not load this shape."}
            />
          )}
          {shape && shown && shown !== lang && (
            <p className="mt-2 text-xs text-muted-foreground">
              {app.name} doesn't publish this shape as {SHAPE_LANGS.find((l) => l.key === lang)?.label}; showing{" "}
              {SHAPE_LANGS.find((l) => l.key === shown)?.label}.
            </p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> {url}
            </a>
          )}
        </>
      )}

      {shapeCaps.length > 0 && (
        <details className="mt-4" open={!data.shapes.length}>
          <summary className="cursor-pointer text-sm font-medium">
            Capabilities <span className="font-normal text-muted-foreground">({shapeCaps.length})</span>
          </summary>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {shapeCaps.map((c) => (
              <CapabilityRow key={c.id} cap={c} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CapabilityRow({ cap }: { cap: Capability }) {
  const action = cap.actions.map((a) => a.replace(/^odrl:/, "")).join(", ");
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{cap.name || cap.id.split("#").pop()}</span>
        {action && <span className="text-xs text-muted-foreground">{action}</span>}
        {cap.accepts.map((a) => (
          <code key={a} className="text-xs text-muted-foreground">
            {a}
          </code>
        ))}
      </div>
      {cap.description && <div className="text-xs text-muted-foreground">{cap.description}</div>}
      {(cap.resourceTypes.length > 0 || cap.shapes.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {cap.resourceTypes.map((t) => (
            <code key={t} className="rounded bg-secondary px-1.5 py-px text-[11px]">
              {curie(t)}
            </code>
          ))}
          {cap.shapes.map((s) => (
            <a key={s} href={s} target="_blank" rel="noopener" className="rounded bg-secondary px-1.5 py-px font-mono text-[11px] hover:underline">
              {s.split("/").pop()}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}
