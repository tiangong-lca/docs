import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let childMilliseconds = 0;
let childOutputBytes = 0;
const prelude = String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
const root = process.env.DOCS_CONTRACT_ROOT;
const fixture = process.env.DOCS_CONTRACT_FIXTURE;
const require = createRequire(path.join(root, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const packageInfo = (entry, name) => {
  for (let folder = path.dirname(entry);; folder = path.dirname(folder)) {
    const file = path.join(folder, 'package.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.name === name) return { ...data, folder };
    }
    if (folder === path.dirname(folder)) throw new Error('Missing package identity: ' + name);
  }
};
const nativeFetch = globalThis.fetch;
const deny = () => { throw new Error('Unexpected network in offline dependency contract'); };
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = net.connect = net.createConnection = deny;
`;

// Portable finite-child lifecycle only. The local OS sandbox and live resource
// observer belong to the execution lease, not to this test helper.
async function child(t, source, { mode = '', status = 0, error, deadline = 10_000, entry, args = [], input } = {}) {
  const remaining = 120_000 - childMilliseconds;
  assert.ok(remaining > 0, 'Bound aggregate native fixture runtime');
  const parent = path.join(root, '.next');
  const parentCreated = !fs.existsSync(parent);
  fs.mkdirSync(parent, { recursive: true });
  assert.equal(fs.lstatSync(parent).isSymbolicLink(), false, 'Owned fixtures need a real parent directory');
  const parentIdentity = fs.statSync(parent);
  const directory = fs.mkdtempSync(path.join(parent, 'dependency-consumer-'));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'HOME', 'USERPROFILE'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, {
    DOCS_CONTRACT_ROOT: root, DOCS_CONTRACT_FIXTURE: directory, DOCS_CONTRACT_MODE: mode,
    TMPDIR: directory, TMP: directory, TEMP: directory,
    UV_THREADPOOL_SIZE: '2', RAYON_NUM_THREADS: '2', OMP_NUM_THREADS: '2', GOMAXPROCS: '2', NEXT_TELEMETRY_DISABLED: '1',
  });
  const started = performance.now();
  let stdout = '', stderr = '', bytes = 0, cancelled = false, exited = false, closed = false, completed = false;
  let spawnError;
  const controller = new AbortController();
  const processChild = spawn(process.execPath, entry ? [entry, ...args] : ['--input-type=module', '-e', prelude + source], {
    cwd: root, env, signal: controller.signal, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  let timeout, closeTimeout, exitResult;
  let settleClosure;
  const closure = new Promise((resolve) => { settleClosure = resolve; });
  const stopDeadlines = () => { clearTimeout(timeout); clearTimeout(closeTimeout); };
  const joinClose = () => {
    if (closed || closeTimeout) return;
    // Separate from execution: inherited stderr can remain open after exit.
    // 10s execution + 2s join stays below the existing 15s outer timeout.
    closeTimeout = setTimeout(() => {
      t.diagnostic(JSON.stringify({
        fixture: directory, pid: processChild.pid, directExitObserved: exited,
        exitResult, closeObserved: closed,
        stdoutEnded: processChild.stdout?.readableEnded, stderrEnded: processChild.stderr?.readableEnded,
        nativeResources: 'unverified; retained for owner inspection',
      }));
      settleClosure({ closeTimedOut: true });
    }, 2_000);
  };
  const cancel = () => {
    if (closed) return;
    if (!cancelled) t.diagnostic('Cancellation retains owned fixture pending closure evidence: ' + directory);
    cancelled = true;
    if (!exited && !controller.signal.aborted) controller.abort();
    joinClose();
  };
  const onExit = (code, signal) => {
    exited = true; exitResult = { code, signal }; clearTimeout(timeout); joinClose();
  };
  const onError = (failure) => { spawnError ??= failure; clearTimeout(timeout); cancel(); };
  const onClose = (code, signal) => {
    closed = true; stopDeadlines(); settleClosure({ code, signal });
  };
  processChild.once('exit', onExit);
  processChild.on('error', onError);
  processChild.once('close', onClose);
  timeout = setTimeout(cancel, Math.min(deadline, remaining));
  t.signal.addEventListener('abort', cancel, { once: true });
  if (t.signal.aborted) cancel();
  const capture = (target) => (buffer) => {
    bytes += buffer.length;
    childOutputBytes += buffer.length;
    if (bytes > 1024 * 1024 || childOutputBytes > 8 * 1024 * 1024) cancel();
    else if (target === 'stdout') stdout += buffer;
    else stderr += buffer;
  };
  const captureOut = capture('stdout'), captureError = capture('stderr');
  const onInputError = (failure) => { spawnError ??= failure; cancel(); };
  processChild.stdout?.on('data', captureOut);
  processChild.stderr?.on('data', captureError);
  processChild.stdin?.on('error', onInputError);
  if (input !== undefined) processChild.stdin.end(input);
  try {
    // Error/AbortError still gets a bounded close join, never an unbounded wait.
    const result = await closure;
    if (result.closeTimedOut) {
      // Keep the useful original error/status if one was already observed.
      if (spawnError) throw spawnError;
      if (exitResult) assert.equal(exitResult.code, status, stderr + stdout);
      throw new Error('Direct-child/stdio closure was not observed within 2s; owned native resources are unverified. ' + stderr + stdout);
    }
    assert.equal(spawnError, undefined, spawnError?.stack);
    assert.equal(cancelled, false, stderr + stdout);
    assert.equal(result.signal, null, stderr + stdout);
    assert.equal(result.code, status, stderr + stdout);
    if (error) assert.match(stderr, error);
    assert.doesNotMatch(stderr, /docs-fixture-key/u, 'SDK error stacks must mask the synthetic API key');
    let total = 0;
    const inspect = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) inspect(file);
        else if (entry.isFile()) total += fs.statSync(file).size;
      }
    };
    inspect(directory);
    assert.ok(total <= 64 * 1024 * 1024, 'Post-exit owned fixture size verification');
    completed = true;
    return { stdout, stderr };
  } finally {
    stopDeadlines();
    t.signal.removeEventListener('abort', cancel);
    if (!closed) {
      // Failure only: cancel the still-live direct child through its own API,
      // release our pipe handles, and stop keeping the test runner alive.
      // Destroyed pipes/unref do NOT establish native descendant termination.
      const releaseErrors = [];
      const release = (action) => {
        try { action(); } catch (failure) { releaseErrors.push(String(failure)); }
      };
      release(cancel);
      release(stopDeadlines);
      release(() => processChild.stdout?.off('data', captureOut));
      release(() => processChild.stderr?.off('data', captureError));
      release(() => processChild.stdin?.off('error', onInputError));
      for (const stream of [processChild.stdin, processChild.stdout, processChild.stderr]) {
        // Passive error sinks own no live handle; late pipe errors stay failures
        // already recorded above rather than becoming unhandled events.
        release(() => stream?.on('error', () => {}));
        release(() => stream?.destroy());
      }
      release(() => processChild.off('exit', onExit));
      release(() => processChild.off('close', onClose));
      release(() => processChild.off('error', onError));
      release(() => processChild.on('error', () => {}));
      release(() => processChild.unref());
      if (releaseErrors.length) t.diagnostic('Failed observation-handle release; original failure retained: ' + releaseErrors.join('; '));
      t.diagnostic('Released failed direct-child/stdio observation handles; native-resource closure remains unverified: ' + directory);
    }
    childMilliseconds += performance.now() - started;
    // No PID/group probing or escalation. Retain failed paths for the local
    // observer; never signal an unknown descendant or infer tree closure.
    if (completed && closed) {
      fs.rmSync(directory, { recursive: true, force: true });
      assert.equal(fs.existsSync(directory), false);
      if (parentCreated && fs.existsSync(parent)) {
        const current = fs.statSync(parent);
        if (current.dev === parentIdentity.dev && current.ino === parentIdentity.ino && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
      }
    } else {
      t.diagnostic('Retained failed owned fixture for inspection: ' + directory);
    }
  }
}

const algolia = String.raw`
const mode = process.env.DOCS_CONTRACT_MODE;
const sha = 'a'.repeat(40);
const locales = ['zh', 'en', 'de', 'fr'];
const records = locales.map((tag) => ({ _id: tag, title: tag, url: '/' + tag + '/docs/', tag, extra_data: { sourceCommit: sha }, structured: { headings: [], contents: [{ content: tag + ' fixture', heading: undefined }] } }));
const { createHash } = await import('node:crypto');
fs.mkdirSync(path.join(fixture, 'out'));
fs.writeFileSync(path.join(fixture, 'out/search-records.json'), JSON.stringify({ schemaVersion: 1, sourceCommit: sha, digest: 'sha256:' + createHash('sha256').update(JSON.stringify(records)).digest('hex'), count: records.length, countsByLocale: Object.fromEntries(locales.map((l) => [l, 1])), records }));
Object.assign(process.env, { ALGOLIA_APP_ID: 'DOCSFIXTURE', ALGOLIA_WRITE_KEY: 'docs-fixture-key', ALGOLIA_INDEX_NAME: 'tiangong-lca-docs', EXPECTED_SHA: sha });
const calls = [];
let task = 0, batches = 0;
globalThis.__docsRequester = { async send(request) {
  assert.ok(calls.length < 32, 'Bound actual SDK requests');
  const pathname = new URL(request.url).pathname;
  const body = request.data ? JSON.parse(request.data) : null;
  calls.push({ method: request.method, pathname, body });
  const response = (value, status = 200) => ({ status, content: JSON.stringify(value), isTimedOut: false });
  if (mode === 'denied') return response({ message: 'synthetic permission denial', status: 403 }, 403);
  if (pathname.endsWith('/settings')) {
    assert.equal(request.method, 'PUT');
    assert.deepEqual(body.attributesForFaceting, ['tag']);
    assert.ok(body.attributesToRetrieve.includes('table'));
    return response({ taskID: ++task, updatedAt: '2026-01-01T00:00:00Z' });
  }
  if (pathname.endsWith('/operation')) {
    assert.ok(['copy', 'move'].includes(body.operation));
    assert.ok(body.destination.startsWith('tiangong-lca-docs'));
    return response({ taskID: ++task });
  }
  if (pathname.endsWith('/batch')) {
    batches++;
    assert.equal(body.requests.length, 4);
    assert.deepEqual(body.requests.map((item) => item.body.tag), locales);
    assert.ok(body.requests.every((item) => item.action === 'addObject' && item.body.sourceCommit === sha && item.body.url.startsWith('/' + item.body.tag + '/')));
    return response({ taskID: ++task, objectIDs: body.requests.map((item) => item.body.objectID) });
  }
  if (/\/task\/\d+$/u.test(pathname)) return response({ status: 'published' });
  if (pathname.endsWith('/query')) {
    assert.equal(request.method, 'POST');
    if (!body.facetFilters) {
      assert.equal(body.hitsPerPage, 1);
      assert.deepEqual(body.attributesToRetrieve, ['sourceCommit']);
      return response({ hits: [{ sourceCommit: mode === 'sentinel' ? 'b'.repeat(40) : sha }] });
    }
    const locale = body.facetFilters[0].slice(4);
    assert.ok(locales.includes(locale));
    assert.ok(body.query.length > 0);
    assert.equal(body.hitsPerPage, 50);
    return response({ hits: [{ url: '/' + (mode === 'locale' ? 'other' : locale) + '/docs/' }] });
  }
  throw new Error('Unexpected synthetic request path ' + pathname);
} };
const script = pathToFileURL(path.join(root, 'scripts/search-sync.mjs')).href;
const sdk = pathToFileURL(require.resolve('algoliasearch')).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'algoliasearch' && context.parentURL === script) return { url: 'docs-offline:algolia-factory', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'docs-offline:algolia-factory') return { format: 'module', source: 'import { algoliasearch as actual } from ' + JSON.stringify(sdk) + '; export const algoliasearch = (id, key) => actual(id, key, { requester: globalThis.__docsRequester });', shortCircuit: true };
    return next(url, context);
  },
});
process.on('exit', () => {
  if (mode === 'denied') assert.equal(calls.length, 1);
  else {
    assert.equal(batches, 1);
    assert.equal(calls[0].pathname.endsWith('/settings'), true);
    assert.equal(calls.filter((call) => call.pathname.endsWith('/operation')).length, 3);
    assert.ok(calls.some((call) => /\/task\/\d+$/u.test(call.pathname)));
  }
});
process.chdir(fixture);
process.argv = [process.execPath, path.join(root, 'scripts/search-sync.mjs'), '--local-out'];
await import(script);
assert.equal(calls.filter((call) => call.pathname.endsWith('/query')).length, 5);
`;

for (const [mode, status, error] of [
  ['success', 0, undefined],
  ['denied', 1, /synthetic permission denial/u],
  ['sentinel', 1, /sentinel readback failed/u],
  ['locale', 1, /locale leak/u],
]) test('real Algolia/Fumadocs reconciliation with offline requester: ' + mode, { timeout: 15_000 }, async (t) => {
  const result = await child(t, algolia, { mode, status, error });
  if (status === 0) assert.match(result.stdout, /ALL GREEN/u);
});

test('Fumadocs public Node loader and macro compile through the real yuku native consumer', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
process.chdir(fixture);
fs.mkdirSync(path.join(fixture, 'content'));
fs.writeFileSync(path.join(fixture, 'content/sample.mdx'), '---\ntitle: Fixture\n---\n# Native fixture\n\nUnicode: 生命周期 — Prüfung.\n\n- first\n- second\n');
fs.writeFileSync(path.join(fixture, 'collection.mjs'), "import { defineDocs } from 'fumadocs-mdx/macro'; export const docs = defineDocs({ dir: './content' });");
const { register } = await import('node:module');
const { MessageChannel } = await import('node:worker_threads');
const loaderEntry = require.resolve('fumadocs-mdx/node/_loader');
const mdxRequire = createRequire(loaderEntry);
const esbuildEntry = mdxRequire.resolve('esbuild');
const expected = Object.fromEntries(['fumadocs-core/mdx-plugins', 'fumadocs-mdx/macro', 'react', 'react/jsx-runtime'].map((name) => [name, fs.realpathSync(require.resolve(name))]));
// Inspect lookup from each generated-module ancestry before evaluation.
for (const directory of [fixture, path.join(fixture, 'generated'), path.join(fixture, 'generated/macro')]) {
  const generatedRequire = createRequire(path.join(directory, 'lookup.mjs'));
  for (const [name, resolved] of Object.entries(expected)) assert.equal(fs.realpathSync(generatedRequire.resolve(name)), resolved);
}
const shim = path.join(fixture, 'owned-mdx-loader.mjs');
fs.writeFileSync(shim, "import { pathToFileURL } from 'node:url';\nimport * as actual from " + JSON.stringify(pathToFileURL(loaderEntry).href) + ";\nexport async function initialize({ options, port, esbuildEntry }) {\n  actual.initialize(options);\n  port.on('message', async (message) => {\n    if (message !== 'dispose') return;\n    try {\n      // Same module instance/realm as the actual Fumadocs evaluator.\n      const esbuild = await import(pathToFileURL(esbuildEntry).href);\n      await esbuild.stop();\n      port.postMessage({ type: 'disposal-request-complete' });\n    } catch (error) {\n      port.postMessage({ type: 'disposal-error', message: String(error) });\n    } finally {\n      port.close();\n    }\n  });\n}\nexport const load = (...args) => actual.load(...args);\n");
const { port1, port2 } = new MessageChannel();
port1.unref();
let registered = false;
try {
  register(pathToFileURL(shim), { data: { options: { root: fixture, outDir: path.join(fixture, 'generated') }, port: port2, loaderEntry, esbuildEntry }, transferList: [port2] });
  registered = true;
  const { docs } = await import(pathToFileURL(path.join(fixture, 'collection.mjs')).href);
  assert.equal(docs.docs.length, 1);
  const entry = docs.getPage('sample.mdx');
  assert.ok(entry);
  assert.equal(entry.title, 'Fixture');
  assert.equal(typeof entry.body, 'function');
  assert.ok(entry.structuredData.contents.some((item) => item.content.includes('生命周期')));
  const { createElement } = await load('react');
  const { renderToStaticMarkup } = await load('react-dom/server');
  const html = renderToStaticMarkup(createElement(entry.body));
  assert.match(html, /Native fixture/u);
  assert.match(html, /<li>first<\/li>/u);
} finally {
  try {
    // Ack proves same-realm stop() invocation; native exit is separately observed.
    if (registered) await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('MDX disposal acknowledgement timeout')), 2_000);
      port1.once('message', (message) => {
        clearTimeout(deadline);
        if (message.type === 'disposal-request-complete') resolve();
        else reject(new Error('MDX disposal failed: ' + message.message));
      });
      port1.postMessage('dispose');
    });
  } finally {
    port1.close();
    if (!registered) port2.close();
  }
}
`);
});

test('installed Next SWC transforms TSX and preserves a source map', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const transformed = await swc.transform('const title: string = "fixture"; export const view = <h1>{title}</h1>;', { filename: 'fixture.tsx', sourceMaps: true, jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'es6' } });
assert.match(transformed.code, /createElement/u);
assert.doesNotMatch(transformed.code, /title: string/u);
const map = JSON.parse(transformed.map);
assert.ok(map.sources.some((source) => source.endsWith('fixture.tsx')));
assert.ok(map.mappings.length > 0);
`);
});

test('actual Next PostCSS host and selected direct processor handle Tailwind/Fumadocs CSS, maps and warnings', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
const direct = require('postcss');
const { lazyPostCSS } = require('next/dist/build/webpack/config/blocks/css');
const hosted = await lazyPostCSS(root, ['chrome 120']);
const nextRequire = createRequire(require.resolve('next/package.json'));
assert.equal(hosted.postcss, nextRequire('postcss'));
assert.equal(hosted.postcss().version, '8.5.23');
assert.equal(direct().version, '8.5.32');
const tailwind = (await load('@tailwindcss/postcss')).default;
const source = fs.readFileSync(path.join(root, 'app/global.css'), 'utf8').replace("@import 'tailwindcss';", "@import 'tailwindcss' source(none);\n@source inline('text-red-500');");
const outputs = [];
for (const [processor, implementation] of [[hosted.postcssWithPlugins, hosted.postcss], [direct([tailwind({ base: root })]), direct]]) {
  const result = await processor.process(source, { from: path.join(root, 'app/dependency-fixture.css'), map: { inline: false, annotation: false, sourcesContent: true } });
  assert.match(result.css, /\.text-red-500/u);
  assert.match(result.css, /--color-fd-primary:\s*#5c246a/u);
  assert.ok(result.map.toJSON().sources.length > 0);
  assert.equal(result.warnings().length, 0);
  outputs.push(result.css);
  const warned = await implementation([{ postcssPlugin: 'owned-warning-control', Once(node, { result }) { result.warn('owned warning', { node: node.first }); } }]).process('a { color: red }', { from: 'warning.css' });
  assert.equal(warned.warnings().length, 1);
  assert.equal(warned.warnings()[0].line, 1);
  await assert.rejects(async () => await processor.process('a {', { from: 'invalid.css' }), /Unclosed block/u);
}
assert.equal(outputs[0], outputs[1]);
`);
});

test('installed Sharp codecs and actual Next ImageResponse produce bounded images offline', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
const nextRequire = createRequire(require.resolve('next/package.json'));
const sharp = nextRequire('sharp');
sharp.concurrency(2);
const input = await sharp({ create: { width: 4, height: 3, channels: 4, background: '#5c246a' } }).png().toBuffer();
const webp = await sharp(input).resize(2, 2).webp().toBuffer();
const metadata = await sharp(webp).metadata();
assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 2, 2]);
const { createElement } = await load('react');
// The actual OG bundle loads its embedded Yoga WASM via an in-memory data URL.
// Permit that bounded input, never an external fetch or a replacement decoder.
let embeddedWasmFetches = 0;
globalThis.fetch = async (input, options) => {
  assert.equal(typeof input, 'string');
  const prefix = 'data:application/octet-stream;base64,';
  assert.ok(input.startsWith(prefix), 'Only embedded WASM data URLs are allowed');
  assert.ok(input.length <= 2 * 1024 * 1024, 'Bound embedded WASM input');
  assert.ok(++embeddedWasmFetches <= 4, 'Bound embedded WASM loads');
  const bytes = Buffer.from(input.slice(prefix.length), 'base64');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '0061736d01000000');
  return nativeFetch(input, options);
};
const { ImageResponse } = await load('next/og');
const response = new ImageResponse(createElement('div', { style: { display: 'flex', width: '100%', height: '100%', background: '#5c246a' } }), { width: 32, height: 16, fonts: [] });
assert.equal(response.headers.get('content-type'), 'image/png');
const image = Buffer.from(await response.arrayBuffer());
assert.ok(image.length < 1024 * 1024);
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
const og = await sharp(image).metadata();
assert.deepEqual([og.width, og.height], [32, 16]);
assert.ok(embeddedWasmFetches > 0, 'Exercise actual embedded WASM loading');
`);
});

test('Markdownlint uses fixed RE2JS for real rules, finite matching and reset controls', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
const cliRequire = createRequire(require.resolve('markdownlint-cli2'));
const lintEntry = cliRequire.resolve('markdownlint/sync');
const lintRequire = createRequire(lintEntry);
assert.equal(packageInfo(lintEntry, 'markdownlint').version, '0.42.0');
const re2Package = packageInfo(lintRequire.resolve('re2js'), 're2js');
assert.equal(re2Package.version, '2.9.1');
// Match Markdownlint's ESM import condition, not the separate require bundle.
const re2Entry = path.join(re2Package.folder, re2Package.exports['.'].import.default);
const { lint } = await import(pathToFileURL(lintEntry).href);
const { RE2JS, RE2JSSyntaxException } = await import(pathToFileURL(re2Entry).href);
// MD013's actual last-run matcher is RE2JS; do not substitute a custom rule.
const result = lint({ strings: { good: 'alpha beta\n', bad: 'alpha beta gamma\n', frontmatter: '---\ntitle: deliberately longer than ten\n---\nalpha beta\n' }, config: { default: false, MD013: { line_length: 10 } } });
assert.deepEqual(result.good, []);
assert.deepEqual(result.frontmatter, []);
assert.equal(result.bad.length, 1);
assert.ok(result.bad[0].ruleNames.includes('MD013'));
assert.equal(result.bad[0].lineNumber, 1);
assert.deepEqual(result.bad[0].errorRange, [11, 6]);
const matcher = RE2JS.compile('(ab+)').matcher('xxabbb ab');
assert.equal(matcher.find(), true);
assert.deepEqual([matcher.start(), matcher.end(), matcher.group(1)], [2, 6, 'abbb']);
assert.equal(matcher.find(), true);
assert.deepEqual([matcher.start(), matcher.end(), matcher.group(1)], [7, 9, 'ab']);
assert.equal(matcher.find(), false);
matcher.reset();
assert.equal(matcher.find(), true);
assert.equal(matcher.start(), 2);
matcher.resetMatcherInput('no match');
assert.equal(matcher.find(), false);
assert.throws(() => RE2JS.compile('(?<=foo)bar'), RE2JSSyntaxException);
const lookbehind = RE2JS.compile('(?<=foo)bar', RE2JS.LOOKBEHINDS);
assert.equal(lookbehind.test('foobar'), true);
assert.equal(lookbehind.test('bazbar'), false);
assert.throws(() => RE2JS.compile('(?<=(foo))bar', RE2JS.LOOKBEHINDS), RE2JSSyntaxException);
`, { deadline: 2_000 });
});

test('actual math HTML consumer uses fixed KaTeX settings and Commander CLI closure', { timeout: 20_000 }, async (t) => {
  await child(t, String.raw`
const cliRequire = createRequire(require.resolve('markdownlint-cli2'));
const lintRequire = createRequire(cliRequire.resolve('markdownlint/sync'));
const mathEntry = lintRequire.resolve('micromark-extension-math');
const mathRequire = createRequire(mathEntry);
assert.equal(packageInfo(mathEntry, 'micromark-extension-math').version, '3.1.0');
const katexPackage = packageInfo(mathRequire.resolve('katex'), 'katex');
assert.equal(katexPackage.version, '0.19.1');
const katexEntry = path.join(katexPackage.folder, katexPackage.exports['.'].import.default);
const katexRequire = createRequire(katexEntry);
assert.equal(packageInfo(katexRequire.resolve('commander'), 'commander').version, '15.0.0');
const { micromark } = await import(pathToFileURL(lintRequire.resolve('micromark')).href);
const { math, mathHtml } = await import(pathToFileURL(mathEntry).href);
const katex = (await import(pathToFileURL(katexEntry).href)).default;
const render = (source, options) => micromark(source, { extensions: [math()], htmlExtensions: [mathHtml(options)] });
const inline = render('$x^2$');
assert.match(inline, /class="math math-inline"/u);
assert.match(inline, /<math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML"/u);
assert.match(render('$$\nx^2\n$$'), /class="math math-display"/u);
const link = '\\href{https://example.invalid/finite}{x}';
assert.doesNotMatch(render('$' + link + '$'), /<a\b/u);
assert.match(render('$' + link + '$', { trust: true }), /<a href="https:\/\/example.invalid\/finite"/u);
const inherited = Object.assign(Object.create({ trust: true, output: 'html' }), { strict: false });
assert.doesNotMatch(katex.renderToString(link, inherited), /<a\b/u);
assert.match(katex.renderToString('x', inherited), /<math xmlns=/u);
assert.doesNotMatch(render('$' + link + '$', inherited), /<a\b/u);
const contexts = [];
const ownTrust = { trust(context) { contexts.push(context); return context.command === '\\href' && context.protocol === 'https'; } };
assert.match(render('$' + link + '$', ownTrust), /<a href=/u);
assert.equal(contexts.length, 1);
assert.equal(contexts[0].command, '\\href');
assert.equal(contexts[0].protocol, 'https');
assert.equal(katex.renderToString('x', { output: undefined, trust: undefined }), katex.renderToString('x'));
assert.equal(katex.renderToString('\\rule{1em}{1em}', { maxSize: -1 }), katex.renderToString('\\rule{1em}{1em}', { maxSize: 0 }));
assert.throws(() => katex.renderToString('\\fixture', { macros: { '\\fixture': 'x' }, maxExpand: -1 }), /Too many expansions/u);
assert.match(katex.renderToString('\\fixture', { macros: { '\\fixture': 'x' }, maxExpand: 1 }), /class="katex"/u);
assert.throws(() => render('$\\ownedUnknownCommand$'), /Undefined control sequence/u);
assert.match(render('$\\ownedUnknownCommand$', { throwOnError: false, errorColor: '#123456' }), /color:\s*#123456/u);
`);
  // Run the installed CLI itself, not a reimplementation of its option parsing.
  const rootRequire = createRequire(path.join(root, 'package.json'));
  const lintRequire = createRequire(createRequire(rootRequire.resolve('markdownlint-cli2')).resolve('markdownlint/sync'));
  const mathRequire = createRequire(lintRequire.resolve('micromark-extension-math'));
  const katexCli = path.join(path.dirname(mathRequire.resolve('katex/package.json')), 'cli.js');
  const rendered = await child(t, '', { entry: katexCli, args: ['--format', 'mathml', '--error-color', '00aa00', '--macro', '\\fixture:x', '--max-expand', '16'], input: '\\fixture', deadline: 2_000 });
  assert.match(rendered.stdout, /<math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML"/u);
  assert.match(rendered.stdout, /<mi>x<\/mi>/u);
  await child(t, '', { entry: katexCli, args: ['--owned-unsupported-option'], status: 1, error: /unknown option/u, deadline: 2_000 });
});

test('active Next and Tailwind source-map-js copies roundtrip finite maps and reject invalid offsets', { timeout: 15_000 }, async (t) => {
  await child(t, String.raw`
const nextRequire = createRequire(require.resolve('next/package.json'));
const postcssEntry = nextRequire.resolve('postcss');
const postcssRequire = createRequire(postcssEntry);
const tailwindRequire = createRequire(require.resolve('@tailwindcss/postcss'));
const tailwindEntry = tailwindRequire.resolve('@tailwindcss/node');
const tailwindNodeRequire = createRequire(tailwindEntry);
const activeEntries = [...new Set([postcssRequire.resolve('source-map-js'), tailwindNodeRequire.resolve('source-map-js')])];
for (const entry of activeEntries) {
  assert.equal(packageInfo(entry, 'source-map-js').version, '1.2.2');
  const { SourceMapGenerator, SourceMapConsumer } = createRequire(entry)(entry);
  const generator = new SourceMapGenerator({ file: 'output.css' });
  generator.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: 'input.css', name: 'owned' });
  generator.setSourceContent('input.css', 'a { color: red }');
  const map = generator.toJSON();
  const consumer = new SourceMapConsumer(map);
  assert.deepEqual(consumer.originalPositionFor({ line: 1, column: 0 }), { source: 'input.css', line: 1, column: 0, name: 'owned' });
  assert.equal(consumer.sourceContentFor('input.css'), 'a { color: red }');
  assert.deepEqual(consumer.generatedPositionFor({ source: 'input.css', line: 1, column: 0 }), { line: 1, column: 0, lastColumn: null });
  assert.throws(() => generator.addMapping({ generated: { line: 0, column: 0 } }), /Invalid mapping/u);
  const indexed = (line, column = 0) => ({ version: 3, sections: [{ offset: { line, column }, map }] });
  // Small metadata-only invalid inputs, checked on the fixed active API before
  // serialization. No large mapping string or vulnerable old copy is invoked.
  for (const value of [-1, 0.5, '1', NaN, Infinity]) assert.throws(() => new SourceMapConsumer(indexed(value)), /non-negative integers/u);
  assert.throws(() => new SourceMapConsumer(indexed(0, -1)), /non-negative integers/u);
  assert.throws(() => new SourceMapConsumer(indexed(10_000_001)), /must not exceed/u);
  const shifted = new SourceMapConsumer(indexed(1));
  assert.equal(shifted.originalPositionFor({ line: 2, column: 1 }).source, 'input.css');
}
const sourceMap = postcssRequire('source-map-js');
const postcss = nextRequire('postcss');
const input = 'a { color: red }';
const result = await postcss([{ postcssPlugin: 'owned-map-roundtrip', Declaration(node) { node.value = 'blue'; } }]).process(input, { from: path.join(fixture, 'input.css'), to: path.join(fixture, 'output.css'), map: { inline: false, annotation: false, sourcesContent: true } });
assert.match(result.css, /blue/u);
const actualMap = new sourceMap.SourceMapConsumer(result.map.toJSON());
const position = actualMap.originalPositionFor({ line: 1, column: result.css.indexOf('color') });
assert.equal(position.line, 1);
assert.ok(position.source.endsWith('input.css'));
assert.equal(actualMap.sourceContentFor(position.source), input);
const tailwindNode = tailwindRequire('@tailwindcss/node');
const cssFile = path.join(fixture, 'tailwind-input.css');
fs.writeFileSync(cssFile, input);
const compiled = await tailwindNode.compile(input, { base: fixture, from: cssFile, onDependency() { throw new Error('Unexpected dependency in finite Tailwind fixture'); } });
assert.match(compiled.build([]), /color: red/u);
const tailwindMap = new (tailwindNodeRequire('source-map-js').SourceMapConsumer)(JSON.parse(tailwindNode.toSourceMap(compiled.buildSourceMap()).raw));
assert.ok(tailwindMap.sources.some((source) => source.endsWith('tailwind-input.css')));
assert.ok(tailwindMap.sources.some((source) => tailwindMap.sourceContentFor(source) === input));
`);
});
