import assert from 'node:assert/strict';

// An existing Playwright installation is sufficient; no site dependency is added.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.argv[2];
if (!origin) throw new Error('Usage: node scripts/test-locale-browser.mjs <static-preview-origin>');
const deepPath = '/docs/quick-start/';
const key = 'tiangong.manual-language';
const browser = await chromium.launch({ headless: true });
const results = [];

async function check(name, options, run) {
  const context = await browser.newContext({ locale: 'en-US', viewport: options.viewport });
  await context.addInitScript(({ languages = ['en-US'], language = languages[0] ?? '', saved, blocked, key }) => {
    Object.defineProperty(navigator, 'languages', { get: () => languages });
    Object.defineProperty(navigator, 'language', { get: () => language });
    if (saved && !localStorage.getItem(key)) localStorage.setItem(key, saved);
    if (blocked === 'access') {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    } else if (blocked) {
      const method = blocked === 'read' ? 'getItem' : 'setItem';
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (name, ...args) {
        if (name === key) throw new Error('Language storage blocked');
        return original.call(this, name, ...args);
      };
    }
  }, { ...options, key });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await run(page, context);
    assert.deepEqual(errors, [], `${name}: page errors`);
    results.push({ name, status: 'pass' });
    console.error(`PASS ${name}`);
  } finally {
    await context.close();
  }
}

async function visit(page, route, expected = route) {
  await page.goto(new URL(route, origin).href);
  await page.waitForURL(new URL(expected, origin).href, { timeout: 10000 }).catch(async (error) => {
    console.error('Navigation state:', await page.evaluate(() => ({ url: location.href, languages: navigator.languages, language: navigator.language })));
    throw error;
  });
  await page.waitForLoadState('networkidle');
  assert.equal(page.url(), new URL(expected, origin).href);
}

async function choose(page, name, expected) {
  await page.getByRole('button', { name: /^(Choose a language|选择语言|Sprache wählen|Choisir une langue)$/ }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForURL(new URL(expected, origin).href, { timeout: 10000 }).catch(async (error) => {
    console.error('Navigation state:', await page.evaluate(() => ({ url: location.href, languages: navigator.languages, language: navigator.language })));
    throw error;
  });
  await page.waitForLoadState('networkidle');
}

try {
  await check('ordered regional preference without automatic persistence', { languages: ['es-ES', 'fr-CA', 'en-US'] }, async (page) => {
    await visit(page, '/?source=entry#intro', '/fr/?source=entry#intro');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
  });
  await check('unsupported browser languages use English', { languages: ['ja-JP', 'es-ES'] }, async (page) => {
    await visit(page, '/', '/en/');
  });
  await check('empty list uses navigator.language', { languages: [], language: 'de-AT' }, async (page) => {
    await visit(page, '/', '/de/');
  });
  await check('saved preference wins; explicit home and deep URLs keep their locale', { languages: ['fr-CA'], saved: 'de' }, async (page) => {
    await visit(page, '/?x=1#intro', '/de/?x=1#intro');
    await visit(page, '/zh/');
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `${new URL(origin).origin}/`);
    await visit(page, `/en${deepPath}?q=source#intro`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  });
  await check('manual switch preserves document and suffix; new tab remembers at root', { languages: ['fr-CA'] }, async (page, context) => {
    await visit(page, `/en${deepPath}?q=one%20two#intro`);
    await choose(page, 'Deutsch', `/de${deepPath}?q=one%20two#intro`);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), 'de');
    const next = await context.newPage();
    await visit(next, '/?fresh=1#intro', '/de/?fresh=1#intro');
    await next.close();
  });
  await check('manual Chinese uses explicit home; history retains explicit old locale', { languages: ['fr-CA'] }, async (page, context) => {
    await visit(page, '/en/?q=history#intro');
    await choose(page, '中文', '/zh/?q=history#intro');
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/zh/');
    await page.goBack();
    await page.waitForURL(new URL('/en/?q=history#intro', origin).href);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.goForward();
    await page.waitForURL(new URL('/zh/?q=history#intro', origin).href);
    const next = await context.newPage();
    await visit(next, '/');
    assert.equal(await next.locator('html').getAttribute('lang'), 'zh-CN');
    await next.close();
  });
  await check('regional Chinese stays at neutral root and explicit Chinese documents remain Chinese', { languages: ['zh-Hant-TW'] }, async (page) => {
    await visit(page, `/zh${deepPath}?q=zh#intro`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await visit(page, '/');
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  });
  await check('automatic root replace does not create a history redirect loop', { languages: ['fr-CA'] }, async (page) => {
    await visit(page, '/en/');
    await visit(page, '/?q=history#intro', '/fr/?q=history#intro');
    await page.goBack();
    await page.waitForURL(new URL('/en/', origin).href);
    await page.waitForLoadState('networkidle');
    await page.goForward();
    await page.waitForURL(new URL('/fr/?q=history#intro', origin).href);
  });
  await check('mobile menu language selection remains explicit and remembered', { languages: ['fr-CA'], viewport: { width: 390, height: 844 } }, async (page, context) => {
    await visit(page, '/', '/fr/');
    await visit(page, '/en/?q=mobile#intro');
    await page.getByRole('button', { name: 'Toggle Menu', exact: true }).click();
    await choose(page, '中文', '/zh/?q=mobile#intro');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), 'zh');
    const next = await context.newPage();
    await visit(next, '/');
    assert.equal(await next.locator('html').getAttribute('lang'), 'zh-CN');
    await next.close();
  });
  await check('invalid saved value yields browser language', { languages: ['de-DE'], saved: 'unsupported' }, async (page) => {
    await visit(page, '/', '/de/');
  });
  for (const blocked of ['access', 'read', 'write']) {
    await check(`blocked storage ${blocked} still allows explicit Chinese`, { languages: ['fr-CA'], blocked }, async (page) => {
      await visit(page, '/', '/fr/');
      await choose(page, '中文', '/zh/');
      await page.reload();
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).pathname, '/zh/');
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    });
  }
  console.log(JSON.stringify({ origin, cases: results.length, results }, null, 2));
} finally {
  await browser.close();
}
