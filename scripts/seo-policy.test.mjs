import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  classifyPageDescription,
  homePath,
  languageAlternates,
  localeMetadata,
  maximumPageDescriptionLength,
  pageDescription,
  siteDescription,
} from '../lib/seo-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** A valid astral character is a surrogate pair; a lone surrogate is a broken cut. */
const hasLoneSurrogate = (value) =>
  /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(value);

const prose =
  'Life cycle inventory data are collected per process and published as versioned datasets with a public identifier.';

test('the Chinese home is the x-default entry and /zh/ is never a canonical or alternate', () => {
  const home = languageAlternates();
  assert.equal(home['zh-CN'], '/');
  assert.equal(home['x-default'], '/');
  assert.equal(home.en, '/en/');
  assert.equal(home.de, '/de/');
  assert.equal(home.fr, '/fr/');
  assert.equal(Object.values(home).includes('/zh/'), false);

  assert.equal(homePath('zh'), '/');
  assert.equal(homePath('en'), '/en/');
});

test('deep pages keep their own locale and fall back to their default-language counterpart', () => {
  const deep = languageAlternates('docs/quick-start');
  assert.equal(deep['zh-CN'], '/zh/docs/quick-start/');
  assert.equal(deep['x-default'], '/zh/docs/quick-start/');
  assert.equal(deep.en, '/en/docs/quick-start/');
});

test('the alias redirect is exactly the Chinese home, added to hosting without relaxing 404s', () => {
  const hosting = JSON.parse(read('edgeone.json'));
  assert.deepEqual(hosting.redirects, [
    { source: '/zh', destination: '/', statusCode: 301 },
    { source: '/zh/', destination: '/', statusCode: 301 },
  ]);

  const deny = JSON.parse(read('manifests/p0b/greenfield-deny.json'));
  assert.equal(
    deny.oldPages.some((page) => page === '/zh' || page === '/zh/'),
    false,
    'the Chinese home alias must stay a redirect, not a deny entry',
  );
  assert.ok(
    deny.oldPages.includes('/zh/docs/integration/mcp-kb-remote/'),
    'retired localized docs paths stay explicitly denied',
  );
});

test('the route contract keeps the alias exported but out of the sitemap', () => {
  const routes = JSON.parse(read('manifests/p0b/site-routes.json')).htmlRoutes;
  const byRoute = new Map(routes.map((route) => [route.route, route]));

  assert.equal(byRoute.get('/')?.sitemap, true);
  assert.equal(byRoute.get('/zh/')?.pageType, 'locale-home');
  assert.equal(byRoute.get('/zh/')?.sitemap, false);
  for (const route of ['/en/', '/de/', '/fr/']) {
    assert.equal(byRoute.get(route)?.sitemap, true, `${route} stays a sitemap home`);
  }
});

test('page summaries report authored, derived or unresolved and never borrow the site default', () => {
  assert.deepEqual(pageDescription({ description: 'Authored summary' }, 'en'), {
    status: 'authored',
    description: 'Authored summary',
  });

  const derived = pageDescription({ structuredData: { contents: [{ content: prose }] } }, 'en');
  assert.deepEqual(derived, { status: 'derived', description: prose });
});

test('navigation, code and table content alone is reported unresolved, not summarized', () => {
  for (const contents of [
    [{ content: '| column | column |' }],
    [{ content: '```ts\nconst forbidden = true;\n```' }],
    [{ content: '1. first\n2. second' }],
    [{ content: '[Data collection](/en/docs/data-collection/)' }],
    [{ content: '### Section heading' }],
    [],
  ]) {
    const result = pageDescription({ structuredData: { contents } }, 'de');
    assert.deepEqual(result, { status: 'unresolved', description: undefined });
    assert.notEqual(result.description, siteDescription('de'));
  }

  assert.deepEqual(pageDescription({}, 'fr'), { status: 'unresolved', description: undefined });
  assert.equal(siteDescription('fr'), localeMetadata.fr.description);
});

test('verification classifies built pages from artifacts, not from the derivation', () => {
  assert.equal(classifyPageDescription({ authored: 'Authored', output: 'anything', lang: 'en' }), 'authored');
  assert.equal(
    classifyPageDescription({ authored: '', output: `${prose} Extra.`, lang: 'en' }),
    'derived',
  );
  assert.equal(
    classifyPageDescription({ authored: '', output: siteDescription('en'), lang: 'en' }),
    'unresolved',
  );
  assert.equal(classifyPageDescription({ authored: '', output: undefined, lang: 'zh' }), 'unresolved');
});

test('truncation counts Unicode characters, keeps astral characters whole and marks the cut', () => {
  const mixed = 'Documented behaviour with real content 🌍 '.repeat(20).trim();
  const result = pageDescription({ structuredData: { contents: [{ content: mixed }] } }, 'en');

  assert.equal(result.status, 'derived');
  assert.ok(Array.from(result.description).length <= maximumPageDescriptionLength);
  assert.equal(hasLoneSurrogate(result.description), false);

  const unbroken = pageDescription(
    { structuredData: { contents: [{ content: `A summary without sentence end ${'word '.repeat(80)}` }] } },
    'en',
  );
  assert.ok(Array.from(unbroken.description).length <= maximumPageDescriptionLength);
  assert.equal(unbroken.description.endsWith('…'), true);
  assert.equal(unbroken.description.endsWith(' …'), false);
});
