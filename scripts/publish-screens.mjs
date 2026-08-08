// Logs in as the admin via the running dev server, opens an app's detail page,
// and clicks "Publish to catalog" to promote the admin's uploaded screenshots
// into catalog.ttl. Usage: node scripts/publish-screens.mjs <appId> [pattern]
import { chromium } from "@playwright/test";
import { POD } from "./lib-env.mjs";

const APP_ID = process.argv[2];
const PATTERN = process.argv[3] || "Dashboard";
if (!APP_ID) {
  console.error("usage: node scripts/publish-screens.mjs <appId> [pattern]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
page.on("console", (m) => m.text().includes("error") && console.log("page:", m.text()));

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

await page.goto(`http://localhost:5180/app/${encodeURIComponent(APP_ID)}`);
await page.getByRole("heading", { level: 2, name: "Screens" }).waitFor({ timeout: 15000 });
await page.waitForTimeout(2500); // let uploads load

const publishBtn = page.getByRole("button", { name: /Publish to catalog/i });
if (!(await publishBtn.isVisible().catch(() => false))) {
  console.error("Publish button not visible — no admin uploads for this app?");
  await browser.close();
  process.exit(2);
}
await page.locator('select[aria-label="Screen pattern tag"]').selectOption(PATTERN);
await publishBtn.click();
await page
  .getByText(/Published \d+ screenshot/)
  .waitFor({ timeout: 30000 });
const status = await page.getByText(/Published \d+ screenshot/).textContent();
console.log("status:", status);
await page.waitForTimeout(1500);
await browser.close();
console.log("done");
