/**
 * The registrable domain of a hostname (`www.example.co.uk` -> `example.co.uk`),
 * with a short list of two-level public suffixes instead of the full public
 * suffix list. Enough for agency and client sites; a hostname under a suffix
 * not listed here is cut to its last two labels.
 */
export const TWO_LEVEL_TLDS = [
  'co.uk',
  'com.au',
  'co.nz',
  'co.za',
  'com.br',
  'co.jp',
] as const;

export function registrableDomain(hostname: string): string {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, '');
  const labels = lower.split('.').filter((label) => label.length > 0);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if ((TWO_LEVEL_TLDS as ReadonlyArray<string>).includes(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}
