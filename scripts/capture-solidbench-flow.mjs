// Capture SolidBench (solidbench.dev) logged-in with the test pod account.
// SolidBench's IdP picker is a MUI Autocomplete (freeSolo) — type a custom
// provider, press Enter to add+select it, then LOG IN.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POD } from "./lib-env.mjs";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:13649611-ba77-4f08-aa99-3eb2cad1e721"; // SolidBench
const URL = "https://solidbench.dev";
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
  const name = `solidbench-${suffix}.webp`;
  await toWebp(await page.screenshot(), join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);

// 1) The pod browser welcome / functionality (works without login).
await snap(page, 1, ["Dashboard"]);

// Set the custom IdP in the MUI Autocomplete. The input is pre-filled with the
// default ("Solid Community"), so fully clear it before typing the custom URL.
const combo = page.locator('input[role="combobox"]').first();
await combo.click({ clickCount: 3 }); // select existing text
await combo.press("Backspace"); // clear it
await combo.press("ControlOrMeta+A");
await combo.press("Backspace");
await combo.type(POD.idp, { delay: 25 });
await page.waitForTimeout(600);
await page.keyboard.press("Enter"); // freeSolo: add + select the provider
await page.waitForTimeout(600);
console.log("combo value:", await combo.inputValue().catch(() => "?"));

await page.getByRole("button", { name: /log in/i }).first().click();

// Expect a redirect to the pod IdP (NOT solidcommunity.net).
await page.waitForURL(/pod\.mpeters\.dev|solidcommunity\.net/, { timeout: 25000 });
console.log("redirected to:", page.url());
if (/solidcommunity\.net/.test(page.url()))
  throw new Error("Custom IdP not selected — landed on solidcommunity.net");

// CSS credential page + consent.
const emailF = page.locator("#email, input[name=email], input[type=email]").first();
await emailF.waitFor({ state: "visible", timeout: 20000 });
await emailF.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await authorize.click();

// Back at SolidBench, logged in — browsing the user's pod.
await page.waitForURL(/solidbench\.dev/, { timeout: 30000 });
await page.waitForTimeout(8000);
await snap(page, 2, ["Dashboard"]);

await browser.close();

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for SolidBench.`);
