// The ONLY thing the repository owns about the data: where the admin pod is and
// where the content lives inside it. Everything else (app metadata as ex:Software
// Turtle, screenshots, videos, comments) is stored in the pod — the admin pod is
// the canonical store, user pods have the identical layout.
// Canonical admin pod (where catalog.ttl + media live). Public-read; the gallery
// loads it unauthenticated. Override per-deployment with VITE_ADMIN_POD.
export const ADMIN_POD =
  import.meta.env?.VITE_ADMIN_POD || "https://pod.mpeters.dev/test/";

// The admin's WebID (owner of the canonical pod). Only this agent may publish
// uploaded screenshots into the shared catalog.
export const ADMIN_WEBID = `${ADMIN_POD}profile/card#me`;

export const GALLERY_ROOT = `${ADMIN_POD}solid-gallery/`;

// The catalog of apps (ex:Software records + their asset links), as Turtle.
export const CATALOG_URL = `${GALLERY_ROOT}catalog.ttl`;

// Media (screenshots/videos) base — schema:contentUrl IRIs resolve under here.
export const SCREENS_BASE = `${GALLERY_ROOT}screens/`;
export const VIDEOS_BASE = `${GALLERY_ROOT}videos/`;

// Where new submissions and the admin inbox live.
export const SUBMISSIONS_DIR = `${GALLERY_ROOT}submissions/`;
export const ADMIN_INBOX = `${ADMIN_POD}inbox/`;

// Where people can nudge the admin about moderator requests. Set per
// deployment (VITE_ADMIN_MATRIX="@you:matrix.org"); the UI hides the line
// when unset.
export const ADMIN_MATRIX: string = import.meta.env?.VITE_ADMIN_MATRIX || "";
