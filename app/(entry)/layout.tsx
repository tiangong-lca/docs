import type { Metadata } from 'next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { Provider } from '@/components/provider';
import { translations } from '@/lib/layout.shared';
import { toHtmlLang } from '@/lib/i18n';
import { languageAlternates, localeMetadata, pageImagePath, siteOrigin, siteVerificationMetadata } from '@/lib/metadata';
import '@/app/global.css';

const rootMeta = localeMetadata.zh;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: rootMeta.title,
  description: rootMeta.description,
  alternates: {
    canonical: '/',
    languages: languageAlternates(),
  },
  openGraph: {
    type: 'website',
    siteName: 'TianGong LCA Docs',
    title: rootMeta.title,
    description: rootMeta.description,
    url: '/',
    locale: rootMeta.openGraphLocale,
    alternateLocale: ['en_US', 'de_DE', 'fr_FR'],
    images: [pageImagePath('zh', [])],
  },
  twitter: {
    card: 'summary_large_image',
    title: rootMeta.title,
    description: rootMeta.description,
    images: [pageImagePath('zh', [])],
  },
  ...siteVerificationMetadata(),
  ...(process.env.DEPLOY_ENV !== 'production'
    ? { robots: { index: false, follow: false } }
    : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={toHtmlLang('zh')} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider i18n={i18nProvider(translations, 'zh')}>{children}</Provider>
      </body>
    </html>
  );
}
