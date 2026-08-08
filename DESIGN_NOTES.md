# Mobbin UI reference (captured 2026-06-23)

Dark theme. Background near-black (#0a0a0a / zinc-950). White text. Rounded cards.
Font: clean grotesk (DM Sans-ish). Generous spacing.

## Top nav (all pages)
- Left: Mobbin logo (M), then "Apps" (active) / "Sites" text tabs.
- Center: large pill search bar "Search on iOS..." with magnifier + scan icon on right.
- Right: bookmark icon, globe icon, bell icon, "Invite & earn" pill button, avatar.

## Discover page (/discover/apps/ios/latest)
- Quick-links grid: 4 columns — Categories | Screens | UI Elements | Flows.
  Each column header (muted) + 5 bold link rows.
- Filter row: [iOS|Web] segmented toggle | tabs: Latest (active, underline), Most popular, Top rated, Animations | right: "Filter" button w/ sliders icon.
- Content: masonry/3-col grid of cards. Each card = phone mockup screenshot, badge top-left ("New"/"Updated").

## Screens page (search content_type=screens)
- Filter pills row: [iOS|Web] | "Categories ▾" | active filter pill "Signup ✕" | "UI Elements ▾" | play icon | list icon.
  Right side: "Showing 1,401 screens" + "Trending ▾" sort.
- Grid: 5 columns of tall phone-screen cards. Below each: app icon (rounded) + app name.
- Hover: thumbs up/down overlay.

## Flows page (search content_type=flows)
- Filter pills row: [iOS|Web] | "Categories ▾" | active pill "Onboarding ✕" | right: "Showing 995 flows" + "Trending ▾".
- Each flow = a ROW: horizontal carousel of phone screens (first shown, rest as a scrollable strip with a → arrow button on the right edge).
  Below row: "{FlowName} in {appIcon} {AppName}" then muted "{N} screens".

## Mapping to Solid catalog Apps & Services
- App entry -> card (icon, name, category, screenshots).
- "Screens" = uploaded screenshots of the app (stored in pod).
- "Flows" = ordered sequence of screenshots.
- Keep: Solid login (top-right avatar/login), Submit new app (was "new record"), Participation.
