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

/** Published description length cap, counted in Unicode characters. */
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
 * Cut derived text at the published cap: prefer a sentence end, else a word break. Counting and
 * slicing happen on Unicode code points, so astral characters are neither miscounted nor split;
 * truncation is marked with an ellipsis and the prose itself is never rewritten.
 */
function truncateProse(value) {
  const characters = Array.from(value);
  if (characters.length <= maximumPageDescriptionLength) return value;
  const window = characters.slice(0, maximumPageDescriptionLength).join('');
  const sentenceEnd = window.search(/[。！？.!?](?:\s|$)/u);
  if (sentenceEnd >= 0) return window.slice(0, sentenceEnd + 1);
  const wordBreak = window.lastIndexOf(' ');
  const kept = wordBreak > maximumPageDescriptionLength / 2 ? window.slice(0, wordBreak) : window;
  return `${kept.trimEnd()}…`;
}

/**
 * Page summary status for one documentation page.
 *
 * `authored` is the frontmatter `description`, which is also the author override. Without one the
 * summary comes from the page's own structured content: the first block that reads as prose after
 * link cleanup, with code, JSX, tables, list runs and navigation labels rejected rather than
 * trimmed into a sentence. When no block qualifies the page is explicitly `unresolved` and gets no
 * page-specific description; the layout's site description is then inherited by Next, which is a
 * site-level default, not a page summary, and the URL is reported as content debt instead of being
 * counted as a fix.
 */
export function pageDescription(page, lang) {
  const authored = page.description?.trim();
  if (authored) return { status: 'authored', description: authored };

  for (const entry of page.structuredData?.contents ?? []) {
    const cleaned = cleanProse(entry.content ?? '');
    if (!isProse(cleaned)) continue;
    return { status: 'derived', description: truncateProse(cleaned) };
  }

  return { status: 'unresolved', description: undefined };
}

/** The inherited layout description Next falls back to when a page has no page-specific one. */
export function siteDescription(lang) {
  return (localeMetadata[lang] ?? localeMetadata.en).description;
}

/**
 * Classify one built page for verification, from artifacts rather than from the derivation itself:
 * authored frontmatter, an output description that differs from the inherited site default, or an
 * unresolved page whose output still equals that default.
 */
export function classifyPageDescription({ authored, output, lang }) {
  if (typeof authored === 'string' && authored.trim().length > 0) return 'authored';
  const site = siteDescription(lang);
  if (typeof output === 'string' && output.trim().length > 0 && output.trim() !== site.trim()) {
    return 'derived';
  }
  return 'unresolved';
}
