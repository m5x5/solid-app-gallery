import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams, useLocation } from "react-router-dom";

export type Device = "mobile" | "desktop";

const DeviceContext = createContext<{
  device: Device;
  setDevice: (d: Device) => void;
}>({ device: "mobile", setDevice: () => {} });

// Global Mobile/Desktop preference, mirrored to the URL (`?device=desktop`) so a
// link opens in the same viewport. Mobile is the default and stays out of the URL.
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const urlDevice: Device =
    params.get("device") === "desktop" ? "desktop" : "mobile";
  const [device, setDevice] = useState<Device>(urlDevice);

  // URL → state (shared links, back/forward).
  useEffect(() => {
    setDevice(urlDevice);
  }, [urlDevice]);

  // State → URL: keep the param in sync (and present after navigation) so the
  // current URL is always shareable. Desktop sets it; mobile clears it.
  useEffect(() => {
    const cur = params.get("device");
    if (device === "desktop" && cur !== "desktop") {
      const next = new URLSearchParams(params);
      next.set("device", "desktop");
      setParams(next, { replace: true });
    } else if (device === "mobile" && cur) {
      const next = new URLSearchParams(params);
      next.delete("device");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, location.pathname, params]);

  return (
    <DeviceContext.Provider value={{ device, setDevice }}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
