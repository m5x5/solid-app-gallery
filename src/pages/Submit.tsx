import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { categories, appBySource } from "@/lib/apps";
import { cn } from "@/lib/utils";
import { useSolid } from "@/lib/solid-context";
import {
  submitApp,
  updateMySubmission,
  listMySubmissions,
  isLegacySubmissionId,
  newSubmissionId,
  type AppSubmission,
} from "@/lib/solid-data";
import {
  addPending,
  updatePending,
  getPending,
  removePending,
} from "@/lib/pending-submissions";
import { usePendingSubmissions } from "@/lib/use-pending-flush";
import { SubmissionScreenshots } from "@/components/SubmissionScreenshots";

export function Submit() {
  const { isLoggedIn, login, webId } = useSolid();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Editing an existing submission: either still queued locally (?pendingId=)
  // or already written to the pod (?url=, the .ttl location to overwrite).
  const editPendingId = params.get("pendingId");
  const editUrl = params.get("url");
  const isEditing = !!editPendingId || !!editUrl;

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
  const pending = usePendingSubmissions();

  // Load the record being edited into the form.
  useEffect(() => {
    if (editPendingId) {
      const p = getPending(editPendingId);
      if (p) setForm(p.sub);
      return;
    }
    if (editUrl && isLoggedIn && webId) {
      let cancelled = false;
      listMySubmissions(webId).then((list) => {
        if (cancelled) return;
        const match = list.find((m) => m.url === editUrl);
        if (!match) return;
        // The id everything (screenshots, republishes) must key on is the
        // live catalog record's, if this submission was already published;
        // otherwise a legacy `cdata:<Name>` subject gets a proper id now.
        // Either way it is written back into the .ttl on the next save.
        const live = appBySource(editUrl);
        const id = live
          ? live.id
          : isLegacySubmissionId(match.sub.id, match.sub.name)
            ? newSubmissionId(match.sub.name)
            : match.sub.id;
        setForm({ ...match.sub, id });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [editPendingId, editUrl, isLoggedIn, webId]);

  function set<K extends keyof AppSubmission>(k: K, v: AppSubmission[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMsg("Name is required.");
      return;
    }

    // Editing a submission already written to the pod: overwrite it in place.
    if (editUrl) {
      if (!webId) {
        setMsg("You must be logged in to edit this submission.");
        return;
      }
      setBusy(true);
      setMsg("Saving changes…");
      try {
        await updateMySubmission(editUrl, form, webId);
        setMsg("Saved ✓");
        setTimeout(() => navigate("/participation"), 1200);
      } catch (err) {
        setMsg(`Failed: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Editing a submission still queued locally.
    if (editPendingId) {
      if (webId) {
        // Already logged in — just send the edited version and drop the
        // local copy (removePending no-ops if the flush already sent it).
        setBusy(true);
        setMsg("Submitting to your pod…");
        try {
          const url = await submitApp(form, webId);
          removePending(editPendingId);
          setMsg(`Submitted ✓ Saved to ${url}`);
          setTimeout(() => navigate("/participation"), 1200);
        } catch (err) {
          setMsg(`Failed: ${(err as Error).message}`);
        } finally {
          setBusy(false);
        }
      } else {
        updatePending(editPendingId, form);
        setMsg("Updated ✓ Still queued on this device.");
        setTimeout(() => navigate("/participation"), 1200);
      }
      return;
    }

    // Logged out: the admin inbox only accepts authenticated appends, so queue
    // the submission locally and let the login flush deliver it.
    if (!webId) {
      addPending(form);
      setMsg("Saved on this device ✓ Log in and it will be sent to the catalog.");
      setForm({
        name: "",
        description: "",
        landingPage: "",
        repository: "",
        subType: categories[0]?.key || "OtherApp",
        status: "Production",
        technicalKeyword: "",
      });
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

  // Prefill from the landing page / repository: fetched server-side
  // (api/prefill.ts — schema.org JSON-LD, Open Graph, GitHub/GitLab APIs) and
  // only ever fills fields that are still empty, so nothing typed is lost.
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillNote, setPrefillNote] = useState("");
  const prefilledFor = useRef<string>("");
  const userTouchedCategory = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;

  async function prefillFrom(url: string) {
    const u = url.trim();
    if (!u || !/^(https?:\/\/)?[^\s.]+\.[^\s]+/.test(u) || prefilledFor.current === u) return;
    prefilledFor.current = u;
    setPrefillBusy(true);
    setPrefillNote("");
    try {
      const res = await fetch(`/api/prefill?url=${encodeURIComponent(u)}`);
      if (res.status !== 200) {
        setPrefillNote("Couldn't read that page — please fill in the details by hand.");
        return;
      }
      const p = (await res.json()) as Partial<AppSubmission> & { source?: string };
      const filled: string[] = [];
      // Work from the latest form (a ref — `form` in this closure may be stale
      // after the await) and set it in one go, so the note below is accurate.
      const next = { ...formRef.current };
      const take = <K extends keyof AppSubmission>(k: K, v: AppSubmission[K] | undefined, label: string) => {
        if (v && !String(next[k] ?? "").trim()) {
          next[k] = v;
          filled.push(label);
        }
      };
      take("name", p.name, "name");
      take("description", p.description, "description");
      take("technicalKeyword", p.technicalKeyword, "keywords");
      // Category has a default value, so treat "still the default" as empty.
      if (
        p.subType &&
        categories.some((c) => c.key === p.subType) &&
        next.subType === (categories[0]?.key || "OtherApp") &&
        !userTouchedCategory.current
      ) {
        next.subType = p.subType;
        filled.push("category");
      }
      take("landingPage", p.landingPage, "landing page");
      take("repository", p.repository, "repository");
      if (filled.length) setForm(next);
      setPrefillNote(
        filled.length
          ? `Prefilled ${filled.join(", ")} from ${p.source || "the link"} — check and adjust.`
          : `Nothing new to prefill from ${p.source || "the link"}.`
      );
    } catch {
      setPrefillNote("Couldn't read that page — please fill in the details by hand.");
    } finally {
      setPrefillBusy(false);
    }
  }
  const labelCls = "block text-sm font-medium mb-1.5";

  return (
    <div className={cn("mx-auto px-4 py-10 md:px-8", isEditing ? "max-w-4xl" : "max-w-2xl")}>
      <h1 className="text-2xl font-bold">
        {isEditing ? "Edit your submission" : "Submit an app"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isEditing
          ? "Update the details below — saving replaces your earlier submission."
          : "Add a Solid app or service to the catalog. Submissions are written as RDF to the catalog's public review inbox."}
      </p>

      {!isLoggedIn && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
          You're not logged in. Your submission is saved on this device and sent
          to the catalog automatically when you{" "}
          <button className="font-semibold underline" onClick={() => login()}>
            log in with Solid
          </button>
          .
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="submit-form">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Landing page</label>
            <Input
              value={form.landingPage}
              onChange={(e) => set("landingPage", e.target.value)}
              onBlur={(e) => prefillFrom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  prefillFrom((e.target as HTMLInputElement).value);
                }
              }}
              placeholder="https://…"
              inputMode="url"
              autoFocus={!isEditing}
              data-testid="field-landing"
            />
          </div>
          <div>
            <label className={labelCls}>Repository</label>
            <Input
              value={form.repository}
              onChange={(e) => set("repository", e.target.value)}
              onBlur={(e) => prefillFrom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  prefillFrom((e.target as HTMLInputElement).value);
                }
              }}
              placeholder="https://github.com/…"
              inputMode="url"
              data-testid="field-repo"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground" data-testid="prefill-note">
          {prefillBusy
            ? "Reading the page…"
            : prefillNote ||
              "Paste a link first — name, description, category and keywords are prefilled from the page (schema.org / Open Graph / GitHub) where available."}
        </p>
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
            <label className={labelCls}>Category</label>
            <select
              value={form.subType}
              onChange={(e) => {
                userTouchedCategory.current = true;
                set("subType", e.target.value);
              }}
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
          <label className={labelCls}>Author WebID</label>
          <Input
            value={form.authorWebId || ""}
            onChange={(e) => set("authorWebId", e.target.value.trim() || undefined)}
            placeholder="https://…/profile/card#me — the app's author or maintainer"
            inputMode="url"
            data-testid="field-author"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. Links the app to its author's profile page in the gallery.
            {webId && !form.authorWebId && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => set("authorWebId", webId)}
                >
                  Use mine
                </button>
              </>
            )}
          </p>
        </div>
        <div>
          <label className={labelCls}>Keywords</label>
          <Input
            value={form.technicalKeyword}
            onChange={(e) => set("technicalKeyword", e.target.value)}
            placeholder="comma, separated, tags"
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {isEditing
            ? "Save changes"
            : isLoggedIn
              ? "Publish to catalog"
              : "Submit app"}
        </Button>
        {msg && (
          <p className="text-sm text-muted-foreground" data-testid="submit-msg">
            {msg}
          </p>
        )}
      </form>


      {!isEditing && pending.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/participation" className="underline">
            See your submissions
          </Link>
        </p>
      )}

      {/* Screenshots are keyed by the submission's stable id — the same IRI
          the catalog record gets on publish, so uploads reviewed from the
          admin queue attach to the right app whichever is approved first. */}
      {isEditing && isLoggedIn && webId && form.id && (
        <div className="mt-12">
          <SubmissionScreenshots appId={form.id} webId={webId} />
        </div>
      )}
    </div>
  );
}
