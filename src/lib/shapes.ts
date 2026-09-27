// An app's data shape — which pod vocabulary it shows and edits — derived
// from the regions people drew on its screenshots (lib/regions), rendered in
// the notation the visitor picked: LinkML YAML, SHACL Turtle or ShEx Compact.
// Same shape, three notations.
import type { Region } from "./regions";
import { NAMESPACES, termInfo, localName } from "./vocab";

export type ShapeLang = "linkml" | "shacl" | "shex";
export const SHAPE_LANGS: { key: ShapeLang; label: string; ext: string }[] = [
  { key: "linkml", label: "LinkML", ext: "yaml" },
  { key: "shacl", label: "SHACL", ext: "ttl" },
  { key: "shex", label: "ShEx", ext: "shex" },
];

export type ShapeProperty = {
  predicate: string; // full IRI
  kind: "literal" | "iri" | "unknown";
  datatype?: string; // literal: xsd IRI
  edited: boolean; // at least one region says the app edits it
  screens: number[]; // 1-based indices of the screens it was seen on
  shape?: string; // the app's published shape it was picked from
};

export type Shape = {
  name: string; // app name
  subject?: string; // app id
  classes: string[]; // annotated class IRIs (what the app's resources are)
  properties: ShapeProperty[];
  regionCount: number;
};

const XSD = "http://www.w3.org/2001/XMLSchema#";
const SHAPE_NS = "https://solidproject.solidcommunity.net/catalog/shapes#";

const screenIndex = (screenId: string): number | undefined => {
  const m = screenId.match(/::(\d+)$/);
  return m ? Number(m[1]) + 1 : undefined;
};

export function deriveAppShape(app: { id: string; name: string }, regions: Region[]): Shape {
  const classes = new Set<string>();
  const props = new Map<string, ShapeProperty>();
  for (const r of regions) {
    if (r.termKind === "class") {
      classes.add(r.term);
      continue;
    }
    const info = termInfo(r.term);
    const cur = props.get(r.term) || {
      predicate: r.term,
      kind: !info ? "unknown" : info.range === "iri" ? "iri" : "literal",
      datatype: info && info.range && info.range !== "iri" ? XSD + info.range : undefined,
      edited: false,
      screens: [],
      shape: r.shape,
    };
    if (r.role === "edits") cur.edited = true;
    if (!cur.shape && r.shape) cur.shape = r.shape;
    const idx = screenIndex(r.screenId);
    if (idx && !cur.screens.includes(idx)) cur.screens.push(idx);
    props.set(r.term, cur);
  }
  const properties = [...props.values()].map((p) => ({ ...p, screens: p.screens.sort((a, b) => a - b) }));
  // Group by vocabulary so vcard:* lines sit together, keeping first-seen order within.
  properties.sort((a, b) => nsIndex(a.predicate) - nsIndex(b.predicate));
  return { name: app.name, subject: app.id, classes: [...classes], properties, regionCount: regions.length };
}

// --- rendering -------------------------------------------------------------

const nsIndex = (iri: string) => {
  const i = NAMESPACES.findIndex(([, ns]) => iri.startsWith(ns));
  return i === -1 ? NAMESPACES.length : i;
};
function curie(iri: string): string {
  for (const [pfx, ns] of NAMESPACES) if (iri.startsWith(ns)) return `${pfx}:${iri.slice(ns.length)}`;
  return `<${iri}>`;
}
function usedPrefixes(shape: Shape, extra: string[] = []): [string, string][] {
  const iris = [...shape.classes, ...shape.properties.flatMap((p) => [p.predicate, p.datatype || ""]), ...extra].filter(Boolean);
  return NAMESPACES.filter(([, ns]) => iris.some((i) => i.startsWith(ns)));
}

// "Solid Contacts" → "SolidContacts", "@uvdsl/solid-app-template-vue" → "UvdslSolidAppTemplateVue".
export function shapeClassName(appName: string): string {
  const words = appName.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return /^\d/.test(pascal) ? `App${pascal}` : pascal || "App";
}

// Where the property was seen — the human trace behind each constraint.
function provenance(p: ShapeProperty): string {
  const where = p.screens.length ? ` on screen ${p.screens.join(", ")}` : "";
  const from = p.shape ? `; see ${curie(p.shape)}` : "";
  return `${p.edited ? "edited" : "shown"}${where}${from}`;
}

const LINKML_RANGE: Record<string, string> = {
  [XSD + "string"]: "string",
  [XSD + "dateTime"]: "datetime",
  [XSD + "date"]: "date",
  [XSD + "integer"]: "integer",
  [XSD + "boolean"]: "boolean",
};

function renderLinkML(shape: Shape): string {
  const cls = shapeClassName(shape.name);
  const out: string[] = [];
  out.push(`id: ${SHAPE_NS.replace(/#$/, "/")}${cls}`);
  out.push(`name: ${cls.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase()}`);
  out.push(`description: Pod data handled by ${JSON.stringify(shape.name)}, from ${shape.regionCount} annotated screen regions`);
  out.push("prefixes:");
  out.push("  linkml: https://w3id.org/linkml/");
  for (const [pfx, ns] of usedPrefixes(shape)) if (pfx !== "xsd" && pfx !== "rdf") out.push(`  ${pfx}: ${ns}`);
  out.push("default_range: string");
  out.push("imports:");
  out.push("  - linkml:types");
  out.push("");
  out.push("classes:");
  out.push(`  ${cls}Data:`);
  if (shape.classes.length) {
    out.push(`    class_uri: ${curie(shape.classes[0])}`);
    if (shape.classes.length > 1) out.push(`    # also seen as: ${shape.classes.slice(1).map(curie).join(", ")}`);
  }
  out.push("    attributes:");
  if (!shape.properties.length) out.push("      {}");
  for (const p of shape.properties) {
    out.push(`      ${localName(p.predicate)}:`);
    out.push(`        slot_uri: ${curie(p.predicate)}`);
    out.push(`        range: ${p.kind === "iri" ? "uriorcurie" : p.kind === "literal" ? LINKML_RANGE[p.datatype || ""] || "string" : "Any"}`);
    if (!p.edited) out.push("        readonly: true");
    out.push(`        comments: [${JSON.stringify(provenance(p))}]`);
  }
  return out.join("\n") + "\n";
}

function renderSHACL(shape: Shape): string {
  const cls = shapeClassName(shape.name);
  const out: string[] = [];
  out.push("@prefix sh: <http://www.w3.org/ns/shacl#> .");
  for (const [pfx, ns] of usedPrefixes(shape)) out.push(`@prefix ${pfx}: <${ns}> .`);
  out.push(`@prefix : <${SHAPE_NS}> .`);
  out.push("");
  out.push(`# Pod data handled by ${JSON.stringify(shape.name)}, from ${shape.regionCount} annotated screen regions`);
  out.push(`:${cls}DataShape a sh:NodeShape ;`);
  for (const c of shape.classes) out.push(`  sh:targetClass ${curie(c)} ;`);
  if (shape.subject) out.push(`  sh:description "Data shape of ${shape.name.replace(/"/g, '\\"')}" ;`);
  if (!shape.properties.length) {
    out[out.length - 1] = out[out.length - 1].replace(/ ;$/, " .");
    return out.join("\n") + "\n";
  }
  const props = shape.properties.map((p) => {
    const parts = [`sh:path ${curie(p.predicate)}`];
    if (p.kind === "literal") parts.push(`sh:datatype ${curie(p.datatype || XSD + "string")}`);
    else if (p.kind === "iri") parts.push("sh:nodeKind sh:IRI");
    parts.push(`sh:description "${provenance(p)}"`);
    return `    [ ${parts.join(" ; ")} ]`;
  });
  out.push("  sh:property");
  out.push(props.join(" ,\n") + " .");
  return out.join("\n") + "\n";
}

function renderShEx(shape: Shape): string {
  const cls = shapeClassName(shape.name);
  const out: string[] = [];
  for (const [pfx, ns] of usedPrefixes(shape)) out.push(`PREFIX ${pfx}: <${ns}>`);
  out.push(`PREFIX : <${SHAPE_NS}>`);
  out.push("");
  out.push(`# Pod data handled by ${JSON.stringify(shape.name)}, from ${shape.regionCount} annotated screen regions`);
  out.push(`:${cls}DataShape {`);
  if (shape.classes.length) out.push(`  a [ ${shape.classes.map(curie).join(" ")} ]${shape.properties.length ? " ;" : ""}`);
  shape.properties.forEach((p, i) => {
    const last = i === shape.properties.length - 1;
    const constraint = p.kind === "literal" ? curie(p.datatype || XSD + "string") : p.kind === "iri" ? "IRI" : ".";
    // Optional and repeatable: a screenshot shows the property exists, not
    // how many values a resource may carry.
    out.push(`  ${curie(p.predicate)} ${constraint} *${last ? "" : " ;"}  // ${provenance(p)}`);
  });
  out.push("}");
  return out.join("\n") + "\n";
}

export function renderShape(shape: Shape, lang: ShapeLang): string {
  switch (lang) {
    case "linkml":
      return renderLinkML(shape);
    case "shacl":
      return renderSHACL(shape);
    case "shex":
      return renderShEx(shape);
  }
}
