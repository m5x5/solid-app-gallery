import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'gallery-auth-'));
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
try {
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: true,
    outDir: directory,
    lib: {entry: fileURLToPath(new URL('../src/lib/solid-auth.ts', import.meta.url)), formats: ['cjs'], fileName: () => 'auth.cjs'},
    rollupOptions: {external: ['n3'], output: {entryFileNames: 'auth.cjs', format: 'cjs'}},
  },
  plugins: [{name:'mock-session', enforce:'pre', resolveId(id) {if (id.startsWith('@uvdsl/')) return '\0mock:' + id;}, load(id) {
    if (!id.startsWith('\0mock:')) return;
    return id.includes('RefreshWorker') ? 'export default "worker"' : `export const SessionEvents={STATE_CHANGE:'change'}; export class Session { constructor(config) { globalThis.usedSessionConfig=config; } addEventListener() {} async login(issuer) {globalThis.usedIssuer=issuer;} }`;
  }}],
});
// Resolve external dependencies from the project when loading the temporary bundle.
const require = createRequire(import.meta.url);
const { readFile } = await import('node:fs/promises');
const code = await readFile(join(directory, 'auth.cjs'), 'utf8');
const module = {exports:{}};
globalThis.window={location:{origin:'http://localhost:5180'}};
new Function('require', 'module', 'exports', code)(require, module, module.exports);
globalThis.window={location:{origin:'http://localhost:5180'}};
globalThis.fetch=async()=>new Response('<https://pod.mpeters.dev/michael/profile/card#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> <https://pod.mpeters.dev/>.',{headers:{'Content-Type':'text/turtle'}});
const {startLogin}=module.exports;
await startLogin('https://pod.mpeters.dev/michael/profile/card#me');
assert.equal(globalThis.usedIssuer,'https://pod.mpeters.dev/');
assert.equal(globalThis.usedSessionConfig.client_id, undefined, 'ordinary CSS profiles use dynamic client registration');
console.log('PASS: WebID resolved before Session.login');

await startLogin('  pod.mpeters.dev/michael/profile/card#me  ');
assert.equal(globalThis.usedIssuer, 'https://pod.mpeters.dev/');
globalThis.fetch = async () => new Response('<https://person.example/id> <http://www.w3.org/ns/solid/terms#oidcIssuer> <https://auth.example/tenant>.', {headers:{'Content-Type':'text/turtle'}});
await startLogin('https://person.example/id');
assert.equal(globalThis.usedIssuer, 'https://auth.example/tenant');
globalThis.fetch = async () => new Response('<#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> <../../>.', {headers:{'Content-Type':'text/turtle'}});
await startLogin('https://pod.mpeters.dev/michael/profile/card#me');
assert.equal(globalThis.usedIssuer, 'https://pod.mpeters.dev/');
await assert.rejects(startLogin('https://pod.mpeters.dev/michael/profile/card#someone-else'), /does not advertise/);
globalThis.fetch = async () => new Response('<html>Provider login</html>', {headers:{'Content-Type':'text/html'}});
await startLogin('https://auth.example/tenant');
assert.equal(globalThis.usedIssuer, 'https://auth.example/tenant');
await assert.rejects(startLogin('https://person.example/id#me'), /Could not read/);
// Solid Community's provider root returns a Turtle container, not a profile.
const turtleContainer = '<> a <http://www.w3.org/ns/ldp#Container>.';
globalThis.fetch = async (url) => String(url).endsWith('/.well-known/openid-configuration')
  ? Response.json({ issuer: 'https://solidcommunity.net' })
  : new Response(turtleContainer, { headers: { 'Content-Type': 'text/turtle' } });
await startLogin('https://solidcommunity.net');
assert.equal(globalThis.usedIssuer, 'https://solidcommunity.net');
await startLogin('https://solidcommunity.net/');
assert.equal(globalThis.usedIssuer, 'https://solidcommunity.net');
await assert.rejects(startLogin('https://solidcommunity.net/profile/card#me'), /does not advertise/);
await assert.rejects(startLogin('https://solidcommunity.net/profile/card'), /does not advertise/);
globalThis.fetch = async (url) => String(url).endsWith('/.well-known/openid-configuration')
  ? Response.json({ issuer: 'https://different-provider.example/' })
  : new Response(turtleContainer, { headers: { 'Content-Type': 'text/turtle' } });
await assert.rejects(startLogin('https://solidcommunity.net/'), /does not advertise/);
console.log('PASS: RDF provider roots use matching OIDC metadata; profiles and mismatched issuers remain rejected.');
globalThis.fetch = async () => new Response(
  '<https://sai.example/profile/card#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> <https://auth.sai.example/>.\n' +
  '<https://sai.example/profile/card#me> <http://www.w3.org/ns/solid/interop#hasAuthorizationAgent> <https://auth.sai.example/agent>.',
  { headers: { 'Content-Type': 'text/turtle' } }
);
await startLogin('https://sai.example/profile/card#me');
assert.equal(globalThis.usedSessionConfig.client_id, 'https://solid-app-gallery.mpeters.dev/id.jsonld');
console.log('PASS: SAI WebIDs use the stable client ID document.');
console.log('PASS: schemeless and fragmentless WebIDs, relative issuer, subject matching, direct provider, unreadable profile.');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  delete globalThis.usedIssuer;
  await rm(directory, {recursive:true, force:true});
}
