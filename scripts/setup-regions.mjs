// One-time admin setup for the data-region annotations (lib/regions): creates
// <admin>/solid-gallery/regions/ with the same access pattern as comments/ —
// world-readable, any authenticated agent may append (draw a region), only the
// admin has full control. Run with the dev server up: node scripts/setup-regions.mjs
import { chromium } from "@playwright/test";
import { POD } from "./lib-env.mjs";

const ADMIN_POD = process.env.VITE_ADMIN_POD || "https://pod.mpeters.dev/test/";
const DIR = `${ADMIN_POD}solid-gallery/regions/`;
const OWNER = `${ADMIN_POD}profile/card#me`;

const ACL = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
<#owner> a acl:Authorization; acl:agent <${OWNER}>;
  acl:accessTo <./>; acl:default <./>; acl:mode acl:Read, acl:Write, acl:Control.
<#public> a acl:Authorization; acl:agentClass foaf:Agent;
  acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.
<#authed> a acl:Authorization; acl:agentClass acl:AuthenticatedAgent;
  acl:accessTo <./>; acl:mode acl:Append.
<#authedChildren> a acl:Authorization; acl:agentClass acl:AuthenticatedAgent;
  acl:default <./>; acl:mode acl:Read, acl:Append, acl:Write.
`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
process.on("uncaughtException", async (e) => {
  console.error("FAILED at", page.url(), e.message);
  await page.screenshot({ path: "/tmp/solid-gallery-setup-regions-fail.png" }).catch(() => {});
  const html = await page.content().catch(() => "");
  const m = html.match(/<form[\s\S]*?<\/form>/);
  console.error("FORM:", (m ? m[0] : html).slice(0, 3000));
  process.exit(1);
});
process.on("unhandledRejection", async (e) => {
  console.error("FAILED at", page.url(), e && e.message);
  await page.screenshot({ path: "/tmp/solid-gallery-setup-regions-fail.png" }).catch(() => {});
  process.exit(1);
});

await page.goto("http://localhost:5180/");
await page.getByRole("button", { name: /log in/i }).first().click();
// Older builds had a single "continue" button, current ones a provider list.
const cont = page.getByRole("button", { name: /continue to log in/i });
if (await cont.isVisible().catch(() => false)) await cont.click();
else await page.getByRole("button", { name: /Solid Gallery Pod/i }).click();
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 20000 });
await page.locator("#email").fill(POD.email);
await page.locator("#password").fill(POD.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/consent/, { timeout: 15000 }).catch(() => {});
// The account carries several WebIDs — the admin one must be selected
// before Authorize, or the form bounces with "webId is a required field".
if (page.url().includes("consent")) {
  await page.check(`input[name="webId"][value="${OWNER}"]`, { force: true, timeout: 10000 });
  await page.click("#authorize");
}
await page.waitForURL(/localhost:5180/, { timeout: 20000 });
await page.waitForTimeout(2500);

// PUT a marker file (creates the container) and then the container ACL.
const readme = await page.evaluate(
  ([url, body]) => window.__gallery.put(url, body, "text/plain"),
  [`${DIR}README.txt`, "Data-region annotations (Web Annotations), one container per app. See the gallery's screen detail view."]
);
const acl = await page.evaluate(
  ([url, body]) => window.__gallery.put(url, body, "text/turtle"),
  [`${DIR}.acl`, ACL]
);
await browser.close();

console.log(`README.txt: ${readme}, .acl: ${acl}`);
const check = await fetch(DIR, { headers: { Accept: "text/turtle" } });
console.log(`public read of ${DIR}: ${check.status}`);
if (!(readme < 300 && acl < 300 && check.ok)) process.exit(1);
console.log("regions/ is ready — logged-in users can now save data regions.");
