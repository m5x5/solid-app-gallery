// Shapes an app publishes itself: apps that follow the W3C Application
// Capability draft describe on their landing page what they can do and link
// the shapes (SHACL / ShEx / LinkML) of the data they read and write. The
// gallery reads that through api/app-shapes (server-side RDFa scrape) and
// shows it on the app page; the annotation tool offers the classes and
// properties from those shapes as terms, so a region can say "this is
// leptum:TaskShape's schema:name".
import { useEffect, useState } from "react";
import { Parser } from "n3";
import type { App } from "./apps";
import type { ShapeLang } from "./shapes";
import { registerPrefix, type Term } from "./vocab";

export type Capability = {
  id: string;
  name?: string;
  description?: string;
  actions: string[];
  accepts: string[];
  shapes: string[];
  resourceTypes: string[];
};
export type PublishedShape = {
  name: string;
  formats: Partial<Record<ShapeLang, string>>;
};
export type AppShapes = {
  source: string;
  capabilities: Capability[];
  shapes: PublishedShape[];
};

const EMPTY: AppShapes = { source: "", capabilities: [], shapes: [] };
const cache = new Map<string, Promise<AppShapes>>();

export function loadAppShapes(app: App): Promise<AppShapes> {
  const url = app.landingPage;
  if (!url) return Promise.resolve(EMPTY);
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(`/api/app-shapes?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : EMPTY))
        .catch(() => EMPTY)
    );
  }
  return cache.get(url)!;
}

export function useAppShapes(app?: App): { data: AppShapes; loading: boolean } {
  const [data, setData] = useState<AppShapes>(EMPTY);
  const [loading, setLoading] = useState(!!app?.landingPage);
  useEffect(() => {
    if (!app) return;
    let alive = true;
    setLoading(true);
    loadAppShapes(app)
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [app]);
  return { data, loading };
}

// One shape document, via the proxy (the app's host may not send CORS).
const textCache = new Map<string, Promise<string>>();
export function loadShapeText(url: string): Promise<string> {
  if (!textCache.has(url)) {
    textCache.set(
      url,
      fetch(`/api/app-shapes?shape=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "")
    );
  }
  return textCache.get(url)!;
}

export function useShapeText(url?: string): { text: string; loading: boolean } {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(!!url);
  useEffect(() => {
    if (!url) {
      setText("");
      return;
    }
    let alive = true;
    setLoading(true);
    loadShapeText(url)
      .then((t) => alive && setText(t))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);
  return { text, loading };
}

// --- terms from a SHACL document, for the annotation tool's pick list ---

const SH = "http://www.w3.org/ns/shacl#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

export type ShapeTerm = Term & { shape: string; shapeName: string };

const RANGE: Record<string, Term["range"]> = {
  [XSD + "string"]: "string",
  [XSD + "dateTime"]: "dateTime",
  [XSD + "date"]: "date",
  [XSD + "integer"]: "integer",
  [XSD + "boolean"]: "boolean",
};

// Every sh:NodeShape becomes a class term (its IRI; label from rdfs:label /
// the file name), every sh:property's sh:path a property term with the
// datatype the shape declares. Non-Turtle input (or a parse error) yields [].
export function termsFromShacl(ttl: string, shapeName: string): ShapeTerm[] {
  let quads;
  try {
    quads = new Parser().parse(ttl);
  } catch {
    return [];
  }
  for (const m of ttl.matchAll(/^\s*(?:@prefix|PREFIX)\s+([\w-]*):\s*<([^>]+)>/gim)) registerPrefix(m[1], m[2]);
  const objs = (s: string, p: string) => quads.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object);
  const out: ShapeTerm[] = [];
  const seen = new Set<string>();
  const nodeShapes = quads.filter((q) => q.predicate.value === RDF + "type" && q.object.value === SH + "NodeShape").map((q) => q.subject);
  for (const ns of nodeShapes) {
    if (ns.termType !== "NamedNode") continue;
    const label = objs(ns.value, RDFS + "label")[0]?.value || `${shapeName} (shape)`;
    if (!seen.has(ns.value)) {
      seen.add(ns.value);
      out.push({ iri: ns.value, kind: "class", label, shape: ns.value, shapeName });
    }
    // sh:targetClass: the class the shape is about
    for (const tc of objs(ns.value, SH + "targetClass")) {
      if (tc.termType === "NamedNode" && !seen.has(tc.value)) {
        seen.add(tc.value);
        out.push({ iri: tc.value, kind: "class", label: `${shapeName} class`, shape: ns.value, shapeName });
      }
    }
    for (const prop of objs(ns.value, SH + "property")) {
      const path = objs(prop.value, SH + "path")[0];
      if (!path || path.termType !== "NamedNode" || path.value === RDF + "type") continue;
      const dt = objs(prop.value, SH + "datatype")[0]?.value;
      const nodeKind = objs(prop.value, SH + "nodeKind")[0]?.value;
      const cls = objs(prop.value, SH + "class")[0];
      const desc = objs(prop.value, SH + "description")[0]?.value || objs(prop.value, SH + "name")[0]?.value;
      const key = `${ns.value} ${path.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        iri: path.value,
        kind: "property",
        label: desc ? desc.slice(0, 80) : `${shapeName} property`,
        range: dt ? RANGE[dt] || "string" : nodeKind === SH + "IRI" || cls ? "iri" : "string",
        shape: ns.value,
        shapeName,
      });
    }
  }
  return out;
}

// All terms across an app's published SHACL shapes (fetched once, cached).
export function useShapeTerms(shapes: PublishedShape[]): ShapeTerm[] {
  const [terms, setTerms] = useState<ShapeTerm[]>([]);
  const key = shapes.map((s) => s.formats.shacl || "").join("|");
  useEffect(() => {
    let alive = true;
    const withShacl = shapes.filter((s) => s.formats.shacl);
    if (!withShacl.length) {
      setTerms([]);
      return;
    }
    Promise.all(withShacl.map((s) => loadShapeText(s.formats.shacl!).then((t) => termsFromShacl(t, s.name)))).then(
      (all) => {
        if (!alive) return;
        // The same property in several shapes (schema:name in task, note, …)
        // becomes one entry naming all of them.
        const byIri = new Map<string, ShapeTerm>();
        for (const t of all.flat()) {
          const cur = byIri.get(t.iri);
          if (!cur) byIri.set(t.iri, { ...t });
          else if (!cur.shapeName.split(", ").includes(t.shapeName)) cur.shapeName += `, ${t.shapeName}`;
        }
        setTerms([...byIri.values()]);
      }
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return terms;
}
