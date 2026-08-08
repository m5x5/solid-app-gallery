// For apps whose captured screenshot is a code Repository, try to find the REAL
// live app URL (GitHub "homepage" field, or a demo/live link in the README).
// Writes scripts/live-overrides.json { [appId]: liveUrl }. If none is found the
// app keeps its repository landing page (and Repository tag).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const screens = JSON.parse(readFileSync(join(ROOT, "src/data/screens.json"), "utf8"));
const data = JSON.parse(readFileSync(join(ROOT, "src/data/apps.json"), "utf8"));
const byId = Object.fromEntries([...data.apps, ...data.participation].map((a) => [a.id, a]));

const repoApps = Object.keys(screens).filter((id) =>
  screens[id].tags.includes("Repository")
);

// Hosting domains that strongly indicate a deployed app.
const HOST_HINT =
  /(github\.io|gitlab\.io|netlify\.app|vercel\.app|surge\.sh|web\.app|firebaseapp\.com|pages\.dev|fly\.dev|onrender\.com|herokuapp\.com|glitch\.me|solidcommunity\.net)/i;
const DEMO_WORD = /(demo|live|try\s?it|hosted|deployed|playground)/i;
// Boilerplate / docs / generic links that are NOT the app's own deployment.
const DENY =
  /(localhost|127\.0\.0\.1|0\.0\.0\.0|create-react-app|facebook\.github\.io|wikipedia\.org|solidproject\.org|\/docs?\/|running-tests|shields\.io|badge|\.md($|[?#])|opensource\.org|w3\.org|example\.(com|org)|mozilla\.org|npmjs\.com|gitter\.im|matrix\.to)/i;

async function safeFetch(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "solid-app-gallery", Accept: "*/*" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function ghParts(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}

function repoHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function pickFromText(text, excludeHost) {
  if (!text) return null;
  const urls = [...text.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)].map((m) =>
    m[0].replace(/[.,]$/, "")
  );
  const ok = (u) => u && !u.includes(excludeHost) && !DENY.test(u);
  // Prefer URLs on a hosting domain.
  const hosted = urls.find((u) => HOST_HINT.test(u) && ok(u));
  if (hosted) return hosted;
  // scan lines mentioning demo/live with a non-repo, non-denied URL
  for (const line of text.split("\n")) {
    if (DEMO_WORD.test(line)) {
      const u = (line.match(/https?:\/\/[^\s)"'<>\]]+/) || [])[0]?.replace(/[.,]$/, "");
      if (ok(u) && !/github\.com|gitlab\.com|bitbucket\.org/.test(u)) return u;
    }
  }
  return null;
}

async function resolveOne(id) {
  const app = byId[id];
  const url = app.landingPage || "";
  const host = repoHost(url);

  // GitHub: authoritative "homepage" field.
  const gh = ghParts(url);
  if (gh) {
    const meta = await safeFetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}`);
    if (meta) {
      try {
        const j = JSON.parse(meta);
        if (
          j.homepage &&
          /^https?:\/\//.test(j.homepage) &&
          !j.homepage.includes("github.com") &&
          !DENY.test(j.homepage)
        )
          return j.homepage.trim();
      } catch {
        /* ignore */
      }
    }
    for (const branch of ["HEAD", "main", "master"]) {
      const readme = await safeFetch(
        `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/README.md`
      );
      const hit = pickFromText(readme, "github.com");
      if (hit) return hit;
    }
    return null;
  }

  // GitLab / Bitbucket: scan raw README.
  let rawBase = null;
  if (url.includes("gitlab.com")) {
    const path = url.match(/gitlab\.com\/(.+?)(?:\/-\/|\?|#|$)/)?.[1];
    if (path) rawBase = `https://gitlab.com/${path}/-/raw`;
  } else if (url.includes("bitbucket.org")) {
    const path = url.match(/bitbucket\.org\/([^/]+\/[^/?#]+)/)?.[1];
    if (path) rawBase = `https://bitbucket.org/${path}/raw`;
  }
  if (rawBase) {
    for (const branch of ["HEAD", "main", "master"]) {
      const readme = await safeFetch(`${rawBase}/${branch}/README.md`);
      const hit = pickFromText(readme, host);
      if (hit) return hit;
    }
  }
  return null;
}

const overrides = {};
for (const id of repoApps) {
  const live = await resolveOne(id);
  if (live) {
    overrides[id] = live;
    console.log(`✓ ${byId[id].name} -> ${live}`);
  } else {
    console.log(`· ${byId[id].name} (kept repository)`);
  }
}
writeFileSync(join(__dirname, "live-overrides.json"), JSON.stringify(overrides, null, 2));
console.log(`\nResolved ${Object.keys(overrides).length}/${repoApps.length} live URLs -> scripts/live-overrides.json`);
