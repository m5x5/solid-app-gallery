import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Placeholder card for a screenshot that is still being uploaded: the local
// preview (object URL) dimmed under a spinner, sized like the real cards so
// the grid doesn't jump when the upload lands and the placeholder is replaced.
export function UploadingCard({
  preview,
  aspect = "aspect-[9/19.5]",
  rounded = "rounded-[1.6rem]",
  label = "Uploading…",
}: {
  preview?: string;
  aspect?: string;
  rounded?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "relative w-full overflow-hidden bg-zinc-900 ring-1 ring-white/10",
        aspect,
        rounded
      )}
    >
      {preview && <img src={preview} alt="" className="h-full w-full object-cover opacity-40" />}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs font-medium">{label}</span>
      </div>
    </div>
  );
}
