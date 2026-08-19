import { useState } from "react";
import { initialsFor, type Author } from "@/lib/apps";
import { useAvatar } from "@/lib/avatars";
import { cn } from "@/lib/utils";

// A stable CSS ident for an author, shared between the small chip on an app
// page and the big avatar on the author page so the View Transitions API can
// morph one into the other when navigating with <Link viewTransition>.
export function authorTransitionName(id: string, part: "avatar" | "name" = "avatar"): string {
  return `author-${part}-${id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}`;
}

// Round avatar for a catalog author: their profile photo (cached, see
// lib/avatars.ts) with initials as the fallback / placeholder.
export function AuthorAvatar({
  author,
  className,
  transitionId,
}: {
  author: Pick<Author, "name" | "webId">;
  className?: string;
  // Author id to derive the view-transition-name from (see above).
  transitionId?: string;
}) {
  const url = useAvatar(author.webId);
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-bold",
        className
      )}
      style={transitionId ? { viewTransitionName: authorTransitionName(transitionId) } : undefined}
    >
      {url && !broken ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsFor(author.name)
      )}
    </span>
  );
}
