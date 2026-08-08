// Records the Focus onboarding + functionality flow as a WebM video (mobile),
// logging in with the test pod account, and saves it to public/videos/focus.webm.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POD } from "./lib-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VID_DIR = join(ROOT, "public/videos");
const TMP = join(ROOT, ".video-tmp");
mkdirSync(VID_DIR, { recursive: true });
mkdirSync(TMP, { recursive: true });

const APP_ID = "urn:uuid:48f199c8-3ee1-4c77-9f8d-98215178c39e"; // Focus
const URL = "https://focus.noeldemartin.com";
const SIZE = { width: 440, height: 953 };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: SIZE,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: true,
  recordVideo: { dir: TMP, size: SIZE },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
// Keep the landing pinned to the top — no parallax/scroll in the recording.
await page.addStyleTag({ content: "html,body{scroll-behavior:auto!important}" });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500); // brief dwell on landing (no scroll)

// Login — keep scroll at top through the click.
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole("button", { name: /log in/i }).first().click();
await page.waitForTimeout(1500);
await page.locator('input[type="text"], input[type="url"], input').first().fill(POD.idp);
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /^log in$/i }).first().click();

// IdP credential page
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 25000 });
const email = page.locator("#email, input[name=email], input[type=email]").first();
await email.waitFor({ state: "visible", timeout: 20000 });
await email.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.waitForTimeout(800);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();

// Consent
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(600);
await authorize.click();

// Back at Focus: wait on the actual logged-in state (don't dwell on idle/sync).
await page.waitForURL(/focus\.noeldemartin\.com/, { timeout: 30000 });
const getStarted = page.getByText(/let'?s get started/i).first();
const inbox = page.getByText(/^inbox$/i).first();
await Promise.race([
  getStarted.waitFor({ state: "visible", timeout: 25000 }).catch(() => {}),
  inbox.waitFor({ state: "visible", timeout: 25000 }).catch(() => {}),
]);

// If onboarding asks for the first task, create it so we land on the Inbox.
if (await getStarted.isVisible().catch(() => false)) {
  await page.waitForTimeout(1000); // brief beat to show the prompt
  await page.locator("input").first().fill("Test Solid App Gallery integration");
  await page.getByRole("button", { name: /continue/i }).first().click();
  await inbox.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
}
await page.waitForTimeout(1500); // short final dwell, then stop recording

const vpath = await page.video().path();
await ctx.close(); // finalizes the recording at vpath
await browser.close();

const target = join(VID_DIR, "focus.webm");
copyFileSync(vpath, target);
console.log("Saved video ->", target);

// Register the video on the app entry.
const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
if (s[APP_ID]) {
  s[APP_ID].video = "/videos/focus.webm";
  writeFileSync(SCR, JSON.stringify(s, null, 2));
  console.log("Registered video on Focus entry.");
}
