import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readPublicDocInventory, toolGuideRoutes, normalizeRoute, assertStaticSearchPageCoverage } from '../lib/public-doc-inventory.mjs';

function fixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-doc-inventory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of files) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '---\ntitle: "Fixture"\n---\n\nBody.\n');
  }
  return directory;
}

test('source inventory maps root, locale siblings and substantive nested guide indexes', (t) => {
  const root = fixture(t, ['index.mdx', 'index.en.mdx', 'integration/index.mdx', 'integration/cli/index.mdx', 'integration/cli/queries.fr.mdx', '.source/ignored.mdx']);
  const pages = readPublicDocInventory(root);
  assert.equal(pages.length, 5);
  assert.deepEqual(pages.filter((page) => !page.indexable).map((page) => page.url), ['/zh/docs/integration/']);
  assert.ok(pages.find((page) => page.url === '/zh/docs/integration/cli/')?.indexable);
  assert.equal(pages.find((page) => page.source === 'integration/cli/queries.fr.mdx')?.locale, 'fr');
  assert.ok(pages.some((page) => page.url === '/en/docs/'));
});

test('source inventory rejects duplicate flat and folder-index public URLs', (t) => {
  const root = fixture(t, ['integration/cli.en.mdx', 'integration/cli/index.en.mdx']);
  assert.throws(() => readPublicDocInventory(root), /Duplicate public source route: \/en\/docs\/integration\/cli\//u);
});

test('all guide routes are unique and normalize without losing locale or nested slugs', () => {
  const routes = toolGuideRoutes();
  assert.equal(routes.length, 72);
  assert.equal(new Set(routes).size, routes.length);
  assert.ok(routes.includes('/fr/docs/integration/skills/first-task/'));
  assert.equal(normalizeRoute('https://docs.tiangong.earth/de/docs/integration/cli'), '/de/docs/integration/cli/');
  assert.equal(normalizeRoute('/'), '/');
});

const guideRoot = '/en/docs/integration/cli/';
const guideChild = '/en/docs/integration/cli/getting-started/';
const staticPayload = (documents) => ({
  type: 'advanced',
  i18n: true,
  internalDocumentIDStore: { internalIdToId: [guideRoot, guideChild] },
  docs: { docs: Object.fromEntries(documents.map((document, index) => [String(index + 1), document])), count: documents.length },
});

test('static search compares normalized URLs of real page records exactly', () => {
  const routes = assertStaticSearchPageCoverage(staticPayload([
    { type: 'page', url: guideRoot.slice(0, -1), locale: 'en' },
    { type: 'page', url: guideChild, locale: 'en' },
    { type: 'text', url: `${guideChild}#first-step`, content: 'Body' },
  ]), [guideRoot, guideChild]);
  assert.deepEqual([...routes].sort(), [guideRoot, guideChild].sort());
});

test('static search rejects a missing parent even when its child and metadata remain', () => {
  const payload = staticPayload([
    { type: 'page', url: guideChild, locale: 'en', content: `Read ${guideRoot}` },
    { type: 'heading', url: `${guideRoot}#overview` },
  ]);
  assert.ok(JSON.stringify(payload).includes(guideRoot.slice(0, -1)), 'the old substring test would pass');
  assert.throws(() => assertStaticSearchPageCoverage(payload, [guideRoot, guideChild]), /missing.*\/en\/docs\/integration\/cli\//iu);
});

test('static search fails closed on an unexpected store or malformed page URL', () => {
  for (const payload of [null, { type: 'simple', docs: {} }, { type: 'advanced', i18n: true, docs: { docs: [] } }]) {
    assert.throws(() => assertStaticSearchPageCoverage(payload, [guideRoot]), /document store/iu);
  }
  assert.throws(() => assertStaticSearchPageCoverage(staticPayload([{ type: 'page' }]), [guideRoot]), /page URL/iu);
  assert.throws(() => assertStaticSearchPageCoverage(staticPayload([{ type: 'page', url: '//elsewhere.example/en/docs/integration/cli/' }]), [guideRoot]), /page URL/iu);
});

test('static search rejects a page assigned to the wrong locale', () => {
  assert.throws(() => assertStaticSearchPageCoverage(staticPayload([{ type: 'page', url: guideRoot, locale: 'fr' }]), [guideRoot]), /locale does not match/iu);
});

test('static search rejects retired pages, headings and text chunks', () => {
  const retired = '/en/docs/integration/mcp-kb-remote/';
  for (const type of ['page', 'heading', 'text']) {
    const payload = staticPayload([
      { type: 'page', url: guideRoot, locale: 'en' },
      { type, url: `${retired}#inspector`, locale: 'en' },
    ]);
    assert.throws(() => assertStaticSearchPageCoverage(payload, [guideRoot], [retired]), /Retired route in static-search/iu, type);
  }
  assert.doesNotThrow(() => assertStaticSearchPageCoverage(staticPayload([
    { type: 'page', url: guideRoot, locale: 'en' },
  ]), [guideRoot], [retired]));
});

test('Knowledge Base MCP pages, public references and exclusive screenshots stay retired in every locale', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const contentRoot = path.join(root, 'content', 'docs');
  const pages = readPublicDocInventory(contentRoot);
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const baseline = JSON.parse(read('manifests/p0b/site-routes.json'));
  const deny = JSON.parse(read('manifests/p0b/greenfield-deny.json'));
  const reconciliation = read('.github/workflows/reconcile-docs.yml');
  const retiredSlugs = /mcp-kb-remote|tiangong_kb_remote|https:\/\/mcp\.tiangong\.earth\/|Search_Sci_Tool/u;

  for (const locale of ['zh', 'en', 'de', 'fr']) {
    const retired = `/${locale}/docs/integration/mcp-kb-remote/`;
    assert.ok(deny.oldPages.includes(retired), `${retired} must be explicitly denied`);
    assert.ok(!baseline.htmlRoutes.some((item) => item.route === retired), `${retired} cannot be a redefined-endpoint exclusion`);
    assert.ok(!pages.some((page) => page.url === retired), `${retired} has no public source`);
    assert.ok(reconciliation.includes(retired.slice(1)), `${retired} needs a live 404 check`);
    for (const retained of ['cli', 'skills', 'tidas', 'mcp-lca-local', 'mcp-lca-remote']) {
      assert.ok(pages.some((page) => page.url === `/${locale}/docs/integration/${retained}/`), `${locale}/${retained} remains published`);
    }
  }

  for (const relative of fs.readdirSync(contentRoot, { recursive: true })) {
    if (!/\.(?:mdx|json)$/u.test(relative)) continue;
    assert.doesNotMatch(fs.readFileSync(path.join(contentRoot, relative), 'utf8'), retiredSlugs, relative);
  }

  for (const asset of ['/assets/docs/3740cf2c/19.png', '/assets/docs/a1eeb268/22.png', '/assets/docs/a64a0c3e/23.png', '/assets/docs/1dc3da1f/24.png']) {
    assert.ok(deny.oldMediaUrls.includes(asset), `${asset} must stay denied`);
    assert.ok(!fs.existsSync(path.join(root, 'public', asset)), `${asset} must not be published`);
    assert.ok(reconciliation.includes(asset.slice(1)), `${asset} needs a live 404 check`);
  }
  for (const asset of ['/assets/docs/b4702b56/6.png', '/assets/docs/3b6ff4be/16.png']) {
    assert.ok(fs.existsSync(path.join(root, 'public', asset)), `${asset} is shared with local LCA MCP`);
    assert.ok(!deny.oldMediaUrls.includes(asset), `${asset} is not retired`);
    for (const suffix of ['', '.en', '.de', '.fr']) {
      assert.ok(read(`content/docs/integration/mcp-lca-local${suffix}.mdx`).includes(asset));
    }
  }
});

test('Database & Methodology P0 section is complete across all four locales with index excluded from AI/search', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const contentRoot = path.join(root, 'content', 'docs');
  const pages = readPublicDocInventory(contentRoot);
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const slugs = ['index', 'overview', 'supply-markets', 'versions-citation', 'comparison'];

  for (const [locale, suffix] of [['zh', ''], ['en', '.en'], ['de', '.de'], ['fr', '.fr']]) {
    const rootMeta = JSON.parse(read(`content/docs/meta${suffix}.json`));
    assert.equal(rootMeta.pages.indexOf('database'), rootMeta.pages.indexOf('user-guide') + 1, `${locale}: database follows user-guide`);
    assert.equal(rootMeta.pages.indexOf('data-collection'), rootMeta.pages.indexOf('database') + 1, `${locale}: data-collection follows database`);

    const sectionMeta = JSON.parse(read(`content/docs/database/meta${suffix}.json`));
    assert.deepEqual(sectionMeta.pages, slugs, `${locale}: database meta ordering`);

    const indexUrl = `/${locale}/docs/database/`;
    assert.equal(byUrl.get(indexUrl)?.indexable, false, `${indexUrl} stays a non-indexable CategoryDirectory root`);
    assert.ok(read(`content/docs/database/index${suffix}.mdx`).includes(`<CategoryDirectory lang="${locale}" category="database" />`));

    for (const slug of slugs) {
      const source = read(`content/docs/database/${slug}${suffix}.mdx`);
      assert.match(source, /^title: ".+"$/mu, `${locale}/${slug}`);
      assert.match(source, /^description: ".+"$/mu, `${locale}/${slug}`);
      if (slug !== 'index') {
        assert.equal(byUrl.get(`/${locale}/docs/database/${slug}/`)?.indexable, true, `/${locale}/docs/database/${slug}/ must be indexable`);
      }
    }
  }
});
