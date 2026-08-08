import {
  Session,
  SessionEvents,
  type SessionStateChangeDetail,
} from "@uvdsl/solid-oidc-client-browser";
// Self-contained refresh worker shipped by the library; Vite serves it as a URL.
import workerUrl from "@uvdsl/solid-oidc-client-browser/RefreshWorker?url";

// Default Identity Provider — the user's test Community Solid Server pod.
export const DEFAULT_IDP = "https://pod.mpeters.dev/";

export type SolidSession = { isLoggedIn: boolean; webId?: string };

const REDIRECT_URI = window.location.origin + "/";

let session: Session | null = null;
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

function getSession(): Session {
  if (session) return session;
  session = new Session(
    {
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
  await getSession().login(oidcIssuer, REDIRECT_URI);
}

export async function endLogin() {
  await getSession().logout();
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
