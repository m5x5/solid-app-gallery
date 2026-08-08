// Captures a MOBILE screenshot of every catalog app's landing page, advanced to
// the point right before sign-in (i.e. it opens the sign-in screen/field but
// does NOT enter credentials). Output: public/screens/<slug>.png + a manifest at
// src/data/screens.json mapping appId -> "/screens/<slug>.png".
//
// Usage:
//   node scripts/capture-screens.mjs              # all apps
//   LIMIT=20 node scripts/capture-screens.mjs     # first 20
//   CONCURRENCY=4 node scripts/capture-screens.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { aHash, hamming, toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/screens");
const MANIFEST = join(ROOT, "src/data/screens.json");

const { apps } = JSON.parse(
  readFileSync(join(ROOT, "src/data/apps.json"), "utf8")
);

// Live-app URL overrides for repository apps (resolved separately).
const OVERRIDES = existsSync(join(__dirname, "live-overrides.json"))
  ? JSON.parse(readFileSync(join(__dirname, "live-overrides.json"), "utf8"))
  : {};
// Tag cache: reuse vision tags for visually-identical frames across re-captures.
const TAG_CACHE = existsSync(join(__dirname, "tag-cache.json"))
  ? JSON.parse(readFileSync(join(__dirname, "tag-cache.json"), "utf8"))
  : [];
const DUP_BITS = 6; // frames within 6/256 bits are near-identical -> skip
const CACHE_BITS = 8; // hash within 8/256 bits -> reuse cached tags

function lookupCachedTags(hash) {
  let best = null,
    bestD = Infinity;
  for (const e of TAG_CACHE) {
    const d = hamming(hash, e.hash);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return bestD <= CACHE_BITS ? best.tags : null;
}

const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 4;
const NAV_TIMEOUT = 25_000;

const targets = apps
  .map((a) => ({ ...a, landingPage: OVERRIDES[a.id] || a.landingPage }))
  .filter((a) => a.landingPage && /^https?:/.test(a.landingPage))
  .slice(0, LIMIT);

mkdirSync(OUT_DIR, { recursive: true });

// Newest large iPhone (16 Pro Max) logical width is 440 pt. We keep the height
// matched to the gallery's PhoneFrame container ratio (9 : 19.5) so captured
// screenshots fill the card with no object-cover cropping.
// 440 × 953 ≈ 9/19.5. deviceScaleFactor 3 -> crisp 1320 × 2859 PNGs.
const PHONE = {
  viewport: { width: 440, height: 953 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

// Selectors that typically open a sign-in surface. We click the first match to
// reveal the sign-in field, then screenshot (without typing anything).
const SIGNIN_RE =
  /^(sign in|signin|log in|login|get started|sign up|continue|register|account)$/i;

function slugFor(a) {
  return (a.name || a.id)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

async function dismissBanners(page) {
  const labels = [/accept/i, /agree/i, /got it/i, /allow all/i, /reject all/i];
  for (const re of labels) {
    const btn = page.getByRole("button", { name: re }).first();
    try {
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 1500 });
        break;
      }
    } catch {
      /* ignore */
    }
  }
}

async function openSignin(page) {
  // Prefer a visible element whose text matches a sign-in affordance.
  const candidates = page
    .locator("a, button, [role=button]")
    .filter({ hasText: SIGNIN_RE });
  const n = Math.min(await candidates.count(), 8);
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      const txt = ((await el.innerText()) || "").trim();
      if (!SIGNIN_RE.test(txt)) continue;
      await el.click({ timeout: 4000 });
      await page.waitForTimeout(2500);
      return txt;
    } catch {
      /* try next */
    }
  }
  return null;
}

// Classify what the captured screen actually shows, into Mobbin-style screen
// patterns. A screen can carry multiple tags. Runs in the page context.
async function classifyScreen(page, clickedLabel) {
  let tags = [];
  try {
    tags = await page.evaluate(() => {
      const txt = (document.body.innerText || "").toLowerCase();
      const hasPw = !!document.querySelector('input[type="password"]');
      const hasWebId = /webid|identity provider|pod provider|oidc|solidcommunity/.test(txt);
      const t = new Set();
      const has = (re) => re.test(txt);
      if (has(/\b(sign ?up|create (an?|your) account|create account|register|join now|get started for free)\b/))
        t.add("Signup");
      if (hasPw || has(/\b(log ?in|sign ?in|welcome back|enter your password)\b/))
        t.add("Login");
      if (hasWebId && (hasPw || document.querySelector("input"))) t.add("Login");
      if (has(/\b(welcome|get started|let'?s get started|let'?s begin|onboard|getting started)\b/))
        t.add("Onboarding");
      if (has(/\b(dashboard|your feed|home feed|inbox|overview|activity|notifications)\b/))
        t.add("Dashboard");
      if (has(/\b(profile|account settings|edit profile|your account|preferences)\b/))
        t.add("Profile");
      return [...t];
    });
  } catch {
    /* ignore */
  }
  // Reinforce from the affordance we clicked to reach the screen.
  if (clickedLabel) {
    const c = clickedLabel.toLowerCase();
    if (/sign ?up|register|create/.test(c)) tags.push("Signup");
    if (/log ?in|sign ?in/.test(c)) tags.push("Login");
    if (/get started|continue/.test(c)) tags.push("Onboarding");
  }
  const uniq = [...new Set(tags)];
  // Landing pages with no clear signal default to Onboarding (first-run/welcome).
  return uniq.length ? uniq : ["Onboarding"];
}

// Capture a SEQUENCE of real frames per app so the discover carousel has genuine
// next/previous screens: (1) landing top, (2) scrolled view, (3) sign-in screen.
// Frames that didn't actually change state are skipped — dot count stays honest.
async function captureOne(context, app) {
  const page = await context.newPage();
  const slug = slugFor(app);
  const frames = [];
  const keptHashes = [];
  // Capture, de-dup against already-kept frames (perceptual hash), save as webp,
  // and reuse cached vision tags when the frame is visually known.
  async function snap(suffix, tagsClicked) {
    const buf = await page.screenshot(); // Buffer, no path
    const hash = await aHash(buf);
    if (keptHashes.some((h) => hamming(h, hash) <= DUP_BITS)) return false; // dup
    keptHashes.push(hash);
    const name = `${slug}-${suffix}.webp`;
    await toWebp(buf, join(OUT_DIR, name));
    const cached = lookupCachedTags(hash);
    const tags = cached || (await classifyScreen(page, tagsClicked));
    frames.push({ path: `/screens/${name}`, tags, hash, needsVision: !cached });
    return true;
  }
  try {
    await page.goto(app.landingPage, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(1800);
    await dismissBanners(page);

    // Frame 1: landing (top).
    await snap(1);

    // Frame 2: scrolled view — only if the page actually scrolls.
    const scrolled = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollTo(0, Math.round(window.innerHeight * 0.85));
      return window.scrollY > before + 50;
    });
    if (scrolled) {
      await page.waitForTimeout(700);
      await snap(2);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
    }

    // Frame 3: sign-in screen — only if an affordance was actually clicked and
    // it changed the view.
    const urlBefore = page.url();
    const clicked = await openSignin(page);
    if (clicked) {
      await page.waitForTimeout(1200);
      await snap(3, clicked);
    }
    void urlBefore;

    console.log(
      `✓ ${app.name}  ${frames.length} frame(s)  [${[...new Set(frames.flatMap((f) => f.tags))].join(", ")}]`
    );
    return { id: app.id, slug, frames };
  } catch (err) {
    try {
      if (!frames.length) await snap(1);
      console.log(`~ ${app.name}  ${frames.length} frame(s)  (partial: ${(err.message || "").slice(0, 50)})`);
      return frames.length ? { id: app.id, slug, frames } : null;
    } catch {
      console.log(`✗ ${app.name}  (${(err.message || "").slice(0, 50)})`);
      return null;
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...PHONE,
    ignoreHTTPSErrors: true,
  });
  const results = [];
  const queue = [...targets];
  async function worker() {
    while (queue.length) {
      const app = queue.shift();
      const r = await captureOne(context, app);
      if (r) results.push(r);
    }
  }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );
  await browser.close();

  const manifest = Object.fromEntries(
    results.map((r) => {
      const tags = [...new Set(r.frames.flatMap((f) => f.tags))];
      return [
        r.id,
        {
          path: r.frames[0].path, // primary frame (back-compat / grid thumbnail)
          tags, // union across frames (used by filters)
          frames: r.frames, // ordered real frames for the carousel
        },
      ];
    })
  );
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  const totalFrames = results.reduce((n, r) => n + r.frames.length, 0);
  const needVision = results
    .flatMap((r) => r.frames)
    .filter((f) => f.needsVision)
    .map((f) => f.path.split("/").pop().replace(".webp", ""));
  console.log(
    `\nCaptured ${results.length}/${targets.length} apps, ${totalFrames} frames. Manifest -> src/data/screens.json`
  );
  console.log(
    `Frames reusing cached tags: ${totalFrames - needVision.length}; needing vision (${needVision.length}): ${needVision.join(", ") || "none"}`
  );
}

run();
