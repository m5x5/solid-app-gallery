import { defineConfig, devices } from "@playwright/test";

// Load test pod credentials from the (non-committed) .env into process.env.
try {
  process.loadEnvFile(".env");
} catch {
  /* fall back to ambient env vars */
}

// E2E config for the Solid App Gallery. Boots the Vite dev server, then runs
// flows that log into the test Community Solid Server pod, upload screenshots,
// and exercise sign-in.
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // Pod-dependent tests can flake under load (remote pod latency); allow one retry.
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5180",
    headless: true,
    ignoreHTTPSErrors: true, // pod is served over Tailscale TLS
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    actionTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5180",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
