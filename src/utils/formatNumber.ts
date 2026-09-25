export type CoinDisplayMode = 'compact' | 'full';

const COMPACT_UNITS = [
  { value: 1e108, suffix: 'Trg' },
  { value: 1e105, suffix: 'Qag' },
  { value: 1e102, suffix: 'Qig' },
  { value: 1e99, suffix: 'Sxg' },
  { value: 1e96, suffix: 'Spg' },
  { value: 1e93, suffix: 'Ocg' },
  { value: 1e90, suffix: 'Nog' },
  { value: 1e87, suffix: 'Dcg' },
  { value: 1e84, suffix: 'UnVg' },
  { value: 1e81, suffix: 'DuVg' },
  { value: 1e78, suffix: 'TrVg' },
  { value: 1e75, suffix: 'QaVg' },
  { value: 1e72, suffix: 'QiVg' },
  { value: 1e69, suffix: 'SxVg' },
  { value: 1e66, suffix: 'SpVg' },
  { value: 1e63, suffix: 'Vg' },
  { value: 1e60, suffix: 'Nd' },
  { value: 1e57, suffix: 'Od' },
  { value: 1e54, suffix: 'Spd' },
  { value: 1e51, suffix: 'Sxd' },
  { value: 1e48, suffix: 'Qid' },
  { value: 1e45, suffix: 'Qad' },
  { value: 1e42, suffix: 'Td' },
  { value: 1e39, suffix: 'Dd' },
  { value: 1e36, suffix: 'Ud' },
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

export function formatPossibility(value: number | string | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.0';
  return (Math.round(amount * 10) / 10).toFixed(1);
}

export function formatCoins(value: number | string | null | undefined, mode?: CoinDisplayMode): string {
  const displayMode = mode || getCoinDisplayMode();
  return displayMode === 'full' ? formatFullNumber(value) : formatCompactNumber(value);
}

/** แปลงจำนวน Coins ที่ผู้ใช้พิมพ์ เช่น 1,000,000 / 1m / 1.5M / 2B ให้เป็นตัวเลขจริง */
export function parseCoinAmount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : 0;
  const raw = String(value ?? '').trim().replace(/\s+/g, '').replace(/,/g, '');
  if (!raw) return 0;
  const match = raw.match(/^(-?\d+(?:\.\d+)?)([a-z]+)?$/i);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const suffix = (match[2] || '').toLowerCase();
  const units: Record<string, number> = {
    k: 1e3, m: 1e6, b: 1e9, t: 1e12,
    qa: 1e15, qi: 1e18, sx: 1e21, sp: 1e24, oc: 1e27, no: 1e30,
    dc: 1e33, ud: 1e36, dd: 1e39, td: 1e42, qad: 1e45, qid: 1e48,
    sxd: 1e51, spd: 1e54, od: 1e57, nd: 1e60, vg: 1e63,
    spvg: 1e66, sxvg: 1e69, qivg: 1e72, qavg: 1e75,
    trvg: 1e78, duvg: 1e81, unvg: 1e84, dcg: 1e87,
    nog: 1e90, ocg: 1e93, spg: 1e96, sxg: 1e99,
    qig: 1e102, qag: 1e105, trg: 1e108,
  };
  const multiplier = suffix ? units[suffix] : 1;
  if (!multiplier) return 0;
  const amount = base * multiplier;
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}
