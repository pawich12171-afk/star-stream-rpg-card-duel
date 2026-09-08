import { Skill, ORVSkillRank } from '../types';
import { getSkillHpBonus, getSkillPotencyPercent } from './healthSystem';

export interface ORVRankDetails {
  rank: ORVSkillRank;
  thaiTitle: string;
  englishTitle: string;
  badgeClass: string;
  cardBorder: string;
  glowEffect: string;
  icon: string;
  storyLore: string;
}

export const ORV_RANKS: Record<ORVSkillRank, ORVRankDetails> = {
  general: {
    rank: 'general',
    thaiTitle: 'ระดับทั่วไป',
    englishTitle: 'General Grade (F~E)',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    cardBorder: 'border-slate-700/80 hover:border-slate-600',
    glowEffect: '',
    icon: 'C',
    storyLore: 'วิชาพื้นฐานทั่วไปที่ผู้ผ่านการทดสอบทุกคนสามารถฝึกฝนได้'
  },
  rare: {
    rank: 'rare',
    thaiTitle: 'ระดับหายาก',
    englishTitle: 'Rare Grade (D~C)',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
    cardBorder: 'border-cyan-800/70 hover:border-cyan-500/60',
    glowEffect: 'shadow-[0_0_12px_rgba(6,182,212,0.15)]',
    icon: 'R',
    storyLore: 'วิชาที่มีความพิเศษเฉพาะตัว มีอานุภาพโดดเด่นในสมรภูมิ'
  },
  hero: {
    rank: 'hero',
    thaiTitle: 'ระดับวีรชน',
    englishTitle: 'Hero Grade (B)',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-600/80',
    cardBorder: 'border-blue-700/70 hover:border-blue-500/60',
    glowEffect: 'shadow-[0_0_15px_rgba(59,130,246,0.2)]',
    icon: 'E',
    storyLore: 'พลังที่สืบทอดมาจากวีรชนในอดีต ผสานเรื่องเล่าการต่อสู้ที่ดุเดือด'
  },
  semi_myth: {
    rank: 'semi_myth',
    thaiTitle: 'ระดับกึ่งตำนาน',
    englishTitle: 'Semi-Myth Grade (A)',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-600/80',
    cardBorder: 'border-purple-700/70 hover:border-purple-500/70',
    glowEffect: 'shadow-[0_0_18px_rgba(168,85,247,0.25)]',
    icon: 'L',
    storyLore: 'เรื่องเล่าชั้นสูงที่ใกล้เคียงกับความลึกลับของเทพเจ้า'
  },
  legendary: {
    rank: 'legendary',
    thaiTitle: 'ระดับตำนาน',
    englishTitle: 'Legendary Grade (S)',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-500/80 font-bold',
    cardBorder: 'border-amber-500/70 hover:border-amber-400',
    glowEffect: 'shadow-[0_0_22px_rgba(245,158,11,0.3)]',
    icon: 'M',
    storyLore: 'วิชาในตำนานที่สามารถพลิกกระแสการต่อสู้ของซีนาริโอได้ในพริบตา'
  },
  myth: {
    rank: 'myth',
    thaiTitle: 'ระดับเรื่องเล่ายักษ์',
    englishTitle: 'Myth / Giant Fable Grade (SSS)',
    badgeClass: 'bg-gradient-to-r from-rose-950/90 via-purple-950/90 to-amber-950/90 text-rose-200 border-rose-400/80 font-black',
    cardBorder: 'border-rose-500/80 hover:border-rose-400',
    glowEffect: 'shadow-[0_0_25px_rgba(244,63,94,0.35)]',
    icon: 'X',
    storyLore: 'เรื่องเล่าระดับจักรวาลที่แม้แต่กลุ่มดาวชั้นสูงสุดยังต้องก้มกราบ'
  },
  transcendent: {
    rank: 'transcendent',
    thaiTitle: 'ระดับจุติสวรรค์',
    englishTitle: 'Transcendent / Star Stream Primordial',
    badgeClass: 'bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 text-slate-950 border-yellow-200 font-black shadow-lg',
    cardBorder: 'border-yellow-400/90 hover:border-yellow-300',
    glowEffect: 'shadow-[0_0_30px_rgba(234,179,8,0.5)] ring-1 ring-yellow-400/50',
    icon: 'S',
    storyLore: 'พลังอันไร้ที่สิ้นสุด ทะลวงขีดจำกัดแห่งความเป็นไปได้ทั้งหมด'
  },
};

export function getSkillORVRank(skill: Skill): ORVRankDetails {
  if (skill.orvRank && ORV_RANKS[skill.orvRank]) {
    return ORV_RANKS[skill.orvRank];
  }
  if ((skill.multiplier || 1) >= 4) {
    return ORV_RANKS.transcendent;
  }
  if ((skill.multiplier || 1) > 1) {
    return ORV_RANKS.myth;
  }

  const name = (skill.name || '').toLowerCase();
  const type = (skill.type || '').toLowerCase();

  if (
    name.includes('ultimate') ||
    name.includes('พายุ') ||
    name.includes('ย้อนเวลา') ||
    name.includes('สุริยัน') ||
    type.includes('ultimate') ||
    skill.category === 'story'
  ) {
    return ORV_RANKS.myth;
  }
  if (
    name.includes('ร่ม') ||
    name.includes('คำสั่ง') ||
    name.includes('ม่าน') ||
    skill.category === 'stigma' ||
    skill.level >= 8
  ) {
    return ORV_RANKS.legendary;
  }
  if (
    name.includes('นางแอ่น') ||
    name.includes('ก้าวเงา') ||
    skill.category === 'innate' ||
    skill.level >= 6
  ) {
    return ORV_RANKS.semi_myth;
  }
  if (
    name.includes('หมัด') ||
    name.includes('ว่องไว') ||
    skill.level >= 4
  ) {
    return ORV_RANKS.hero;
  }
  if (skill.level >= 2) {
    return ORV_RANKS.rare;
  }
  return ORV_RANKS.general;
}

export const BASE_SKILL_UPGRADE_COST = 350; // Coins
export const BASE_STAT_UPGRADE_COST = 1000; // Coins
export const COMPOUND_RATE = 1.20; // +20% compounded per upgrade

export function calculateSkillUpgradeCost(skill: Skill): number {
  const timesUpgraded = skill.upgradeCount ?? (
    (skill.level - 1) + ((skill.multiplier || 1) > 1 ? ((skill.multiplier || 1) - 1) * 10 : 0)
  );
  return Math.round(BASE_SKILL_UPGRADE_COST * Math.pow(COMPOUND_RATE, timesUpgraded));
}

export function calculateStatUpgradeCost(timesUpgraded: number = 0): number {
  return Math.round(BASE_STAT_UPGRADE_COST * Math.pow(COMPOUND_RATE, timesUpgraded));
}

export function getLevel10Perk(skill: Skill): string {
  if (skill.perkLevel10) return skill.perkLevel10;
  const name = skill.name || '';
  if (name.includes('ร่ม')) {
    return 'เพิ่มอัตราสะท้อนเป็น 50% และลดคูลดาวน์ลง 1 เทิร์น';
  }
  if (name.includes('หมัด')) {
    return 'ระเบิดเพลิงสร้างความเสียหายรอบตัว 100%';
  }
  if (name.includes('เงา')) {
    return 'หลบหลีกการโจมตีทางกายภาพได้สมบูรณ์แบบ';
  }
  return 'พลังทำลายและความเร็วกระบวนท่าเพิ่มขึ้น 50%';
}

export function getUpgradePreview(skill: Skill): {
  cost: number;
  nextLevelText: string;
  benefitText: string;
  isAscension: boolean;
  currentPotency: number;
  nextPotency: number;
  currentHpBonus: number;
  nextHpBonus: number;
} {
  const cost = calculateSkillUpgradeCost(skill);
  const currentLevel = skill.level || 1;
  const currentMultiplier = skill.multiplier || 1;
  const currentPotency = getSkillPotencyPercent(currentLevel, currentMultiplier);
  const currentHpBonus = getSkillHpBonus(skill);

  if (currentLevel >= 10) {
    const nextMult = currentMultiplier * 2;
    const nextHp = getSkillHpBonus({ ...skill, level: 1, multiplier: nextMult });
    return {
      cost,
      nextLevelText: 'จุติสวรรค์ (รีเซ็ตเป็น Lv.1 พร้อม Multiplier x2)',
      benefitText: `ตัวคูณความสามารถทวีคูณเป็น ${nextMult}X และรีเซ็ตสู่รอบถัดไป (บัฟเลือด +${nextHp} HP)`,
      isAscension: true,
      currentPotency,
      nextPotency: currentPotency * 2,
      currentHpBonus,
      nextHpBonus: nextHp,
    };
  }

  const nextLevel = currentLevel + 1;
  const nextPotency = getSkillPotencyPercent(nextLevel, currentMultiplier);
  const nextHpBonus = getSkillHpBonus({ ...skill, level: nextLevel, multiplier: currentMultiplier });

  let benefitText = `ความสามารถ +10% (รวม +${nextPotency}%)`;
  if (nextHpBonus > currentHpBonus) {
    benefitText += ` • บัฟเลือด +${currentHpBonus} ➔ +${nextHpBonus} HP`;
  } else if (nextHpBonus > 0) {
    benefitText += ` • มอบบัฟเลือด +${nextHpBonus} HP`;
  }

  if (nextLevel === 10) {
    benefitText += ` และปลดล็อกผลพิเศษ Lv.10: "${getLevel10Perk(skill)}"`;
  }

  return {
    cost,
    nextLevelText: `อัปเกรดสู่ Lv.${nextLevel} / 10`,
    benefitText,
    isAscension: false,
    currentPotency,
    nextPotency,
    currentHpBonus,
    nextHpBonus,
  };
}
