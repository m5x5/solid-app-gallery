// Records a slow, steady scroll-through of the Focus homepage so all the parallax
// effects and animations are visible. Saves public/videos/focus-homepage.webm and
// registers it (labeled "Homepage walkthrough") on the Focus app entry.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1800); // dwell at the top

// The Focus landing is a scroll-jacked animated story: the document barely
// scrolls; each WHEEL event advances the in-place animations. So we drive it
// with slow, small wheel ticks and stop once the final screen (the
// "Just give it a try…" CTA above the "about | source | v0.3.3" footer) shows.
await page.mouse.move(220, 470);
const footer = page.getByText(/about\s*\|\s*source/i).first();

// The scroll-jack lib only honours trusted (CDP) wheel events. Awaiting each
// mouse.wheel is round-trip bound (~40ms) -> coarse/laggy. Instead pipeline
// fine wheel ticks over a raw CDP session (fire without awaiting) and pace them
// in real time, so we get many small, evenly-timed steps -> smooth motion.
const client = await page.context().newCDPSession(page);
const fire = (dy) =>
  client.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 220,
    y: 470,
    deltaX: 0,
    deltaY: dy,
  });

const STEP = 8; // px per tick
const TOTAL = 9000; // reaches the final screen
const PACE = 13; // ms between ticks -> ~75 ticks/s, ~600 px/s, ~15s
const pending = [];
for (let delta = 0; delta < TOTAL; delta += STEP) {
  pending.push(fire(STEP).catch(() => {}));
  await page.waitForTimeout(PACE);
}
await Promise.allSettled(pending);
// Settle on the final screen with the footer visible.
await footer.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(2200); // dwell on the end / footer

const vpath = await page.video().path();
await ctx.close();
await browser.close();

const target = join(VID_DIR, "focus-homepage.webm");
copyFileSync(vpath, target);
console.log("Saved video ->", target);

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
if (s[APP_ID]) {
  const videos = (s[APP_ID].videos || []).filter(
    (v) => v.label !== "Homepage walkthrough"
  );
  videos.push({ label: "Homepage walkthrough", path: "/videos/focus-homepage.webm" });
  s[APP_ID].videos = videos;
  writeFileSync(SCR, JSON.stringify(s, null, 2));
  console.log("Registered homepage walkthrough on Focus entry.");
}
