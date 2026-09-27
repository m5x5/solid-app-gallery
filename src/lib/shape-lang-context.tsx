import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ShapeLang } from "./shapes";

// Global shape-language preference (LinkML / SHACL / ShEx) — which notation
// every shape panel renders in. Persisted like the device preference; unlike
// it, not mirrored to the URL: the notation is a reading preference, not part
// of what a link points at.
const ShapeLangContext = createContext<{
  lang: ShapeLang;
  setLang: (l: ShapeLang) => void;
}>({ lang: "linkml", setLang: () => {} });

const LS_KEY = "solid-gallery.shape-lang";
function readPref(): ShapeLang {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === "shacl" || v === "shex" ? v : "linkml";
  } catch {
    return "linkml";
  }
}

export function ShapeLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<ShapeLang>(readPref);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);
  return <ShapeLangContext.Provider value={{ lang, setLang }}>{children}</ShapeLangContext.Provider>;
}

export const useShapeLang = () => useContext(ShapeLangContext);
