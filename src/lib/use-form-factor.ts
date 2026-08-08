import { useState, useEffect } from "react";

export type FormFactor = "mobile" | "desktop";

// Detect each image's form factor from its natural aspect ratio (wide = desktop,
// tall = mobile) by loading it off-screen. Returns a map keyed by URL; unmeasured
// images are simply absent (callers default to "mobile").
export function useFormFactors(urls: string[]): Record<string, FormFactor> {
  const [map, setMap] = useState<Record<string, FormFactor>>({});
  const key = urls.filter(Boolean).join("|");

  useEffect(() => {
    let alive = true;
    for (const url of urls) {
      if (!url) continue;
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        const ff: FormFactor =
          img.naturalWidth > img.naturalHeight * 1.1 ? "desktop" : "mobile";
        setMap((m) => (m[url] === ff ? m : { ...m, [url]: ff }));
      };
      img.src = url;
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
