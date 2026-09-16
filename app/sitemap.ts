import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { i18n } from '@/lib/i18n';
import { homePath, languageAlternates, withTrailingSlash } from '@/lib/metadata';

export const dynamic = 'force-static';

/**
 * v4 §5.4：只列真实存在的语言页面。fallbackLanguage 为 null，de/fr 未翻译页面不生成路由，
 * 因此不会出现在 sitemap。
 *
 * `/zh/` 只是 `/` 的永久重定向别名（见 edgeone.json），因此不作为条目出现，也不会出现在
 * 任何 hreflang 中；`languageAlternates()` 负责这套映射。
 *
 * lastmod 有意省略：当前静态构建只提供一个 source epoch，逐页写入会把所有无关页面标成同一次
 * 更新时间，比不写更误导。若将来有真实的逐页修改时间，再按内容来源补充。
 */

const homeAlternates = (origin: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(languageAlternates()).map(([language, path]) => [language, `${origin}${path}`]),
  );

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.CANONICAL_ORIGIN ?? 'http://localhost:3000';

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: { languages: homeAlternates(origin) },
    },
  ];

  for (const lang of i18n.languages) {
    if (lang !== i18n.defaultLanguage) {
      entries.push({
        url: `${origin}${homePath(lang)}`,
        changeFrequency: 'weekly',
        priority: 1,
        alternates: { languages: homeAlternates(origin) },
      });
    }

    for (const page of source.getPages(lang)) {
      const url = withTrailingSlash(page.url);
      const languages = Object.fromEntries(
        i18n.languages.flatMap((candidate) => {
          const alternate = source.getPage(page.slugs, candidate);
          if (!alternate) return [];
          return [[candidate === 'zh' ? 'zh-CN' : candidate, `${origin}${withTrailingSlash(alternate.url)}`]];
        }),
      );
      const defaultPage = source.getPage(page.slugs, i18n.defaultLanguage);
      entries.push({
        url: `${origin}${url}`,
        priority: 0.8,
        alternates: {
          languages: defaultPage
            ? { ...languages, 'x-default': `${origin}${withTrailingSlash(defaultPage.url)}` }
            : languages,
        },
      });
    }
  }

  return entries;
}
