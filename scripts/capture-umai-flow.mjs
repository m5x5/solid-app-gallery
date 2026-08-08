// Capture the Umai (umai.noeldemartin.com) onboarding + functionality flow as
// mobile webp frames, logging in with the test pod account.
// Flow: landing -> "Connect your Solid POD" -> WebID/issuer form -> CSS login ->
// consent -> logged-in recipe collection.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POD } from "./lib-env.mjs";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:387508ca-7b30-4e1a-8aa3-32621b50096a"; // Umai
const URL = "https://umai.noeldemartin.com";
const PHONE = {
  viewport: { width: 440, height: 953 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

const frames = [];
async function snap(page, suffix, tags) {
  const name = `umai-${suffix}.webp`;
  await toWebp(await page.screenshot(), join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Onboarding ("How would you like to begin?")
await snap(page, 1, ["Onboarding"]);

// 2) Connect-your-Pod form (WebID/issuer input).
await page.getByRole("button", { name: /connect your solid pod/i }).first().click();
await page.waitForTimeout(1200);
await page.locator('input[placeholder^="https"], input').first().fill(POD.idp);
await snap(page, 2, ["Login"]);

// Submit -> pod.mpeters.dev. Fill CSS credential page + consent.
await page.getByRole("button", { name: /^log in$/i }).first().click();
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 25000 });
const emailF = page.locator("#email, input[name=email], input[type=email]").first();
await emailF.waitFor({ state: "visible", timeout: 20000 });
await emailF.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await authorize.click();

// Back at Umai: wait for sync, then advance past the "create your cookbook"
// step to the actual recipe collection.
await page.waitForURL(/umai\.noeldemartin\.com/, { timeout: 30000 });
await page.waitForTimeout(6000); // sync + render
const cont = page.getByRole("button", { name: /^continue$/i }).first();
if (await cont.isVisible({ timeout: 3000 }).catch(() => false)) {
  await cont.click();
  await page.waitForTimeout(6000); // create container + load collection
}
// 3) Logged-in functionality (recipe collection / dashboard).
await snap(page, 3, ["Dashboard"]);

await browser.close();

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for Umai: ${frames.map((f) => f.tags).flat().join(", ")}`);
