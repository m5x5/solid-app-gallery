// Screenshot <img> attributes: sized, async, and — on Vercel — served through
// the platform's image optimizer (/_vercel/image, configured in vercel.json),
// which resizes and re-encodes (AVIF/WebP) the pod's 1080–3840px PNGs to the
// width actually displayed. Elsewhere (vite dev, other hosts) the raw URL is
// used, so nothing here is required for correctness.
//
// Layout stability comes from the frames themselves: PhoneFrame/DesktopFrame
// reserve their aspect ratio, and the <img> carries width/height, so nothing
// shifts while bytes are still on the wire.

// Must match "images.sizes" in vercel.json.
const SIZES = [256, 384, 640, 1080, 1920];

function onVercel(): boolean {
  if (!import.meta.env.PROD) return false;
  const h = typeof location !== "undefined" ? location.hostname : "";
  return h !== "localhost" && h !== "127.0.0.1";
}

export function optimizedUrl(url: string, width: number, quality = 75): string {
  if (!onVercel() || url.startsWith("blob:") || url.startsWith("data:")) return url;
  const w = SIZES.find((s) => s >= width) ?? SIZES[SIZES.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=${quality}`;
}

// srcSet across the configured widths, plus `sizes` from the caller's layout.
export function responsiveImg(url: string, sizes: string, quality = 75) {
  if (!onVercel() || url.startsWith("blob:") || url.startsWith("data:"))
    return { src: url } as { src: string; srcSet?: string; sizes?: string };
  return {
    src: optimizedUrl(url, 640, quality),
    srcSet: SIZES.map((w) => `${optimizedUrl(url, w, quality)} ${w}w`).join(", "),
    sizes,
  };
}
