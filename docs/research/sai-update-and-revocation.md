# SAI update, consent, and application revocation

Research date: 2026-09-04. Sources are the official `hackers4peace/sai-js` repository, its releases and commits, the Solid Application Interoperability specification/primer, and this gallery's dependency manifest.

## Conclusion

There **is newer SAI-JS code on GitHub**, but it is unreleased `main`-branch work rather than a newer core package release. The gallery itself does not depend on SAI-JS, so updating a gallery npm dependency would not update the authorization UI. The SAI server/UI is a separate deployment.

The one-button screen for an already-registered application is intentional in both the latest release and current `main`: registered applications are sent to a simple sign-in component, while only unregistered applications are sent to the granular authorization component. The missing ability to review, change, or revoke an application's grants is a real gap in the current UI.

The deployed server checkout is also behind upstream's new grant-revocation backend. Updating it to current `main` would supply that backend, but **would not add an application revoke button or settings screen**. That UI still needs implementation.

## Versions and deployment gap

| Item | Evidence | Meaning |
| --- | --- | --- |
| Latest core SAI-JS release | [`v1.0.0-rc.26`, published 2026-02-03](https://github.com/hackers4peace/sai-js/releases/tag/v1.0.0-rc.26), commit [`16ded8b`](https://github.com/hackers4peace/sai-js/commit/16ded8b5ef977a50eb5c9ee673db91d32d36f8ac) | There is no newer tagged core release. |
| Current upstream `main` | [`7541e70`, 2026-08-22](https://github.com/hackers4peace/sai-js/commit/7541e70709ce7696c3c0bb2a8375f29d1d2c703e) | It is [145 commits ahead of `rc.26`](https://github.com/hackers4peace/sai-js/compare/v1.0.0-rc.26...main), so substantial newer code exists without a new core version. |
| Inspected SAI server checkout | [`133e227`, 2026-08-10](https://github.com/hackers4peace/sai-js/commit/133e227ce38c360d52a5b54e0a5c7cbbfd40be85) | It is [12 commits behind current `main`](https://github.com/hackers4peace/sai-js/compare/133e227...main), including the revocation work. |
| Gallery dependencies | Local [`package.json`](../../package.json) | The gallery uses Inrupt clients and `@uvdsl/solid-oidc-client-browser`; no `@janeirodigital/*` or SAI-JS package is installed. |

The current GitHub manifests still call the core packages `1.0.0-rc.26`, while the server integration component is `1.0.0-rc.29`: see the current [`authorization-agent` manifest](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/packages/authorization-agent/package.json#L1-L4) and [`components` manifest](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/packages/components/package.json#L1-L4). This reinforces that “update from GitHub” means deploying an unreleased repository snapshot, not selecting a newer stable package.

## Why authentication only shows Accept/Sign in

The SAI primer describes granular consent specifically for an application that **has not yet been registered**: the Authorization Agent presents its Access Needs and the user chooses the scope before an Application Registration is created ([application primer, user-consent steps 6–13](https://solid.github.io/data-interoperability-panel/primer/application.html#user-consent)).

The upstream UI implements exactly that split:

- [`Authorization.vue`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/views/Authorization.vue#L1-L15) renders `AuthenticateApp` when the client ID is already in the application list, and `AuthorizeApp` only when it is not registered.
- [`AuthenticateApp.vue`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/components/AuthenticateApp.vue#L1-L47) has only Cancel and Sign in; Sign in forwards to the OIDC consent operation.
- [`AuthorizeApp.vue`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/components/AuthorizeApp.vue#L38-L146) contains the Access Need checkboxes and all/some/none scope selectors, with Deny and Authorize actions later in the component.

Those registered-app and application-list files are byte-for-byte unchanged between `v1.0.0-rc.26` and current `main`. Therefore an update alone will not make granular settings appear on every authentication. Seeing only Accept/Sign in means SAI considers Solid App Gallery already registered; it is not evidence that the gallery failed to publish Access Needs.

## Revocation status

Upstream added grant revocation after the inspected server checkout:

- Commit [`d35dc54` (“access grant revocation”, 2026-08-19)](https://github.com/hackers4peace/sai-js/commit/d35dc54ab07728897165bf0e64c294da912f1720) adds the `RevokeGrants` RPC, authorization-service implementation, revocation handler, and tests.
- Current [`effect.ts`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/effect.ts#L220-L234) and [`app.ts`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/store/app.ts#L121-L132) expose that RPC to the UI.
- The service accepts a list of Data Grant IRIs and deletes them at the data-owner boundary ([`Revocation.ts`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/packages/components/src/services/Revocation.ts#L6-L42)).

However, current [`ApplicationList.vue`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/ui/authorization/src/views/ApplicationList.vue#L1-L89) only lists applications, links to their callback endpoints, and offers “Add application.” It has no details, edit, delete, or revoke action, and no view invokes `revokeGrants`. The RPC also revokes Data Grants rather than deleting the Application Registration. Since the routing decision checks whether a registration exists, revoking only the grants would not by itself restore the first-time authorization screen.

So the practical status is:

1. The deployed checkout (`133e227`) has no new revocation RPC.
2. Current upstream `main` has the revocation machinery.
3. Neither version has an end-user application-management/revoke workflow.

The SAI specification describes authorization as supporting granting, adjustment, and rescission and says access decisions are managed by the Authorization Agent ([SAI §8](https://solid.github.io/data-interoperability-panel/specification/#authorization-flows)). The missing UI is therefore an implementation gap, not a reason to expect users to edit Pod resources manually.

## Important compatibility finding for Solid App Gallery

The published July 2026 specification and primer use this discovery chain:

`ApplicationRegistration → hasAccessGrant → AccessGrant → hasDataGrant → DataGrant`

See [SAI §6.1](https://solid.github.io/data-interoperability-panel/specification/#application-registration) and the [application primer](https://solid.github.io/data-interoperability-panel/primer/application.html#access-grant).

But SAI-JS commit [`4a359cb` (“refactor grants - initial pass”, 2026-07-28)](https://github.com/hackers4peace/sai-js/commit/4a359cb68b1ad348c8bbe2a5b2c1bfb9c2d785e3) removed the Access Grant wrapper and changed Agent Registrations to link directly to Data Grants with `interop:hasDataGrant`. The inspected server checkout is later than that change, and current [`application-registration.ts`](https://github.com/hackers4peace/sai-js/blob/7541e70709ce7696c3c0bb2a8375f29d1d2c703e/packages/data-model/src/application-registration.ts#L16-L33) still models direct `hasDataGrant` links.

Therefore the gallery should tolerate both layouts during this transition:

1. Prefer direct `ApplicationRegistration → hasDataGrant → DataGrant` when present (the deployed SAI-JS model).
2. Otherwise follow `ApplicationRegistration → hasAccessGrant → AccessGrant → hasDataGrant → DataGrant` (the published-spec/`rc.26` model).

Without that dual-path compatibility, updating the SAI server can make a spec-chain-only gallery report that no workspace grant exists even when the newer server issued one.

## Recommended next move

Update the SAI deployment only after reviewing and testing the 12 unreleased commits between `133e227` and `main`. That supplies the backend revocation work, but a complete user-facing fix also needs an application details screen that can enumerate an application's grants, revoke all selected grants, and either remove/disable its Application Registration or allow reauthorization when it has no grants. Independently, keep the gallery compatible with both grant-link layouts above.
