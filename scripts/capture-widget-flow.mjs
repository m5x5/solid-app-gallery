// One-off: capture the onboarding flow of the "Solid authorization Widget"
// (bourgeoa solid-file-widget) as mobile webp frames and add them to the gallery.
// The widget's login is currently broken — clicking Connect opens the pod's data
// browser ("not publicly readable") instead of completing the widget's own auth,
// so we document the flow up to that break point.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:69fbb4f7-97a8-48c3-bc5a-6f706cc96120"; // Solid authorization Widget
const URL = "https://bourgeoa.solidcommunity.net/public/solid-file-widget/";
const WEBID = "https://pod.mpeters.dev/test/profile/card#me";

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
  const name = `solid-authorization-widget-${suffix}.webp`;
  const buf = await page.screenshot();
  await toWebp(buf, join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Onboarding banner
await snap(page, 1, ["Onboarding"]);

// 2) Connect form (login form with WebID/pod input)
await page.locator("text=Connect your Solid Pod").first().click();
await page.waitForTimeout(1200);
await page.locator('input').first().fill(WEBID);
await page.waitForTimeout(400);
await snap(page, 2, ["Login"]);

// 3) Click Connect -> a popup opens (the pod data browser); capture it.
try {
  const [popup] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 15000 }),
    page.locator('button:has-text("Connect"), input[type=submit]').first().click(),
  ]);
  // Popups open at desktop width — force the mobile viewport so the screenshot
  // is phone-proportioned (9:19.5) and fills the card without zoom/crop.
  await popup.setViewportSize(PHONE.viewport);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.waitForTimeout(3000);
  await snap(popup, 3, ["Other"]);
} catch (e) {
  console.log("  no popup:", (e.message || "").slice(0, 60));
}

await browser.close();

// Merge frames into the manifest for this app.
const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for Solid authorization Widget.`);
