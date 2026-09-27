import { Parser } from "n3";

const OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";
const AUTHORIZATION_AGENT = "http://www.w3.org/ns/solid/interop#hasAuthorizationAgent";

export type LoginTarget = {
  issuer: string;
  // SAI authorization is advertised directly on a WebID. It needs the stable
  // client document so the authorization agent can find the access needs.
  isSai: boolean;
};

// A login address can identify either an issuer or a person. Resolve the
// person's advertised issuer before handing it to the OIDC client.
export async function resolveLoginTarget(address: string): Promise<LoginTarget> {
  const input = address.trim();
  const webId = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!/^https?:$/.test(webId.protocol)) throw new Error("Enter an HTTP(S) provider URL or WebID.");
  const documentUrl = new URL(webId);
  documentUrl.hash = "";

  let response: Response;
  try {
    response = await fetch(documentUrl.href, {
      headers: { Accept: "text/turtle, application/n-triples;q=0.9" },
    });
  } catch {
    if (webId.hash) throw new Error("Could not load your WebID profile. Check the URL and try again.");
    return { issuer: webId.href, isSai: false };
  }

  const isRdf = /text\/turtle|application\/(?:n-triples|trig)/i.test(response.headers.get("Content-Type") || "");
  if (response.ok && isRdf) {
    const triples = new Parser({ baseIRI: response.url || documentUrl.href }).parse(await response.text());
    const issuer = triples.find((quad) =>
      quad.subject.value === webId.href &&
      quad.predicate.value === OIDC_ISSUER &&
      quad.object.termType === "NamedNode"
    )?.object.value;
    if (!issuer) {
      // Provider roots can return RDF containers too (e.g. solidcommunity.net).
      // Only accept the address as a provider when discovery names that exact
      // address as its issuer, using the OIDC client's trailing-slash tolerance.
      // A profile must not silently fall back to its host's identity provider.
      if (!webId.hash) {
        try {
          const discovery = await fetch(new URL("/.well-known/openid-configuration", webId), {
            headers: { Accept: "application/json" },
          });
          if (discovery.ok) {
            const metadata = await discovery.json();
            if (typeof metadata.issuer === "string" &&
                metadata.issuer.replace(/\/$/, "") === webId.href.replace(/\/$/, "")) {
              return { issuer: metadata.issuer, isSai: false };
            }
          }
        } catch {
          // Without matching metadata, this is not a confirmed provider URL.
        }
      }
      throw new Error("This WebID profile does not advertise an identity provider (solid:oidcIssuer).");
    }
    const issuerUrl = new URL(issuer);
    if (!/^https?:$/.test(issuerUrl.protocol) || issuerUrl.hash) {
      throw new Error("Your WebID profile advertises an invalid identity provider URL.");
    }
    // Preserve the advertised spelling: OIDC compares issuer identifiers exactly.
    return {
      issuer,
      isSai: triples.some(
        (quad) =>
          quad.subject.value === webId.href &&
          quad.predicate.value === AUTHORIZATION_AGENT &&
          quad.object.termType === "NamedNode"
      ),
    };
  }
  if (webId.hash) throw new Error("Could not read your WebID profile's identity provider.");
  return { issuer: webId.href, isSai: false };
}

export async function resolveOidcIssuer(address: string): Promise<string> {
  return (await resolveLoginTarget(address)).issuer;
}
