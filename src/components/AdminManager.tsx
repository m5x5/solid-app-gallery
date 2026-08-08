import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { loadAdmins, addAdmin, removeAdmin } from "@/lib/solid-data";
import { Button } from "@/components/ui/button";

// Manage who can publish: the admins group (acl:agentGroup the catalog grants
// write to). Adding/removing a WebID here is the "simple ACL change" — the
// member instantly gains catalog-write + inbox-read via the group reference.
export function AdminManager({ currentWebId }: { currentWebId?: string }) {
  const [admins, setAdmins] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => loadAdmins().then(setAdmins);
  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    const webId = input.trim();
    if (!/^https?:\/\/.+/.test(webId)) {
      setError("Enter a full WebID URL (https://…/profile/card#me).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addAdmin(webId);
      setInput("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(webId: string) {
    setBusy(true);
    setError("");
    try {
      await removeAdmin(webId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Admins</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone listed here can publish, review, and manage admins. Membership is
        the catalog's <code>acl:agentGroup</code> — a single change grants
        everything.
      </p>

      <ul className="mt-4 space-y-2">
        {admins.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No admins listed yet.
          </li>
        )}
        {admins.map((webId) => (
          <li
            key={webId}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              {webId}
              {webId === currentWebId && (
                <span className="ml-2 text-xs text-muted-foreground">(you)</span>
              )}
            </span>
            <button
              onClick={() => remove(webId)}
              disabled={busy}
              aria-label="Remove admin"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-red-600 hover:text-white disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="https://example.solidcommunity.net/profile/card#me"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
        <Button onClick={add} disabled={busy} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add admin
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
