// Desktop (1280x800, MacBook Pro M1 16:10) capture of the dokieli sign-in flow —
// the same steps as the mobile capture (scripts/capture-dokieli-flow.mjs):
// landing -> tools menu -> sign-in dialog -> Sign in with Solid -> CSS login -> signed in.
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { POD } from "./lib-env.mjs";

const OUT =
  "/private/tmp/claude-501/-Users-michael-Software-opensource-solid-app-gallery/5bba3d71-d25b-4237-96f6-c468fe2edb2d/scratchpad/dokieli-desktop";
const URL = "https://dokie.li/";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, // 16:10
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
async function snap(name) {
  const buf = await page.screenshot();
  const webp = await sharp(buf).resize(1280, 800, { fit: "cover", position: "top" }).webp({ quality: 82 }).toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, webp);
  console.log(`  snap ${name}.webp ${webp.length}`);
}

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Landing
await snap("dokieli-desktop-1");

// 2) Tools / actions menu
await page.locator("button.do-menu").first().click();
await page.waitForTimeout(1000);
await snap("dokieli-desktop-2");

// 3) Sign-in dialog (providers)
await page.getByText("Sign in", { exact: true }).first().click();
await page.waitForTimeout(1000);
await snap("dokieli-desktop-3");

// Sign in with Solid -> pod provider -> Continue
await page.getByText(/Sign in with Solid/i).first().click();
await page.waitForTimeout(800);
const provider = page.locator("#solid-provider-url");
await provider.click();
await provider.press("ControlOrMeta+A");
await provider.press("Backspace");
await provider.pressSequentially(POD.idp, { delay: 35 });
await page.waitForTimeout(500);
await page.locator("button.do-signin-provider-go").first().click();

// CSS credentials + consent
await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 25000 });
const emailF = page.locator("#email, input[name=email], input[type=email]").first();
await emailF.waitFor({ state: "visible", timeout: 20000 });
await emailF.fill(POD.email);
await page.locator("#password, input[type=password]").first().fill(POD.password);
await page.locator('button[type=submit], button:has-text("Log in")').first().click();
const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
await authorize.waitFor({ state: "visible", timeout: 20000 });
await authorize.click();

// Signed in — open the menu to show the logged-in state
await page.waitForURL(/dokie\.li/, { timeout: 30000 });
await page.waitForTimeout(5000);
await page.locator("button.do-menu").first().click().catch(() => {});
await page.waitForTimeout(1500);
await snap("dokieli-desktop-4");

await browser.close();
console.log("DONE");
