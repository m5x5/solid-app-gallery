import { accentFor, initialsFor, type App } from "@/lib/apps";
import { cn } from "@/lib/utils";

// A browser-window mockup for desktop (landscape) screenshots — many Solid apps
// are desktop-first, so wide captures get a window chrome instead of a phone.
export function DesktopFrame({
  app,
  image,
  className,
}: {
  app: App;
  image?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10",
        className
      )}
    >
      {image ? (
        <img
          src={image}
          alt={app.name}
          width={320}
          height={200}
          className="aspect-[16/10] w-full bg-zinc-950 object-contain"
        />
      ) : (
        <div
          className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ background: `linear-gradient(160deg, ${accentFor(app.id)}22, #0b0b0b 60%)` }}
        >
          <span
            className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
            style={{ background: accentFor(app.id) }}
          >
            {app.icon ? (
              <img src={app.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsFor(app.name)
            )}
          </span>
          <span className="text-sm font-semibold text-white">{app.name}</span>
          <span className="line-clamp-2 max-w-md text-xs text-white/55">
            {app.description || app.category}
          </span>
        </div>
      )}
    </div>
  );
}
