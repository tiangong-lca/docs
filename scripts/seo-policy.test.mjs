import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  homePath,
  languageAlternates,
  localeMetadata,
  maximumPageDescriptionLength,
  pageDescription,
} from '../lib/seo-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

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

test('page descriptions prefer authored text and never invent one', () => {
  assert.equal(
    pageDescription({ description: 'Authored summary', structuredData: undefined }, 'en'),
    'Authored summary',
  );

  const derived = pageDescription(
    {
      structuredData: {
        contents: [
          { content: '| column | column |' },
          { content: '```ts\nconst forbidden = true;\n```' },
          { content: '1. first\n2. second' },
          {
            content:
              'Life cycle inventory data are collected per process and published as versioned datasets with a public identifier.',
          },
        ],
      },
    },
    'en',
  );
  assert.equal(
    derived,
    'Life cycle inventory data are collected per process and published as versioned datasets with a public identifier.',
  );

  assert.equal(
    pageDescription({ structuredData: { contents: [{ content: '`code only`' }] } }, 'de'),
    localeMetadata.de.description,
  );
  assert.equal(pageDescription({}, 'fr'), localeMetadata.fr.description);
});

test('derived descriptions stop at a sentence or a word boundary and mark truncation', () => {
  const sentence = 'Documented behaviour is described here with real content. ';
  const long = sentence.repeat(20).trim();
  const described = pageDescription({ structuredData: { contents: [{ content: long }] } }, 'en');

  assert.ok(described.length <= maximumPageDescriptionLength);
  assert.ok(long.startsWith(described.replace(/…$/u, '').trimEnd()));
  assert.equal(described.endsWith('.'), true);
  assert.equal(described.endsWith('…'), false);

  const unbroken = pageDescription(
    { structuredData: { contents: [{ content: `A summary without sentence end ${'word '.repeat(80)}` }] } },
    'en',
  );
  assert.ok(unbroken.length <= maximumPageDescriptionLength);
  assert.equal(unbroken.endsWith('…'), true);
  assert.equal(unbroken.endsWith(' …'), false);
});
