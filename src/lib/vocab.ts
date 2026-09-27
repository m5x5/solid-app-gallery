// Vocabulary terms a region on a screenshot can be tagged with: the classes
// and properties Solid apps commonly read and write in a pod. A curated pick
// list for the annotation tool — any IRI or CURIE can still be typed in, this
// just makes the common ones one keystroke away and supplies datatype hints
// for the derived shapes (lib/shapes).

export type TermKind = "property" | "class";
export type Term = {
  iri: string;
  kind: TermKind;
  label: string; // short human label shown next to the CURIE
  // For properties: the value type, used as the shape's datatype / nodeKind.
  range?: "string" | "dateTime" | "date" | "integer" | "boolean" | "iri";
};

export const NAMESPACES: [string, string][] = [
  ["vcard", "http://www.w3.org/2006/vcard/ns#"],
  ["foaf", "http://xmlns.com/foaf/0.1/"],
  ["schema", "http://schema.org/"],
  ["dcterms", "http://purl.org/dc/terms/"],
  ["ldp", "http://www.w3.org/ns/ldp#"],
  ["pim", "http://www.w3.org/ns/pim/space#"],
  ["solid", "http://www.w3.org/ns/solid/terms#"],
  ["acl", "http://www.w3.org/ns/auth/acl#"],
  ["as", "https://www.w3.org/ns/activitystreams#"],
  ["oa", "http://www.w3.org/ns/oa#"],
  ["sioc", "http://rdfs.org/sioc/ns#"],
  ["ical", "http://www.w3.org/2002/12/cal/ical#"],
  ["bookmark", "http://www.w3.org/2002/01/bookmark#"],
  ["skos", "http://www.w3.org/2004/02/skos/core#"],
  ["rdfs", "http://www.w3.org/2000/01/rdf-schema#"],
  ["rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["xsd", "http://www.w3.org/2001/XMLSchema#"],
  ["ex", "http://example.org#"],
];

const ns = (pfx: string) => NAMESPACES.find(([p]) => p === pfx)![1];
const p = (pfx: string, local: string, label: string, range: Term["range"] = "string"): Term => ({
  iri: ns(pfx) + local,
  kind: "property",
  label,
  range,
});
const c = (pfx: string, local: string, label: string): Term => ({ iri: ns(pfx) + local, kind: "class", label });

export const TERMS: Term[] = [
  // --- profile / contacts
  c("vcard", "Individual", "Person (vCard)"),
  c("vcard", "Organization", "Organisation (vCard)"),
  c("vcard", "AddressBook", "Address book"),
  p("vcard", "fn", "Full name"),
  p("vcard", "hasName", "Structured name", "iri"),
  p("vcard", "nickname", "Nickname"),
  p("vcard", "hasEmail", "Email", "iri"),
  p("vcard", "hasTelephone", "Phone", "iri"),
  p("vcard", "hasPhoto", "Photo", "iri"),
  p("vcard", "hasAddress", "Postal address", "iri"),
  p("vcard", "organization-name", "Organisation name"),
  p("vcard", "role", "Role"),
  p("vcard", "bday", "Birthday", "date"),
  p("vcard", "note", "Note"),
  c("foaf", "Person", "Person (FOAF)"),
  c("foaf", "Group", "Group"),
  p("foaf", "name", "Name"),
  p("foaf", "nick", "Nick"),
  p("foaf", "mbox", "Mailbox", "iri"),
  p("foaf", "img", "Image", "iri"),
  p("foaf", "depiction", "Depiction", "iri"),
  p("foaf", "homepage", "Homepage", "iri"),
  p("foaf", "knows", "Knows", "iri"),
  p("foaf", "member", "Member", "iri"),
  // --- schema.org (generic content)
  c("schema", "Person", "Person (schema.org)"),
  c("schema", "Event", "Event"),
  c("schema", "Article", "Article"),
  c("schema", "Recipe", "Recipe"),
  c("schema", "ImageObject", "Image"),
  c("schema", "VideoObject", "Video"),
  c("schema", "Place", "Place"),
  c("schema", "Product", "Product"),
  c("schema", "Review", "Review"),
  c("schema", "ItemList", "List"),
  p("schema", "name", "Name"),
  p("schema", "description", "Description"),
  p("schema", "text", "Text"),
  p("schema", "url", "URL", "iri"),
  p("schema", "image", "Image", "iri"),
  p("schema", "author", "Author", "iri"),
  p("schema", "keywords", "Keywords"),
  p("schema", "dateCreated", "Date created", "dateTime"),
  p("schema", "dateModified", "Date modified", "dateTime"),
  p("schema", "startDate", "Start date", "dateTime"),
  p("schema", "endDate", "End date", "dateTime"),
  p("schema", "location", "Location", "iri"),
  p("schema", "ratingValue", "Rating", "integer"),
  p("schema", "itemListElement", "List item", "iri"),
  // --- Dublin Core
  p("dcterms", "title", "Title"),
  p("dcterms", "description", "Description (DC)"),
  p("dcterms", "created", "Created", "dateTime"),
  p("dcterms", "modified", "Modified", "dateTime"),
  p("dcterms", "creator", "Creator", "iri"),
  // --- pod structure
  c("ldp", "Container", "Container"),
  c("ldp", "BasicContainer", "Basic container"),
  c("ldp", "Resource", "Resource"),
  p("ldp", "contains", "Contains", "iri"),
  p("ldp", "inbox", "Inbox", "iri"),
  p("pim", "storage", "Storage root", "iri"),
  p("pim", "preferencesFile", "Preferences file", "iri"),
  p("pim", "workspace", "Workspace", "iri"),
  p("solid", "oidcIssuer", "OIDC issuer", "iri"),
  p("solid", "publicTypeIndex", "Public type index", "iri"),
  p("solid", "privateTypeIndex", "Private type index", "iri"),
  c("solid", "TypeRegistration", "Type registration"),
  p("solid", "forClass", "Registered class", "iri"),
  p("solid", "instance", "Instance", "iri"),
  p("solid", "instanceContainer", "Instance container", "iri"),
  // --- access control
  c("acl", "Authorization", "Authorization"),
  p("acl", "agent", "Agent", "iri"),
  p("acl", "agentClass", "Agent class", "iri"),
  p("acl", "agentGroup", "Agent group", "iri"),
  p("acl", "accessTo", "Access to", "iri"),
  p("acl", "default", "Default for", "iri"),
  p("acl", "mode", "Access mode", "iri"),
  // --- social / messaging
  c("as", "Note", "Note (AS)"),
  c("as", "Create", "Create activity"),
  c("as", "Announce", "Announce activity"),
  p("as", "actor", "Actor", "iri"),
  p("as", "object", "Object", "iri"),
  p("as", "content", "Content"),
  p("as", "published", "Published", "dateTime"),
  p("as", "summary", "Summary"),
  c("sioc", "Post", "Post"),
  p("sioc", "content", "Post content"),
  p("sioc", "has_creator", "Post creator", "iri"),
  c("oa", "Annotation", "Annotation"),
  p("oa", "hasBody", "Annotation body", "iri"),
  p("oa", "hasTarget", "Annotation target", "iri"),
  // --- calendar, bookmarks
  c("ical", "Vevent", "Calendar event"),
  c("ical", "Vtodo", "To-do"),
  p("ical", "summary", "Summary (iCal)"),
  p("ical", "dtstart", "Starts", "dateTime"),
  p("ical", "dtend", "Ends", "dateTime"),
  p("ical", "due", "Due", "dateTime"),
  p("ical", "completed", "Completed", "dateTime"),
  c("bookmark", "Bookmark", "Bookmark"),
  p("bookmark", "recalls", "Bookmarked URL", "iri"),
  p("bookmark", "title", "Bookmark title"),
  // --- generic
  c("skos", "Concept", "Concept"),
  p("skos", "prefLabel", "Preferred label"),
  p("rdfs", "label", "Label"),
  p("rdfs", "comment", "Comment"),
  p("rdf", "type", "Type", "iri"),
];

const byIri = new Map(TERMS.map((t) => [t.iri, t]));
export const termInfo = (iri: string): Term | undefined => byIri.get(iri);

// Prefixes declared by an app's own shapes (leptum:, crdt:, …) join the
// table so their terms render as CURIEs too.
export function registerPrefix(pfx: string, ns: string) {
  if (!pfx || !ns || NAMESPACES.some(([, n]) => n === ns)) return;
  // A known prefix under another namespace (https://schema.org/ next to
  // http://schema.org/) becomes an alias: curie() matches either.
  NAMESPACES.push([pfx, ns]);
}

// "vcard:fn" ⇄ full IRI. Unknown prefixes stay as typed; full IRIs pass through.
export function expandTerm(input: string): string {
  const s = input.trim().replace(/^<|>$/g, "");
  if (/^https?:\/\//.test(s)) return s;
  const m = s.match(/^([A-Za-z][\w-]*):(.+)$/);
  if (m) {
    const hit = NAMESPACES.find(([pfx]) => pfx === m[1]);
    if (hit) return hit[1] + m[2];
  }
  return s;
}
export function curie(iri: string): string {
  for (const [pfx, n] of NAMESPACES) if (iri.startsWith(n)) return `${pfx}:${iri.slice(n.length)}`;
  return iri;
}
export const localName = (iri: string) => iri.split(/[#/]/).pop() || iri;

// Search the pick list: matches CURIE, local name or label, case-insensitive.
// `extra` (an app's own shape terms) is searched first and listed ahead of
// the generic vocabulary on equal score.
export function searchTerms(q: string, limit = 12, extra: Term[] = []): Term[] {
  const s = q.trim().toLowerCase();
  const pool = [...extra, ...TERMS];
  if (!s) return pool.slice(0, limit);
  const scored = pool.map((t) => {
    const cur = curie(t.iri).toLowerCase();
    const loc = localName(t.iri).toLowerCase();
    const lab = t.label.toLowerCase();
    let score = 0;
    if (cur === s || loc === s) score = 4;
    else if (loc.startsWith(s) || cur.startsWith(s)) score = 3;
    else if (lab.startsWith(s)) score = 2;
    else if (cur.includes(s) || lab.includes(s)) score = 1;
    return { t, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.t);
}

// Stable colour per namespace, so every vcard:* box looks alike and differs
// from schema:* — the eye groups by vocabulary before reading labels.
export function termColor(iri: string): string {
  const idx = NAMESPACES.findIndex(([, n]) => iri.startsWith(n));
  const hues = [265, 200, 150, 30, 340, 90, 0, 180, 60, 300, 120, 210, 20, 240, 100, 330, 160, 45];
  const h = idx >= 0 ? hues[idx % hues.length] : 0;
  return `hsl(${h} 85% 60%)`;
}
