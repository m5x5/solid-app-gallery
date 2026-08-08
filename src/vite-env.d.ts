/// <reference types="vite/client" />

declare module "*?url" {
  const src: string;
  export default src;
}

declare module "@uvdsl/solid-oidc-client-browser/RefreshWorker?url" {
  const src: string;
  export default src;
}
