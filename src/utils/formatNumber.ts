export function formatCompactNumber(value: number | string | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  const abs = Math.abs(amount);
  if (abs < 1000) return Math.trunc(amount).toLocaleString('en-US');

  const units = [
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'K' },
  ];
  const unit = units.find(item => abs >= item.value) || units[units.length - 1];
  const compact = amount / unit.value;
  const rounded = Math.round(compact * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${unit.suffix}`;
}

export function formatCoins(value: number | string | null | undefined): string {
  return formatCompactNumber(value);
}
