# Bug report — Solid File Widget (solid-authorization-widget)

**App:** https://bourgeoa.solidcommunity.net/public/solid-file-widget/
**Tested:** 2026-06-23, mobile (iPhone 16 Pro Max viewport) + desktop Chrome
**Account:** test pod on https://pod.mpeters.dev/ (WebID `https://pod.mpeters.dev/test/profile/card#me`)

## Onboarding flow observed
1. Floating card **"Connect your Solid Pod — To sync data with your account"** (top-right).
2. Click → **"Connect your Solid Pod"** form with a WebID/pod input (`Void 'webId-Pod' or 'https://<podName>'`) + green **Connect** button + "Need help?".
3. Enter pod/WebID → **Connect** opens a **popup**.

## The break
The login popup does **not** complete the widget's own auth. Instead the popup
loads the pod's data browser and shows:

```
Error reading file: Error: Web error: 401 on GET of
<https://solidcommunity.net/common/popup.html>

This resource is not publicly readable. Try logging in or opening a
different public resource.
```

Even after authenticating on `pod.mpeters.dev` (IdP select → Authorize/consent
succeeds, WebID `…/test/profile/card#me`), the **widget tab never becomes
logged-in** — reloading still shows the "Connect your Solid Pod" banner.

## Likely cause
The popup-based login points at `https://solidcommunity.net/common/popup.html`
(a hard-coded solid-ui/mashlib popup redirect), which returns **401**, so the
auth token is never posted back to the widget's opener window. The session is
therefore never established on the `bourgeoa.solidcommunity.net` origin.

## Screenshots
Captured into the gallery for this app (3 frames): banner → connect form →
401 error popup. Files: `public/screens/solid-authorization-widget-{1,2,3}.webp`.
