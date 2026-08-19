import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";

export type Device = "mobile" | "desktop";

const DeviceContext = createContext<{
  device: Device;
  setDevice: (d: Device) => void;
}>({ device: "mobile", setDevice: () => {} });

const LS_KEY = "solid-gallery.device";
function readPref(): Device {
  try {
    return localStorage.getItem(LS_KEY) === "desktop" ? "desktop" : "mobile";
  } catch {
    return "mobile";
  }
}

// Global Mobile/Desktop preference, mirrored to the URL (`?device=desktop`) so a
// link opens in the same viewport. Mobile is the default and stays out of the URL.
//
// One-directional by design: the *preference* (persisted) is the source of
// truth, and effects only ever add the desktop param to the URL or lift an
// explicit desktop param into the preference. Nothing here ever flips the
// preference to mobile or strips the param except the user's own toggle — the
// old two-way sync (URL→state and state→URL effects) fought each other whenever
// a navigation dropped the param, flashing between the two layouts.
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const urlDesktop = params.get("device") === "desktop";
  const [pref, setPref] = useState<Device>(() => (urlDesktop ? "desktop" : readPref()));

  // What we render: an explicit desktop link wins, otherwise the preference.
  const device: Device = urlDesktop ? "desktop" : pref;

  // A shared desktop link makes desktop sticky for this visitor.
  useEffect(() => {
    if (urlDesktop && pref !== "desktop") setPref("desktop");
  }, [urlDesktop, pref]);

  // Keep the param on the URL after in-app navigations that dropped it, so the
  // current URL is always shareable.
  useEffect(() => {
    if (pref === "desktop" && !urlDesktop) {
      const next = new URLSearchParams(params);
      next.set("device", "desktop");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref, urlDesktop, params]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, pref);
    } catch {
      /* ignore */
    }
  }, [pref]);

  const setDevice = useCallback(
    (d: Device) => {
      setPref(d);
      const next = new URLSearchParams(params);
      if (d === "desktop") next.set("device", "desktop");
      else next.delete("device");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  return (
    <DeviceContext.Provider value={{ device, setDevice }}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
