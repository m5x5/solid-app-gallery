import * as Sentry from "@sentry/react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App, { routes } from "./App";
import { SolidProvider } from "@/lib/solid-context";
import { BookmarksProvider } from "@/lib/bookmarks";
import { DeviceProvider } from "@/lib/device-context";
import { initCatalog } from "@/lib/apps";
import { solidFetch } from "@/lib/solid-auth";
import { initVirtualKeyboard } from "@/lib/virtual-keyboard";
import "./index.css";

initVirtualKeyboard();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Dev-only upload helpers: admin maintenance scripts (e.g. publishing media or
// editing catalog.ttl) push into the pod through this authenticated session.
if (import.meta.env.DEV) {
  (window as unknown as { __gallery: unknown }).__gallery = {
    put: (url: string, body: string, ct: string) =>
      solidFetch(url, { method: "PUT", headers: { "Content-Type": ct }, body }).then(
        (r) => r.status
      ),
    putBinary: (url: string, b64: string, ct: string) =>
      solidFetch(url, {
        method: "PUT",
        headers: { "Content-Type": ct },
        body: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      }).then((r) => r.status),
  };
}

// Load the catalog from the admin pod (the canonical store) before the first
// render, so every page reads the pod-owned data.
const root = ReactDOM.createRoot(document.getElementById("root")!);

initCatalog()
  .catch(() => "empty")
  .then((source) => {
    if (source !== "pod")
      console.warn("[gallery] admin pod unreachable — no catalog loaded");
    // NOTE: no React.StrictMode — its double-invoked effects would call
    // handleIncomingRedirect twice and consume the one-time OIDC auth code twice.
    // A data router (not <BrowserRouter>) so <Link viewTransition> can drive
    // the View Transitions API. App keeps its own <Routes>; the providers need
    // router context (useSearchParams), so they live inside the route element.
    const router = createBrowserRouter([
      {
        element: (
          <SolidProvider>
            <BookmarksProvider>
              <DeviceProvider>
                <App />
              </DeviceProvider>
            </BookmarksProvider>
          </SolidProvider>
        ),
        children: routes,
      },
    ]);
    root.render(<RouterProvider router={router} />);
  });
