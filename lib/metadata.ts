export {
  homePath,
  languageAlternates,
  localeMetadata,
  maximumPageDescriptionLength,
  pageDescription,
  siteOrigin,
  withTrailingSlash,
} from '@/lib/seo-policy.mjs';

export function pageImagePath(lang: string, slugs: string[]): string {
  return `/${['og', lang, 'docs', ...slugs, 'image.png'].filter(Boolean).join('/')}`;
}
