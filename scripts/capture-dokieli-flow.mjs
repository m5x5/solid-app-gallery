// Capture dokieli (dokie.li) — a browser-based article editor/annotator — and
// log in with the test pod account. The login lives in the top-right burger
// menu: Sign in -> Sign in with Solid -> enter pod provider -> Sign in.
// Frames: landing -> the tools menu -> sign-in dialog -> logged-in menu.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POD } from "./lib-env.mjs";
import { toWebp } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/screens");
const APP_ID = "urn:uuid:e01a124a-688a-4e00-ad67-8b69ef116bbd"; // dokieli
const URL = "https://dokie.li/";
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
  const name = `dokieli-${suffix}.webp`;
  await toWebp(await page.screenshot(), join(OUT, name));
  frames.push({ path: `/screens/${name}`, tags });
  console.log(`  snap ${name} [${tags.join(",")}]`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...PHONE, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Landing.
await snap(page, 1, ["Documentation"]);

// 2) Open the burger menu -> the tools/actions menu (functionality).
await page.locator("button.do-menu").first().click();
await page.waitForTimeout(1000);
await snap(page, 2, ["Other"]);

// 3) Sign in dialog (the provider options).
await page.getByText("Sign in", { exact: true }).first().click();
await page.waitForTimeout(1000);
await snap(page, 3, ["Login"]);

// Sign in with Solid -> enter the pod provider -> submit. The submit button
// (button.signin-user) only enables once the provider is typed (keystroke
// events), so use pressSequentially, then click it (or press Enter).
await page.getByText(/Sign in with Solid/i).first().click();
await page.waitForTimeout(800);
const provider = page.locator("#solid-provider-url");
await provider.click();
await provider.press("ControlOrMeta+A");
await provider.press("Backspace");
await provider.pressSequentially(POD.idp, { delay: 35 });
await page.waitForTimeout(500);
// "Continue" submits the Solid provider OIDC flow.
await page.locator("button.do-signin-provider-go").first().click();

// CSS credential page + consent on pod.mpeters.dev.
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 25000 });
const emailF = page.locator("#email, input[name=email], input[type=email]").first();
await emailF.waitFor({ state: "visible", timeout: 20000 });
await emailF.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await authorize.click();

// Back at dokieli, logged in. Open the menu to show the signed-in state.
await page.waitForURL(/dokie\.li/, { timeout: 30000 });
await page.waitForTimeout(5000);
await page.locator("button.do-menu").first().click().catch(() => {});
await page.waitForTimeout(1500);
await snap(page, 4, ["Dashboard"]);

await browser.close();

const SCR = join(ROOT, "src/data/screens.json");
const s = JSON.parse(readFileSync(SCR, "utf8"));
s[APP_ID] = {
  path: frames[0].path,
  tags: [...new Set(frames.flatMap((f) => f.tags))],
  frames,
};
writeFileSync(SCR, JSON.stringify(s, null, 2));
console.log(`Added ${frames.length} frames for dokieli: ${frames.map((f) => f.tags).flat().join(", ")}`);
