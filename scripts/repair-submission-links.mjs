// One-off repair for submissions published before catalog records were linked
// to their source submission (dcterms:source) and screenshots were keyed by the
// submission's stable id. Merges duplicate records for one app into a single
// canonical record, retargets orphaned screenshot triples onto it, and adds
// the dcterms:source link so future edits/uploads resolve to it.
//
//   node scripts/repair-submission-links.mjs --dry            # print the diff only
//   node scripts/repair-submission-links.mjs                  # write catalog.ttl (admin login)
//
// The plan below is data-specific (Proxion, 2026-08-18); edit KEEP/DROP/ORPHANS
// for another case.
import { readFile, writeFile } from "node:fs/promises";
import { Parser, Store, Writer, DataFactory } from "n3";

const CATALOG_URL = "https://pod.mpeters.dev/test/solid-gallery/catalog.ttl";
const EX = "http://example.org#";
const SCHEMA = "http://schema.org/";
const CON = "https://solidproject.solidcommunity.net/catalog/taxonomy#";
const DCTERMS_SOURCE = "http://purl.org/dc/terms/source";

const KEEP = "https://solidproject.solidcommunity.net/catalog/data#Proxion_msyvpuyw";
const SOURCE = "https://pod.mpeters.dev/michael/solid-gallery/submissions/2026-08-18-Proxion.ttl";
// Duplicate records created by re-reviewing the same submission — folded into KEEP.
const DROP = [
  "https://solidproject.solidcommunity.net/catalog/data#Proxion_msyx529p",
  "https://solidproject.solidcommunity.net/catalog/data#Proxion_msyx56ou",
];
// Subjects that screenshots were (wrongly) attached to — moved onto KEEP.
const ORPHANS = [
  "https://pod.mpeters.dev/michael/solid-gallery/submissions/2026-08-18-Proxion.ttl",
  "https://solidproject.solidcommunity.net/catalog/data#Proxion",
];

const dry = process.argv.includes("--dry");
const { namedNode, quad } = DataFactory;

// --from <file> reads a local copy instead of fetching (offline dry runs).
const fromIdx = process.argv.indexOf("--from");
const ttl =
  fromIdx > -1
    ? await readFile(process.argv[fromIdx + 1], "utf8")
    : await (await fetch(CATALOG_URL, { headers: { Accept: "text/turtle" } })).text();
const store = new Store(new Parser().parse(ttl));
const before = store.size;

const keep = namedNode(KEEP);

// 1. Fold DROP records' descriptive fields into KEEP (a description KEEP lacks),
//    then drop them. Their screenshots are handled with the orphans below.
for (const d of DROP) {
  for (const q of store.getQuads(d, null, null, null)) {
    const p = q.predicate.value;
    if (p === EX + "screenshot" || p === SCHEMA + "video") continue; // step 2
    if (p === EX + "description" && !store.getObjects(KEEP, p, null).length)
      store.addQuad(quad(keep, q.predicate, q.object));
    store.removeQuad(q);
  }
}

// 2. Retarget screenshots hanging off DROP/orphan subjects:
//    <x> ex:screenshot <x#screenshot-N> becomes <KEEP> ex:screenshot <KEEP#screenshot-M>
//    with M continuing KEEP's numbering (image triples move along).
const existing = store
  .getObjects(KEEP, EX + "screenshot", null)
  .map((o) => Number((o.value.match(/#screenshot-(\d+)$/) || [])[1] || 0));
let n = Math.max(0, ...existing);
for (const o of [...DROP, ...ORPHANS]) {
  const nodes = store.getObjects(o, EX + "screenshot", null);
  for (const node of nodes) {
    n += 1;
    const dest = namedNode(`${KEEP}#screenshot-${n}`);
    for (const q of store.getQuads(node, null, null, null)) {
      store.addQuad(quad(dest, q.predicate, q.object));
      store.removeQuad(q);
    }
    store.addQuad(quad(keep, namedNode(EX + "screenshot"), dest));
    store.removeQuad(quad(namedNode(o), namedNode(EX + "screenshot"), node));
  }
  // anything else left on the orphan subject is dropped
  for (const q of store.getQuads(o, null, null, null)) store.removeQuad(q);
}

// 3. Link the record to its submission so the app resolves it from now on.
store.removeQuads(store.getQuads(KEEP, DCTERMS_SOURCE, null, null));
store.addQuad(quad(keep, namedNode(DCTERMS_SOURCE), namedNode(SOURCE)));

const out = await new Promise((resolve, reject) => {
  const w = new Writer({
    prefixes: {
      ex: EX,
      schema: SCHEMA,
      con: CON,
      skos: "http://www.w3.org/2004/02/skos/core#",
      dcterms: "http://purl.org/dc/terms/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
  });
  w.addQuads(store.getQuads(null, null, null, null));
  w.end((err, r) => (err ? reject(err) : resolve(r)));
});

console.log(`quads: ${before} -> ${store.size}`);
console.log(`KEEP now has ${store.getObjects(KEEP, EX + "screenshot", null).length} screenshots`);
for (const d of DROP) console.log(`${d}: ${store.getQuads(d, null, null, null).length} quads left`);
for (const o of ORPHANS) console.log(`${o}: ${store.getQuads(o, null, null, null).length} quads left`);

const outPath = new URL("../.repaired-catalog.ttl", import.meta.url);
await writeFile(outPath, out);
console.log(`repaired catalog written to ${outPath.pathname}`);
if (dry) {
  console.log("--dry: not uploading.");
  process.exit(0);
}

// Upload as admin through the running dev server (same pattern as publish-screens.mjs).
const { chromium } = await import("@playwright/test");
const { POD } = await import("./lib-env.mjs");
const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto("http://localhost:5180/");
await page.getByRole("button", { name: /log in/i }).first().click();
await page.getByRole("button", { name: /continue to log in/i }).click();
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 20000 });
await page.locator("#email").fill(POD.email);
await page.locator("#password").fill(POD.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/consent/, { timeout: 15000 }).catch(() => {});
const auth = page.locator('button:has-text("Authorize")').first();
if (await auth.isVisible().catch(() => false)) await auth.click();
await page.waitForURL(/localhost:5180/, { timeout: 20000 });
await page.waitForTimeout(2500);
const body = await readFile(outPath, "utf8");
const status = await page.evaluate(
  ([url, b]) => window.__gallery.put(url, b, "text/turtle"),
  [CATALOG_URL, body]
);
console.log(`PUT ${CATALOG_URL} -> ${status}`);
await browser.close();
process.exit(status >= 200 && status < 300 ? 0 : 1);
