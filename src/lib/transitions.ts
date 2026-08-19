// Shared-element view transitions between list cards and detail pages.
//
// The detail page marks its hero icon/name with a stable name; a card can't
// carry the same name statically because the same app may appear several
// times in one grid (one card per screen), and duplicate view-transition-names
// abort the transition. So a card *arms* the names on the clicked elements only,
// synchronously in the click handler — before react-router snapshots the old
// page — and everything else stays unnamed.
export function appTransitionName(id: string, part: "icon" | "name"): string {
  return `app-${part}-${id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}`;
}

// Call from a card link's onClick with the link element and the app id. The
// icon/name inside are located via data-vt="icon" / data-vt="name".
export function armAppTransition(link: HTMLElement, id: string) {
  const icon = link.querySelector<HTMLElement>('[data-vt="icon"]');
  const name = link.querySelector<HTMLElement>('[data-vt="name"]');
  if (icon) icon.style.viewTransitionName = appTransitionName(id, "icon");
  if (name) name.style.viewTransitionName = appTransitionName(id, "name");
}

// Screenshot → screen detail: the clicked frame morphs into the big frame.
// Same arm-on-click scheme (a frame can appear more than once on a page).
export function screenTransitionName(appId: string, index: number): string {
  return `screen-${appId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50)}-${index}`;
}
export function armScreenTransition(link: HTMLElement, appId: string, index: number) {
  const shot = link.querySelector<HTMLElement>('[data-vt="shot"]') || link;
  shot.style.viewTransitionName = screenTransitionName(appId, index);
}

// The screen currently/last shown in the detail view. When the detail closes
// (X, Escape, back), the page underneath renders the matching thumbnail with
// the same view-transition-name so the big frame morphs back into it. Only
// one thumbnail per page can match (app + index), so names stay unique.
let lastOpened: { appId: string; index: number } | null = null;
export function setLastOpenedScreen(appId: string, index: number) {
  lastOpened = { appId, index };
}
// Static name for a thumbnail iff it is the last-opened screen (the return
// direction); arm-on-click still handles the forward direction.
export function returnScreenTransitionName(appId: string, index: number): string | undefined {
  return lastOpened && lastOpened.appId === appId && lastOpened.index === index
    ? screenTransitionName(appId, index)
    : undefined;
}
