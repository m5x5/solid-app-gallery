import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { renderShape, SHAPE_LANGS, type Shape, type ShapeLang } from "@/lib/shapes";
import { useShapeLang } from "@/lib/shape-lang-context";
import { cn } from "@/lib/utils";

// A code panel showing a data shape in the visitor's chosen notation
// (LinkML / SHACL / ShEx). Used on the app page (full, copyable) and inside
// the screen annotation panel (compact preview).
export function ShapeFrame({
  shape,
  text: rawText,
  title,
  available,
  lang: forced,
  className,
  copyable = false,
  langSwitch = false,
  compact = false,
  empty,
}: {
  shape?: Shape;
  // Raw-text mode: show a shape document as published (no rendering).
  text?: string;
  title?: string;
  // Notations the document exists in (greys out the others in the switch).
  available?: ShapeLang[];
  lang?: ShapeLang;
  className?: string;
  // Copy-to-clipboard button in the title bar.
  copyable?: boolean;
  // Inline LinkML / SHACL / ShEx switch in the title bar (for views that sit
  // outside the sub-nav, e.g. the full-screen screen detail).
  langSwitch?: boolean;
  compact?: boolean;
  // Rendered instead of the code when the shape has no annotations yet.
  empty?: ReactNode;
}) {
  const { lang: pref, setLang } = useShapeLang();
  const lang = forced ?? pref;
  const text = rawText ?? (shape ? renderShape(shape, lang) : "");
  const meta = SHAPE_LANGS.find((l) => l.key === lang)!;
  const [copied, setCopied] = useState(false);
  const isEmpty = rawText !== undefined ? !rawText : !shape || (!shape.properties.length && !shape.classes.length);
  const fileName = title ?? (shape ? `${shapeFileName(shape.name)}.${meta.ext}` : "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  return (
    <div className={cn("flex w-full flex-col overflow-hidden rounded-xl bg-zinc-950 text-zinc-100 ring-1 ring-border", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5 font-mono text-[11px] text-white/60">
        <span className="truncate">{fileName}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {langSwitch ? (
            SHAPE_LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLang(l.key)}
                aria-pressed={lang === l.key}
                disabled={available ? !available.includes(l.key) : false}
                title={available && !available.includes(l.key) ? `Not published as ${l.label}` : undefined}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-30",
                  lang === l.key ? "bg-white/20 text-white" : "text-white/50 hover:text-white"
                )}
              >
                {l.label}
              </button>
            ))
          ) : (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
              {meta.label}
            </span>
          )}
          {copyable && !isEmpty && (
            <button
              type="button"
              onClick={copy}
              aria-label="Copy shape"
              className="ml-1 rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </span>
      </div>
      {isEmpty && empty ? (
        <div className="p-4 text-xs text-white/60">{empty}</div>
      ) : (
        <pre className={cn("min-h-0 flex-1 overflow-x-auto p-3 font-mono leading-[1.5]", compact ? "text-[11px]" : "text-xs")}>
          <code>{highlight(text, lang)}</code>
        </pre>
      )}
    </div>
  );
}

export function shapeFileName(appName: string): string {
  return (
    appName
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "shape"
  );
}

// Minimal, regex-level syntax colouring shared by the three notations:
// comments, quoted strings, CURIEs / YAML keys, numbers and the structural
// keywords each language uses. Enough to read as code; not a parser.
const KEYWORDS = /^(PREFIX|@prefix|a|IRI|classes|attributes|prefixes|imports|sh:\w+)$/;
function highlight(text: string, lang: ShapeLang) {
  return text.split("\n").map((line, i) => (
    <span key={i} className="block">
      {tokens(line, lang)}
    </span>
  ));
}

function tokens(line: string, lang: ShapeLang) {
  if (/^\s*#/.test(line)) return <span className="text-zinc-500">{line}</span>;
  // ShEx trailing comments
  const cIdx = lang === "shex" ? line.indexOf("//") : -1;
  const code = cIdx >= 0 ? line.slice(0, cIdx) : line;
  const comment = cIdx >= 0 ? line.slice(cIdx) : "";
  const out: React.ReactNode[] = [];
  const re = /("[^"]*"|<[^>]*>|\b\d+(?:\.\d+)?\b|[\w.@-]*:[\w-]+|[\w@-]+:?|\S)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  let k = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const t = m[0];
    let cls = "";
    if (t.startsWith('"')) cls = "text-emerald-300";
    else if (t.startsWith("<")) cls = "text-sky-300/80";
    else if (/^\d/.test(t)) cls = "text-amber-300";
    else if (KEYWORDS.test(t)) cls = "text-violet-300";
    else if (lang === "linkml" && t.endsWith(":")) cls = "text-sky-300";
    else if (/^[\w.@-]*:[\w-]+$/.test(t)) cls = "text-sky-300";
    else if (/^[?*+;.,[\]{}]$/.test(t)) cls = "text-zinc-400";
    out.push(
      cls ? (
        <span key={k++} className={cls}>
          {t}
        </span>
      ) : (
        t
      )
    );
    last = m.index + t.length;
  }
  if (last < code.length) out.push(code.slice(last));
  if (comment) out.push(<span key="c" className="text-zinc-500">{comment}</span>);
  return out;
}
