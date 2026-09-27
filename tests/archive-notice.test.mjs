import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const noticeUrl = "https://example.test/inbox/notice";
const notice = { type: "Announce", summary: "Test contribution", actor: "https://example.test/profile#me" };
let calls;
let readStatus;
let postStatus;
let deleteStatus;
let networkFailure;
let invalidJson;

globalThis.archiveNoticeFetch = async (url, options = {}) => {
  const method = options.method || "GET";
  calls.push({ url: String(url), method, body: options.body });
  if (method === networkFailure) throw new Error("Network failure");
  if (String(url) === noticeUrl && method === "GET") {
    return new Response(invalidJson ? "invalid JSON" : JSON.stringify(notice), { status: readStatus });
  }
  if (method === "POST") return new Response(null, { status: postStatus });
  if (method === "DELETE") return new Response(null, { status: deleteStatus });
  if (method === "GET") return new Response("", { headers: { "Content-Type": "text/turtle" } });
  return new Response(null, { status: 200 });
};

const server = await createServer({
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  plugins: [{
    name: "mock-auth",
    enforce: "pre",
    resolveId(id) { if (id.endsWith("solid-auth")) return "\0mock-auth"; },
    load(id) {
      if (id === "\0mock-auth") return `
        export const CLIENT_ID = "https://example.test/client";
        export const solidFetch = (...args) => globalThis.archiveNoticeFetch(...args);
      `;
    },
  }],
});
const { archiveNotice } = await server.ssrLoadModule("/src/lib/solid-data.ts");

after(async () => {
  await server.close();
  delete globalThis.archiveNoticeFetch;
});
beforeEach(() => {
  calls = [];
  readStatus = 200;
  postStatus = 201;
  deleteStatus = 204;
  networkFailure = undefined;
  invalidJson = false;
});

for (const status of [403, 404, 500]) {
  test(`preserves the notice when reading fails with HTTP ${status}`, async () => {
    readStatus = status;
    await assert.rejects(archiveNotice(noticeUrl));
    assert.deepEqual(calls.map(c => c.method), ["GET"]);
  });
}
test("preserves the notice when its JSON is invalid", async () => {
  invalidJson = true;
  await assert.rejects(archiveNotice(noticeUrl));
  assert.ok(!calls.some(c => c.method === "DELETE"));
});
for (const status of [403, 500]) {
  test(`preserves the notice when archiving fails with HTTP ${status}`, async () => {
    postStatus = status;
    await assert.rejects(archiveNotice(noticeUrl));
    assert.ok(calls.some(c => c.method === "POST"));
    assert.ok(!calls.some(c => c.method === "DELETE"));
  });
}
test("preserves the notice when the archive request throws", async () => {
  networkFailure = "POST";
  await assert.rejects(archiveNotice(noticeUrl));
  assert.ok(!calls.some(c => c.method === "DELETE"));
});
test("archives the notice with provenance before deleting the original", async () => {
  await archiveNotice(noticeUrl, notice.actor);
  const post = calls.find(c => c.method === "POST");
  const body = JSON.parse(post.body);
  assert.deepEqual(body, { ...notice, dismissedAt: body.dismissedAt, dismissedBy: notice.actor, archivedFrom: noticeUrl });
  assert.ok(Number.isFinite(Date.parse(body.dismissedAt)));
  assert.ok(calls.findIndex(c => c.method === "POST") < calls.findIndex(c => c.method === "DELETE"));
  assert.equal(calls.at(-1).url, noticeUrl);
});
test("reports failure if deleting the archived original is denied", async () => {
  deleteStatus = 403;
  await assert.rejects(archiveNotice(noticeUrl));
  assert.ok(calls.some(c => c.method === "POST"));
});
