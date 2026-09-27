import * as Sentry from "@sentry/react";
import { Link, useRouteError, isRouteErrorResponse, useLocation } from "react-router-dom";
import { AlertTriangle, RotateCw, Home, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// Crash screens. Three entry points, all rendering the same panel:
//   <AppErrorBoundary>   — around the page tree, so the nav survives a page crash
//   <RootErrorBoundary>  — around everything, for crashes in the chrome itself
//   <RouteErrorBoundary> — the router's errorElement (also catches unknown URLs)

function ErrorPanel({
  title,
  message,
  detail,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center px-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button onClick={onRetry}>
            <RotateCw className="h-4 w-4" />
            {retryLabel}
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/">
            <Home className="h-4 w-4" />
            Back to the gallery
          </Link>
        </Button>
      </div>

      {/* The technical bit, folded away — useful when reporting, noise otherwise. */}
      {detail && (
        <details className="group mt-8 w-full text-left">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground marker:hidden hover:text-foreground">
            Technical details
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-card p-3 text-left text-xs text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
    </div>
  );
}

function detailFrom(error: unknown): string | undefined {
  if (error instanceof Error)
    return [error.message, error.stack].filter(Boolean).join("\n\n");
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return undefined;
  }
}

// Everything below the app chrome. Sentry reports the error (when a DSN is
// configured) and hands us a reset() that re-renders the subtree; remounting on
// navigation is handled by the caller keying this on the location.
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <Sentry.ErrorBoundary
      // A new key per URL: navigating away from a broken page clears the error
      // instead of leaving the crash screen up.
      key={location.pathname}
      fallback={({ error, resetError }) => (
        <ErrorPanel
          title="This page hit a snag"
          message="Something in this view failed to render. The rest of the gallery still works — try again, or head back to the app list."
          detail={detailFrom(error)}
          onRetry={resetError}
        />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

// The outermost net: if the nav, a provider or the router itself throws there
// is no chrome left to keep, so offer a reload rather than a soft retry.
export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error }) => (
        <div className="min-h-screen bg-background text-foreground">
          <ErrorPanel
            title="The gallery couldn't start"
            message="An unexpected error stopped the app from loading. Reloading usually clears it."
            detail={detailFrom(error)}
            onRetry={() => window.location.reload()}
            retryLabel="Reload"
          />
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

// The router's errorElement: unmatched URLs (a 404 Response thrown by the
// router) and anything a route throws outside React rendering.
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col items-center px-4 py-20 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That URL doesn't exist in the gallery. It may have been a link to an app
          that has since been removed.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4" />
              Back to the gallery
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/screens">Browse screens</Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <ErrorPanel
      title="Something went wrong"
      message={
        status
          ? `The page could not be opened (${status}).`
          : "The page could not be opened. Reloading usually clears it."
      }
      detail={isRouteErrorResponse(error) ? error.data || status || undefined : detailFrom(error)}
      onRetry={() => window.location.reload()}
      retryLabel="Reload"
    />
  );
}
