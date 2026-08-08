import { type Page, expect } from "@playwright/test";

// Credentials come from .env (loaded in playwright.config.ts) — never hardcoded.
export const POD = {
  idp: process.env.TEST_POD_IDP || "https://pod.mpeters.dev/",
  email: process.env.TEST_POD_EMAIL || "",
  password: process.env.TEST_POD_PASSWORD || "",
};

/**
 * Drives the Community Solid Server (CSS) Identity Provider login + consent
 * pages after the app has redirected to them. Handles the small markup
 * differences across CSS versions defensively.
 */
export async function completeCssLogin(page: Page) {
  // We should now be on the IdP (the pod host), not localhost.
  await page.waitForURL(/pod\.mpeters\.dev/, { timeout: 30_000 });

  // --- Email + password form ---
  const email = page
    .locator(
      'input[name="email"], input[type="email"], input#email'
    )
    .first();
  await email.waitFor({ state: "visible", timeout: 20_000 });
  await email.fill(POD.email);

  const password = page
    .locator('input[name="password"], input[type="password"], input#password')
    .first();
  await password.fill(POD.password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page
      .locator(
        'button:has-text("Log in"), button:has-text("Login"), button[type="submit"], input[type="submit"]'
      )
      .first()
      .click(),
  ]);

  // --- Consent / authorization page (if shown) ---
  await authorizeIfPresent(page);
}

export async function authorizeIfPresent(page: Page) {
  // CSS shows an "Authorize" / "Consent" page granting the app access.
  const authorize = page
    .locator(
      'button:has-text("Authorize"), button:has-text("Consent"), button:has-text("Allow"), button:has-text("Continue")'
    )
    .first();
  try {
    await authorize.waitFor({ state: "visible", timeout: 8_000 });
    await authorize.click();
  } catch {
    // No consent screen (already authorized) — fine.
  }
}

/** Full login starting from the app's "Log in" dialog on localhost. */
export async function loginToGallery(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /log in/i }).first().click();

  // Dialog: IdP prefilled with the test pod; click continue.
  const idpInput = page.locator('input[value*="pod.mpeters.dev"]');
  await idpInput.waitFor({ state: "visible", timeout: 10_000 });

  await page.getByRole("button", { name: /continue to log in/i }).click();

  await completeCssLogin(page);

  // Back on the app, logged in: avatar menu trigger replaces "Log in".
  await page.waitForURL(/localhost:5180/, { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: /log in/i }).first()
  ).toHaveCount(0, { timeout: 20_000 });
}
