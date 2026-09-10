import { CharacterProfile, Skill } from '../types';

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
  'ผู้พิชิตสตรีม': 5,
  'ราชันย์บัลลังก์สัมบูรณ์': 8,
  'กลีบบัววิบัติ': 4,
  'เงาแห่งความมืด': 6,
  'นักรบเพลิง': 3,
  'วีรชนแห่งกาลเวลา': 5,
  'ผู้คุมกฎแห่งสตรีม': 7,
  'ผู้ผ่านพ้นบททดสอบ': 5,
  'ภัยพิบัติแห่งคลื่นสะท้อน': 6,
  'ภัยพิบัติแห่งเสียงกูร้อง': 5,
  'ผู้ย้อนกลับ': 7,
  'ผู้เหยียดหยามนักเล่าเรื่อง': 5,
  'อาจารย์มัทนะ': 4,
  'ยันเดเระผู้คลั่งรัก': 4,
  'ผู้สืบทอดแห่งความว่างเปล่า': 6,
  'เหยี่ยวราตรีแห่งเงา': 4,
  'หมัดเพลิงสุริยัน': 4,
  'นางแอ่นสวรรค์': 4,
  'ราชาอสูรผู้เฝ้ามองความว่างเปล่า': 8,
  'ผู้อวตารแห่งโชคชะตา': 5,
  'ผู้ไร้พ่าย': 6,
};

export function getSkillPotencyPercent(level: number, multiplier: number = 1): number {
  const lvl = Math.max(1, level || 1);
  const basePercent = (lvl - 1) * 10;
  return basePercent * (multiplier || 1);
}

export function getSkillHpBonus(skill: { name?: string; level: number; multiplier?: number; description?: string; type?: string; category?: string; }): number {
  const lvl = Math.max(1, skill.level || 1);
  const mult = Math.max(1, skill.multiplier || 1);
  const name = skill.name || '';
  const desc = skill.description || '';
  const isVitality =
    name.includes('บัว') || name.includes('ม่าน') || name.includes('เกราะ') ||
    name.includes('เลือด') || name.includes('พลังชีวิต') || name.includes('HP') ||
    name.includes('กายา') || name.includes('ทนทาน') || name.includes('ตื่นรู้') ||
    name.includes('ฟื้นฟู') || name.includes('พิทักษ์') || name.includes('บาเรีย') ||
    name.includes('ลมปราณ') || name.includes('ระบำ') || name.includes('คำสั่ง') ||
    name.includes('ก้าว') || name.includes('Awakening') || desc.includes('HP') ||
    desc.includes('เลือด') || desc.includes('เกราะ') || desc.includes('ป้องกัน') ||
    desc.includes('ฟื้นฟู') || desc.includes('สะท้อน') || skill.type?.includes('ติดตัว') ||
    skill.type?.includes('บัฟ') || skill.category === 'stigma' || skill.category === 'innate' || skill.category === 'story';

  if (!isVitality) return Math.max(0, Math.floor((lvl - 1) * 0.25) * mult);
  const baseBonus = 1;
  const levelGrowth = (lvl - 1) * 0.55;
  return Math.max(1, Math.round((baseBonus + levelGrowth) * mult));
}

export function calculateCharacterHealth(character: CharacterProfile): HealthBreakdown {
  const itemsList: { name: string; bonus: number; source: 'base' | 'stat' | 'title' | 'story' | 'skill' | 'item' }[] = [];
  itemsList.push({ name: 'พลังชีวิตพื้นฐาน (Base HP)', bonus: BASE_HP, source: 'base' });

  const equipped = character.inventory?.filter(i => i.isEquipped) || [];
  let equipStrengthBonus = 0;
  let equipDurabilityBonus = 0;
  let equipHpBonus = 0;

  equipped.forEach(item => {
    if (item.effectType === 'buff_stat') {
      if (item.targetStat === 'strength' && item.effectValue) equipStrengthBonus += item.effectValue;
      if (item.targetStat === 'durability' && item.effectValue) equipDurabilityBonus += item.effectValue;
    }
    const explicitHp = item.hpBonus || 0;
    if (explicitHp > 0) {
      equipHpBonus += explicitHp;
      itemsList.push({ name: `อุปกรณ์สวมใส่: ${item.name} (+${explicitHp} Max HP)`, bonus: explicitHp, source: 'item' });
    } else if (
      item.effectType === 'heal_hp' || item.name.includes('โอสถ') || item.name.includes('พลังชีวิต') ||
      item.name.includes('Elixir') || item.name.includes('เกราะ') || item.name.includes('เสื้อคลุม') ||
      item.name.includes('สนับมือ') || item.name.includes('สร้อย') || item.name.includes('แหวน') ||
      item.name.includes('โลหิต') || item.name.includes('บัว') || item.name.includes('มังกร')
    ) {
      const bonus = item.effectValue && item.effectValue <= 20 ? Math.min(10, Math.round(item.effectValue / 2) || item.effectValue) : 4;
      equipHpBonus += bonus;
      itemsList.push({ name: `อุปกรณ์สวมใส่: ${item.name}`, bonus, source: 'item' });
    }
  });

  const rawStrength = character.stats?.strength || 0;
  const rawDurability = character.stats?.durability || 0;
  const effectiveStrength = rawStrength + equipStrengthBonus;
  const effectiveDurability = rawDurability + equipDurabilityBonus;
  const statPairs = Math.min(Math.floor(effectiveStrength / 2), Math.floor(effectiveDurability / 2));
  const statBonusHp = Math.max(0, statPairs);
  if (statBonusHp > 0) itemsList.push({ name: `โบนัสสเตตัส (พละกำลัง ${effectiveStrength} & ทนทาน ${effectiveDurability}) [คู่ละ = +1 HP]`, bonus: statBonusHp, source: 'stat' });

  let titleBonusHp = 0;
  const titlesToCheck: string[] = [];
  if (character.badgeTitle) titlesToCheck.push(character.badgeTitle);
  if (character.profileTitleBadge && !titlesToCheck.includes(character.profileTitleBadge)) titlesToCheck.push(character.profileTitleBadge);
  if (character.nickname) character.nickname.split('/').map(s => s.trim()).forEach(p => { if (p && !titlesToCheck.includes(p)) titlesToCheck.push(p); });
  titlesToCheck.forEach(title => {
    let bonus = 0;
    if (BADGE_HP_BONUSES[title]) bonus = BADGE_HP_BONUSES[title];
    else if (title.includes('ราชัน') || title.includes('ราชา') || title.includes('คุมกฎ') || title.includes('สวรรค์')) bonus = 6;
    else if (title.includes('ผู้ย้อนกลับ') || title.includes('ว่างเปล่า') || title.includes('ภัยพิบัติ') || title.includes('วีรชน')) bonus = 5;
    else if (title.includes('ผู้พิชิต') || title.includes('พิทักษ์') || title.includes('นักรบ')) bonus = 4;
    else bonus = 3;
    if (titleBonusHp + bonus <= 14) {
      titleBonusHp += bonus;
      itemsList.push({ name: `ฉายา/สมญานาม: ${title}`, bonus, source: 'title' });
    }
  });

  let storyBonusHp = 0;
  if (character.storySummary && character.storySummary.trim()) {
    const sum = character.storySummary;
    let sBonus = 2;
    if (sum.includes('มายา') || sum.includes('Myth')) sBonus = 5;
    else if (sum.includes('ตำนาน') || sum.includes('Legendary')) sBonus = 4;
    else if (sum.includes('วีรชน') || sum.includes('Hero')) sBonus = 3;
    storyBonusHp += sBonus;
    itemsList.push({ name: `เรื่องเล่าครอบครอง: ${sum}`, bonus: sBonus, source: 'story' });
  }
  if (character.characteristics && Array.isArray(character.characteristics)) {
    let charBonus = 0;
    character.characteristics.forEach(c => {
      if (c.includes('มายา')) charBonus += 2;
      else if (c.includes('ตำนาน')) charBonus += 2;
      else if (c.includes('หายาก') || c.includes('พิเศษ')) charBonus += 1;
      else charBonus += 1;
    });
    charBonus = Math.min(6, charBonus);
    if (charBonus > 0) {
      storyBonusHp += charBonus;
      itemsList.push({ name: `คุณลักษณะเรื่องเล่า (${character.characteristics.length} ประการ)`, bonus: charBonus, source: 'story' });
    }
  }

  let skillBonusHp = 0;
  if (character.skills && Array.isArray(character.skills)) {
    character.skills.forEach(s => {
      const bonus = getSkillHpBonus(s);
      if (bonus > 0) {
        skillBonusHp += bonus;
        const potency = getSkillPotencyPercent(s.level, s.multiplier);
        itemsList.push({ name: `สกิล: ${s.name} (Lv.${s.level}) [ความสามารถ +${potency}%]`, bonus, source: 'skill' });
      }
    });
  }

  const consumedMaxHp = character.consumedMaxHpBonus || 0;
  if (consumedMaxHp > 0) itemsList.push({ name: 'โอสถทองคำ/แก่นพลังชีวิตถาวรที่ดื่ม', bonus: consumedMaxHp, source: 'item' });

  const totalMaxHp = BASE_HP + statBonusHp + titleBonusHp + storyBonusHp + skillBonusHp + equipHpBonus + consumedMaxHp;
  const formulaDescription = `HP = พื้นฐาน (${BASE_HP}) + สเตตัส (+${statBonusHp}) + ฉายา (+${titleBonusHp}) + เรื่องเล่า (+${storyBonusHp}) + สกิล (+${skillBonusHp}) + อุปกรณ์ (+${equipHpBonus})${consumedMaxHp > 0 ? ` + โอสถถาวร (+${consumedMaxHp})` : ''} = ${totalMaxHp} HP`;
  return { baseHp: BASE_HP, statBonusHp, effectiveStrength, effectiveDurability, titleBonusHp, storyBonusHp, skillBonusHp, itemBonusHp: equipHpBonus, totalMaxHp, formulaDescription, itemsList };
}

function signedAdminModifier(m: any): number {
  return m.mode === 'buff' ? (m.amount || 0) : -(m.amount || 0);
}

function getAdminDeltas(character: CharacterProfile) {
  const modifiers = character.adminBalanceModifiers || [];
  return {
    modifiers,
    maxHpDelta: modifiers.filter(m => m.kind === 'hp' && m.id.startsWith('admin-maxhp-')).reduce((sum, m) => sum + signedAdminModifier(m), 0),
    hpDelta: modifiers.filter(m => m.kind === 'hp' && !m.id.startsWith('admin-maxhp-')).reduce((sum, m) => sum + signedAdminModifier(m), 0),
  };
}

function migrateMissingAdminSnapshot(character: CharacterProfile): CharacterProfile {
  const { modifiers, maxHpDelta, hpDelta } = getAdminDeltas(character);
  if (!modifiers.length || character.adminBalanceSnapshot) return character;

  const baseCharacter: CharacterProfile = {
    ...character,
    hp: Math.max(0, (Number(character.hp) || 0) - hpDelta),
    maxHp: Math.max(1, (Number(character.maxHp) || 1) - maxHpDelta),
    adminBalanceSnapshot: undefined,
  };

  if (baseCharacter.stats) {
    const stats = { ...baseCharacter.stats };
    (['strength', 'durability', 'agility', 'magic'] as const).forEach(key => {
      const delta = modifiers.filter(m => m.kind === 'stat' && m.stat === key).reduce((sum, m) => sum + signedAdminModifier(m), 0);
      stats[key] = Math.max(0, stats[key] - delta);
    });
    baseCharacter.stats = stats;
  }

  if (Array.isArray(baseCharacter.skills)) {
    baseCharacter.skills = baseCharacter.skills.map(skill => {
      const delta = modifiers.filter(m => m.kind === 'skill' && m.skillId === skill.id).reduce((sum, m) => sum + signedAdminModifier(m), 0);
      return { ...skill, level: Math.max(1, skill.level - delta) };
    });
  }

  // IMPORTANT: the old effective maxHp may already contain a stale value.
  // Recalculate the true base from the character with admin stat/skill deltas reversed.
  const calculatedBase = calculateCharacterHealth(baseCharacter).totalMaxHp;
  baseCharacter.maxHp = Math.max(1, calculatedBase);

  return {
    ...character,
    adminBalanceSnapshot: {
      hp: baseCharacter.hp,
      maxHp: baseCharacter.maxHp,
      stats: { ...baseCharacter.stats },
      skills: (baseCharacter.skills || []).map(s => ({ ...s })),
      capturedAt: Date.now(),
    },
  };
}

export function syncCharacterHealth(character: CharacterProfile): CharacterProfile {
  if (!character) return character;
  const migrated = migrateMissingAdminSnapshot(character);
  const { modifiers, maxHpDelta, hpDelta } = getAdminDeltas(migrated);
  const healthData = calculateCharacterHealth(migrated);

  const baseMaxHp = modifiers.length && migrated.adminBalanceSnapshot
    ? migrated.adminBalanceSnapshot.maxHp
    : healthData.totalMaxHp;
  const targetMaxHp = Math.max(1, baseMaxHp + maxHpDelta);
  const baseHp = modifiers.length && migrated.adminBalanceSnapshot
    ? migrated.adminBalanceSnapshot.hp
    : (typeof migrated.hp === 'number' ? migrated.hp : targetMaxHp);
  const targetHp = Math.max(0, Math.min(targetMaxHp, baseHp + hpDelta));

  return { ...migrated, maxHp: targetMaxHp, hp: targetHp };
}
