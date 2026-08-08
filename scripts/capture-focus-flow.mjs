// Capture the Focus (focus.noeldemartin.com) onboarding + functionality flow as
// mobile webp frames, logging in with the test pod account. Focus works
// end-to-end (proper Client-ID-Document OIDC), so we get: landing -> login form
// -> logged-in Inbox (task list synced from the pod).
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POD } from "./lib-env.mjs";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:48f199c8-3ee1-4c77-9f8d-98215178c39e"; // Focus
const URL = "https://focus.noeldemartin.com";
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
  const name = `focus-${suffix}.webp`;
  await toWebp(await page.screenshot(), join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Landing (onboarding)
await snap(page, 1, ["Onboarding"]);

// 2) Login form ("Welcome back!" + WebID input)
await page.getByRole("button", { name: /log in/i }).first().click();
await page.waitForTimeout(1200);
await page.locator('input[type="text"], input[type="url"], input').first().fill(POD.idp);
await snap(page, 2, ["Login"]);

// Submit -> pod.mpeters.dev IdP. Then fill the CSS credential page + consent.
await page.getByRole("button", { name: /^log in$/i }).first().click();
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 25000 });

// CSS credential page (email/username + password).
const email = page.locator("#email, input[name=email], input[type=email]").first();
await email.waitFor({ state: "visible", timeout: 20000 });
await email.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();

// Consent / authorize page.
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await authorize.click();

// Back at Focus: wait for return + pod sync to finish.
await page.waitForURL(/focus\.noeldemartin\.com/, { timeout: 30000 });
await page.waitForTimeout(10000);

// If an onboarding "Let's get started" task prompt shows, capture it; else Inbox.
const getStarted = page.getByText(/let'?s get started/i).first();
if (await getStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
  await snap(page, 3, ["Onboarding"]);
  await page.locator('input').first().fill("Test Solid App Gallery integration");
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForTimeout(4000);
}
// 4) Logged-in Inbox / task list (functionality)
await snap(page, frames.length + 1 === 4 ? 4 : 3, ["Dashboard"]);

await browser.close();

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for Focus: ${frames.map((f) => f.tags).flat().join(", ")}`);
