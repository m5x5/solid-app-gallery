import {
  Session,
  SessionEvents,
  type SessionStateChangeDetail,
} from "@uvdsl/solid-oidc-client-browser";
// Self-contained refresh worker shipped by the library; Vite serves it as a URL.
// Patched (see patches/@uvdsl+solid-oidc-client-browser+*.patch) to fall back to
// a plain Worker via @okikio/sharedworker on browsers without SharedWorker
// (Android Chrome/Firefox, iOS) instead of throwing.
import workerUrl from "@uvdsl/solid-oidc-client-browser/RefreshWorker?url";
import { resolveLoginTarget } from "./oidc-issuer";

// Default Identity Provider — the user's test Community Solid Server pod.
export const DEFAULT_IDP = "https://pod.mpeters.dev/";
export const CLIENT_ID = "https://solid-app-gallery.mpeters.dev/id.jsonld";

export type SolidSession = { isLoggedIn: boolean; webId?: string };

const REDIRECT_URI = window.location.origin + "/";
const STATIC_CLIENT_ORIGINS = new Set([
  "https://solid-app-gallery.mpeters.dev",
  "http://localhost:5180",
]);
const USE_STATIC_CLIENT_ID = STATIC_CLIENT_ORIGINS.has(window.location.origin);
const CLIENT_MODE_KEY = "solid-gallery.oidc-client-mode";

let session: Session | null = null;
let sessionUsesStaticClientId: boolean | null = null;
let ready: Promise<void> | null = null;
const listeners = new Set<(s: SolidSession) => void>();

function snapshot(): SolidSession {
  return { isLoggedIn: !!session?.isActive, webId: session?.webId };
}

function emit() {
  const snap = snapshot();
  for (const l of listeners) l(snap);
}

export function onSessionChange(cb: (s: SolidSession) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function storedStaticClientMode(): boolean {
  try {
    return window.sessionStorage.getItem(CLIENT_MODE_KEY) === "sai";
  } catch {
    return false;
  }
}

function saveStaticClientMode(useStaticClientId: boolean) {
  try {
    window.sessionStorage.setItem(CLIENT_MODE_KEY, useStaticClientId ? "sai" : "dynamic");
  } catch {
    // The OIDC session still works when storage is unavailable; this only
    // selects the matching configuration after the redirect.
  }
}

function clearStaticClientMode() {
  try {
    window.sessionStorage.removeItem(CLIENT_MODE_KEY);
  } catch {
    // Ignore private-mode storage failures.
  }
}

function getSession(useStaticClientId = sessionUsesStaticClientId ?? storedStaticClientMode()): Session {
  if (session) return session;
  sessionUsesStaticClientId = useStaticClientId;
  session = new Session(
    useStaticClientId
      ? { client_id: CLIENT_ID }
      : {
          redirect_uris: [REDIRECT_URI],
          client_name: "Solid App Gallery",
        },
    { workerUrl }
  );
  session.addEventListener(SessionEvents.STATE_CHANGE, (e: Event) => {
    const detail = (e as CustomEvent<SessionStateChangeDetail>).detail;
    void detail;
    emit();
  });
  return session;
}

// Restore a prior session, or complete the OIDC redirect handshake if we just
// came back from the IdP (URL carries ?code=&state=).
export function restoreSession(): Promise<SolidSession> {
  if (ready) return ready.then(snapshot);
  const s = getSession();
  const hasCode = /[?&]code=/.test(window.location.search);
  ready = (async () => {
    try {
      if (hasCode) {
        await s.handleRedirectFromLogin();
        // strip ?code/?state from the address bar
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        await s.restore();
      }
    } catch (err) {
      console.warn("solid restore/redirect failed:", err);
    }
  })();
  return ready.then(snapshot);
}

export async function startLogin(oidcIssuer: string = DEFAULT_IDP) {
  const target = await resolveLoginTarget(oidcIssuer);
  // CSS and other standard Solid servers keep their working dynamic client
  // registration. A WebID that advertises an SAI authorization agent instead
  // uses the stable client document required to resolve its access needs.
  const useStaticClientId = USE_STATIC_CLIENT_ID && target.isSai;
  if (session && sessionUsesStaticClientId !== useStaticClientId) {
    session = null;
    sessionUsesStaticClientId = null;
    ready = null;
  }
  saveStaticClientMode(useStaticClientId);
  await getSession(useStaticClientId).login(target.issuer, REDIRECT_URI);
}

export async function endLogin() {
  if (!session) {
    clearStaticClientMode();
    return;
  }
  await getSession().logout();
  clearStaticClientMode();
  emit();
}

// Authenticated fetch bound to the active session (DPoP + access token).
export function solidFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return getSession().authFetch(input, init);
}

export function currentWebId(): string | undefined {
  return session?.webId;
}
