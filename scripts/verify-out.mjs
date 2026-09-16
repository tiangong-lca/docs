#!/usr/bin/env node
/**
 * Static output contract verification, driven by deterministic manifests.
 * Inputs: retained route/deny contracts plus the build environment.
 * 用法：DEPLOY_ENV=ci SOURCE_COMMIT=<sha> node scripts/verify-out.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publicLocales, readPublicDocInventory, toolGuideRoutes, normalizeRoute, assertStaticSearchPageCoverage } from '../lib/public-doc-inventory.mjs';
import { categoryBases } from '../lib/ia.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(ROOT, 'out');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const siteRoutes = load('manifests/p0b/site-routes.json');
const deny = load('manifests/p0b/greenfield-deny.json');
const categories = load('manifests/p0b/categories.json');
const sourcePages = readPublicDocInventory(path.join(ROOT, 'content', 'docs'));
const indexablePages = sourcePages.filter((page) => page.indexable);
// Home entries come from the retained route contract: `/zh/` is the permanent redirect alias of the
// x-default `/` home, so it stays an exported page but is marked out of the sitemap there.
const expectedPublicRoutes = [
  '/',
  ...siteRoutes.htmlRoutes.filter((route) => route.pageType === 'locale-home' && route.sitemap).map((route) => route.route),
  ...sourcePages.map((page) => page.url),
];
const expectedIndexRoutes = indexablePages.map((page) => page.url);

const errors = [];
const passed = [];

const exists = (rel) => fs.existsSync(path.join(outRoot, rel));
const read = (rel) => fs.readFileSync(path.join(outRoot, rel), 'utf8');

if (!fs.existsSync(outRoot)) {
  console.error('[verify-out] FAIL out/ does not exist; run the build first');
  process.exit(1);
}

// lib/ia.ts 硬编码分类集 == manifest（单一来源断言）
const iaBases = categoryBases;
if (JSON.stringify(iaBases) !== JSON.stringify(categories.map((c) => c.newBase))) {
  errors.push('lib/ia.ts categoryBases != manifests/p0b/categories.json');
} else {
  passed.push('categoryBases == manifest');
}
for (const category of categories) {
  for (const [suffix, key] of [['', 'descriptionZh'], ['.en', 'descriptionEn']]) {
    const sourcePath = path.join(ROOT, 'content', 'docs', category.newBase, `index${suffix}.mdx`);
    const expected = category[key];
    if (!fs.existsSync(sourcePath)) {
      errors.push(`missing category source ${path.relative(ROOT, sourcePath)}`);
      continue;
    }
    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    if (!sourceText.includes(`description: "${expected}"`)) {
      errors.push(`${category.newBase}${suffix} description differs from categories manifest`);
    }
  }
}
passed.push('zh/en category descriptions match manifest');

// 1. 全量 HTML 路由（site-routes manifest）
let htmlOk = 0;
for (const route of siteRoutes.htmlRoutes) {
  const rel = route.route === '/' ? 'index.html' : `${route.route.replace(/^\//, '')}index.html`;
  if (exists(rel)) htmlOk += 1;
  else errors.push(`missing html route ${route.route}`);
}
if (htmlOk === siteRoutes.htmlRoutes.length) {
  passed.push(`html routes ${htmlOk}/${siteRoutes.htmlRoutes.length}`);
}
for (const route of expectedPublicRoutes) {
  const relative = route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
  if (!exists(relative)) errors.push(`source page missing from HTML output: ${route}`);
}
passed.push(`source-derived public HTML inventory (${expectedPublicRoutes.length} routes)`);

// 2. 系统端点
for (const p of ['llms.txt', 'robots.txt', 'sitemap.xml', 'search-records.json', 'api/search']) {
  if (exists(p) && fs.statSync(path.join(outRoot, p)).isFile()) passed.push(`endpoint ${p}`);
  else errors.push(`missing file endpoint ${p}`);
}
if (exists('404.html')) passed.push('404.html');
else errors.push('missing 404.html');

// 3. greenfield deny：旧路径不得以任何形式出现在 out/
//    例外（v4 §5.3）：与新站 route manifest 精确重合的旧 URL 属"新站重新定义的端点"，
//    从 deny 检查中排除（例：旧 en slug /en/docs/openapi == 新 /en/docs/openapi/ 分类路由）。
const newRouteSet = new Set(siteRoutes.htmlRoutes.map((r) => r.route));
let denyLeaks = 0;
let redefinedExcluded = 0;
for (const old of [...deny.oldPages, ...deny.oldMediaUrls]) {
  const rel = old.replace(/^\//, '').replace(/\/$/, '');
  const asRoute = old.endsWith('/') ? old : `${old}/`;
  if (newRouteSet.has(asRoute)) {
    redefinedExcluded += 1;
    continue;
  }
  if (rel && exists(rel)) {
    denyLeaks += 1;
    errors.push(`deny path present in out/: ${old}`);
  }
}
if (denyLeaks === 0) {
  passed.push(`greenfield deny (${deny.oldPages.length + deny.oldMediaUrls.length} paths, ${redefinedExcluded} redefined-endpoint exclusions)`);
}

// 4. search-records 契约（v4 §7）
const sr = JSON.parse(read('search-records.json'));
const commit = process.env.SOURCE_COMMIT;
if (sr.sourceCommit !== (commit ?? null)) {
  errors.push(`search-records sourceCommit ${sr.sourceCommit} != ${commit ?? null}`);
}
const recomputed = createHash('sha256').update(JSON.stringify(sr.records)).digest('hex');
if (sr.digest !== `sha256:${recomputed}`) errors.push('search-records digest mismatch');
const expectedCounts = Object.fromEntries(publicLocales.map((lang) => [lang, indexablePages.filter((page) => page.locale === lang).length]));
for (const [lang, count] of Object.entries(expectedCounts)) {
  if (sr.countsByLocale?.[lang] !== count) {
    errors.push(`countsByLocale.${lang} = ${sr.countsByLocale?.[lang]}, expected ${count}`);
  }
}
for (const record of sr.records) {
  if (record.tag !== String(record.url).split('/')[1] || record.locale !== record.tag) {
    errors.push(`record tag/locale mismatch: ${record._id}`);
    break;
  }
}
function verifyRouteSet(label, actualRoutes, expectedRoutes) {
  const actual = new Set(actualRoutes.map(normalizeRoute));
  const expected = new Set(expectedRoutes.map(normalizeRoute));
  if (actual.size !== actualRoutes.length) errors.push(`${label} contains duplicate routes`);
  for (const route of expected) if (!actual.has(route)) errors.push(`${label} missing source route ${route}`);
  for (const route of actual) if (!expected.has(route)) errors.push(`${label} unexpected route ${route}`);
}
verifyRouteSet('search-records', sr.records.map((record) => record.url), expectedIndexRoutes);
if (sr.count !== sr.records.length || sr.count !== indexablePages.length) errors.push('search-records total differs from its records or source inventory');
passed.push(`search-records count=${sr.count} counts=${JSON.stringify(sr.countsByLocale)}`);

// 5. llms.txt: every indexable source URL, including substantive tool-guide indexes.
const llms = read('llms.txt');
if (commit && !llms.includes(commit)) errors.push('llms.txt does not expose SOURCE_COMMIT');
const llmsEntries = (llms.match(/^- \[/gm) ?? []).length;
const llmsRoutes = [...llms.matchAll(/^- \[.*?\]\((https?:\/\/[^)]+)\)/gmu)].map((match) => match[1]);
verifyRouteSet('llms.txt', llmsRoutes, expectedIndexRoutes);
if (llmsEntries !== indexablePages.length) errors.push(`llms entries = ${llmsEntries}, expected ${indexablePages.length}`);
else passed.push(`llms entries ${llmsEntries} + commit`);
// 分类页不得出现在 llms（抽样：quick-start 分类首页的 URL 形态）
if (/\/zh\/docs\/quick-start\/\)/.test(llms)) errors.push('category page leaked into llms.txt');

// 6. html lang 与 noindex
const deployEnv = process.env.DEPLOY_ENV ?? 'ci';
if (read('zh/index.html').includes('lang="zh-CN"')) passed.push('html lang zh-CN');
else errors.push('zh html lang is not zh-CN');
if (deployEnv !== 'production') {
  if (read('zh/docs/index.html').includes('noindex')) passed.push('noindex (non-prod)');
  else errors.push('non-production pages missing noindex');
  if (read('robots.txt').includes('Disallow: /')) passed.push('robots disallow (non-prod)');
  else errors.push('non-production robots.txt must disallow all');
} else if (!read('robots.txt').includes('https://docs.tiangong.earth/sitemap.xml')) {
  errors.push('production robots.txt missing absolute sitemap URL');
}

// 7. sitemap: exactly the real four-language source inventory plus landing pages.
const sitemap = read('sitemap.xml');
const sitemapCount = (sitemap.match(/<loc>/g) ?? []).length;
verifyRouteSet('sitemap', [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]), expectedPublicRoutes);
if (sitemapCount !== expectedPublicRoutes.length) errors.push(`sitemap entries = ${sitemapCount}, expected ${expectedPublicRoutes.length}`);
else passed.push(`sitemap ${sitemapCount} entries`);

// 8. OG images cover every source page, without a stale frozen page count.
let ogCount = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && !e.name.endsWith('.html')) ogCount += 1;
  }
})(path.join(outRoot, 'og'));
if (ogCount >= sourcePages.length) passed.push(`og images (${ogCount})`);
else errors.push(`expected >=${sourcePages.length} OG images, found ${ogCount}`);

// 9. 内部路径零泄漏
let leaked = null;
(function walkAll(dir) {
  if (leaked) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.includes('agents')) {
      leaked = path.relative(outRoot, path.join(dir, e.name));
      return;
    }
    if (e.isDirectory()) walkAll(path.join(dir, e.name));
  }
})(outRoot);
if (!leaked) passed.push('no /agents/ leak');
else errors.push(`internal path leaked into out/: ${leaked}`);

// 10. 文档根页是任务导航枢纽，而不是落地页副本或空白存根。
let docsPortalCount = 0;
for (const lang of ['zh', 'en', 'de', 'fr']) {
  const html = read(`${lang}/docs/index.html`);
  if (!html.includes('data-docs-portal="lca-task-hub"')) {
    errors.push(`${lang} docs root omits the LCA task-hub marker`);
    continue;
  }
  if (!html.includes('data-docs-portal-map="lca-task-route"')) {
    errors.push(`${lang} docs root omits the LCA task-route marker`);
    continue;
  }
  for (const section of ['cli', 'skills', 'tidas']) {
    if (!html.includes(`href="/${lang}/docs/integration/${section}/"`)) {
      errors.push(`${lang} docs hub omits the ${section} reader guide`);
    }
  }
  docsPortalCount += 1;
}
if (docsPortalCount === 4) passed.push('four-locale LCA docs task hubs');

// 11. 快速开始分类首页提供真实的首次使用路线和当前任务入口。
const quickStartTargets = [
  'quick-start/first-login',
  'quick-start/demonstrations',
  'user-guide/data',
  'user-guide/create-my-data',
  'user-guide/lcia',
  'user-guide/account-profile',
  'faq',
  'overview/resources-and-support',
];
let quickStartGuideCount = 0;
for (const lang of ['zh', 'en', 'de', 'fr']) {
  const html = read(`${lang}/docs/quick-start/index.html`);
  if (!html.includes('data-quick-start-guide="first-session-route"')) {
    errors.push(`${lang} quick-start root omits the first-session route marker`);
    continue;
  }
  if (!html.includes('data-quick-start-map="three-stage-onboarding"')) {
    errors.push(`${lang} quick-start root omits the three-stage onboarding marker`);
    continue;
  }
  if (!html.includes('data-quick-start-primary')) {
    errors.push(`${lang} quick-start root omits the governed application entry action`);
    continue;
  }
  const missingTarget = quickStartTargets.find((target) => !html.includes(`href="/${lang}/docs/${target}/"`));
  if (missingTarget) {
    errors.push(`${lang} quick-start root omits canonical target /${lang}/docs/${missingTarget}/`);
    continue;
  }
  quickStartGuideCount += 1;
}
if (quickStartGuideCount === 4) passed.push('four-locale guided quick-start routes');

// 12. 分类首页目录从本地化 page tree 自动派生；meta 增删或排序无需再手改首页。
const categoryDirectorySource = fs.readFileSync(path.join(ROOT, 'components', 'category-directory.tsx'), 'utf8');
for (const signature of ['source.getPageTree', 'findParent', 'structuredData']) {
  if (!categoryDirectorySource.includes(signature)) {
    errors.push(`category directory omits automatic source signature ${signature}`);
  }
}

const directoryBases = [
  'overview', 'user-guide', 'data-collection', 'integration',
  'openapi', 'deploy-and-dev', 'faq', 'changelog',
  'data-collection/case-introduction',
  'integration/cli', 'integration/skills', 'integration/tidas',
];
let categoryDirectoryCount = 0;
for (const lang of ['zh', 'en', 'de', 'fr']) {
  for (const base of directoryBases) {
    const metaFile = lang === 'zh' ? 'meta.json' : `meta.${lang}.json`;
    const meta = load(`content/docs/${base}/${metaFile}`);
    const targets = meta.pages.filter((page) => page !== 'index');
    const html = read(`${lang}/docs/${base}/index.html`);
    if (!html.includes(`data-category-directory="${base}"`)) {
      errors.push(`${lang}/${base} omits its automatic category-directory marker`);
      continue;
    }
    if (!html.includes(`data-category-count="${targets.length}"`)) {
      errors.push(`${lang}/${base} directory count does not match ${metaFile}`);
      continue;
    }
    const summaryCount = (html.match(/data-category-summary="true"/g) ?? []).length;
    if (summaryCount !== targets.length) {
      errors.push(`${lang}/${base} directory summaries ${summaryCount} != ${targets.length}`);
      continue;
    }
    const missingTarget = targets.find((target) => !html.includes(`href="/${lang}/docs/${base}/${target}/"`));
    if (missingTarget) {
      errors.push(`${lang}/${base} directory omits meta target ${missingTarget}`);
      continue;
    }
    categoryDirectoryCount += 1;
  }
}
const expectedDirectoryCount = directoryBases.length * publicLocales.length;
if (categoryDirectoryCount === expectedDirectoryCount) passed.push(`${categoryDirectoryCount} automatic localized category directories`);

// 13. Static search covers exactly the current source pages and contains no
// searchable page/heading/text record for a retired path.
try {
  const retiredRoutes = deny.oldPages.filter((route) => !newRouteSet.has(normalizeRoute(route)));
  const expectedSearchPages = sourcePages.map((page) => page.url);
  const staticSearchPages = assertStaticSearchPageCoverage(JSON.parse(read('api/search')), expectedSearchPages, retiredRoutes);
  verifyRouteSet('static-search page records', [...staticSearchPages], expectedSearchPages);
} catch (error) {
  errors.push(`static search: ${error.message}`);
}
const searchRouteSet = new Set(sr.records.map((record) => normalizeRoute(record.url)));
const llmsRouteSet = new Set(llmsRoutes.map(normalizeRoute));
for (const route of toolGuideRoutes()) {
  if (!searchRouteSet.has(route)) errors.push(`tool guide missing from search records: ${route}`);
  if (!llmsRouteSet.has(route)) errors.push(`tool guide missing from llms.txt: ${route}`);
}
passed.push(`four-language tool-guide discovery (${toolGuideRoutes().length} chapters)`);

// 14. Landing pages expose one compact technical-guide group and a safe
// external entry to the TianGong LCA application.
const landingOutputs = [
  { lang: 'zh', path: 'index.html', label: 'root' },
  ...publicLocales.map((lang) => ({ lang, path: `${lang}/index.html`, label: lang })),
];
let landingActionCount = 0;
for (const landing of landingOutputs) {
  const html = read(landing.path);
  const technicalGroupCount = (html.match(/data-home-technical="true"/g) ?? []).length;
  const technicalLinkCount = (html.match(/data-home-technical-link="true"/g) ?? []).length;
  if (technicalGroupCount !== 1) {
    errors.push(`${landing.label} landing has ${technicalGroupCount} technical-guide groups, expected 1`);
    continue;
  }
  if (technicalLinkCount !== 2) {
    errors.push(`${landing.label} landing has ${technicalLinkCount} technical-guide links, expected 2`);
    continue;
  }
  for (const route of ['integration', 'deploy-and-dev']) {
    if (!html.includes(`href="/${landing.lang}/docs/${route}/"`)) {
      errors.push(`${landing.label} landing omits /${landing.lang}/docs/${route}/`);
    }
  }
  const platformAnchors = html.match(/<a\b[^>]*href="https:\/\/lca\.tiangong\.earth\/"[^>]*>/g) ?? [];
  if (platformAnchors.length !== 1) {
    errors.push(`${landing.label} landing has ${platformAnchors.length} platform actions, expected 1`);
    continue;
  }
  const platformAnchor = platformAnchors[0];
  if (!platformAnchor.includes('target="_blank"')) {
    errors.push(`${landing.label} platform action does not open externally`);
    continue;
  }
  const relTokens = new Set((platformAnchor.match(/rel="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean));
  if (!relTokens.has('noreferrer') || !relTokens.has('noopener')) {
    errors.push(`${landing.label} platform action omits safe external-link rel attributes`);
    continue;
  }
  landingActionCount += 1;
}
if (landingActionCount === landingOutputs.length) {
  passed.push(`${landingActionCount} landing pages with technical guides and safe platform actions`);
}

// --- summary ---
console.log(`\n[verify-out] ${passed.length} checks passed:`);
for (const p of passed) console.log(`  ✓ ${p}`);
if (errors.length > 0) {
  console.error(`\n[verify-out] ${errors.length} FAILURES:`);
  for (const e of errors.slice(0, 30)) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\n[verify-out] ALL GREEN');
