import {
  getSolidDataset,
  getThing,
  getUrl,
  getUrlAll,
} from "@inrupt/solid-client";
import { CLIENT_ID, solidFetch } from "./solid-auth";

const INTEROP = "http://www.w3.org/ns/solid/interop#";
const SPACE = "http://www.w3.org/ns/pim/space#";
const AUTHORIZATION_AGENT = `${INTEROP}hasAuthorizationAgent`;
const REGISTERED_AGENT = `${INTEROP}registeredAgent`;
const ACCESS_GRANT = `${INTEROP}hasAccessGrant`;
const DATA_GRANT = `${INTEROP}hasDataGrant`;
const DATA_OWNER = `${INTEROP}dataOwner`;
const DATA_REGISTRATION = `${INTEROP}hasDataRegistration`;
const REGISTERED_SHAPE_TREE = `${INTEROP}registeredShapeTree`;
const SCOPE_OF_GRANT = `${INTEROP}scopeOfGrant`;
const ALL_FROM_REGISTRY = `${INTEROP}AllFromRegistry`;

export const GALLERY_WORKSPACE_SHAPE_TREE =
  "https://solid-app-gallery.mpeters.dev/sai/access-needs.ttl#application-submission-tree-v1";

type SaiRegistration = {
  isSai: boolean;
  root?: string;
};

const registrationCache = new Map<string, Promise<SaiRegistration>>();

function asContainer(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function linkedThing(dataset: Awaited<ReturnType<typeof getSolidDataset>>, id: string) {
  // Discovery links identify a specific RDF resource. Never substitute an
  // unrelated first subject from the document when that resource is absent.
  return getThing(dataset, id);
}

function registrationFromLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  for (const entry of linkHeader.match(/<[^>]+>(?:\s*;\s*[^,]+)*/g) ?? []) {
    const relation = entry.match(/;\s*rel\s*=\s*"?([^";]+)"?/i)?.[1];
    if (!relation?.split(/\s+/).includes(REGISTERED_AGENT)) continue;
    return entry.match(/;\s*anchor\s*=\s*"?([^";]+)"?/i)?.[1];
  }
  return undefined;
}

async function discoverSaiRegistration(webId: string): Promise<SaiRegistration> {
  const profileDataset = await getSolidDataset(webId, { fetch: solidFetch });
  const profile = linkedThing(profileDataset, webId);
  const authorizationAgent = profile && getUrl(profile, AUTHORIZATION_AGENT);
  if (!authorizationAgent) return { isSai: false };

  const agentResponse = await solidFetch(authorizationAgent, { method: "HEAD" });
  if (!agentResponse.ok) {
    throw new Error(`SAI registration discovery failed (${agentResponse.status}).`);
  }
  const registrationUrl = registrationFromLink(agentResponse.headers.get("Link"));
  if (!registrationUrl) return { isSai: true };

  const registrationDataset = await getSolidDataset(registrationUrl, {
    fetch: solidFetch,
  });
  const registration = linkedThing(registrationDataset, registrationUrl);
  const directDataGrantUrls = registration
    ? getUrlAll(registration, DATA_GRANT)
    : [];
  const accessGrantUrls = registration
    ? getUrlAll(registration, ACCESS_GRANT)
    : [];
  const accessGrantResults = await Promise.allSettled(
    accessGrantUrls.map(async (accessGrantUrl) => {
      const dataset = await getSolidDataset(accessGrantUrl, {
        fetch: solidFetch,
      });
      return linkedThing(dataset, accessGrantUrl);
    })
  );
  const accessGrants = accessGrantResults.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  const nestedDataGrantUrls = accessGrants.flatMap((accessGrant) =>
    accessGrant ? getUrlAll(accessGrant, DATA_GRANT) : []
  );
  const dataGrantUrls = [
    ...new Set([...directDataGrantUrls, ...nestedDataGrantUrls]),
  ];
  const dataGrantResults = await Promise.allSettled(
    dataGrantUrls.map(async (dataGrantUrl) => {
      const dataset = await getSolidDataset(dataGrantUrl, { fetch: solidFetch });
      return linkedThing(dataset, dataGrantUrl);
    })
  );
  const dataGrants = dataGrantResults.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  const workspaceRoots = new Set(
    dataGrants.flatMap((grant) => {
      if (
        !grant ||
        getUrl(grant, DATA_OWNER) !== webId ||
        getUrl(grant, SCOPE_OF_GRANT) !== ALL_FROM_REGISTRY ||
        getUrl(grant, REGISTERED_SHAPE_TREE) !== GALLERY_WORKSPACE_SHAPE_TREE
      ) {
        return [];
      }

      const root = getUrl(grant, DATA_REGISTRATION);
      return root ? [asContainer(root)] : [];
    })
  );
  if (workspaceRoots.size > 1) {
    throw new Error(
      `Solid App Gallery has ambiguous SAI workspace grants for ${CLIENT_ID}: multiple gallery workspace roots are authorized.`
    );
  }
  return { isSai: true, root: workspaceRoots.values().next().value };
}

async function standardStorageRoot(webId: string): Promise<string | undefined> {
  try {
    const dataset = await getSolidDataset(webId, { fetch: solidFetch });
    const profile = linkedThing(dataset, webId);
    const storage = profile && getUrl(profile, `${SPACE}storage`);
    return storage ? asContainer(storage) : undefined;
  } catch {
    return undefined;
  }
}

export async function galleryStorageRoot(
  webId: string,
  fallbackPodRoot: string
): Promise<string> {
  let registration = registrationCache.get(webId);
  if (!registration) {
    registration = discoverSaiRegistration(webId);
    registrationCache.set(webId, registration);
  }

  let sai: SaiRegistration;
  try {
    sai = await registration;
  } catch (error) {
    // A transient profile/agent/registration failure must not poison this
    // WebID's discovery cache for the lifetime of the page.
    if (registrationCache.get(webId) === registration) {
      registrationCache.delete(webId);
    }
    throw error;
  }
  if (sai.root) return sai.root;
  if (sai.isSai) {
    throw new Error(
      `Solid App Gallery has no SAI workspace grant for ${CLIENT_ID}. Sign out, sign in again, and authorize access to your gallery workspace.`
    );
  }

  const storageRoot = (await standardStorageRoot(webId)) ?? fallbackPodRoot;
  return new URL("solid-gallery/", asContainer(storageRoot)).href;
}
