/**
 * The registrable domain of a hostname (`www.example.co.uk` -> `example.co.uk`).
 * Same rule as core's `registrableDomainOf` (packages/core/src/score/discover.ts),
 * copied rather than imported so the audit helpers stay independent of the
 * score entry: the last two labels, or the last three when the second-to-last
 * label is one of `SECOND_LEVEL_LABELS` and the last label has two letters. IP
 * literals and single labels return themselves, so they only ever match exactly.
 * Input is trimmed (it often comes from CSV cells) and a trailing dot dropped.
 */
export const SECOND_LEVEL_LABELS = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'] as const;

export function registrableDomain(hostname: string): string {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (/^\d+(?:\.\d+){3}$/.test(lower) || lower.includes(':') || lower.startsWith('[')) {
    return lower;
  }
  const labels = lower.split('.').filter((label) => label.length > 0);
  if (labels.length <= 2) return labels.join('.');
  const last = labels[labels.length - 1];
  const secondToLast = labels[labels.length - 2];
  const keep =
    last.length === 2 && (SECOND_LEVEL_LABELS as ReadonlyArray<string>).includes(secondToLast) ? 3 : 2;
  return labels.slice(-keep).join('.');
}
