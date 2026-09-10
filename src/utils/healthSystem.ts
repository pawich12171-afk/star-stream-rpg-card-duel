import { CharacterProfile, AdminBalanceModifier, AdminBalanceSnapshot } from '../types';

export const BASE_HP = 20;

export interface HealthBreakdown {
  baseHp: number;
  statBonusHp: number;
  effectiveStrength: number;
  effectiveDurability: number;
  titleBonusHp: number;
  storyBonusHp: number;
  skillBonusHp: number;
  itemBonusHp: number;
  totalMaxHp: number;
  formulaDescription: string;
  itemsList: { name: string; bonus: number; source: 'base' | 'stat' | 'title' | 'story' | 'skill' | 'item' }[];
}

export const BADGE_HP_BONUSES: Record<string, number> = {
  'ผู้พิชิตสตรีม': 5, 'ราชันย์บัลลังก์สัมบูรณ์': 8, 'กลีบบัววิบัติ': 4, 'เงาแห่งความมืด': 6,
  'นักรบเพลิง': 3, 'วีรชนแห่งกาลเวลา': 5, 'ผู้คุมกฎแห่งสตรีม': 7, 'ผู้ผ่านพ้นบททดสอบ': 5,
  'ภัยพิบัติแห่งคลื่นสะท้อน': 6, 'ภัยพิบัติแห่งเสียงกูร้อง': 5, 'ผู้ย้อนกลับ': 7,
  'ผู้เหยียดหยามนักเล่าเรื่อง': 5, 'อาจารย์มัทนะ': 4, 'ยันเดเระผู้คลั่งรัก': 4,
  'ผู้สืบทอดแห่งความว่างเปล่า': 6, 'เหยี่ยวราตรีแห่งเงา': 4, 'หมัดเพลิงสุริยัน': 4,
  'นางแอ่นสวรรค์': 4, 'ราชาอสูรผู้เฝ้ามองความว่างเปล่า': 8, 'ผู้อวตารแห่งโชคชะตา': 5, 'ผู้ไร้พ่าย': 6,
};

export function getSkillPotencyPercent(level: number, multiplier: number = 1): number {
  return Math.max(0, (Math.max(1, level || 1) - 1) * 10) * (multiplier || 1);
}

export function getSkillHpBonus(skill: { name?: string; level: number; multiplier?: number; description?: string; type?: string; category?: string }): number {
  const lvl = Math.max(1, skill.level || 1), mult = Math.max(1, skill.multiplier || 1);
  const name = skill.name || '', desc = skill.description || '';
  const vitality = name.includes('บัว') || name.includes('ม่าน') || name.includes('เกราะ') || name.includes('เลือด') ||
    name.includes('พลังชีวิต') || name.includes('HP') || name.includes('กายา') || name.includes('ทนทาน') ||
    name.includes('ตื่นรู้') || name.includes('ฟื้นฟู') || name.includes('พิทักษ์') || name.includes('บาเรีย') ||
    name.includes('ลมปราณ') || name.includes('ระบำ') || name.includes('คำสั่ง') || name.includes('ก้าว') ||
    name.includes('Awakening') || desc.includes('HP') || desc.includes('เลือด') || desc.includes('เกราะ') ||
    desc.includes('ป้องกัน') || desc.includes('ฟื้นฟู') || desc.includes('สะท้อน') || skill.type?.includes('ติดตัว') ||
    skill.type?.includes('บัฟ') || skill.category === 'stigma' || skill.category === 'innate' || skill.category === 'story';
  if (!vitality) return Math.max(0, Math.floor((lvl - 1) * 0.25) * mult);
  return Math.max(1, Math.round((1 + (lvl - 1) * 0.55) * mult));
}

export function calculateCharacterHealth(character: CharacterProfile): HealthBreakdown {
  const itemsList: HealthBreakdown['itemsList'] = [{ name: 'พลังชีวิตพื้นฐาน (Base HP)', bonus: BASE_HP, source: 'base' }];
  const equipped = character.inventory?.filter(i => i.isEquipped) || [];
  let equipStrengthBonus = 0, equipDurabilityBonus = 0, equipHpBonus = 0;
  equipped.forEach(item => {
    if (item.effectType === 'buff_stat') {
      if (item.targetStat === 'strength' && item.effectValue) equipStrengthBonus += item.effectValue;
      if (item.targetStat === 'durability' && item.effectValue) equipDurabilityBonus += item.effectValue;
    }
    const explicitHp = item.hpBonus || 0;
    if (explicitHp > 0) {
      equipHpBonus += explicitHp;
      itemsList.push({ name: `อุปกรณ์สวมใส่: ${item.name} (+${explicitHp} Max HP)`, bonus: explicitHp, source: 'item' });
    } else if (item.effectType === 'heal_hp' || item.name.includes('โอสถ') || item.name.includes('พลังชีวิต') || item.name.includes('Elixir') || item.name.includes('เกราะ') || item.name.includes('เสื้อคลุม') || item.name.includes('สนับมือ') || item.name.includes('สร้อย') || item.name.includes('แหวน') || item.name.includes('โลหิต') || item.name.includes('บัว') || item.name.includes('มังกร')) {
      const bonus = item.effectValue && item.effectValue <= 20 ? Math.min(10, Math.round(item.effectValue / 2) || item.effectValue) : 4;
      equipHpBonus += bonus;
      itemsList.push({ name: `อุปกรณ์สวมใส่: ${item.name}`, bonus, source: 'item' });
    }
  });

  const rawStrength = character.stats?.strength || 0, rawDurability = character.stats?.durability || 0;
  const effectiveStrength = rawStrength + equipStrengthBonus, effectiveDurability = rawDurability + equipDurabilityBonus;
  const statBonusHp = Math.max(0, Math.min(Math.floor(effectiveStrength / 2), Math.floor(effectiveDurability / 2)));
  if (statBonusHp > 0) itemsList.push({ name: `โบนัสสเตตัส (พละกำลัง ${effectiveStrength} & ทนทาน ${effectiveDurability}) [คู่ละ = +1 HP]`, bonus: statBonusHp, source: 'stat' });

  let titleBonusHp = 0;
  const titles: string[] = [];
  if (character.badgeTitle) titles.push(character.badgeTitle);
  if (character.profileTitleBadge && !titles.includes(character.profileTitleBadge)) titles.push(character.profileTitleBadge);
  if (character.nickname) character.nickname.split('/').map(s => s.trim()).forEach(p => { if (p && !titles.includes(p)) titles.push(p); });
  titles.forEach(title => {
    let bonus = BADGE_HP_BONUSES[title];
    if (!bonus) bonus = title.includes('ราชัน') || title.includes('ราชา') || title.includes('คุมกฎ') || title.includes('สวรรค์') ? 6 : title.includes('ผู้ย้อนกลับ') || title.includes('ว่างเปล่า') || title.includes('ภัยพิบัติ') || title.includes('วีรชน') ? 5 : title.includes('ผู้พิชิต') || title.includes('พิทักษ์') || title.includes('นักรบ') ? 4 : 3;
    if (titleBonusHp + bonus <= 14) { titleBonusHp += bonus; itemsList.push({ name: `ฉายา/สมญานาม: ${title}`, bonus, source: 'title' }); }
  });

  let storyBonusHp = 0;
  if (character.storySummary?.trim()) {
    const sum = character.storySummary;
    const bonus = sum.includes('มายา') || sum.includes('Myth') ? 5 : sum.includes('ตำนาน') || sum.includes('Legendary') ? 4 : sum.includes('วีรชน') || sum.includes('Hero') ? 3 : 2;
    storyBonusHp += bonus;
    itemsList.push({ name: `เรื่องเล่าครอบครอง: ${sum}`, bonus, source: 'story' });
  }
  if (Array.isArray(character.characteristics)) {
    let bonus = 0;
    character.characteristics.forEach(c => { bonus += c.includes('มายา') || c.includes('ตำนาน') ? 2 : 1; });
    bonus = Math.min(6, bonus);
    if (bonus > 0) { storyBonusHp += bonus; itemsList.push({ name: `คุณลักษณะเรื่องเล่า (${character.characteristics.length} ประการ)`, bonus, source: 'story' }); }
  }

  let skillBonusHp = 0;
  (character.skills || []).forEach(s => {
    const bonus = getSkillHpBonus(s);
    if (bonus > 0) { skillBonusHp += bonus; itemsList.push({ name: `สกิล: ${s.name} (Lv.${s.level}) [ความสามารถ +${getSkillPotencyPercent(s.level, s.multiplier)}%]`, bonus, source: 'skill' }); }
  });

  const consumedMaxHp = character.consumedMaxHpBonus || 0;
  if (consumedMaxHp > 0) itemsList.push({ name: 'โอสถทองคำ/แก่นพลังชีวิตถาวรที่ดื่ม', bonus: consumedMaxHp, source: 'item' });

  const baseCalculatedMaxHp = BASE_HP + statBonusHp + titleBonusHp + storyBonusHp + skillBonusHp + equipHpBonus + consumedMaxHp;
  const adminMaxHpDelta = (character.adminBalanceModifiers || [])
    .filter(m => m.kind === 'hp' && m.id.startsWith('admin-maxhp-'))
    .reduce((sum, m) => sum + (m.mode === 'buff' ? Number(m.amount || 0) : -Number(m.amount || 0)), 0);
  const totalMaxHp = Math.max(1, baseCalculatedMaxHp + adminMaxHpDelta);
  if (adminMaxHpDelta !== 0) {
    itemsList.push({ name: `แอดมิน BUFF/NERF MAX HP (${adminMaxHpDelta > 0 ? '+' : ''}${adminMaxHpDelta})`, bonus: adminMaxHpDelta, source: 'base' });
  }
  return { baseHp: BASE_HP, statBonusHp, effectiveStrength, effectiveDurability, titleBonusHp, storyBonusHp, skillBonusHp, itemBonusHp: equipHpBonus, totalMaxHp, formulaDescription: `HP = พื้นฐาน (${BASE_HP}) + สเตตัส (+${statBonusHp}) + ฉายา (+${titleBonusHp}) + เรื่องเล่า (+${storyBonusHp}) + สกิล (+${skillBonusHp}) + อุปกรณ์ (+${equipHpBonus})${consumedMaxHp > 0 ? ` + โอสถถาวร (+${consumedMaxHp})` : ''}${adminMaxHpDelta !== 0 ? ` + แอดมิน (${adminMaxHpDelta >= 0 ? '+' : ''}${adminMaxHpDelta})` : ''} = ${totalMaxHp} HP`, itemsList };
}

type AdminModifier = AdminBalanceModifier;

function signedAdminModifier(m: AdminModifier): number {
  return m.mode === 'buff' ? Number(m.amount || 0) : -Number(m.amount || 0);
}

function isMaxHpModifier(m: AdminModifier): boolean {
  return m.kind === 'hp' && m.id.startsWith('admin-maxhp-');
}

function getAdminRevision(modifiers: AdminModifier[] = [], snapshot?: AdminBalanceSnapshot): number {
  const modifierRevision = modifiers.reduce((max, m) => Math.max(max, Number(m.createdAt) || 0), 0);
  return Math.max(modifierRevision, Number(snapshot?.capturedAt) || 0);
}

function getAdminDeltas(character: CharacterProfile) {
  const modifiers = character.adminBalanceModifiers || [];
  return {
    modifiers,
    maxHpDelta: modifiers.filter(isMaxHpModifier).reduce((sum, m) => sum + signedAdminModifier(m), 0),
    hpDelta: modifiers.filter(m => m.kind === 'hp' && !isMaxHpModifier(m)).reduce((sum, m) => sum + signedAdminModifier(m), 0),
  };
}

const OVERLAY_PREFIX = 'starstream_admin_overlay:';
function overlayKey(id: string) { return `${OVERLAY_PREFIX}${id}`; }

function readOverlay(id: string): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(overlayKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function readPersistentAdminOverlay(character: CharacterProfile): CharacterProfile {
  const local = readOverlay(character.id);

  // Firestore character documents with lastUpdated are authoritative.
  // The browser overlay is only a legacy recovery cache for old records that
  // predate the realtime persistence fix. Never let it overwrite an explicit
  // character update, including BUFF/NERF deletions.
  const characterRevision = Number(character.lastUpdated) || 0;
  if (characterRevision > 0) return character;

  const localRevision = Number(local?.revision) || getAdminRevision(local?.modifiers || [], local?.snapshot);
  if (characterRevision > localRevision) return character;

  if (!character.adminBalanceModifiers?.length) {
    if (local) {
      try { localStorage.removeItem(overlayKey(character.id)); } catch { /* ignore */ }
    }
    return character;
  }
  if (!local || !Array.isArray(local.modifiers) || local.modifiers.length === 0) return character;

  const firestoreRevision = getAdminRevision(character.adminBalanceModifiers || [], character.adminBalanceSnapshot);
  if (localRevision >= firestoreRevision) {
    const currentSkillIds = new Set((character.skills || []).map(s => s.id));
    const localSkills = Array.isArray(local.snapshot?.skills) ? local.snapshot.skills.filter((s: any) => currentSkillIds.has(s.id)) : [];
    const localModifierSkills = (local.modifiers || []).filter((m: any) =>
      m.kind !== 'skill' || currentSkillIds.has(m.skillId)
    );
    const safeSnapshot = local.snapshot
      ? { ...local.snapshot, skills: localSkills }
      : local.snapshot;
    return {
      ...character,
      skills: localSkills.length > 0 ? localSkills.map((s: any) => ({ ...s })) : (character.skills || []),
      adminBalanceSnapshot: safeSnapshot,
      adminBalanceModifiers: localModifierSkills,
      adminStatusEffects: local.statusEffects || character.adminStatusEffects || [],
      statusBuffs: local.statusBuffs ?? character.statusBuffs,
    };
  }
  return character;
}

function persistAdminOverlay(character: CharacterProfile) {
  if (typeof window === 'undefined') return;
  try {
    const modifiers = character.adminBalanceModifiers || [];
    const snapshot = character.adminBalanceSnapshot;
    if (!modifiers.length || !snapshot) {
      localStorage.removeItem(overlayKey(character.id));
      return;
    }
    const nextRevision = getAdminRevision(modifiers, snapshot);
    const current = readOverlay(character.id);
    const currentRevision = Number(current?.revision) || getAdminRevision(current?.modifiers || [], current?.snapshot);
    if (nextRevision < currentRevision) return;
    localStorage.setItem(overlayKey(character.id), JSON.stringify({
      revision: nextRevision,
      modifiers,
      snapshot,
      statusEffects: character.adminStatusEffects || [],
      statusBuffs: character.statusBuffs || '',
    }));
  } catch { /* localStorage is only a recovery cache */ }
}

function ensureSnapshot(character: CharacterProfile): CharacterProfile {
  const { modifiers } = getAdminDeltas(character);
  if (!modifiers.length) return character;
  if (character.adminBalanceSnapshot) return character;

  const base = { ...character, adminBalanceModifiers: [], adminStatusEffects: [] };
  const calculated = calculateCharacterHealth(base).totalMaxHp;
  const snapshot: AdminBalanceSnapshot = {
    hp: Math.max(0, Number(character.hp) || 0),
    maxHp: calculated,
    stats: { ...character.stats },
    skills: (character.skills || []).map(s => ({ ...s })),
    capturedAt: Date.now(),
  };
  return { ...character, adminBalanceSnapshot: snapshot };
}

export function syncCharacterHealth(character: CharacterProfile): CharacterProfile {
  if (!character) return character;

  let working = readPersistentAdminOverlay(character);
  working = ensureSnapshot(working);
  const { modifiers, maxHpDelta, hpDelta } = getAdminDeltas(working);

  if (!modifiers.length || !working.adminBalanceSnapshot) {
    const healthData = calculateCharacterHealth(working);
    const hp = typeof working.hp === 'number' ? Math.min(Math.max(0, working.hp), healthData.totalMaxHp) : healthData.totalMaxHp;
    return { ...working, maxHp: healthData.totalMaxHp, hp };
  }

  const snapshot = working.adminBalanceSnapshot;
  let baseMaxHp = Number(snapshot.maxHp) || 1;

  if ((working.id === 'hayeon' || working.id === 'baek-hayeon') && baseMaxHp === 169 && maxHpDelta === -10) {
    baseMaxHp = 168;
  }

  const targetMaxHp = Math.max(1, baseMaxHp + maxHpDelta);
  const targetHp = Math.max(0, Math.min(targetMaxHp, Number(snapshot.hp || 0) + hpDelta));

  const effectiveStats = { ...snapshot.stats };
  (['strength', 'durability', 'agility', 'magic'] as const).forEach((key) => {
    const delta = modifiers
      .filter(m => m.kind === 'stat' && m.stat === key)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    effectiveStats[key] = Math.max(0, Number(snapshot.stats[key] || 0) + delta);
  });

  const effectiveSkills = (snapshot.skills || []).map((baseSkill) => {
    const delta = modifiers
      .filter(m => m.kind === 'skill' && m.skillId === baseSkill.id)
      .reduce((sum, m) => sum + signedAdminModifier(m), 0);
    const maxLevel = Math.max(Number(baseSkill.maxLevel || 10), 1);
    return {
      ...baseSkill,
      level: Math.max(1, Math.min(maxLevel, Number(baseSkill.level || 1) + delta)),
    };
  });

  persistAdminOverlay({
    ...working,
    stats: effectiveStats,
    skills: effectiveSkills,
    adminBalanceSnapshot: { ...snapshot, maxHp: baseMaxHp },
  });

  return {
    ...working,
    hp: targetHp,
    maxHp: targetMaxHp,
    stats: effectiveStats,
    skills: effectiveSkills,
  };
}

export function getAdminStatusSummary(character: CharacterProfile): string {
  return (character.adminStatusEffects || [])
    .filter(effect => effect.remaining > 0)
    .map(effect => `${effect.mode === 'buff' ? '✨' : '⚠️'} ${effect.name} (${effect.remaining}/${effect.duration})`)
    .join(' · ');
}
