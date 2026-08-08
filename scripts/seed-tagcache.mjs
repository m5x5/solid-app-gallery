// Seeds scripts/tag-cache.json from the current (vision-tagged) screens.json so a
// re-capture can reuse tags for visually-unchanged frames instead of re-tagging.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { aHash } from "./lib-imgsig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const s = JSON.parse(readFileSync(join(ROOT, "src/data/screens.json"), "utf8"));

const cache = [];
for (const id in s) {
  for (const f of s[id].frames || []) {
    const file = join(ROOT, "public", f.path); // /screens/<slug>.png
    if (!existsSync(file)) continue;
    const hash = await aHash(readFileSync(file));
    cache.push({ hash, tags: f.tags });
  }
}
writeFileSync(join(__dirname, "tag-cache.json"), JSON.stringify(cache, null, 2));
console.log(`Seeded tag-cache with ${cache.length} signatures.`);
