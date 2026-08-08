import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Building2, User } from "lucide-react";
import { Parser, Store } from "n3";
import { appsByAuthor, initialsFor } from "@/lib/apps";
import { DiscoverCard } from "@/components/cards";
import { Button } from "@/components/ui/button";

const FOAF_IMG = "http://xmlns.com/foaf/0.1/img";
const FOAF_DEPICTION = "http://xmlns.com/foaf/0.1/depiction";
const VCARD_PHOTO = "http://www.w3.org/2006/vcard/ns#hasPhoto";

// Fetch the author's Solid profile (their WebID document) and pull the avatar
// from foaf:img / foaf:depiction / vcard:hasPhoto. Best-effort: pods are
// public-read + CORS-enabled, but a failure just falls back to initials.
async function fetchAvatar(webId: string): Promise<string | undefined> {
  const docUrl = webId.split("#")[0];
  const res = await fetch(docUrl, { headers: { Accept: "text/turtle" } });
  if (!res.ok) return undefined;
  const store = new Store(new Parser({ baseIRI: docUrl }).parse(await res.text()));
  for (const p of [FOAF_IMG, VCARD_PHOTO, FOAF_DEPICTION]) {
    const img = store.getObjects(webId, p, null)[0]?.value;
    if (img) return img;
  }
  return undefined;
}

export function AuthorDetail() {
  const { id } = useParams();
  const authorId = id ? decodeURIComponent(id) : "";
  const { author, apps } = appsByAuthor(authorId);
  const [avatar, setAvatar] = useState<string>();

  useEffect(() => {
    setAvatar(undefined);
    if (!author?.webId) return;
    let alive = true;
    fetchAvatar(author.webId)
      .then((url) => alive && setAvatar(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [author?.webId]);

  // Fall back to the IRI when the agent isn't in the catalog (stale link).
  const name = author?.name || authorId;
  const isOrg = author?.type === "Organization";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <Link
        to="/screens"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-secondary text-xl font-bold">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-full w-full object-cover"
              onError={() => setAvatar(undefined)}
            />
          ) : (
            initialsFor(name)
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {isOrg ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
            {isOrg ? "Organization" : "Person"} · {apps.length}{" "}
            {apps.length === 1 ? "app" : "apps"}
          </div>
        </div>
        {author?.webId && (
          <Button asChild variant="outline" className="ml-auto">
            <a href={author.webId} target="_blank" rel="noopener">
              <ExternalLink className="h-4 w-4" />
              {/^https?:\/\/[^/]+\/profile\/card/.test(author.webId)
                ? "View Solid profile"
                : "View profile"}
            </a>
          </Button>
        )}
      </div>

      {apps.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">
          No apps found for this author.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {apps.map((app) => (
            <DiscoverCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
