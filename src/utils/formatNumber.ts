export type CoinDisplayMode = 'compact' | 'full';

const COMPACT_UNITS = [
  { value: 1e33, suffix: 'Dc' },
  { value: 1e30, suffix: 'No' },
  { value: 1e27, suffix: 'Oc' },
  { value: 1e24, suffix: 'Sp' },
  { value: 1e21, suffix: 'Sx' },
  { value: 1e18, suffix: 'Qi' },
  { value: 1e15, suffix: 'Qa' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

export function formatCompactNumber(value: number | string | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  const abs = Math.abs(amount);
  if (abs < 1000) return Math.trunc(amount).toLocaleString('en-US');

  const unit = COMPACT_UNITS.find(item => abs >= item.value) || COMPACT_UNITS[COMPACT_UNITS.length - 1];
  const compact = amount / unit.value;
  const rounded = Math.round(compact * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(rounded >= 100 ? 0 : 2)}${unit.suffix}`;
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
