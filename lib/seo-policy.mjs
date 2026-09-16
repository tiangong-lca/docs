/**
 * Node-safe SEO policy shared by the app and by plain `node --test` regression checks.
 *
 * `lib/metadata.ts` re-exports these for application code; this module deliberately avoids the
 * `@/` alias and Node-only APIs so `scripts/*.test.mjs` can import it directly.
 */
import { i18n } from './i18n.ts';

export const siteOrigin = process.env.CANONICAL_ORIGIN ?? 'https://docs.tiangong.earth';

/** @type {Record<string, { title: string; description: string; openGraphLocale: string }>} */
export const localeMetadata = {
  zh: {
    title: 'TianGong LCA Docs',
    description: 'TianGong LCA 生命周期评价平台文档：数据、建模、LCIA、评审、协作与开放集成。',
    openGraphLocale: 'zh_CN',
  },
  en: {
    title: 'TianGong LCA Docs',
    description: 'Documentation for TianGong LCA data, modelling, LCIA, review, collaboration, and open integrations.',
    openGraphLocale: 'en_US',
  },
  de: {
    title: 'TianGong LCA Docs',
    description: 'Dokumentation zu Daten, Modellierung, LCIA, Prüfung, Zusammenarbeit und offenen Integrationen in TianGong LCA.',
    openGraphLocale: 'de_DE',
  },
  fr: {
    title: 'TianGong LCA Docs',
    description: 'Documentation des données, de la modélisation, de la LCIA, de la révision, de la collaboration et des intégrations TianGong LCA.',
    openGraphLocale: 'fr_FR',
  },
};

export function withTrailingSlash(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Chinese is the x-default home at `/`; every other locale keeps its own `/{lang}/` home. The
 * `/zh/` alias is a permanent provider redirect (see edgeone.json), so it is never a canonical or
 * hreflang target.
 */
export function homePath(lang) {
  return lang === i18n.defaultLanguage ? '/' : `/${lang}/`;
}

/**
 * hreflang map for one logical page. Every entry names a real page in that locale and the
 * default-language counterpart is the x-default, so no alternate points at the `/zh/` alias.
 */
export function languageAlternates(path = '') {
  const suffix = path.length === 0 ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  const localized = (lang) => (suffix === '' ? homePath(lang) : `/${lang}${suffix}/`);
  return {
    'x-default': suffix === '' ? '/' : localized(i18n.defaultLanguage),
    ...Object.fromEntries(
      i18n.languages.map((lang) => [lang === 'zh' ? 'zh-CN' : lang, localized(lang)]),
    ),
  };
}

/** Published description length cap; longer prose is cut at a word boundary, never rewritten. */
export const maximumPageDescriptionLength = 300;

/** Boilerplate shapes: JSX/code/table syntax, markdown list or heading markers, link targets. */
const nonProsePattern = /[`{}<>|]|\]\(|^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s)/u;

function cleanProse(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isProse(value) {
  if (nonProsePattern.test(value)) return false;
  return (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 20;
}

/**
 * Cut derived text at the published cap: prefer a sentence end, else a word break. Truncation is
 * marked with an ellipsis, matching the existing category-directory summary style; the prose itself
 * is never rewritten.
 */
function truncateProse(value) {
  if (value.length <= maximumPageDescriptionLength) return value;
  const window = value.slice(0, maximumPageDescriptionLength);
  const sentenceEnd = window.search(/[。！？.!?](?:\s|$)/u);
  if (sentenceEnd >= 0) return window.slice(0, sentenceEnd + 1);
  const wordBreak = window.lastIndexOf(' ');
  const kept = wordBreak > maximumPageDescriptionLength / 2 ? window.slice(0, wordBreak) : window;
  return `${kept.trimEnd()}…`;
}

/**
 * Metadata description for one documentation page.
 *
 * The authored frontmatter `description` always wins, which is also how an author overrides the
 * derived text. Without one, the summary comes from the page's own structured content: the first
 * block that reads as prose after link/whitespace cleanup. Code blocks, JSX, tables, list runs and
 * navigation labels are rejected rather than trimmed into a sentence, and when no block qualifies
 * the locale site description is used instead of inventing one.
 */
export function pageDescription(page, lang) {
  const authored = page.description?.trim();
  if (authored) return authored;

  for (const entry of page.structuredData?.contents ?? []) {
    const cleaned = cleanProse(entry.content ?? '');
    if (!isProse(cleaned)) continue;
    return truncateProse(cleaned);
  }

  return (localeMetadata[lang] ?? localeMetadata.en).description;
}
