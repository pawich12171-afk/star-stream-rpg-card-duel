export function formatCompactNumber(value: number | string | null | undefined): string {
  const amount = Number(value) || 0;
  if (Math.abs(amount) < 1000) return Math.trunc(amount).toLocaleString('en-US');
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(amount).replace(/\s/g, '');
}

export function formatCoins(value: number | string | null | undefined): string {
  return formatCompactNumber(value);
}
