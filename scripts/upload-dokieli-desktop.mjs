// Uploads the dokieli desktop FLOW frames and rewrites the catalog so dokieli's
// desktop screenshots are exactly these (removing any earlier dokieli-desktop-*).
import { chromium } from "@playwright/test";
import { Parser, Store, Writer, DataFactory } from "n3";
import { readFileSync, readdirSync } from "node:fs";
import { POD } from "./lib-env.mjs";

const { namedNode, literal } = DataFactory;
const ADMIN_POD = "https://pod.mpeters.dev/test/";
const SCREENS_BASE = `${ADMIN_POD}solid-gallery/screens/`;
const CATALOG_URL = `${ADMIN_POD}solid-gallery/catalog.ttl`;
const APP_ID = "urn:uuid:e01a124a-688a-4e00-ad67-8b69ef116bbd";
const DIR =
  "/private/tmp/claude-501/-Users-michael-Software-opensource-solid-app-gallery/5bba3d71-d25b-4237-96f6-c468fe2edb2d/scratchpad/dokieli-desktop";
const EX = "http://example.org#";
const SCHEMA = "http://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const files = readdirSync(DIR).filter((f) => f.endsWith(".webp")).sort();

// 1) Rebuild the catalog store: drop existing dokieli desktop screenshots.
const ttl = await (await fetch(CATALOG_URL, { cache: "no-store" })).text();
const store = new Store(new Parser().parse(ttl));
const nodes = store.getObjects(APP_ID, EX + "screenshot", null).map((o) => o.value);
let maxIdx = 0;
for (const n of nodes) {
  const cu = store.getObjects(n, SCHEMA + "contentUrl", null)[0]?.value || "";
  const idx = Number((n.match(/#screenshot-(\d+)/) || [])[1] || 0);
  if (cu.includes("dokieli-desktop-")) {
    store.removeQuads(store.getQuads(APP_ID, EX + "screenshot", n, null));
    store.removeQuads(store.getQuads(n, null, null, null));
  } else {
    maxIdx = Math.max(maxIdx, idx);
  }
}
files.forEach((f, k) => {
  const node = namedNode(`${APP_ID}#screenshot-${maxIdx + 1 + k}`);
  store.addQuad(namedNode(APP_ID), namedNode(EX + "screenshot"), node);
  store.addQuad(node, namedNode(RDF_TYPE), namedNode(SCHEMA + "ImageObject"));
  store.addQuad(node, namedNode(SCHEMA + "contentUrl"), namedNode(`${SCREENS_BASE}${f}`));
  store.addQuad(node, namedNode(SCHEMA + "encodingFormat"), literal("image/webp"));
});
const newTtl = await new Promise((res, rej) => {
  const w = new Writer({ prefixes: { ex: EX, schema: SCHEMA, con: "https://solidproject.solidcommunity.net/catalog/taxonomy#", skos: "http://www.w3.org/2004/02/skos/core#", dcterms: "http://purl.org/dc/terms/", xsd: "http://www.w3.org/2001/XMLSchema#" } });
  w.addQuads(store.getQuads(null, null, null, null));
  w.end((e, r) => (e ? rej(e) : res(r)));
});
console.log(`dokieli: kept ${maxIdx} mobile, adding ${files.length} desktop.`);

// 2) Log in as admin and upload images + the rewritten catalog.
const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto("http://localhost:5180/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /log in/i }).first().click({ timeout: 20000 });
await page.getByRole("button", { name: /continue to log in/i }).click();
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 20000 });
await page.locator("#email").fill(POD.email);
await page.locator("#password").fill(POD.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/consent/, { timeout: 15000 }).catch(() => {});
const a = page.locator('button:has-text("Authorize")').first();
if (await a.isVisible().catch(() => false)) await a.click();
await page.waitForURL(/localhost:5180/, { timeout: 20000 });
await page.waitForTimeout(2500);

for (const f of files) {
  const b64 = readFileSync(`${DIR}/${f}`).toString("base64");
  const st = await page.evaluate(([u, b]) => window.__gallery.putBinary(u, b, "image/webp"), [`${SCREENS_BASE}${f}`, b64]);
  console.log(`${f} -> ${st}`);
}
const cst = await page.evaluate(([u, b]) => window.__gallery.put(u, b, "text/turtle"), [CATALOG_URL, newTtl]);
console.log("catalog.ttl ->", cst);
await browser.close();
console.log("done");
