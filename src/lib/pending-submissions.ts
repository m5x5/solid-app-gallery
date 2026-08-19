// Submissions made while logged out.
//
// A submission is a PUT into the submitter's own pod plus an LDN to the admin
// inbox, and the inbox only grants acl:Append to AuthenticatedAgent — so an
// anonymous visitor cannot deliver one. Rather than blocking the form, we keep
// the filled-in submission here and flush the queue to the pod as soon as the
// user logs in (see usePendingSubmissionFlush).
import { newSubmissionId, type AppSubmission } from "./solid-data";

const LS_KEY = "solid-gallery.pending-submissions";

export type PendingSubmission = {
  id: string;
  sub: AppSubmission;
  created: string; // ISO
};

export function readPending(): PendingSubmission[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: PendingSubmission[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* quota or private mode — the in-memory copy still drives the UI */
  }
}

export function addPending(sub: AppSubmission): PendingSubmission {
  const entry: PendingSubmission = {
    // Unique per submission without needing a uuid dependency.
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    // Mint the catalog identity up front so screenshots can be attached to
    // it before the submission is ever sent.
    sub: sub.id ? sub : { ...sub, id: newSubmissionId(sub.name) },
    created: new Date().toISOString(),
  };
  write([...readPending(), entry]);
  notify();
  return entry;
}

export function removePending(id: string) {
  write(readPending().filter((p) => p.id !== id));
  notify();
}

// Edit a still-queued submission in place (keeps its id/created so it stays
// the same list entry rather than becoming a duplicate).
export function updatePending(id: string, sub: AppSubmission): void {
  write(readPending().map((p) => (p.id === id ? { ...p, sub } : p)));
  notify();
}

export function getPending(id: string): PendingSubmission | undefined {
  const p = readPending().find((p) => p.id === id);
  // Entries queued before ids existed: mint one now so it's stable from here on.
  if (p && !p.sub.id) {
    const sub = { ...p.sub, id: newSubmissionId(p.sub.name) };
    updatePending(id, sub);
    return { ...p, sub };
  }
  return p;
}

// Same-tab change notification (the native "storage" event only fires in other
// tabs), so a page showing the queue re-renders when it is flushed or cleared.
const EVENT = "solid-gallery:pending-submissions";
function notify() {
  window.dispatchEvent(new Event(EVENT));
}
export function subscribePending(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
