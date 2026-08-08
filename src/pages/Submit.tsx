import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { categories } from "@/lib/apps";
import { useSolid } from "@/lib/solid-context";
import { submitApp, type AppSubmission } from "@/lib/solid-data";

export function Submit() {
  const { isLoggedIn, login, webId } = useSolid();
  const navigate = useNavigate();
  const [form, setForm] = useState<AppSubmission>({
    name: "",
    description: "",
    landingPage: "",
    repository: "",
    subType: categories[0]?.key || "OtherApp",
    status: "Production",
    technicalKeyword: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function set<K extends keyof AppSubmission>(k: K, v: AppSubmission[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMsg("Name is required.");
      return;
    }
    if (!webId) {
      setMsg("You must be logged in to publish.");
      return;
    }
    setBusy(true);
    setMsg("Submitting to your pod…");
    try {
      const url = await submitApp(form, webId);
      setMsg(`Submitted ✓ Saved to ${url}`);
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setMsg(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const labelCls = "block text-sm font-medium mb-1.5";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
      <h1 className="text-2xl font-bold">Submit an app</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Add a Solid app or service to the catalog. Submissions are written as RDF
        to the catalog's public review inbox.
      </p>

      {!isLoggedIn && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
          You're not logged in. You can fill the form, but you must{" "}
          <button
            className="font-semibold underline"
            onClick={() => login()}
          >
            log in with Solid
          </button>{" "}
          to publish.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="submit-form">
        <div>
          <label className={labelCls}>Name *</label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="My Solid App"
            data-testid="field-name"
          />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What does it do?"
          />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Landing page</label>
            <Input
              value={form.landingPage}
              onChange={(e) => set("landingPage", e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className={labelCls}>Repository</label>
            <Input
              value={form.repository}
              onChange={(e) => set("repository", e.target.value)}
              placeholder="https://github.com/…"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Category</label>
            <select
              value={form.subType}
              onChange={(e) => set("subType", e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm"
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm"
            >
              <option value="Production">Production</option>
              <option value="Development">Development</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Keywords</label>
          <Input
            value={form.technicalKeyword}
            onChange={(e) => set("technicalKeyword", e.target.value)}
            placeholder="comma, separated, tags"
          />
        </div>

        <Button type="submit" disabled={busy || !isLoggedIn} className="w-full">
          {isLoggedIn ? "Publish to catalog" : "Log in to publish"}
        </Button>
        {msg && (
          <p className="text-sm text-muted-foreground" data-testid="submit-msg">
            {msg}
          </p>
        )}
      </form>
    </div>
  );
}
