export type CoinDisplayMode = 'compact' | 'full';

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

export function formatFullNumber(value: number | string | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return Math.trunc(amount).toLocaleString('en-US');
}

export function getCoinDisplayMode(): CoinDisplayMode {
  try {
    const saved = localStorage.getItem('starstream_coin_display_mode');
    return saved === 'full' ? 'full' : 'compact';
  } catch {
    return 'compact';
  }
}

export function formatCoins(value: number | string | null | undefined, mode?: CoinDisplayMode): string {
  const displayMode = mode || getCoinDisplayMode();
  return displayMode === 'full' ? formatFullNumber(value) : formatCompactNumber(value);
}
