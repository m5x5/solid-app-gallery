// One-time migration: add schema:width / schema:height to every ImageObject in
// the catalog (measured from the actual image), so the loader can classify a
// screenshot's form factor (desktop = landscape) without client-side probing.
import { chromium } from "@playwright/test";
import { Parser, Store, Writer, DataFactory } from "n3";
import sharp from "sharp";
import { POD } from "./lib-env.mjs";

const { namedNode, literal } = DataFactory;
const ADMIN_POD = "https://pod.mpeters.dev/test/";
const CATALOG_URL = `${ADMIN_POD}solid-gallery/catalog.ttl`;
const SCHEMA = "http://schema.org/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const EX = "http://example.org#";
const int = (n) => literal(String(n), namedNode(XSD + "integer"));

const ttl = await (await fetch(CATALOG_URL, { cache: "no-store" })).text();
const store = new Store(new Parser().parse(ttl));

const imgs = store.getSubjects(namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), namedNode(SCHEMA + "ImageObject"), null);
let measured = 0, skipped = 0, failed = 0;
for (const img of imgs) {
  if (store.getObjects(img, SCHEMA + "width", null).length) { skipped++; continue; }
  const url = store.getObjects(img, SCHEMA + "contentUrl", null)[0]?.value;
  if (!url) { failed++; continue; }
  try {
    const buf = Buffer.from(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
    const { width, height } = await sharp(buf).metadata();
    if (!width || !height) throw new Error("no dims");
    store.addQuad(img, namedNode(SCHEMA + "width"), int(width));
    store.addQuad(img, namedNode(SCHEMA + "height"), int(height));
    measured++;
  } catch (e) {
    console.log("  fail", url?.split("/").pop(), e.message);
    failed++;
  }
}
console.log(`measured ${measured}, already had ${skipped}, failed ${failed}`);
if (!measured) { console.log("nothing to write"); process.exit(0); }

const body = await new Promise((res, rej) => {
  const w = new Writer({ prefixes: { ex: EX, schema: SCHEMA, con: "https://solidproject.solidcommunity.net/catalog/taxonomy#", skos: "http://www.w3.org/2004/02/skos/core#", dcterms: "http://purl.org/dc/terms/", xsd: XSD } });
  w.addQuads(store.getQuads(null, null, null, null));
  w.end((e, r) => (e ? rej(e) : res(r)));
});

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
const st = await page.evaluate(([u, b]) => window.__gallery.put(u, b, "text/turtle"), [CATALOG_URL, body]);
console.log("catalog.ttl ->", st);
await browser.close();
console.log("done");
