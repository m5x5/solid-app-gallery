// A one-shot status message that outlives a remount.
//
// reloadCatalog() notifies App, which re-keys <main> so every view recomputes
// from the fresh catalog — that throws away the page's local state, including
// the "…✓" confirmation of the action that triggered the reload. Park the
// message here first and the remounted page picks it up.
let pending: string | null = null;

export function setFlash(message: string): void {
  pending = message;
}

// Read and clear — safe to call from a useState initializer.
export function takeFlash(): string {
  const message = pending;
  pending = null;
  return message ?? "";
}
