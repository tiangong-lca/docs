import type { Metadata } from 'next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { Provider } from '@/components/provider';
import { translations } from '@/lib/layout.shared';
import { i18n, toHtmlLang } from '@/lib/i18n';
import { homePath, languageAlternates, localeMetadata, pageImagePath, siteOrigin, siteVerificationMetadata } from '@/lib/metadata';
import '@/app/global.css';

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  const content = localeMetadata[lang] ?? localeMetadata.en;
  const alternateLocale = i18n.languages
    .filter((candidate) => candidate !== lang)
    .map((candidate) => localeMetadata[candidate]?.openGraphLocale)
    .filter((candidate): candidate is string => Boolean(candidate));

  return {
    ...siteVerificationMetadata(),
    metadataBase: new URL(siteOrigin),
    title: {
      default: content.title,
      template: `%s | ${content.title}`,
    },
    description: content.description,
    alternates: {
      canonical: homePath(lang),
      languages: languageAlternates(),
    },
    openGraph: {
      type: 'website',
      siteName: 'TianGong LCA Docs',
      title: content.title,
      description: content.description,
      url: homePath(lang),
      locale: content.openGraphLocale,
      alternateLocale,
      images: [pageImagePath(lang, [])],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.title,
      description: content.description,
      images: [pageImagePath(lang, [])],
    },
    ...(process.env.DEPLOY_ENV !== 'production'
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return (
    <html lang={toHtmlLang(lang)} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider i18n={i18nProvider(translations, lang)}>{children}</Provider>
      </body>
    </html>
  );
}
