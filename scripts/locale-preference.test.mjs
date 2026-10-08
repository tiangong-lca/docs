import assert from 'node:assert/strict';
import test from 'node:test';
import { entryDestination, entryLanguage, languageDestination, languagePreferenceKey, readManualLanguage, saveManualLanguage, supportedLanguage } from '../lib/locale-preference.mjs';

function storage(initial) {
  const values = new Map(initial ? [[languagePreferenceKey, initial]] : []);
  const writes = [];
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); writes.push([key, value]); },
    writes,
  };
}

const browser = (store, languages = ['en-US'], language = 'en-US') => ({
  getStorage: () => store, languages, language,
});

test('manual preference wins over browser languages and is not rewritten on automatic entry', () => {
  const store = storage('fr');
  assert.equal(entryDestination('https://example.test/?source=nav#overview', browser(store, ['de-DE'])), '/fr/?source=nav#overview');
  assert.deepEqual(store.writes, []);
  assert.equal(entryDestination('/', browser(storage('zh'), ['en-US'])), undefined);
});

test('browser preference order uses the first supported language, including regional and script aliases', () => {
  assert.equal(entryLanguage(browser(storage(), ['es-ES', 'fr-CA', 'en-US'])), 'fr');
  assert.equal(entryLanguage(browser(storage(), ['de-AT', 'fr-FR'])), 'de');
  assert.equal(entryLanguage(browser(storage(), ['zh-Hant-TW', 'en-US'])), 'zh');
  assert.equal(supportedLanguage('EN_gb'), 'en');
  assert.equal(supportedLanguage(' fr-CH '), 'fr');
});

test('no supported browser language falls back to English; empty lists use navigator.language', () => {
  assert.equal(entryLanguage(browser(storage(), ['es', 'ja'])), 'en');
  assert.equal(entryLanguage(browser(storage(), [], 'de-DE')), 'de');
  assert.equal(entryLanguage(browser(storage(), [], '')), 'en');
  assert.equal(entryLanguage(browser(storage('unsupported'), ['fr-CA'])), 'fr');
});

test('explicit localized home and deep URLs do not consult preferences or change language', () => {
  const getStorage = () => { throw new Error('must not consult storage on an explicit URL'); };
  for (const href of ['/zh', '/zh/', '/en/', '/fr/docs/intro/?q=test#section', '/zh/docs/intro/']) {
    assert.equal(entryDestination(href, { getStorage, languages: ['de-DE'] }), undefined, href);
  }
});

test('blocked storage access and reads still permit browser selection and manual navigation', () => {
  const blockedAccess = () => { throw new Error('SecurityError'); };
  assert.equal(readManualLanguage(blockedAccess), undefined);
  assert.equal(entryLanguage({ getStorage: blockedAccess, languages: ['de-DE'] }), 'de');
  const blockedRead = () => ({ getItem() { throw new Error('blocked'); } });
  assert.equal(readManualLanguage(blockedRead), undefined);
  assert.doesNotThrow(() => saveManualLanguage(blockedAccess, 'zh'));
  assert.doesNotThrow(() => saveManualLanguage(() => ({ setItem() { throw new Error('quota'); } }), 'fr'));
  assert.equal(languageDestination('/en/?q=one#section', 'zh'), '/zh/?q=one#section');
});

test('manual switching keeps the current document, query and fragment and always uses explicit homes', () => {
  assert.equal(languageDestination('/?campaign=one#intro', 'zh'), '/zh/?campaign=one#intro');
  assert.equal(languageDestination('/en?campaign=one#intro', 'zh'), '/zh/?campaign=one#intro');
  assert.equal(languageDestination('/zh/docs/intro/?q=one%20two#chapter-2', 'fr'), '/fr/docs/intro/?q=one%20two#chapter-2');
  assert.equal(languageDestination('/de/docs/intro', 'en'), '/en/docs/intro');
  assert.equal(languageDestination('/en/docs/intro/', 'not-supported'), undefined);
  const store = storage();
  saveManualLanguage(() => store, 'de');
  assert.equal(readManualLanguage(() => store), 'de');
  assert.deepEqual(store.writes, [[languagePreferenceKey, 'de']]);
  saveManualLanguage(() => store, 'not-supported');
  assert.equal(store.writes.length, 1);
});
