'use client';

import SearchDialog from '@/components/search';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { I18nProviderProps } from 'fumadocs-ui/contexts/i18n';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { entryDestination, languageDestination, saveManualLanguage } from '@/lib/locale-preference.mjs';

export function Provider({
  children,
  i18n,
}: {
  children: ReactNode;
  i18n?: I18nProviderProps;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const destination = entryDestination(window.location.href, {
      getStorage: () => window.localStorage,
      languages: navigator.languages,
      language: navigator.language,
    });
    if (destination) router.replace(destination);
  }, [pathname, router]);

  function onLocaleChange(language: string) {
    const destination = languageDestination(window.location.href, language);
    if (!destination) return;
    saveManualLanguage(() => window.localStorage, language);
    router.push(destination);
  }

  return (
    <RootProvider i18n={i18n ? { ...i18n, onLocaleChange } : undefined} search={{ SearchDialog }}>
      {children}
    </RootProvider>
  );
}
