import { i18n } from './i18n.ts';

export const languagePreferenceKey = 'tiangong.manual-language';

/** @param {unknown} value */
export function supportedLanguage(value) {
  if (typeof value !== 'string') return undefined;
  const language = value.trim().replaceAll('_', '-').toLowerCase().split('-')[0];
  return i18n.languages.includes(language) ? language : undefined;
}

/** @param {() => Storage | undefined} getStorage */
export function readManualLanguage(getStorage) {
  try {
    const value = getStorage()?.getItem(languagePreferenceKey);
    return typeof value === 'string' && i18n.languages.includes(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Saving is exclusively a language-switcher action. Automatic detection never writes.
 * @param {() => Storage | undefined} getStorage
 * @param {string} language
 */
export function saveManualLanguage(getStorage, language) {
  if (!i18n.languages.includes(language)) return;
  try {
    getStorage()?.setItem(languagePreferenceKey, language);
  } catch {
    // Browsing and explicit language URLs keep working when storage is unavailable.
  }
}

/**
 * @param {{ getStorage: () => Storage | undefined, languages: readonly string[], language?: string }} browser
 */
export function entryLanguage(browser) {
  const manual = readManualLanguage(browser.getStorage);
  if (manual) return manual;
  const preferences = browser.languages.length > 0 ? browser.languages : [browser.language];
  for (const preference of preferences) {
    const language = supportedLanguage(preference);
    if (language) return language;
  }
  return 'en';
}

/**
 * Only the neutral root negotiates language. Localized URLs always retain their language.
 * @param {string} href
 * @param {Parameters<typeof entryLanguage>[0]} browser
 */
export function entryDestination(href, browser) {
  const url = new URL(href, 'https://locale.invalid');
  if (url.pathname !== '/') return undefined;
  const language = entryLanguage(browser);
  if (language === 'zh') return undefined;
  return `/${language}/${url.search}${url.hash}`;
}

/**
 * Explicit localized homes, including /zh/, avoid re-negotiation after manual selection.
 * @param {string} href
 * @param {string} language
 */
export function languageDestination(href, language) {
  if (!i18n.languages.includes(language)) return undefined;
  const url = new URL(href, 'https://locale.invalid');
  const segments = url.pathname.split('/');
  if (i18n.languages.includes(segments[1])) segments[1] = language;
  else segments.splice(1, 0, language);
  url.pathname = segments.join('/');
  if (url.pathname === `/${language}`) url.pathname += '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
