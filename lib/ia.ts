/**
 * Public information architecture: 11 category groups.
 * The retained build contract is manifests/p0b/categories.json; verify-out
 * keeps this runtime list aligned with that deterministic route inventory.
 *
 * Category index pages stay out of llms.txt and search records.
 */
export const categoryBases: readonly string[] = [
  'overview',
  'quick-start',
  'user-guide',
  'database',
  'data-collection',
  'data-collection/case-introduction',
  'integration',
  'openapi',
  'deploy-and-dev',
  'faq',
  'changelog',
];

export function isCategoryIndex(slugs: string[]): boolean {
  return categoryBases.includes(slugs.join('/'));
}
