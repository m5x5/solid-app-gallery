// Best-effort: attempts to SIGN IN to each catalog app using the test pod's
// Solid identity (alice). Third-party Solid apps each expose their own login UI,
// so this uses broad heuristics: open the app -> click a login affordance ->
// enter the pod IdP into a WebID/IdP field (or pick a provider) -> complete the
// Community Solid Server credential + consent screens -> detect return.
//
// It writes a report to scripts/signin-report.json and a screenshot per app to
// public/signin/<slug>.png. This is exploratory automation, not a pass/fail gate.
//
// Usage: LIMIT=10 node scripts/signin-apps.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/signin");
mkdirSync(OUT, { recursive: true });

import { POD } from "./lib-env.mjs";

const { apps } = JSON.parse(readFileSync(join(ROOT, "src/data/apps.json"), "utf8"));
const screens = JSON.parse(readFileSync(join(ROOT, "src/data/screens.json"), "utf8"));
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

// Only attempt apps that have a landing page (and we captured a screen for).
const targets = apps
  .filter((a) => a.landingPage && screens[a.id])
  .slice(0, LIMIT);

const LOGIN_RE = /log ?in|sign ?in|connect|get started|continue with solid|authenticate/i;
const IDP_FIELD_RE = /webid|idp|identity provider|pod|issuer|oidc|https?:\/\//i;

function slugFor(a) {
  return (a.name || a.id).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60);
}

async function clickFirst(page, re, timeout = 4000) {
  const loc = page.locator("a, button, [role=button]").filter({ hasText: re });
  const n = Math.min(await loc.count(), 6);
  for (let i = 0; i < n; i++) {
    try {
      const el = loc.nth(i);
      if (await el.isVisible()) {
        await el.click({ timeout });
        return true;
      }
    } catch { /* next */ }
  }
  return false;
}

async function fillIdp(page) {
  // Find a text/url input that plausibly takes an IdP/WebID.
  const inputs = page.locator('input[type="text"], input[type="url"], input:not([type])');
  const n = Math.min(await inputs.count(), 8);
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      const ph = (await el.getAttribute("placeholder")) || "";
      const name = (await el.getAttribute("name")) || "";
      const aria = (await el.getAttribute("aria-label")) || "";
      if (IDP_FIELD_RE.test(`${ph} ${name} ${aria}`)) {
        await el.fill(POD.idp);
        return true;
      }
    } catch { /* next */ }
  }
  return false;
}

async function completeCss(page) {
  // CSS credential page
  try {
    await page.waitForURL(/home-server\.taild91db4\.ts\.net/, { timeout: 12000 });
  } catch {
    return "no-redirect-to-idp";
  }
  try {
    await page.locator("#email, input[name=email], input[type=email]").first().fill(POD.email, { timeout: 8000 });
    await page.locator("#password, input[type=password]").first().fill(POD.password);
    await page.locator('button[type=submit], button:has-text("Log in")').first().click();
  } catch {
    return "credential-step-failed";
  }
  // consent
  try {
    const authorize = page.locator('button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow")').first();
    await authorize.waitFor({ state: "visible", timeout: 8000 });
    await authorize.click();
  } catch { /* maybe no consent */ }
  return "ok";
}

async function attempt(context, app) {
  const page = await context.newPage();
  const slug = slugFor(app);
  const origin = new URL(app.landingPage).origin;
  const out = { id: app.id, name: app.name, landingPage: app.landingPage, result: "fail", detail: "" };
  try {
    await page.goto(app.landingPage, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1500);
    await clickFirst(page, /accept|agree|got it|allow all/i, 1500).catch(() => {});

    const openedLogin = await clickFirst(page, LOGIN_RE);
    if (!openedLogin) { out.detail = "no login affordance found"; }
    await page.waitForTimeout(1500);

    const filled = await fillIdp(page);
    if (filled) {
      // submit the IdP form (Enter or a login/continue button)
      if (!(await clickFirst(page, /log ?in|continue|connect|next|go/i, 3000))) {
        await page.keyboard.press("Enter").catch(() => {});
      }
      const css = await completeCss(page);
      out.detail = `idp-submitted; css:${css}`;
      // Did we return to the app origin?
      try {
        await page.waitForURL((u) => u.href.startsWith(origin), { timeout: 15000 });
        out.result = css === "ok" ? "signed-in" : "partial";
      } catch {
        out.result = css === "ok" ? "partial" : "fail";
      }
    } else {
      out.detail = (out.detail ? out.detail + "; " : "") + "no IdP/WebID field";
      out.result = openedLogin ? "login-opened" : "fail";
    }
  } catch (e) {
    out.detail = (e.message || "").slice(0, 80);
  } finally {
    try { await page.screenshot({ path: join(OUT, `${slug}.png`) }); } catch {}
    await page.close().catch(() => {});
  }
  console.log(`${out.result.padEnd(11)} ${app.name} — ${out.detail}`);
  return out;
}

async function run() {
  const browser = await chromium.launch();
  const report = [];
  for (const app of targets) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 440, height: 953 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    report.push(await attempt(context, app));
    await context.close();
  }
  await browser.close();
  writeFileSync(join(__dirname, "signin-report.json"), JSON.stringify(report, null, 2));
  const by = report.reduce((m, r) => ((m[r.result] = (m[r.result] || 0) + 1), m), {});
  console.log("\nSummary:", JSON.stringify(by));
  console.log("Report -> scripts/signin-report.json");
}

run();
