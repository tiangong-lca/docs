import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
const withoutFrontmatter = (source) => source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
const workflowSources = fs
  .readdirSync(path.join(repositoryRoot, '.github/workflows'))
  .filter((fileName) => fileName.endsWith('.yml'))
  .map((fileName) => ({ fileName, source: read(`.github/workflows/${fileName}`) }));

const expectedActions = new Map([
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['dtolnay/rust-toolchain', '4360b52568e2003a75bf9bc1d59f33a8e3fc893c'],
  ['pnpm/setup', '84cb39b217b10273981911c288cd62326dc7c6d2'],
]);

test('bounds Node 24 while pinning pnpm, TypeScript, and markdownlint exactly', () => {
  const packageJson = readJson('package.json');
  const edgeOne = readJson('edgeone.json');

  assert.equal(packageJson.packageManager, 'pnpm@11.24.0');
  assert.deepEqual(packageJson.engines, { node: '>=24.18.0 <25', pnpm: '11.24.0' });
  assert.equal(packageJson.devDependencies.typescript, '7.0.2');
  assert.equal(packageJson.devDependencies['markdownlint-cli2'], '0.23.2');
  assert.equal(read('.nvmrc').trim(), '24');
  assert.equal(edgeOne.nodeVersion, '24.18.0');
  assert.equal(edgeOne.installCommand, 'pnpm install --frozen-lockfile');
  assert.equal(
    packageJson.scripts.lint,
    "pnpm exec markdownlint-cli2 '**/*.md' '**/*.mdx' '#node_modules' '#content/docs/.source'",
  );
  assert.equal(
    packageJson.scripts.test,
    'node --test scripts/check-env.test.mjs scripts/check-links.test.mjs scripts/oauth-doc-contract.test.mjs scripts/tool-guides.test.mjs scripts/public-doc-inventory.test.mjs scripts/toolchain-contract.test.mjs scripts/context7-refresh.test.mjs',
  );
  assert.equal(
    packageJson.scripts['test:screenshots'],
    'node --test scripts/check-screenshots.test.mjs',
  );
});

test('keeps the frozen graph on TypeScript 7 without dynamic lint installation', () => {
  const lockfile = read('pnpm-lock.yaml');

  assert.match(lockfile, /^\s{2}markdownlint-cli2@0\.23\.2:/mu);
  assert.match(lockfile, /^\s{2}typescript@7\.0\.2:/mu);
  assert.doesNotMatch(lockfile, /^\s{2}typescript@[0-6]\./mu);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'package-lock.json')), false);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'yarn.lock')), false);
});

test('uses pnpm only across active repository automation', () => {
  const activeSources = [
    ['package.json', read('package.json')],
    ...fs
      .readdirSync(path.join(repositoryRoot, 'scripts'))
      .filter((fileName) => /\.(?:mjs|sh)$/u.test(fileName) && !fileName.endsWith('.test.mjs'))
      .map((fileName) => [`scripts/${fileName}`, read(`scripts/${fileName}`)]),
    ...fs
      .readdirSync(path.join(repositoryRoot, '.githooks'))
      .map((fileName) => [`.githooks/${fileName}`, read(`.githooks/${fileName}`)]),
    ...workflowSources.map(({ fileName, source }) => [`.github/workflows/${fileName}`, source]),
  ];

  for (const [relativePath, source] of activeSources) {
    assert.doesNotMatch(source, /(^|[\s"'`:])npx(?=$|[\s"'])/mu, relativePath);
    assert.doesNotMatch(source, /(^|[\s"'`:])npm\s+(?:exec|install|run|test)(?=$|\s)/mu, relativePath);
  }
});

test('pins every external action to a reviewed executable commit', () => {
  const observedActions = new Map();

  for (const { fileName, source } of workflowSources) {
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) {
      const actionRef = match[1];
      if (actionRef.startsWith('./')) continue;

      assert.match(actionRef, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[a-f0-9]{40}$/iu, fileName);
      const separator = actionRef.lastIndexOf('@');
      const action = actionRef.slice(0, separator);
      const commit = actionRef.slice(separator + 1);
      assert.equal(commit, expectedActions.get(action), `${fileName}: unexpected ${action} commit`);
      observedActions.set(action, commit);
    }
  }

  assert.deepEqual(observedActions, expectedActions);
  assert.equal(workflowSources.some(({ source }) => source.includes('pnpm/action-setup')), false);
  assert.equal(workflowSources.some(({ source }) => source.includes('actions/setup-node')), false);
});

test('binds every pnpm CI runtime to the exact toolchain', () => {
  const setupWorkflows = workflowSources.filter(({ source }) => source.includes('uses: pnpm/setup@'));
  assert.equal(setupWorkflows.length, 3);
  for (const { fileName, source } of setupWorkflows) {
    assert.match(source, /version:\s*11\.24\.0/u, fileName);
    assert.match(source, /runtime:\s*node@24\.19\.0/u, fileName);
    assert.match(source, /install:\s*false/u, fileName);
  }
});

test('keeps contributor-facing Node range and exact pnpm baseline aligned across locales', () => {
  const documents = [
    'README.md',
    'content/docs/deploy-and-dev/dev-env.mdx',
    'content/docs/deploy-and-dev/dev-env.en.mdx',
    'content/docs/deploy-and-dev/dev-env.de.mdx',
    'content/docs/deploy-and-dev/dev-env.fr.mdx',
  ];

  for (const relativePath of documents) {
    const activeDocumentation = withoutFrontmatter(read(relativePath));
    assert.match(activeDocumentation, />=24\.18\.0 <25/u, relativePath);
    assert.match(activeDocumentation, /11\.24\.0/u, relativePath);
    assert.doesNotMatch(activeDocumentation, /11\.23/u, relativePath);
  }
});
