import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { zhCN } from '@fumadocs/language/zh-cn';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';
import { SiteBrand } from '@/components/site-brand';

/**
 * v4 §5.1：zh 使用官方语言包；de/fr 无官方包（@fumadocs/language 仅 zh-cn/zh-tw），
 * 自补核心 UI 词条。displayName 为语言切换器显示名（缺省会全部显示 English）。
 */
export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .preset('zh', zhCN())
  .add({
    zh: {
      displayName: '中文',
    },
    en: {
      displayName: 'English',
    },
    de: {
      displayName: 'Deutsch',
      'Search(search trigger)': 'Suchen',
      'Search(search dialog)': 'Suchen',
      'Open Search(search trigger)(aria-label)': 'Suche öffnen',
      'Close Search(search dialog)(aria-label)': 'Suche schließen',
      'Open Sidebar(sidebar)(aria-label)': 'Seitenleiste öffnen',
      'Close Sidebar(sidebar)(aria-label)': 'Seitenleiste schließen',
      'Close Sidebar(aria-label)': 'Seitenleiste schließen',
      'Collapse Sidebar(sidebar)(aria-label)': 'Seitenleiste einklappen',
      'Toggle Menu(mobile menu)(aria-label)': 'Menü umschalten',
      'Choose a language(language switcher)(aria-label)': 'Sprache wählen',
      'Copy Text(code block)(aria-label)': 'Text kopieren',
      'Copied Text(code block)(aria-label)': 'Text kopiert',
      'Copy Anchor Link(heading anchor)(aria-label)': 'Abschnittslink kopieren',
      'Toggle Theme(theme switcher)(aria-label)': 'Design wechseln',
      'Light(theme switcher)(aria-label)': 'Hell',
      'Dark(theme switcher)(aria-label)': 'Dunkel',
      'System(theme switcher)(aria-label)': 'System',
      'Table of Contents(inline table of contents)': 'Inhaltsverzeichnis',
      'On this page(table of contents)': 'Auf dieser Seite',
      'Next Page(pagination)': 'Nächste Seite',
      'Previous Page(pagination)': 'Vorherige Seite',
      'No results found(search dialog)': 'Keine Ergebnisse gefunden',
      'Choose a language(language switcher)': 'Sprache wählen',
      'Back to Home(404 page)': 'Zurück zur Startseite',
      'Page Not Found(404 page)': 'Seite nicht gefunden',
    },
    fr: {
      displayName: 'Français',
      'Search(search trigger)': 'Rechercher',
      'Search(search dialog)': 'Rechercher',
      'Open Search(search trigger)(aria-label)': 'Ouvrir la recherche',
      'Close Search(search dialog)(aria-label)': 'Fermer la recherche',
      'Open Sidebar(sidebar)(aria-label)': 'Ouvrir la barre latérale',
      'Close Sidebar(sidebar)(aria-label)': 'Fermer la barre latérale',
      'Close Sidebar(aria-label)': 'Fermer la barre latérale',
      'Collapse Sidebar(sidebar)(aria-label)': 'Réduire la barre latérale',
      'Toggle Menu(mobile menu)(aria-label)': 'Afficher ou masquer le menu',
      'Choose a language(language switcher)(aria-label)': 'Choisir une langue',
      'Copy Text(code block)(aria-label)': 'Copier le texte',
      'Copied Text(code block)(aria-label)': 'Texte copié',
      'Copy Anchor Link(heading anchor)(aria-label)': 'Copier le lien de section',
      'Toggle Theme(theme switcher)(aria-label)': 'Changer de thème',
      'Light(theme switcher)(aria-label)': 'Clair',
      'Dark(theme switcher)(aria-label)': 'Sombre',
      'System(theme switcher)(aria-label)': 'Système',
      'Table of Contents(inline table of contents)': 'Sommaire',
      'On this page(table of contents)': 'Sur cette page',
      'Next Page(pagination)': 'Page suivante',
      'Previous Page(pagination)': 'Page précédente',
      'No results found(search dialog)': 'Aucun résultat trouvé',
      'Choose a language(language switcher)': 'Choisir une langue',
      'Back to Home(404 page)': "Retour à l'accueil",
      'Page Not Found(404 page)': 'Page introuvable',
    },
  });

const docsLabel: Record<string, string> = {
  zh: '文档',
  en: 'Documentation',
  de: 'Dokumentation',
  fr: 'Documentation',
};

const pcrLabel: Record<string, string> = {
  zh: 'PCR 文档',
  en: 'PCR documentation',
  de: 'PCR (Englisch)',
  fr: 'PCR (anglais)',
};

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    nav: {
      title: <SiteBrand />,
      url: `/${locale}`,
      transparentMode: 'top',
    },
    githubUrl: 'https://github.com/tiangong-lca/docs',
    links: [
      {
        type: 'main',
        text: docsLabel[locale] ?? docsLabel.en,
        url: `/${locale}/docs`,
      },
      {
        type: 'main',
        text: pcrLabel[locale] ?? pcrLabel.en,
        url: locale === 'zh' ? 'https://pcr.tiangong.earth/' : 'https://pcr.tiangong.earth/en/',
        external: true,
      },
    ],
  };
}
