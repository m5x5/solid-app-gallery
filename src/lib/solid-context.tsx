import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  restoreSession,
  startLogin,
  endLogin,
  onSessionChange,
  DEFAULT_IDP,
} from "./solid-auth";
import { isAdmin as checkIsAdmin, getProfile } from "./solid-data";
import { ADMIN_WEBID } from "@/config";

type Ctx = {
  isLoggedIn: boolean;
  webId?: string;
  name?: string;
  avatar?: string;
  isAdmin: boolean;
  // The catalog owner (the admin pod's WebID) — the only one who may manage
  // moderators. Moderators (isAdmin) can publish/review but not change the group.
  isOwner: boolean;
  loading: boolean;
  login: (idp?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SolidContext = createContext<Ctx | null>(null);

export function SolidProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>();
  const [admin, setAdmin] = useState(false);
  const [profile, setProfile] = useState<{ name?: string; avatar?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSessionChange((s) => {
      setLoggedIn(s.isLoggedIn);
      setWebId(s.webId);
    });
    restoreSession()
      .then((s) => {
        setLoggedIn(s.isLoggedIn);
        setWebId(s.webId);
      })
      .finally(() => setLoading(false));
    return unsub;
  }, []);

  // Admin status follows catalog write access (WAC) — recomputed on login.
  useEffect(() => {
    let alive = true;
    if (!webId) {
      setAdmin(false);
      return;
    }
    checkIsAdmin(webId).then((v) => alive && setAdmin(v));
    return () => {
      alive = false;
    };
  }, [webId]);

  // Display name + avatar from the user's own WebID profile document.
  useEffect(() => {
    let alive = true;
    if (!webId) {
      setProfile({});
      return;
    }
    getProfile(webId).then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [webId]);

  const value: Ctx = {
    isLoggedIn,
    webId,
    name: profile.name,
    avatar: profile.avatar,
    isAdmin: admin,
    isOwner: !!webId && webId === ADMIN_WEBID,
    loading,
    login: (idp = DEFAULT_IDP) => startLogin(idp),
    logout: async () => {
      await endLogin();
      setLoggedIn(false);
      setWebId(undefined);
    },
  };
  return <SolidContext.Provider value={value}>{children}</SolidContext.Provider>;
}

export function useSolid() {
  const ctx = useContext(SolidContext);
  if (!ctx) throw new Error("useSolid must be used within SolidProvider");
  return ctx;
}
