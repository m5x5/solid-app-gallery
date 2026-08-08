# Solid App Gallery

A **Mobbin-style gallery** for the **Apps & Services** region of the
[Solid Catalog](../catalog). Built with **React + Vite + Tailwind + shadcn/ui**.

It strips the catalog down to apps & services (plus Participation) and keeps the
three things that matter for contribution:

- **Solid login** — sign in with your Solid Identity Provider (the test pod by
  default), via [`@uvdsl/solid-oidc-client-browser`](https://github.com/uvdsl/solid-oidc-client-browser)
  (the same library the original catalog uses — Inrupt's client was unreliable
  against this pod, dropping its handshake state across the redirect).
- **Submit** — publish a new app as RDF/Turtle to your pod.
- **Participation** — pod providers & communication channels from the catalog.

## UI (recreated from Mobbin)

| Route | Mobbin reference |
| --- | --- |
| `/` Discover | `mobbin.com/discover/apps/ios/latest` — quick-links grid + tab row + masonry app cards |
| `/screens` | `…/search/apps/ios?content_type=screens` — filter pills, count, 5-col phone-screen grid |
| `/flows` | `…/search/apps/ios?content_type=flows` — horizontal screen carousels per app |
| `/app/:id` | app detail + screenshot upload to your pod |
| `/submit` | submit a new app (writes Turtle to your pod) |
| `/participation` | participation opportunities |

## Data

The catalog lives **in the pod** as `catalog.ttl` (see "the pod is the database"
below) — it is the single source of truth and is edited directly in the pod, not
generated from the repo. The repo only knows the pod's address (`src/config.ts`).
Admin maintenance (publishing screenshots, adding image dimensions, managing the
admins group) is done with the small pod-direct scripts under `scripts/` that log
in through the dev server and write to the pod.

## Screenshots (mobile + desktop)

Screenshots are captured per app (mobile = phone viewport, desktop = 1280×800,
16:10) and uploaded straight into the pod's `screens/` + referenced in
`catalog.ttl` (`scripts/capture-dokieli-desktop-flow.mjs` +
`scripts/upload-dokieli-desktop.mjs` are the worked example). Each screenshot
records `schema:width`/`height`, so the gallery classifies it as mobile or
desktop and the navbar Mobile/Desktop toggle filters the grids accordingly.

## Tests (Playwright, against the real test pod)

`tests/solid-apps.spec.ts` drives the live Community Solid Server pod
(`pod.mpeters.dev`, account `teststudent@mpeters.dev` — the admin pod is
`pod.mpeters.dev/test/`):

1. renders the discover gallery
2. screens filter
3. flows view
4. **logs into the pod** (full OIDC + CSS credential + consent)
5. **uploads screenshots** to the pod
6. **submits a new app** (Turtle written to the pod)

```
npm run test:e2e
```

## Where the data lives — the pod is the database

The repository does **not** own the catalog. The single thing it knows is the
**admin pod's address** (`src/config.ts` → `ADMIN_POD`); everything else is read
from the pod at runtime. The admin pod and user pods share the identical layout:

```
<admin-pod>/solid-gallery/
  catalog.ttl          # every app as an ex:Software record + its assets (the DB)
  screens/*.webp       # screenshots          (schema:contentUrl targets)
  videos/*.webm        # flow recordings
  comments/<screen>/   # public comments (oa:Annotation resources)
  submissions/         # user-submitted apps (ex:Software Turtle)
<admin-pod>/inbox/     # comment notifications (LDN)
```

- **Runtime load:** `main.tsx` calls `initCatalog()` → `fetchCatalog()` fetches
  `catalog.ttl`, parses it with `n3`, and rebuilds the app list + screen manifest
  + category labels (SKOS) entirely from the RDF. `solid-gallery/` is made
  world-readable with a WAC `.acl` so the gallery reads it unauthenticated. There
  is **no bundled fallback** — the runtime imports nothing from a repo data
  snapshot; if the pod is unreachable the gallery is empty.
- **Publish:** curated content is written directly to the pod — admins upload
  screenshots and click "Publish to catalog" in the UI (or run a pod-direct
  maintenance script), which copies the image into the admin pod and appends the
  `schema:ImageObject` triples to `catalog.ttl`. Admin status is the catalog's
  `acl:agentGroup` (the admins group), so granting publish rights is one ACL/group
  change.

So the repo is a thin client; the pod is the source of truth, and user
contributions (uploads, submissions, comments, bookmarks) write to each user's
own pod with the same structure.

## Asset RDF model (schema.org + Web Annotations)

The catalog vocabulary describes apps (name, type, status, links, people) but has
**no concept of a screenshot, flow, or comment** — only a single `ex:logo`. The
gallery's media + social layer is therefore modelled with standard vocabularies
and kept as portable RDF:

- **Screenshots / flows / videos → schema.org.** Assets are forward-linked onto
  each `ex:Software` node in `catalog.ttl`:
  - `ex:screenshot → schema:ImageObject` (`contentUrl`, `encodingFormat`,
    `width`/`height`, `schema:keywords` = the screen-pattern as a SKOS concept)
  - `ex:flow → schema:ItemList` of `schema:ListItem` (`position` + `item`) — an
    ordered screen sequence; screens are shared IRIs reused across flows
  - `schema:video → schema:VideoObject`
- **Comments → W3C Web Annotations (`oa:Annotation`).** Each comment is its own
  JSON-LD LDP resource (`oa:hasTarget` back-links the screen, `oa:hasBody` the
  text, `as:audience` public/private), stored in a per-screen container — public
  in the admin pod, private in the author's pod. Every comment also POSTs an
  ActivityStreams `as:Announce` to the admin's `ldp:inbox` (LDN).

### SHACL is a client/CI contract, not a server feature

CSS (and Solid pods generally) **do not enforce SHACL on write**, so the model is
validated client/CI-side against `shapes/gallery-shacl.ttl` — exactly how the
upstream catalog does (it SHACL-checks `catalog-data.ttl` in CI and uses the shape
to generate its submit form).

`shapes/gallery-shacl.ttl` holds the `:ImageObjectShape`, `:FlowShape`,
`:VideoObjectShape` and `:AnnotationShape`, plus an `:AppAssetsShape` that adds
`ex:screenshot`/`ex:flow`/`schema:video` to the catalog's `ex:Software` via
`sh:node` — the same nesting the catalog uses for `ex:provider`.

## Develop

```
npm install
npm run dev        # http://localhost:5180
npm run build
```

## Notes

- The original `../catalog` app is left untouched; this is a separate, focused
  rebuild rather than an in-place strip.
- Pod writes land under `<pod>/solid-gallery/` (`screens/<app>/`, `submissions/`).
  A pod's DPoP token only authorizes its own origin, so submissions go to the
  user's pod, not the external catalog inbox.
