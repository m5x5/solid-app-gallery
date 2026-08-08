// Capture Solid Groups (solid-groups.solidcommunity.net): the live "Demo group"
// view + the login popup. Its LOG IN opens the SolidOS solid-ui popup at
// solidcommunity.net/common/popup.html, which 401s (same broken pattern as the
// Solid File Widget) — so we document the popup state.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:a0620a99-64a0-4526-8a86-0e4793993ec4"; // Solid Groups
const URL = "https://solid-groups.solidcommunity.net/";
const SIZE = { width: 440, height: 953 };
const PHONE = {
  viewport: SIZE,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

const frames = [];
async function snap(page, suffix, tags) {
  const name = `solid-groups-${suffix}.webp`;
  await toWebp(await page.screenshot(), join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3000);

// 1) The live "Demo group" view (functional, public).
await snap(page, 1, ["Dashboard"]);

// 2) Click LOG IN -> a popup opens; capture it at mobile size.
const popupPromise = ctx.waitForEvent("page", { timeout: 15000 });
await page.getByRole("button", { name: /log ?in/i }).first().click();
try {
  const popup = await popupPromise;
  await popup.setViewportSize(SIZE);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.waitForTimeout(3000);
  await snap(popup, 2, ["Other"]);
} catch (e) {
  console.log("no popup:", (e.message || "").slice(0, 60));
}

await browser.close();

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for Solid Groups.`);
