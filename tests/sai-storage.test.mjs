import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const saiStoragePath = join(projectRoot, "src/lib/sai-storage.ts");
const require = createRequire(import.meta.url);

const mockSolidAuth = String.raw`
export const CLIENT_ID = "https://solid-app-gallery.mpeters.dev/id.jsonld";

const WEB_ID = "https://michael.sai.example/profile/card#me";
const AUTHORIZATION_AGENT = "https://auth.sai.example/agent";
const REGISTRATION = "https://auth.sai.example/registrations/gallery";
const ACCESS_GRANT_A = "https://auth.sai.example/grants/access-a";
const ACCESS_GRANT_B = "https://auth.sai.example/grants/access-b";
const DATA_GRANT_A = "https://auth.sai.example/grants/data-a";
const DATA_GRANT_B = "https://auth.sai.example/grants/data-b";
const DATA_GRANT_TARGET = "https://auth.sai.example/grants/data-target";
const BROKEN_DATA_GRANT = "https://auth.sai.example/grants/missing-data";
const DELEGATED_OWNER = "https://alice.example/profile/card#me";
const AMBIGUOUS_WEB_ID = "https://ambiguous.sai.example/profile/card#me";
const AMBIGUOUS_AUTHORIZATION_AGENT = "https://auth.sai.example/ambiguous-agent";
const AMBIGUOUS_REGISTRATION = "https://auth.sai.example/registrations/ambiguous";
const AMBIGUOUS_ACCESS_GRANT = "https://auth.sai.example/grants/ambiguous-access";
const AMBIGUOUS_DATA_GRANT_A = "https://auth.sai.example/grants/ambiguous-data-a";
const AMBIGUOUS_DATA_GRANT_B = "https://auth.sai.example/grants/ambiguous-data-b";
const DIRECT_WEB_ID = "https://direct.sai.example/profile/card#me";
const DIRECT_AUTHORIZATION_AGENT = "https://auth.sai.example/direct-agent";
const DIRECT_REGISTRATION = "https://auth.sai.example/registrations/direct";
const DIRECT_DATA_GRANT = "https://auth.sai.example/grants/direct-data";
const DIRECT_LEGACY_DATA_GRANT = "https://auth.sai.example/grants/direct-legacy-data";
const DIRECT_ACCESS_GRANT = "https://auth.sai.example/grants/direct-access";
const BROKEN_ACCESS_GRANT = "https://auth.sai.example/grants/missing-access";
const TRANSIENT_WEB_ID = "https://transient.sai.example/profile/card#me";
const TRANSIENT_AUTHORIZATION_AGENT = "https://auth.sai.example/transient-agent";
const TRANSIENT_REGISTRATION = "https://auth.sai.example/registrations/transient";
const TRANSIENT_DATA_GRANT = "https://auth.sai.example/grants/transient-data";
const SHAPE_TREE =
  "https://solid-app-gallery.mpeters.dev/sai/access-needs.ttl#application-submission-tree-v1";
const DATA_REGISTRATION = "https://data.sai.example/gallery-workspace";
const INTEROP = "http://www.w3.org/ns/solid/interop#";
let transientRegistrationRequests = 0;

function turtle(body) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/turtle" },
  });
}

export async function solidFetch(input, init) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (url === WEB_ID) {
    return turtle(
      "<" + WEB_ID + "> <" + INTEROP + "hasAuthorizationAgent> <" +
        AUTHORIZATION_AGENT + "> ."
    );
  }
  if (url === AMBIGUOUS_WEB_ID) {
    return turtle(
      "<" + AMBIGUOUS_WEB_ID + "> <" + INTEROP +
        "hasAuthorizationAgent> <" + AMBIGUOUS_AUTHORIZATION_AGENT + "> ."
    );
  }
  if (url === DIRECT_WEB_ID) {
    return turtle(
      "<" + DIRECT_WEB_ID + "> <" + INTEROP +
        "hasAuthorizationAgent> <" + DIRECT_AUTHORIZATION_AGENT + "> ."
    );
  }
  if (url === TRANSIENT_WEB_ID) {
    return turtle(
      "<" + TRANSIENT_WEB_ID + "> <" + INTEROP +
        "hasAuthorizationAgent> <" + TRANSIENT_AUTHORIZATION_AGENT + "> ."
    );
  }
  if (url === AUTHORIZATION_AGENT && init?.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        Link:
          "<" + CLIENT_ID + ">; anchor=\"" + REGISTRATION +
          "\"; rel=\"" + INTEROP + "registeredAgent\"",
      },
    });
  }
  if (url === AMBIGUOUS_AUTHORIZATION_AGENT && init?.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        Link:
          "<" + CLIENT_ID + ">; anchor=\"" + AMBIGUOUS_REGISTRATION +
          "\"; rel=\"" + INTEROP + "registeredAgent\"",
      },
    });
  }
  if (url === DIRECT_AUTHORIZATION_AGENT && init?.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        Link:
          "<" + CLIENT_ID + ">; anchor=\"" + DIRECT_REGISTRATION +
          "\"; rel=\"" + INTEROP + "registeredAgent\"",
      },
    });
  }
  if (url === TRANSIENT_AUTHORIZATION_AGENT && init?.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        Link:
          "<" + CLIENT_ID + ">; anchor=\"" + TRANSIENT_REGISTRATION +
          "\"; rel=\"" + INTEROP + "registeredAgent\"",
      },
    });
  }
  if (url === REGISTRATION) {
    return turtle(
      "<" + REGISTRATION + "> a <" + INTEROP + "ApplicationRegistration>; " +
        "<" + INTEROP + "hasAccessGrant> <" + ACCESS_GRANT_A + ">, <" +
        ACCESS_GRANT_B + "> ."
    );
  }
  if (url === ACCESS_GRANT_A) {
    return turtle(
      "<" + ACCESS_GRANT_A + "> a <" + INTEROP + "AccessGrant>; " +
        "<" + INTEROP + "hasDataGrant> <" + DATA_GRANT_A + "> ."
    );
  }
  if (url === ACCESS_GRANT_B) {
    return turtle(
      "<" + ACCESS_GRANT_B + "> a <" + INTEROP + "AccessGrant>; " +
        "<" + INTEROP + "hasDataGrant> <" + DATA_GRANT_B + ">, <" +
        DATA_GRANT_TARGET + ">, <" + BROKEN_DATA_GRANT + "> ."
    );
  }
  if (url === AMBIGUOUS_REGISTRATION) {
    return turtle(
      "<" + AMBIGUOUS_REGISTRATION + "> a <" + INTEROP +
        "ApplicationRegistration>; <" + INTEROP + "hasAccessGrant> <" +
        AMBIGUOUS_ACCESS_GRANT + "> ."
    );
  }
  if (url === AMBIGUOUS_ACCESS_GRANT) {
    return turtle(
      "<" + AMBIGUOUS_ACCESS_GRANT + "> a <" + INTEROP + "AccessGrant>; " +
        "<" + INTEROP + "hasDataGrant> <" + AMBIGUOUS_DATA_GRANT_A + ">, <" +
        AMBIGUOUS_DATA_GRANT_B + "> ."
    );
  }
  if (url === DIRECT_REGISTRATION) {
    return turtle(
      "<" + DIRECT_REGISTRATION + "> a <" + INTEROP +
        "ApplicationRegistration>; <" + INTEROP + "hasDataGrant> <" +
        DIRECT_DATA_GRANT + ">; <" + INTEROP + "hasAccessGrant> <" +
        DIRECT_ACCESS_GRANT + ">, <" + BROKEN_ACCESS_GRANT + "> ."
    );
  }
  if (url === DIRECT_ACCESS_GRANT) {
    return turtle(
      "<" + DIRECT_ACCESS_GRANT + "> a <" + INTEROP + "AccessGrant>; " +
        "<" + INTEROP + "hasDataGrant> <" + DIRECT_DATA_GRANT + ">, <" +
        DIRECT_LEGACY_DATA_GRANT + "> ."
    );
  }
  if (url === TRANSIENT_REGISTRATION) {
    transientRegistrationRequests += 1;
    if (transientRegistrationRequests === 1) {
      return new Response("Temporarily unavailable", { status: 503 });
    }
    return turtle(
      "<" + TRANSIENT_REGISTRATION + "> a <" + INTEROP +
        "ApplicationRegistration>; <" + INTEROP + "hasDataGrant> <" +
        TRANSIENT_DATA_GRANT + "> ."
    );
  }
  if (url === DATA_GRANT_A) {
    return turtle(
      "<" + url + "> a <" + INTEROP + "DelegatedDataGrant>; " +
        "<" + INTEROP + "delegationOfGrant> <https://alice.example/grants/source>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + DELEGATED_OWNER + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP + "hasDataRegistration> <https://data.sai.example/delegated> ."
    );
  }
  if (url === DATA_GRANT_B) {
    return turtle(
      "<" + url + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "SelectedFromRegistry>; " +
        "<" + INTEROP + "hasDataRegistration> <https://data.sai.example/selected> ."
    );
  }
  if (url === DATA_GRANT_TARGET) {
    return turtle(
      "<" + DATA_GRANT_TARGET + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP + "hasDataRegistration> <" + DATA_REGISTRATION + "> ."
    );
  }
  if (url === AMBIGUOUS_DATA_GRANT_A || url === AMBIGUOUS_DATA_GRANT_B) {
    const suffix = url === AMBIGUOUS_DATA_GRANT_A ? "a" : "b";
    return turtle(
      "<" + url + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + AMBIGUOUS_WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP + "hasDataRegistration> <https://data.sai.example/" +
        suffix + "> ."
    );
  }
  if (url === DIRECT_DATA_GRANT) {
    return turtle(
      "<" + DIRECT_DATA_GRANT + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + DIRECT_WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP +
        "hasDataRegistration> <https://data.sai.example/direct-gallery> ."
    );
  }
  if (url === DIRECT_LEGACY_DATA_GRANT) {
    return turtle(
      "<" + DIRECT_LEGACY_DATA_GRANT + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + DIRECT_WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP +
        "hasDataRegistration> <https://data.sai.example/direct-gallery/> ."
    );
  }
  if (url === TRANSIENT_DATA_GRANT) {
    return turtle(
      "<" + TRANSIENT_DATA_GRANT + "> a <" + INTEROP + "DataGrant>; " +
        "<" + INTEROP + "registeredShapeTree> <" + SHAPE_TREE + ">; " +
        "<" + INTEROP + "dataOwner> <" + TRANSIENT_WEB_ID + ">; " +
        "<" + INTEROP + "scopeOfGrant> <" + INTEROP + "AllFromRegistry>; " +
        "<" + INTEROP +
        "hasDataRegistration> <https://data.sai.example/transient-gallery> ."
    );
  }
  return new Response("Not found", { status: 404 });
}
`;

async function loadGalleryStorageRoot(t) {
  const buildDirectory = await mkdtemp(join(tmpdir(), "gallery-sai-storage-"));
  t.after(() => rm(buildDirectory, { recursive: true, force: true }));
  const bundlePath = join(buildDirectory, "sai-storage.cjs");

  const entryId = "virtual:sai-storage-test-entry";
  const resolvedEntryId = `\0${entryId}`;
  const authId = "virtual:mock-solid-auth";
  const resolvedAuthId = `\0${authId}`;

  await build({
    configFile: false,
    root: projectRoot,
    logLevel: "silent",
    ssr: { noExternal: true },
    plugins: [
      {
        name: "mock-solid-auth",
        enforce: "pre",
        resolveId(id) {
          if (id === entryId) return resolvedEntryId;
          if (id === "./solid-auth") return resolvedAuthId;
        },
        load(id) {
          if (id === resolvedEntryId) {
            return `export { galleryStorageRoot } from ${JSON.stringify(saiStoragePath)};`;
          }
          if (id === resolvedAuthId) return mockSolidAuth;
        },
      },
    ],
    build: {
      ssr: true,
      outDir: buildDirectory,
      emptyOutDir: false,
      rollupOptions: {
        input: entryId,
        output: {
          format: "cjs",
          entryFileNames: "sai-storage.cjs",
        },
      },
    },
  });

  return require(bundlePath).galleryStorageRoot;
}

test("resolves a legacy grant while ignoring a dangling nested data grant", async (t) => {
  const galleryStorageRoot = await loadGalleryStorageRoot(t);
  const root = await galleryStorageRoot(
    "https://michael.sai.example/profile/card#me",
    "https://fallback.example/"
  );

  assert.equal(root, "https://data.sai.example/gallery-workspace/");
});

test("rejects ambiguous gallery workspace roots", async (t) => {
  const galleryStorageRoot = await loadGalleryStorageRoot(t);

  await assert.rejects(
    galleryStorageRoot(
      "https://ambiguous.sai.example/profile/card#me",
      "https://fallback.example/"
    ),
    {
      message:
        "Solid App Gallery has ambiguous SAI workspace grants for " +
        "https://solid-app-gallery.mpeters.dev/id.jsonld: multiple gallery " +
        "workspace roots are authorized.",
    }
  );
});

test("merges direct and legacy layouts while ignoring a dangling access grant", async (t) => {
  const galleryStorageRoot = await loadGalleryStorageRoot(t);
  const root = await galleryStorageRoot(
    "https://direct.sai.example/profile/card#me",
    "https://fallback.example/"
  );

  assert.equal(root, "https://data.sai.example/direct-gallery/");
});

test("retries registration discovery after a transient failure", async (t) => {
  const galleryStorageRoot = await loadGalleryStorageRoot(t);
  const args = [
    "https://transient.sai.example/profile/card#me",
    "https://fallback.example/",
  ];

  await assert.rejects(galleryStorageRoot(...args));
  assert.equal(
    await galleryStorageRoot(...args),
    "https://data.sai.example/transient-gallery/"
  );
});
