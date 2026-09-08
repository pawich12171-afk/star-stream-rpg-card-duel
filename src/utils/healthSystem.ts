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

/**
 * คำนวณความสามารถสกิลพื้นฐานที่เพิ่มขึ้นตามเลเวล (+10% ต่อเลเวล)
 * Lv.1 = +0% (ความสามารถมาตรฐาน 100%)
 * Lv.2 = +10%
 * Lv.3 = +20%
 * ...
 * Lv.10 = +90%
 */
export function getSkillPotencyPercent(level: number, multiplier: number = 1): number {
  const lvl = Math.max(1, level || 1);
  const basePercent = (lvl - 1) * 10;
  return basePercent * (multiplier || 1);
}

/**
 * คำนวณโบนัสพลังชีวิต (HP) จากสกิล
 * ตามเกณฑ์: อัปเดต Level 1 เป็น Level 2 ความสามารถ +10% เช่นความสามารถนี้บวกเลือด 1 ก็จะกลายเป็น 2
 * Lv.1: +1 HP
 * Lv.2: +2 HP
 * Lv.3: +2 HP
 * Lv.4: +3 HP
 * Lv.5: +3 HP
 * Lv.6: +4 HP
 * Lv.7: +4 HP
 * Lv.8: +5 HP
 * Lv.9: +5 HP
 * Lv.10: +6 HP (หากจุติสวรรค์ Multiplier x2 จะกลายเป็น +12 HP)
 */
export function getSkillHpBonus(skill: {
  name?: string;
  level: number;
  multiplier?: number;
  description?: string;
  type?: string;
  category?: string;
}): number {
  const lvl = Math.max(1, skill.level || 1);
  const mult = Math.max(1, skill.multiplier || 1);
  const name = skill.name || '';
  const desc = skill.description || '';

  // สกิลสายพลังชีวิต, การป้องกัน, ม่านพลัง, กายา, ปราณ, สติกมา หรือสกิลติดตัว
  const isVitality =
    name.includes('บัว') ||
    name.includes('ม่าน') ||
    name.includes('เกราะ') ||
    name.includes('เลือด') ||
    name.includes('พลังชีวิต') ||
    name.includes('HP') ||
    name.includes('กายา') ||
    name.includes('ทนทาน') ||
    name.includes('ตื่นรู้') ||
    name.includes('ฟื้นฟู') ||
    name.includes('พิทักษ์') ||
    name.includes('บาเรีย') ||
    name.includes('ลมปราณ') ||
    name.includes('ระบำ') ||
    name.includes('คำสั่ง') ||
    name.includes('ก้าว') ||
    name.includes('Awakening') ||
    desc.includes('HP') ||
    desc.includes('เลือด') ||
    desc.includes('เกราะ') ||
    desc.includes('ป้องกัน') ||
    desc.includes('ฟื้นฟู') ||
    desc.includes('สะท้อน') ||
    skill.type?.includes('ติดตัว') ||
    skill.type?.includes('บัฟ') ||
    skill.category === 'stigma' ||
    skill.category === 'innate' ||
    skill.category === 'story';

  if (!isVitality) {
    // สกิลสายการต่อสู้อื่นๆ มอบความทรหดตามเลเวล
    return Math.max(0, Math.floor((lvl - 1) * 0.25) * mult);
  }

  // สูตรคำนวณตามโจทย์:
  // Lv.1 ได้ 1
  // Lv.2 ได้ 2 (เพิ่มตามความสามารถ +10% และสเกลขั้นเลเวล)
  const baseBonus = 1;
  const levelGrowth = (lvl - 1) * 0.55;
  const calculated = Math.max(1, Math.round((baseBonus + levelGrowth) * mult));
  return calculated;
}

export function calculateCharacterHealth(character: CharacterProfile): HealthBreakdown {
  const itemsList: { name: string; bonus: number; source: 'base' | 'stat' | 'title' | 'story' | 'skill' | 'item' }[] = [];

  // 1. Base HP = 20
  itemsList.push({
    name: 'พลังชีวิตพื้นฐาน (Base HP)',
    bonus: BASE_HP,
    source: 'base',
  });

  // 2. Equipment / Inventory Item Bonuses
  const equipped = character.inventory?.filter(i => i.isEquipped) || [];
  let equipStrengthBonus = 0;
  let equipDurabilityBonus = 0;
  let equipHpBonus = 0;

  equipped.forEach(item => {
    if (item.effectType === 'buff_stat') {
      if (item.targetStat === 'strength' && item.effectValue) {
        equipStrengthBonus += item.effectValue;
      }
      if (item.targetStat === 'durability' && item.effectValue) {
        equipDurabilityBonus += item.effectValue;
      }
    }

    // Explicit hpBonus or equipment item HP boost
    const explicitHp = item.hpBonus || 0;
    if (explicitHp > 0) {
      equipHpBonus += explicitHp;
      itemsList.push({
        name: `อุปกรณ์สวมใส่: ${item.name} (+${explicitHp} Max HP)`,
        bonus: explicitHp,
        source: 'item',
      });
    } else if (
      item.effectType === 'heal_hp' ||
      item.name.includes('โอสถ') ||
      item.name.includes('พลังชีวิต') ||
      item.name.includes('Elixir') ||
      item.name.includes('เกราะ') ||
      item.name.includes('เสื้อคลุม') ||
      item.name.includes('สนับมือ') ||
      item.name.includes('สร้อย') ||
      item.name.includes('แหวน') ||
      item.name.includes('โลหิต') ||
      item.name.includes('บัว') ||
      item.name.includes('มังกร')
    ) {
      const bonus = item.effectValue && item.effectValue <= 20 ? Math.min(10, Math.round(item.effectValue / 2) || item.effectValue) : 4;
      equipHpBonus += bonus;
      itemsList.push({
        name: `อุปกรณ์สวมใส่: ${item.name}`,
        bonus,
        source: 'item',
      });
    }
  });

  // 3. Stats Bonus: Pairs of Strength & Durability (Stamina)
  const rawStrength = character.stats?.strength || 0;
  const rawDurability = character.stats?.durability || 0;
  const effectiveStrength = rawStrength + equipStrengthBonus;
  const effectiveDurability = rawDurability + equipDurabilityBonus;

  const statPairs = Math.min(
    Math.floor(effectiveStrength / 2),
    Math.floor(effectiveDurability / 2)
  );
  const statBonusHp = Math.max(0, statPairs);

  if (statBonusHp > 0) {
    itemsList.push({
      name: `โบนัสสเตตัส (พละกำลัง ${effectiveStrength} & ทนทาน ${effectiveDurability}) [คู่ละ = +1 HP]`,
      bonus: statBonusHp,
      source: 'stat',
    });
  }

  // 4. Title (ฉายา / ตราเกียรติยศ / สมญานาม)
  let titleBonusHp = 0;
  const titlesToCheck: string[] = [];

  if (character.badgeTitle) titlesToCheck.push(character.badgeTitle);
  if (character.profileTitleBadge && !titlesToCheck.includes(character.profileTitleBadge)) {
    titlesToCheck.push(character.profileTitleBadge);
  }
  if (character.nickname) {
    const parts = character.nickname.split('/').map(s => s.trim());
    parts.forEach(p => {
      if (p && !titlesToCheck.includes(p)) titlesToCheck.push(p);
    });
  }

  titlesToCheck.forEach(title => {
    let bonus = 0;
    if (BADGE_HP_BONUSES[title]) {
      bonus = BADGE_HP_BONUSES[title];
    } else if (title.includes('ราชัน') || title.includes('ราชา') || title.includes('คุมกฎ') || title.includes('สวรรค์')) {
      bonus = 6;
    } else if (title.includes('ผู้ย้อนกลับ') || title.includes('ว่างเปล่า') || title.includes('ภัยพิบัติ') || title.includes('วีรชน')) {
      bonus = 5;
    } else if (title.includes('ผู้พิชิต') || title.includes('พิทักษ์') || title.includes('นักรบ')) {
      bonus = 4;
    } else {
      bonus = 3;
    }

    // Only grant the best title bonuses (capped at max 14 HP total from titles)
    if (titleBonusHp + bonus <= 14) {
      titleBonusHp += bonus;
      itemsList.push({
        name: `ฉายา/สมญานาม: ${title}`,
        bonus,
        source: 'title',
      });
    }
  });

  // 5. Story (เรื่องเล่า & คุณลักษณะ)
  let storyBonusHp = 0;

  // 5.1 จากสรุปเรื่องเล่า (Story Summary)
  if (character.storySummary && character.storySummary.trim()) {
    const sum = character.storySummary;
    let sBonus = 2;
    if (sum.includes('มายา') || sum.includes('Myth')) {
      sBonus = 5;
    } else if (sum.includes('ตำนาน') || sum.includes('Legendary')) {
      sBonus = 4;
    } else if (sum.includes('วีรชน') || sum.includes('Hero')) {
      sBonus = 3;
    }
    storyBonusHp += sBonus;
    itemsList.push({
      name: `เรื่องเล่าครอบครอง: ${sum}`,
      bonus: sBonus,
      source: 'story',
    });
  }

  // 5.2 จากคุณลักษณะเฉพาะตัว (Characteristics)
  if (character.characteristics && Array.isArray(character.characteristics)) {
    let charBonus = 0;
    character.characteristics.forEach(c => {
      if (c.includes('มายา')) charBonus += 2;
      else if (c.includes('ตำนาน')) charBonus += 2;
      else if (c.includes('หายาก') || c.includes('พิเศษ')) charBonus += 1;
      else charBonus += 1;
    });
    // Cap characteristics trait bonus at +6 HP
    charBonus = Math.min(6, charBonus);
    if (charBonus > 0) {
      storyBonusHp += charBonus;
      itemsList.push({
        name: `คุณลักษณะเรื่องเล่า (${character.characteristics.length} ประการ)`,
        bonus: charBonus,
        source: 'story',
      });
    }
  }

  // 6. Skills Bonus (คำนวณตามเลเวลและอัตราความสามารถ +10%)
  let skillBonusHp = 0;
  if (character.skills && Array.isArray(character.skills)) {
    character.skills.forEach(s => {
      const bonus = getSkillHpBonus(s);
      if (bonus > 0) {
        skillBonusHp += bonus;
        const potency = getSkillPotencyPercent(s.level, s.multiplier);
        itemsList.push({
          name: `สกิล: ${s.name} (Lv.${s.level}) [ความสามารถ +${potency}%]`,
          bonus,
          source: 'skill',
        });
      }
    });
  }

  // 7. Consumed Elixirs / Permanent Max HP Boost
  const consumedMaxHp = character.consumedMaxHpBonus || 0;
  if (consumedMaxHp > 0) {
    itemsList.push({
      name: `โอสถทองคำ/แก่นพลังชีวิตถาวรที่ดื่ม`,
      bonus: consumedMaxHp,
      source: 'item',
    });
  }

  // Total Max HP Calculation
  const totalMaxHp = BASE_HP + statBonusHp + titleBonusHp + storyBonusHp + skillBonusHp + equipHpBonus + consumedMaxHp;
  const formulaDescription = `HP = พื้นฐาน (${BASE_HP}) + สเตตัส (+${statBonusHp}) + ฉายา (+${titleBonusHp}) + เรื่องเล่า (+${storyBonusHp}) + สกิล (+${skillBonusHp}) + อุปกรณ์ (+${equipHpBonus})${consumedMaxHp > 0 ? ` + โอสถถาวร (+${consumedMaxHp})` : ''} = ${totalMaxHp} HP`;

  return {
    baseHp: BASE_HP,
    statBonusHp,
    effectiveStrength,
    effectiveDurability,
    titleBonusHp,
    storyBonusHp,
    skillBonusHp,
    itemBonusHp: equipHpBonus,
    totalMaxHp,
    formulaDescription,
    itemsList,
  };
}

/**
 * ซิงค์ค่าพลังชีวิตให้สมดุลเสมอ โดยอิงจากสูตรคำนวณจริง
 * จะลบล้างค่าเลือดที่ค้างสูงผิดปกติในอดีต (เช่น 1500, 800, 950) ให้กลับมาสู่มาตรฐานทันที
 */
export function syncCharacterHealth(character: CharacterProfile): CharacterProfile {
  if (!character) return character;
  const healthData = calculateCharacterHealth(character);
  const targetMaxHp = healthData.totalMaxHp;
  let newHp = character.hp;

  // หากไม่มีค่าเลือด หรือเลือดมากกว่าเป้าหมาย หรือติดค่าเลือดสูงเกินจริงจากระบบเดิม
  if (
    typeof newHp !== 'number' ||
    newHp > targetMaxHp ||
    !character.maxHp ||
    character.maxHp > targetMaxHp ||
    character.maxHp > 200 ||
    character.maxHp === 1500 ||
    character.maxHp === 800 ||
    character.maxHp === 950
  ) {
    newHp = targetMaxHp;
  }

  return {
    ...character,
    maxHp: targetMaxHp,
    hp: Math.min(newHp, targetMaxHp),
  };
}
