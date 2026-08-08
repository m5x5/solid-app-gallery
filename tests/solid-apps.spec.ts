import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loginToGallery } from "./helpers/solid-login";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, "fixtures");

test.describe("Solid App Gallery", () => {
  test("renders the discover gallery with apps from the catalog", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Solid Gallery/i })).toBeVisible();
    // Quick-links + at least one app card present.
    await expect(page.getByText("Categories").first()).toBeVisible();
    await expect(page.locator('a[href^="/app/"]').first()).toBeVisible();
  });

  test("bookmark feature: toggle, badge, bookmarks page, persistence", async ({
    page,
  }) => {
    await page.goto("/");
    const firstBookmark = page.locator('button[aria-label="Add bookmark"]').first();
    await firstBookmark.click();

    // Nav badge reflects the count.
    const badge = page.locator('a[aria-label="Bookmarks"] span');
    await expect(badge).toHaveText("1");

    // Bookmarks page shows exactly one saved app.
    await page.locator('a[aria-label="Bookmarks"]').click();
    await expect(page).toHaveURL(/\/bookmarks$/);
    await expect(
      page.locator('[data-testid="bookmarks-grid"] > div')
    ).toHaveCount(1);

    // Persists across reload (localStorage).
    await page.reload();
    await expect(
      page.locator('[data-testid="bookmarks-grid"] > div')
    ).toHaveCount(1);

    // Un-bookmark from the page -> empty state.
    await page.locator('button[aria-label="Remove bookmark"]').first().click();
    await expect(page.getByText(/No bookmarks yet/i)).toBeVisible();
  });

  test("archived and broken apps are hidden from listings", async ({ page }) => {
    await page.goto("/screens");
    // Archived (Poddit) and broken/dead-landing apps must not appear.
    await expect(page.getByText("Poddit", { exact: true })).toHaveCount(0);
    await expect(page.getByText("geopod", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/North Kensington/i)).toHaveCount(0);
    await expect(page.getByText("Solid Health (AU)", { exact: true })).toHaveCount(0);
  });

  test("screens view filters by login pattern (vision-tagged)", async ({ page }) => {
    await page.goto("/screens?pattern=Login");
    await expect(page.getByText(/screens$/).first()).toBeVisible();
    // Login-tagged screens exist (Focus, profile-editor, …); cards open /screen/.
    await expect(page.locator('a[href^="/screen/"]').first()).toBeVisible();
  });

  test("flows view shows onboarding flow rows", async ({ page }) => {
    await page.goto("/flows?action=Onboarding");
    await expect(page.getByText(/flows$/).first()).toBeVisible();
    await expect(page.getByText("Onboarding").first()).toBeVisible();
  });

  test("logs into the Solid pod (sign-in)", async ({ page }) => {
    await loginToGallery(page);
    // Avatar menu shows the WebID when opened.
    await page.locator("header button").last().click();
    await expect(page.getByText(/Signed in/i)).toBeVisible();
  });

  test("uploads screenshots for an app to the pod", async ({ page }) => {
    await loginToGallery(page);

    // Open the first app's detail page via SPA nav (keeps the in-memory session;
    // a full reload can race the uvdsl session restore). Discover cards → /app/.
    await page.locator('a[href^="/app/"]').first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Screens" })).toBeVisible();

    // Upload the two fixture screenshots.
    await page.setInputFiles('[data-testid="screenshot-input"]', [
      join(FIX, "screenshot-1.png"),
      join(FIX, "screenshot-2.png"),
    ]);

    await expect(page.getByText(/Uploaded ✓|Uploading/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Uploaded ✓/)).toBeVisible({ timeout: 30_000 });

    // Clean up: remove the fixture uploads from the pod so test runs don't
    // accumulate solid-color placeholder screenshots on the app's detail page.
    const appId = decodeURIComponent(page.url().split("/app/")[1]);
    await page.evaluate(async (id) => {
      const data = await import("/src/lib/solid-data.ts");
      const auth = await import("/src/lib/solid-auth.ts");
      const urls = await data.listScreenshots(auth.currentWebId(), id);
      for (const u of urls) await auth.solidFetch(u, { method: "DELETE" });
    }, appId);
  });

  test("comments: public and private on a screen, stored in the pod", async ({
    page,
  }) => {
    await loginToGallery(page); // logged in on "/"
    // Navigate within the SPA (keeps the in-memory Solid session) to a screen.
    await page.getByRole("link", { name: "Screens", exact: true }).click();
    await page.locator('a[href^="/screen/"]').first().click();

    const stamp = Date.now();
    const aside = page.locator("aside");
    const input = page.locator('[data-testid="comment-input"]');
    const submit = page.locator('[data-testid="comment-submit"]');

    // Public comment (default "All" tab).
    await input.fill(`public ${stamp}`);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(aside.getByText(`public ${stamp}`)).toBeVisible({ timeout: 25_000 });

    // Private comment.
    await page.getByRole("button", { name: /^private$/i }).click();
    await input.fill(`private ${stamp}`);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(aside.getByText(`private ${stamp}`)).toBeVisible({ timeout: 25_000 });

    // Persisted to the pod: close and reopen the same screen (re-fetches from
    // the pod) — both comments reappear in their tabs.
    await page.getByRole("button", { name: "Close" }).click();
    await page.locator('a[href^="/screen/"]').first().click();
    await expect(aside.getByText(`public ${stamp}`)).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: /^private$/i }).click();
    await expect(aside.getByText(`private ${stamp}`)).toBeVisible({ timeout: 25_000 });
  });

  test("submits a new app to the catalog", async ({ page }) => {
    await loginToGallery(page);
    await page.goto("/submit");

    const stamp = Date.now();
    await page.fill('[data-testid="field-name"]', `E2E Test App ${stamp}`);
    await page.fill(
      'textarea',
      "Created by the Playwright e2e suite."
    );
    await page.getByRole("button", { name: /publish to catalog/i }).click();

    await expect(page.locator('[data-testid="submit-msg"]')).toContainText(
      /Submitted|Failed/,
      { timeout: 30_000 }
    );
  });
});
