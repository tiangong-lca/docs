import { DocsHome } from '@/components/docs-home';

/** Root is the x-default entry and renders the complete default-language home before browser-only language negotiation. */
export default function EntryPage() {
  return <DocsHome lang="zh" />;
}
