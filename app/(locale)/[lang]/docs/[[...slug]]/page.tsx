import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/components/mdx';
import { i18n } from '@/lib/i18n';
import { localeMetadata, pageDescription, pageImagePath, withTrailingSlash } from '@/lib/metadata';
import { source } from '@/lib/source';

export const dynamicParams = false;

export default async function Page(props: PageProps<'/[lang]/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  const MDX = page.data.body;
  const isDocsRoot = !params.slug || params.slug.length === 0;

  return (
    <DocsPage toc={page.data.toc} footer={{ className: 'docs-pagination', enabled: !isDocsRoot }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug, params.lang);
  if (!page) notFound();

  const canonical = withTrailingSlash(page.url);
  const languageEntries = i18n.languages.flatMap((lang) => {
    const alternate = source.getPage(params.slug, lang);
    if (!alternate) return [];
    return [[lang === 'zh' ? 'zh-CN' : lang, withTrailingSlash(alternate.url)] as const];
  });
  const defaultPage = source.getPage(params.slug, i18n.defaultLanguage);
  const pageImage = pageImagePath(params.lang, page.slugs);
  const content = localeMetadata[params.lang] ?? localeMetadata.en;
  // Authored frontmatter first, else a summary derived from this page's own structured content.
  // A page with neither stays unresolved: no page-specific description is published, so Next keeps
  // the layout's site-level description and the URL is reported as content debt by `verify:out`.
  const structuredData =
    typeof page.data.structuredData === 'function' ? undefined : page.data.structuredData;
  const summary = pageDescription(
    { description: page.data.description, structuredData },
    params.lang,
  );
  const descriptionFields = summary.description ? { description: summary.description } : {};

  return {
    title: page.data.title,
    ...descriptionFields,
    alternates: {
      canonical,
      languages: {
        'x-default': defaultPage ? withTrailingSlash(defaultPage.url) : canonical,
        ...Object.fromEntries(languageEntries),
      },
    },
    openGraph: {
      type: 'article',
      siteName: 'TianGong LCA Docs',
      title: page.data.title,
      ...descriptionFields,
      url: canonical,
      locale: content.openGraphLocale,
      images: [pageImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      ...descriptionFields,
      images: [pageImage],
    },
  };
}
