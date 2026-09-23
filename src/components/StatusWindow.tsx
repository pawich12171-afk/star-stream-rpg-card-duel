// Vercel build sync: force fresh main build after JSX repair.
import React, { useEffect, useRef, useState } from 'react';
// Build trigger: StatusWindow JSX fix is present on main.
import { CharacterProfile, Skill, ORVSkillRank, BattleExtraEffect, ItemPassiveEffect } from '../types';
import { 
  Sparkles, 
  Zap, 
  Heart, 
  Coins, 
  Plus, 
  ArrowUpCircle, 
  Trash2, 
  Layers, 
  Award, 
  Palette, 
  TrendingUp, 
  Crown, 
  Lock, 
  Unlock,
  Users
} from 'lucide-react';
import confetti from '../utils/confetti';
import { 
  calculateCharacterHealth, 
  syncCharacterHealth, 
  getSkillHpBonus, 
  getSkillPotencyPercent, 
  BASE_HP 
} from '../utils/healthSystem';
import { 
  getSkillORVRank, 
  calculateSkillUpgradeCost, 
  calculateStatUpgradeCost, 
  getUpgradePreview, 
  getLevel10Perk,
  ORV_RANKS,
  COMPOUND_RATE,
  STAT_COMPOUND_RATE
} from '../utils/orvSkillSystem';

interface StatusWindowProps {
  character: CharacterProfile;
  onUpdateCharacter: (updated: CharacterProfile) => void | Promise<boolean>;
  onPersistStatus?: (characterId: string, patch: Pick<CharacterProfile, 'stats' | 'hp' | 'maxHp' | 'statusBuffs' | 'characteristics'>) => Promise<boolean>;
  onOpenTransfer: () => void;
  onOpenProfileCustomizer?: () => void;
  onOpenCharacterSelect?: () => void;
  isAdmin: boolean;
}

export const StatusWindow: React.FC<StatusWindowProps> = ({
  character,
  onUpdateCharacter,
  onPersistStatus,
  onOpenTransfer,
  onOpenProfileCustomizer,
  onOpenCharacterSelect,
  isAdmin,
}) => {
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [editingSkillDraft, setEditingSkillDraft] = useState<Skill | null>(null);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillType, setNewSkillType] = useState('วิชาทั่วไป');
  const [newSkillCategory, setNewSkillCategory] = useState<'general' | 'innate' | 'stigma' | 'story'>('general');
  const [newSkillORVRank, setNewSkillORVRank] = useState<ORVSkillRank>('rare');
  const [newSkillPerk10, setNewSkillPerk10] = useState('');
  const [newSkillBattleEffect, setNewSkillBattleEffect] = useState<NonNullable<Skill['battleEffect']>>('damage');
  const [newSkillBattlePower, setNewSkillBattlePower] = useState(5);
  const [newSkillCooldownTurns, setNewSkillCooldownTurns] = useState(3);
  const [newSkillCritChance, setNewSkillCritChance] = useState(0);
  const [newSkillCritMultiplier, setNewSkillCritMultiplier] = useState(2);
  const [newSkillRepeatAttackChance, setNewSkillRepeatAttackChance] = useState(0);
  const [newSkillMaxRepeatAttacks, setNewSkillMaxRepeatAttacks] = useState(1);
  const [newSkillBattleStats, setNewSkillBattleStats] = useState<NonNullable<Skill['battleStats']>>([]);
  const [newSkillStatKind, setNewSkillStatKind] = useState<NonNullable<Skill['battleStats']>[number]['kind']>('attack_power');
  const [newSkillStatValue, setNewSkillStatValue] = useState(15);
  const [newSkillStatDuration, setNewSkillStatDuration] = useState(1);
  const [newSkillExtraEffects, setNewSkillExtraEffects] = useState<NonNullable<Skill['battleEffects']>>([]);
  const [newSkillPassiveEffects, setNewSkillPassiveEffects] = useState<ItemPassiveEffect[]>([]);
  const [newSkillPassiveName, setNewSkillPassiveName] = useState('Passive ของสกิล');
  const [newSkillPassiveKind, setNewSkillPassiveKind] = useState<ItemPassiveEffect['kind']>('stack');
  const [newSkillPassiveTrigger, setNewSkillPassiveTrigger] = useState<ItemPassiveEffect['trigger']>('turn_start');
  const [newSkillPassiveValue, setNewSkillPassiveValue] = useState(1);
  const [newSkillPassiveMaxStacks, setNewSkillPassiveMaxStacks] = useState(6);
  const [newSkillPassiveChance, setNewSkillPassiveChance] = useState(100);
  const [newSkillPassiveStackKey, setNewSkillPassiveStackKey] = useState('skill');
  const [newSkillPassiveDuration, setNewSkillPassiveDuration] = useState(1);
  const [newSkillExtraKind, setNewSkillExtraKind] = useState<NonNullable<Skill['battleEffects']>[number]['kind']>('bleeding');
  const [newSkillExtraValue, setNewSkillExtraValue] = useState(15);
  const [newSkillExtraDuration, setNewSkillExtraDuration] = useState(3);
  const [newSkillExtraChance, setNewSkillExtraChance] = useState(100);
  const [newSkillEffectDuration, setNewSkillEffectDuration] = useState(1);
  const [newSkillDrawbacks, setNewSkillDrawbacks] = useState<BattleExtraEffect[]>([]);
  const [newSkillDrawbackKind, setNewSkillDrawbackKind] = useState<BattleExtraEffect['kind']>('bleeding');
  const [newSkillDrawbackValue, setNewSkillDrawbackValue] = useState(10);
  const [newSkillDrawbackDuration, setNewSkillDrawbackDuration] = useState(1);

  const [showHpBreakdown, setShowHpBreakdown] = useState(false);
  const [showStatEditModal, setShowStatEditModal] = useState(false);
  const [tempStats, setTempStats] = useState({ ...character.stats });
  const [tempHp, setTempHp] = useState(character.hp);
  const [tempMaxHp, setTempMaxHp] = useState(character.maxHp);
  const [tempBuffs, setTempBuffs] = useState(character.statusBuffs || '');
  const [tempCharacteristics, setTempCharacteristics] = useState<string[]>(character.characteristics || []);
  const [newCharacteristic, setNewCharacteristic] = useState('');
  const [isSavingStats, setIsSavingStats] = useState(false);
  const [transcendenceBatchCounts, setTranscendenceBatchCounts] = useState<Record<'strength' | 'durability' | 'agility' | 'magic', number>>({ strength: 1, durability: 1, agility: 1, magic: 1 });
  const [skillBatchCounts, setSkillBatchCounts] = useState<Record<string, number>>({});
  const [isUpgradingSkill, setIsUpgradingSkill] = useState(false);
  const latestCharacterRef = useRef<CharacterProfile>(character);

  useEffect(() => {
    latestCharacterRef.current = character;
  }, [character]);
  useEffect(() => {
    // Keep the edit form aligned with the newest character snapshot.
    // A realtime update must not leave the modal editing an older copy.
    if (!showStatEditModal) {
      setTempStats({ ...character.stats });
      setTempHp(character.hp);
      setTempMaxHp(character.maxHp);
      setTempBuffs(character.statusBuffs || '');
      setTempCharacteristics([...(character.characteristics || [])]);
    }
  }, [
    character.id,
    character.stats,
    character.hp,
    character.maxHp,
    character.statusBuffs,
    character.characteristics,
    showStatEditModal,
  ]);


  const commitCharacterUpdate = async (updated: CharacterProfile): Promise<boolean> => {
    const latest = latestCharacterRef.current;
    const committed: CharacterProfile = {
      ...updated,
      lastUpdated: Math.max(
        Date.now(),
        Number(latest.lastUpdated || 0) + 1,
        Number(updated.lastUpdated || 0) + 1
      ),
    };
    latestCharacterRef.current = committed;
    const result = onUpdateCharacter(committed);
    if (result && typeof (result as Promise<boolean>).then === 'function') {
      return (await result) !== false;
    }
    return true;
  };

  const healthData = calculateCharacterHealth(character);

  const equippedItems = character.inventory?.filter(i => i.isEquipped) || [];
  const statBonus = {
    strength: 0,
    durability: 0,
    agility: 0,
    magic: 0,
  };
  equippedItems.forEach(item => {
    if (item.effectType === 'buff_stat' && item.targetStat && item.effectValue) {
      statBonus[item.targetStat] += item.effectValue;
    }
  });

  const isAllStats100 = 
    character.stats.strength >= 100 &&
    character.stats.durability >= 100 &&
    character.stats.agility >= 100 &&
    character.stats.magic >= 100;

  const currentStatUpgradeTimes = character.statUpgradeCount || 0;
  const currentStatUpgradeCost = calculateStatUpgradeCost(currentStatUpgradeTimes);
  const nextStatUpgradeCost = Math.round(currentStatUpgradeCost * STAT_COMPOUND_RATE);

  const handleUpgradeTranscendenceStat = async (statName: 'strength' | 'durability' | 'agility' | 'magic') => {
    if (isSavingStats) return;
    const base = latestCharacterRef.current;
    const allStats100 =
      Number(base.stats.strength) >= 100 &&
      Number(base.stats.durability) >= 100 &&
      Number(base.stats.agility) >= 100 &&
      Number(base.stats.magic) >= 100;
    if (!allStats100) {
      alert('ต้องมีสเตตัสครบ 100 ทุกค่าก่อนจึงจะปลดล็อกการอัปเกรดทะลุขีดจำกัด!');
      return;
    }
    const requestedTimes = Math.max(1, Math.min(1000, Math.floor(Number(transcendenceBatchCounts[statName]) || 1)));
    const startUpgradeTimes = Math.max(0, Math.floor(Number(base.statUpgradeCount) || 0));
    let totalCost = 0;
    for (let i = 0; i < requestedTimes; i += 1) {
      totalCost += calculateStatUpgradeCost(startUpgradeTimes + i);
    }
    const currentCoins = Number(base.coins) || 0;
    if (currentCoins < totalCost) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${totalCost.toLocaleString()} Coins (คุณมี ${currentCoins.toLocaleString()} Coins)`);
      return;
    }
    const now = Date.now();
    const nextTimes = startUpgradeTimes + requestedTimes;
    const newStats = {
      ...base.stats,
      [statName]: Number(base.stats[statName] || 0) + requestedTimes,
    };
    const updatedChar: CharacterProfile = {
      ...base,
      coins: currentCoins - totalCost,
      stats: newStats,
      statUpgradeCount: nextTimes,
      lastUpdated: Math.max(now, Number(base.lastUpdated || 0) + 1),
      notifications: [
        {
          id: `notif-stat-up-${now}-${nextTimes}`,
          title: 'อัปเกรดสเตตัสทะลุขีดจำกัดสำเร็จ!',
          message: `เพิ่มค่า ${statName} +${requestedTimes} (ปัจจุบัน Lv.${newStats[statName]}) ใช้เหรียญ ${totalCost.toLocaleString()} Coins`,
          timestamp: now,
          read: false,
          type: 'system',
        },
        ...(base.notifications || []),
      ],
    };
    setIsSavingStats(true);
    latestCharacterRef.current = updatedChar;
    confetti({ particleCount: Math.min(180, 40 + requestedTimes), spread: 60, origin: { y: 0.5 } });
    try {
      const saved = await onUpdateCharacter(syncCharacterHealth(updatedChar));
      if (saved === false) {
        latestCharacterRef.current = base;
        alert('บันทึกการอัปเกรดไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch (error) {
      latestCharacterRef.current = base;
      alert('บันทึกการอัปเกรดไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsSavingStats(false);
    }
  };

  const handleUpgradeSkill = async (skillId: string) => {
    if (isUpgradingSkill || isSavingStats) return;
    const base = latestCharacterRef.current;
    const targetSkill = (base.skills || []).find(s => s.id === skillId);
    if (!targetSkill) return;
    const requestedTimes = Math.max(1, Math.min(1000, Math.floor(Number(skillBatchCounts[skillId]) || 1)));
    const startUpgradeCount = Math.max(0, Math.floor(Number(targetSkill.upgradeCount ?? (targetSkill.level - 1)) || 0));
    let totalCost = 0;
    for (let i = 0; i < requestedTimes; i += 1) totalCost += calculateSkillUpgradeCost({ ...targetSkill, upgradeCount: startUpgradeCount + i });
    const currentCoins = Number(base.coins) || 0;
    if (currentCoins < totalCost) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${totalCost.toLocaleString()} Coins (คุณมี ${currentCoins.toLocaleString()} Coins)`);
      return;
    }
    let finalSkill = { ...targetSkill };
    let ascensionCount = 0;
    for (let i = 0; i < requestedTimes; i += 1) {
      let level = Number(finalSkill.level || 1) + 1;
      let multiplier = Number(finalSkill.multiplier || 1);
      if (level > 10) { level = 1; multiplier *= 2; ascensionCount += 1; }
      finalSkill = { ...finalSkill, level, multiplier, upgradeCount: startUpgradeCount + i + 1 };
    }
    const oldHpBonus = getSkillHpBonus(targetSkill);
    const newHpBonus = getSkillHpBonus(finalSkill);
    const now = Date.now();
    const updatedChar: CharacterProfile = {
      ...base,
      coins: currentCoins - totalCost,
      skills: (base.skills || []).map(skill => skill.id === skillId ? finalSkill : skill),
      lastUpdated: Math.max(now, Number(base.lastUpdated || 0) + 1),
      notifications: [{ id: `notif-skill-up-${now}-${startUpgradeCount + requestedTimes}`, title: ascensionCount ? 'สกิลจุติสวรรค์ (Ascension)!' : 'อัปเกรดสกิลสำเร็จ', message: `อัปเกรด "${targetSkill.name}" +${requestedTimes} ขั้น → Lv.${finalSkill.level} • ใช้ ${totalCost.toLocaleString()} Coins${ascensionCount ? ` • จุติ ${ascensionCount} ครั้ง → x${finalSkill.multiplier}` : ''}${newHpBonus > oldHpBonus ? ` • HP +${newHpBonus - oldHpBonus}` : ''}`, timestamp: now, read: false, type: 'system' }, ...(base.notifications || [])],
    };
    setIsUpgradingSkill(true);
    latestCharacterRef.current = updatedChar;
    if (ascensionCount) confetti({ particleCount: Math.min(200, 100 + ascensionCount * 20), spread: 80, origin: { y: 0.5 } });
    try {
      const saved = await onUpdateCharacter(syncCharacterHealth(updatedChar));
      if (saved === false) { latestCharacterRef.current = base; alert('บันทึกการอัปเกรดสกิลไม่สำเร็จ กรุณาลองใหม่'); }
    } catch { latestCharacterRef.current = base; alert('บันทึกการอัปเกรดสกิลไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setIsUpgradingSkill(false); }
  };
  const handleDeleteSkill = (skillId: string) => {
    if (!confirm('คุณต้องการลบสกิลนี้ใช่หรือไม่?')) return;

    const remainingSkills = (character.skills || []).filter(s => s.id !== skillId);
    const remainingModifiers = (character.adminBalanceModifiers || [])
      .filter(m => !(m.kind === 'skill' && m.skillId === skillId));

    const nextSnapshot = character.adminBalanceSnapshot
      ? {
          ...character.adminBalanceSnapshot,
          skills: (character.adminBalanceSnapshot.skills || []).filter(s => s.id !== skillId),
          capturedAt: Date.now(),
        }
      : undefined;

    onUpdateCharacter({
      ...character,
      skills: remainingSkills,
      adminBalanceSnapshot: remainingModifiers.length ? nextSnapshot : undefined,
      adminBalanceModifiers: remainingModifiers,
      lastUpdated: Date.now() + 1,
    });
  };

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;

    const newSkill: Skill = {
      id: `skill-custom-${Date.now()}`,
      name: newSkillName.trim(),
      level: 1,
      multiplier: 1,
      type: newSkillType,
      category: newSkillCategory,
      orvRank: newSkillORVRank,
      perkLevel10: newSkillPerk10.trim() || undefined,
      description: newSkillDesc.trim() || 'วิชาพิเศษที่สร้างสรรค์โดยผู้ใช้งาน',
      battleEffect: newSkillBattleEffect,
      battleEffectDuration: Math.max(1, Math.min(10, Math.round(Number(newSkillEffectDuration) || 1))),
      battlePower: Math.max(1, Number(newSkillBattlePower) || 1),
      cooldownTurns: Math.max(0, Math.min(99, Number(newSkillCooldownTurns) || 0)),
      cooldown: Number(newSkillCooldownTurns) > 0 ? `${newSkillCooldownTurns} เทิร์น` : undefined,
      battleCriticalChance: Math.max(0, Math.min(100, Number(newSkillCritChance) || 0)),
      battleCriticalMultiplier: Math.max(1, Number(newSkillCritMultiplier) || 1),
      repeatAttackChance: Math.max(0, Math.min(100, Number(newSkillRepeatAttackChance) || 0)),
      maxRepeatAttacks: Math.max(1, Math.min(20, Number(newSkillMaxRepeatAttacks) || 1)),
      battleStats: newSkillBattleStats.length ? [...newSkillBattleStats] : undefined,
      battleEffects: newSkillExtraEffects.length ? [...newSkillExtraEffects] : undefined,
      battleDrawbacks: newSkillDrawbacks.length ? [...newSkillDrawbacks] : undefined,
      passiveEffects: newSkillPassiveEffects.length ? [...newSkillPassiveEffects] : undefined,
      upgradeCount: 0,
    };

    onUpdateCharacter({
      ...character,
      skills: [...(character.skills || []), newSkill],
      notifications: [
        {
          id: `notif-new-skill-${Date.now()}`,
          title: 'เรียนรู้สกิลใหม่สำเร็จ',
          message: `คุณได้รับสกิล "${newSkill.name}" (${ORV_RANKS[newSkillORVRank]?.thaiTitle})`,
          timestamp: Date.now(),
          read: false,
          type: 'system',
        },
        ...(character.notifications || []),
      ],
    });

    setNewSkillName('');
    setNewSkillDesc('');
    setNewSkillPerk10('');
    setNewSkillBattleEffect('damage');
    setNewSkillBattlePower(5);
    setNewSkillCooldownTurns(3);
    setNewSkillCritChance(0);
    setNewSkillCritMultiplier(2);
    setNewSkillRepeatAttackChance(0);
    setNewSkillMaxRepeatAttacks(1);
    setNewSkillBattleStats([]);
    setNewSkillExtraEffects([]);
    setNewSkillEffectDuration(1);
    setNewSkillDrawbacks([]); setNewSkillDrawbackKind('bleeding'); setNewSkillDrawbackValue(10); setNewSkillDrawbackDuration(1);
    setNewSkillPassiveEffects([]); setNewSkillPassiveName('Passive ของสกิล'); setNewSkillPassiveKind('stack'); setNewSkillPassiveTrigger('turn_start'); setNewSkillPassiveValue(1); setNewSkillPassiveMaxStacks(6); setNewSkillPassiveChance(100); setNewSkillPassiveStackKey('skill'); setNewSkillPassiveDuration(1);
    setShowAddSkillModal(false);
  };

  const openSkillEditor = (skill: Skill) => {
    setEditingSkillDraft({ ...skill, battleStats: skill.battleStats ? [...skill.battleStats] : undefined, battleEffects: skill.battleEffects ? [...skill.battleEffects] : undefined, battleDrawbacks: skill.battleDrawbacks ? [...skill.battleDrawbacks] : undefined, passiveEffects: skill.passiveEffects ? [...skill.passiveEffects] : undefined });
  };

  const saveEditedSkill = async () => {
    if (!editingSkillDraft) return;
    const updatedSkills = (latestCharacterRef.current.skills || []).map(skill =>
      skill.id === editingSkillDraft.id ? { ...editingSkillDraft, name: editingSkillDraft.name.trim() || skill.name, description: editingSkillDraft.description.trim() || skill.description, battlePower: Math.max(0, Number(editingSkillDraft.battlePower) || 0), cooldownTurns: Math.max(0, Number(editingSkillDraft.cooldownTurns) || 0), battleCriticalChance: Math.max(0, Math.min(100, Number(editingSkillDraft.battleCriticalChance) || 0)), battleCriticalMultiplier: Math.max(1, Number(editingSkillDraft.battleCriticalMultiplier) || 1), repeatAttackChance: Math.max(0, Math.min(100, Number(editingSkillDraft.repeatAttackChance) || 0)), maxRepeatAttacks: Math.max(1, Math.min(20, Number(editingSkillDraft.maxRepeatAttacks) || 1)), damageScalingMultiplier: Math.max(0, Number(editingSkillDraft.damageScalingMultiplier) || 1), battleEffectDuration: Math.max(1, Math.min(10, Number(editingSkillDraft.battleEffectDuration) || 1)), battleDrawbacks: editingSkillDraft.battleDrawbacks?.length ? [...editingSkillDraft.battleDrawbacks] : undefined, battleEffects: editingSkillDraft.battleEffects?.length ? [...editingSkillDraft.battleEffects] : undefined, passiveEffects: editingSkillDraft.passiveEffects?.length ? [...editingSkillDraft.passiveEffects] : undefined } : skill
    );
    const saved = await commitCharacterUpdate({ ...latestCharacterRef.current, skills: updatedSkills });
    if (saved) { setEditingSkillDraft(null); }
  };

  const handleAddCharacteristic = () => {
    const value = newCharacteristic.trim();
    if (!value) return;

    const alreadyExists = tempCharacteristics.some(
      characteristic => characteristic.trim().toLowerCase() === value.toLowerCase()
    );
    if (alreadyExists) {
      setNewCharacteristic('');
      return;
    }

    setTempCharacteristics([...tempCharacteristics, value]);
    setNewCharacteristic('');
  };

  const handleRemoveCharacteristic = (index: number) => {
    setTempCharacteristics(tempCharacteristics.filter((_, i) => i !== index));
  };

  const handleSaveStats = async () => {
    if (isSavingStats) return;
    setIsSavingStats(true);
    try {
      const base = latestCharacterRef.current;
      const patch = {
        stats: {
          strength: Number(tempStats.strength),
          durability: Number(tempStats.durability),
          agility: Number(tempStats.agility),
          magic: Number(tempStats.magic),
        },
        hp: Number(tempHp),
        maxHp: Number(tempMaxHp),
        statusBuffs: tempBuffs,
        characteristics: [...tempCharacteristics],
      };
      // Always persist through the main character update path so the
      // status edit is merged with the latest profile and written to the
      // same database document as every other character change.
      const saved = await commitCharacterUpdate({
        ...base,
        ...patch,
        stats: { ...base.stats, ...patch.stats },
      });
      if (saved) setShowStatEditModal(false);
    } finally {
      setIsSavingStats(false);
    }
  };

  return (
    <div id="status-window-container" className="space-y-6">
      {/* Top Banner: ORV System Window Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 border shadow-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-cyan-500/40">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div 
              className="relative cursor-pointer group"
              onClick={onOpenProfileCustomizer}
              title="คลิกเพื่อตกแต่งและเปลี่ยนรูปโปรไฟล์"
            >
              <img
                src={character.avatarUrl}
                alt={character.displayName}
                className="w-20 h-20 md:w-24 md:h-24 rounded-2xl object-cover border-2 border-cyan-400/60 group-hover:border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all"
              />
              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity text-white text-[10px] font-bold gap-1">
                <Palette className="w-4 h-4 text-cyan-300" />
                <span>เปลี่ยนรูป</span>
              </div>
              <span className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-full border border-yellow-200 shadow">
                RANK #{character.powerScore ? Math.floor(character.powerScore / 1000) : 1}
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800 tracking-wider">
                  [หน้าต่างสถานะตัวละคร]
                </span>
                <span className="text-xs font-mono text-slate-400">ID: {character.username}</span>
                {character.badgeTitle && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-400" />
                    {character.badgeTitle}
                  </span>
                )}
                {isAllStats100 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 border border-yellow-200 shadow animate-pulse flex items-center gap-1">
                    <Crown className="w-3 h-3 text-slate-950" />
                    ผู้ทะลุขีดจำกัด 100+
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1 tracking-tight flex items-center gap-2">
                {character.displayName}
              </h1>
              <p className="text-cyan-400 text-sm font-medium mt-0.5">
                {character.nickname || "ไม่มีสมญานาม"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-slate-300 font-semibold">กลุ่มดาวผู้สนับสนุน:</span> {character.constellation || "ไม่มีผู้สนับสนุน"}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 w-full md:w-auto shadow-xl">
            <div>
              <span className="text-xs text-slate-400 block">เหรียญของคุณ (Coins)</span>
              <div className="flex items-center gap-2 mt-0.5">
                <Coins className="w-5 h-5 text-amber-400" />
                <span className="text-2xl font-black text-amber-300">
                  {character.coins.toLocaleString()}
                </span>
                <span className="text-xs text-amber-500/80 font-mono">C</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-transfer-coins"
                onClick={onOpenTransfer}
                className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Coins className="w-3.5 h-3.5" />
                โอนเหรียญ
              </button>
              {onOpenProfileCustomizer && (
                <button
                  id="btn-customize-profile-modal"
                  onClick={onOpenProfileCustomizer}
                  className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg cursor-pointer"
                  title="ตกแต่งโปรไฟล์ เปลี่ยนรูป ฉายา และเรื่องเล่า"
                >
                  <Palette className="w-3.5 h-3.5" />
                  ตกแต่งโปรไฟล์
                </button>
              )}
              {onOpenCharacterSelect && (
                <button
                  id="btn-switch-character-status"
                  onClick={onOpenCharacterSelect}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold rounded-xl border border-cyan-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow"
                  title="สลับดูและควบคุมตัวละครอื่นในระบบ"
                >
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  สลับดูโปรไฟล์อื่น
                </button>
              )}
              <button
                id="btn-edit-stats-modal"
                onClick={() => {
                  setTempStats({ ...character.stats });
                  setTempHp(character.hp);
                  setTempMaxHp(character.maxHp);
                  setTempBuffs(character.statusBuffs || '');
                  setTempCharacteristics(character.characteristics || []);
                  setNewCharacteristic('');
                  setShowStatEditModal(true);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                แก้ไขสเตตัส
              </button>
            </div>
          </div>
        </div>

        {character.quote && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-300 italic">
            "{character.quote}"
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-400 mr-1">คุณลักษณะ:</span>
          {character.characteristics?.map((c, i) => (
            <span
              key={i}
              className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-900/60 font-medium"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* STAT TRANSCENDENCE UPGRADE */}
      <div className={`p-5 rounded-3xl border transition-all ${
        isAllStats100
          ? 'bg-gradient-to-r from-amber-950/50 via-slate-900 to-yellow-950/40 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
          : 'bg-slate-900/90 border-slate-800 shadow-xl'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isAllStats100 ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-400'
            }`}>
              {isAllStats100 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">
                  ระบบอัปเกรดสเตตัสทะลุขีดจำกัด (Stat Transcendence 100+)
                </h3>
                {isAllStats100 ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ปลดล็อกแล้ว
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ต้องครบ 100 ทุกค่า
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAllStats100 
                  ? `อัปเกรดสเตตัสได้ไม่จำกัดโดยใช้เหรียญ Coins แบบดอกเบี้ยทบต้น 20% ต่อครั้ง`
                  : `เมื่อสเตตัสทั้ง 4 ค่าแตะ 100 จะสามารถอัปเกรดทะลุขีดจำกัดได้`}
              </p>
            </div>
          </div>

          {isAllStats100 && (
            <div className="bg-slate-950/80 px-3.5 py-2 rounded-2xl border border-amber-500/40 flex items-center gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block">ราคาอัปเกรด:</span>
                <span className="text-sm font-black text-amber-300 font-mono">
                  {currentStatUpgradeCost.toLocaleString()} Coins
                </span>
              </div>
              <div className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-800">
                +5% รอบถัดไป ({nextStatUpgradeCost.toLocaleString()} C)
              </div>
            </div>
          )}
        </div>

        {isAllStats100 ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['strength', 'durability', 'agility', 'magic'] as const).map(statKey => {
                const statLabel = statKey === 'strength' ? 'พละกำลัง' : statKey === 'durability' ? 'ความทนทาน' : statKey === 'agility' ? 'ความว่องไว' : 'พลังเวท';
                const currentVal = character.stats[statKey];
                return (
                  <div key={statKey} className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex flex-col justify-between space-y-3 shadow-md">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{statLabel}</span>
                        <span className="text-[10px] text-amber-400 font-bold">100+</span>
                      </div>
                      <div className="text-xl font-black text-white mt-1">
                        Lv.{currentVal}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400">
                        จำนวนขั้นที่ต้องการอัป
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={transcendenceBatchCounts[statKey]}
                          onChange={(e) => setTranscendenceBatchCounts(prev => ({
                            ...prev,
                            [statKey]: Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1))),
                          }))}
                          disabled={isSavingStats}
                          className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-500/30 text-white font-mono font-bold outline-none focus:border-amber-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleUpgradeTranscendenceStat(statKey)}
                        disabled={isSavingStats}
                        className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${!isSavingStats ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>อัปเกรด +{transcendenceBatchCounts[statKey]} ขั้น</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-slate-800/40 rounded-2xl border border-slate-700/60 text-xs text-slate-400">
            พละกำลัง ({character.stats.strength}/100) | ความทนทาน ({character.stats.durability}/100) | ความว่องไว ({character.stats.agility}/100) | พลังเวท ({character.stats.magic}/100)
          </div>
        )}
      </div>

      {/* Grid: Core Stats & Stories */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900/90 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              ค่าสถานะโดยรวม (Overall Status)
            </h2>
            <span className="text-xs text-cyan-400 font-mono">
              พลังรบรวม: <strong className="text-white text-sm">{character.powerScore?.toLocaleString() || 0}</strong>
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> พลังชีวิต (HP)
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-rose-300 text-xs">
                  {character.hp} / {character.maxHp} HP
                </span>
                <button
                  type="button"
                  onClick={() => setShowHpBreakdown(!showHpBreakdown)}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  {showHpBreakdown ? 'ซ่อนสูตรคำนวณ' : 'ดูสูตรคำนวณ'}
                </button>
              </div>
            </div>
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="bg-gradient-to-r from-rose-600 to-red-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (character.hp / character.maxHp) * 100))}%` }}
              />
            </div>

            {showHpBreakdown && (
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-slate-200">สูตรคำนวณ Max HP:</span>
                  <span className="font-mono text-rose-400 font-black">
                    ผลลัพธ์: {healthData.totalMaxHp} HP
                  </span>
                </div>
                <div className="space-y-1 text-[11px]">
                  {healthData.itemsList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">• {item.name}</span>
                      <span className="font-mono font-bold text-emerald-400">+{item.bonus} HP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-800/70 p-3.5 rounded-2xl border border-slate-700/80">
              <span className="text-xs text-slate-400">พละกำลัง</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">Lv.{character.stats.strength}</span>
                {statBonus.strength > 0 && (
                  <span className="text-xs text-emerald-400 font-bold">+{statBonus.strength}</span>
                )}
              </div>
            </div>
            <div className="bg-slate-800/70 p-3.5 rounded-2xl border border-slate-700/80">
              <span className="text-xs text-slate-400">ความทนทาน</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">Lv.{character.stats.durability}</span>
                {statBonus.durability > 0 && (
                  <span className="text-xs text-emerald-400 font-bold">+{statBonus.durability}</span>
                )}
              </div>
            </div>
            <div className="bg-slate-800/70 p-3.5 rounded-2xl border border-slate-700/80">
              <span className="text-xs text-slate-400">ความว่องไว</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">Lv.{character.stats.agility}</span>
                {statBonus.agility > 0 && (
                  <span className="text-xs text-emerald-400 font-bold">+{statBonus.agility}</span>
                )}
              </div>
            </div>
            <div className="bg-slate-800/70 p-3.5 rounded-2xl border border-slate-700/80">
              <span className="text-xs text-slate-400">พลังเวท</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">Lv.{character.stats.magic}</span>
                {statBonus.magic > 0 && (
                  <span className="text-xs text-emerald-400 font-bold">+{statBonus.magic}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              เรื่องเล่าและสถานะ
            </h2>
            {character.storySummary && (
              <div className="mt-3 p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700 text-xs leading-relaxed">
                <span className="font-bold text-purple-300 block mb-1">เรื่องเล่า:</span>
                <p className="text-slate-300">{character.storySummary}</p>
              </div>
            )}
            {character.statusBuffs && (
              <div className="mt-3 p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-800/60 text-xs leading-relaxed">
                <span className="font-bold text-cyan-300 block mb-1">บัฟสถานะ:</span>
                <p className="text-cyan-200/90">{character.statusBuffs}</p>
              </div>
            )}
            {character.adminStatusEffects && character.adminStatusEffects.filter(effect => effect.remaining > 0).length > 0 && (
              <div className="mt-3 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-3.5 text-xs leading-relaxed">
                <span className="font-bold text-amber-300 block mb-2">BUFF / DEBUFF ที่กำลังทำงาน:</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {character.adminStatusEffects.filter(effect => effect.remaining > 0).map(effect => (
                    <div key={effect.id} className={`rounded-xl border px-3 py-2 ${effect.mode === 'buff' ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-rose-700/60 bg-rose-950/30'}`}>
                      <div className={effect.mode === 'buff' ? 'font-bold text-emerald-200' : 'font-bold text-rose-200'}>{effect.mode === 'buff' ? '✨ BUFF' : '⚠️ DEBUFF'} • {effect.name}</div>
                      <div className="mt-1 text-[11px] text-slate-300">พลัง {effect.power} • เหลือ {effect.remaining}/{effect.duration} รอบ</div>
                      <div className="mt-1 text-[10px] text-slate-500">{effect.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SKILLS SECTION */}
      <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              สกิลประจำตัว & สติกมา (Skills)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              อัปเกรดสกิลได้สูงสุด Lv.10 เมื่อเกิน 10 จะจุติสวรรค์คูณสอง
            </p>
          </div>
          <button
            id="btn-add-skill-modal"
            onClick={() => setShowAddSkillModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            เพิ่มสกิลใหม่
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {character.skills?.map((skill) => {
            const orvRankInfo = getSkillORVRank(skill);
            const upgradePreview = getUpgradePreview(skill);
            const canAfford = character.coins >= upgradePreview.cost;
            const perk10 = getLevel10Perk(skill);
            return (
              <div
                key={skill.id}
                className={`p-5 rounded-3xl border transition-all flex flex-col justify-between relative overflow-hidden ${orvRankInfo.cardBorder} bg-slate-850/90`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${orvRankInfo.badgeClass}`}>
                          <span>{orvRankInfo.icon}</span>
                          <span>{orvRankInfo.thaiTitle}</span>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/90 text-cyan-300 font-mono border border-slate-700">
                          {skill.type || 'สกิล'}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-white mt-1">
                        {skill.name}
                      </h3>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-cyan-400 font-mono">
                        Lv.{skill.level} <span className="text-xs text-slate-400 font-normal">/ 10</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 mt-2 leading-relaxed">
                    {skill.description}
                  </p>

                  {/* Skill Potency & HP Bonus Status */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-cyan-400" /> ความสามารถ:
                      </span>
                      <span className="font-bold font-mono">
                        {skill.level > 1 ? `+${(skill.level - 1) * 10}%` : 'ค่าพื้นฐาน (100%)'}
                        {(skill.multiplier || 1) > 1 && ` [x${skill.multiplier}]`}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-950/50 border border-rose-800/50 text-rose-300 flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-400" /> บัฟเลือด:
                      </span>
                      <span className="font-bold font-mono text-emerald-400">
                        +{upgradePreview.currentHpBonus} HP
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
                    <span className="font-bold text-amber-300">ผลพิเศษ Lv.10: </span>
                    {perk10}
                  </div>

                  {/* Next Level Preview Callout */}
                  <div className="mt-2.5 p-2.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-cyan-300 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>
                        {skill.level >= 10
                          ? 'พร้อมจุติสวรรค์ (Ascension): Multiplier ทวีคูณ x2'
                          : `อัปเกรดสู่ Lv.${skill.level + 1}: ความสามารถ +10%`}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-right shrink-0">
                      {upgradePreview.nextHpBonus > upgradePreview.currentHpBonus ? (
                        <span className="text-rose-300 font-semibold">
                          เลือด +{upgradePreview.currentHpBonus} ➔ <strong className="text-emerald-300 font-bold">+{upgradePreview.nextHpBonus} HP</strong> (+{upgradePreview.nextHpBonus - upgradePreview.currentHpBonus})
                        </span>
                      ) : upgradePreview.nextHpBonus > 0 ? (
                        <span className="text-rose-300">เลือด +{upgradePreview.nextHpBonus} HP</span>
                      ) : (
                        <span className="text-cyan-400 font-mono">+10% อานุภาพ</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>ราคา: <strong className="text-amber-300">{upgradePreview.cost.toLocaleString()} C</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSkillEditor(skill)}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-violet-600/20 hover:bg-violet-600/35 text-violet-200 border border-violet-500/40 cursor-pointer"
                    >
                      ✏️ แก้ไข
                    </button>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={1} max={1000} value={skillBatchCounts[skill.id] || 1}
                          onChange={(e) => setSkillBatchCounts(prev => ({ ...prev, [skill.id]: Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1))) }))}
                          disabled={isUpgradingSkill}
                          className="w-20 px-2 py-2 rounded-xl bg-slate-950 border border-cyan-500/30 text-white text-xs font-mono font-bold"
                        />
                        <span className="text-[10px] text-slate-500">ขั้น</span>
                      </div>
                      <button type="button" id={`btn-upgrade-skill-${skill.id}`} onClick={() => handleUpgradeSkill(skill.id)}
                        disabled={!canAfford || isUpgradingSkill}
                        className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${canAfford && !isUpgradingSkill ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                        <ArrowUpCircle className="w-4 h-4" />
                        {skill.level >= 10 ? `จุติสวรรค์ / +${skillBatchCounts[skill.id] || 1} ขั้น` : `อัปเกรด +${skillBatchCounts[skill.id] || 1} ขั้น`}
                      </button>
                    </div>
                    <button type="button"
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: Edit Existing Skill */}
      {editingSkillDraft && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[60] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-violet-500/40 rounded-3xl max-w-2xl w-full shadow-2xl my-4 max-h-[92vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-violet-500/20 flex items-center justify-between">
              <div><div className="text-[10px] font-mono tracking-widest text-violet-300">SKILL EDITOR</div><h3 className="text-lg font-black text-white">✏️ แก้ไขสกิลที่สร้างไว้</h3></div>
              <button type="button" onClick={() => { setEditingSkillDraft(null); }} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 cursor-pointer">ปิด</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[78vh] text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-slate-400">ชื่อสกิล<input value={editingSkillDraft.name} onChange={e=>setEditingSkillDraft({...editingSkillDraft,name:e.target.value})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-white font-bold"/></label>
                <label className="text-slate-400">ประเภท<input value={editingSkillDraft.type || ''} onChange={e=>setEditingSkillDraft({...editingSkillDraft,type:e.target.value})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-white"/></label>
              </div>
              <label className="text-slate-400 block">คำอธิบาย<textarea rows={3} value={editingSkillDraft.description} onChange={e=>setEditingSkillDraft({...editingSkillDraft,description:e.target.value})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-white resize-none"/></label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="text-slate-400">พลัง<input type="number" value={editingSkillDraft.battlePower ?? 0} onChange={e=>setEditingSkillDraft({...editingSkillDraft,battlePower:Number(e.target.value)})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
                <label className="text-slate-400">Cooldown<input type="number" min="0" value={editingSkillDraft.cooldownTurns ?? 0} onChange={e=>setEditingSkillDraft({...editingSkillDraft,cooldownTurns:Number(e.target.value),cooldown:Number(e.target.value)>0?e.target.value+' เทิร์น':undefined})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
                <label className="text-slate-400">คริ %<input type="number" step="0.001" min="0" max="100" value={editingSkillDraft.battleCriticalChance ?? 0} onChange={e=>setEditingSkillDraft({...editingSkillDraft,battleCriticalChance:Number(e.target.value)})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
                <label className="text-slate-400">ตีซ้ำ %<input type="number" step="0.001" min="0" max="100" value={editingSkillDraft.repeatAttackChance ?? 0} onChange={e=>setEditingSkillDraft({...editingSkillDraft,repeatAttackChance:Number(e.target.value)})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="text-slate-400">สูตรดาเมจ<select value={editingSkillDraft.damageScaling || 'fixed'} onChange={e=>setEditingSkillDraft({...editingSkillDraft,damageScaling:e.target.value as Skill['damageScaling']})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"><option value="fixed">คงที่</option><option value="strength">ตาม STR</option><option value="durability">ตาม DUR</option><option value="agility">ตาม AGI</option><option value="magic">ตาม MAG</option></select></label>
                <label className="text-slate-400">ตัวคูณสเกล<input type="number" step="0.1" min="0" value={editingSkillDraft.damageScalingMultiplier ?? 1} onChange={e=>setEditingSkillDraft({...editingSkillDraft,damageScalingMultiplier:Number(e.target.value)})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
                <label className="text-slate-400">ตีซ้ำสูงสุด<input type="number" min="1" max="20" value={editingSkillDraft.maxRepeatAttacks ?? 1} onChange={e=>setEditingSkillDraft({...editingSkillDraft,maxRepeatAttacks:Number(e.target.value)})} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-2 py-2 text-white"/></label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800"><button type="button" onClick={()=>{setEditingSkillDraft(null)}} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 cursor-pointer">ยกเลิก</button><button type="button" onClick={()=>void saveEditedSkill()} className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black cursor-pointer">💾 บันทึกการแก้ไข</button></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Skill */}
      {showAddSkillModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-xl w-full shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-900/40 bg-slate-900/90 backdrop-blur-md flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 p-0.5 shadow-[0_0_18px_rgba(6,182,212,0.35)] flex items-center justify-center shrink-0">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-cyan-300" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-[.18em] text-cyan-400 font-bold uppercase">SKILL REGISTRY</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 star-live-dot" />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white truncate">สร้างและบันทึกสกิลใหม่</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">กำหนดข้อมูลให้ครบ เพื่อให้สกิลแสดงผลสวยและใช้ต่อสู้ได้จริง</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSkillModal(false)}
                aria-label="ปิดหน้าต่างสร้างสกิล"
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer border border-slate-700 shrink-0"
              >
                <span className="text-xs font-bold">ปิด</span>
              </button>
            </div>

            <form onSubmit={handleAddCustomSkill} className="p-4 sm:p-6 space-y-4 overflow-y-auto text-xs">
              <section className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-300" />ข้อมูลหลักของสกิล</h4>
                    <p className="text-[11px] text-slate-400 mt-1">ชื่อ ระดับ และหมวดหมู่ที่จะใช้แสดงบนการ์ดสกิล</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 font-mono shrink-0">STEP 01</span>
                </div>

                <div>
                  <label className="text-slate-200 font-bold block mb-1">ชื่อสกิล / วิชา <span className="text-rose-300">*</span></label>
                  <p className="text-[10px] text-slate-500 mb-1.5">ชื่อที่ผู้เล่นจะเห็นบนโปรไฟล์และการ์ดสกิล</p>
                  <input
                    type="text"
                    required
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="เช่น ม่านหมอกสายลมหยก, ปราณเพลิงสะบั้นดารา..."
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-cyan-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-200 font-bold block mb-1">ป้ายกำกับสกิล</label>
                  <p className="text-[10px] text-slate-500 mb-1.5">ข้อความสั้น ๆ ที่จะแสดงคู่กับชื่อสกิล เช่น วิชาทั่วไป หรือท่าไม้ตาย</p>
                  <input
                    type="text"
                    value={newSkillType}
                    onChange={(e) => setNewSkillType(e.target.value)}
                    placeholder="เช่น วิชาทั่วไป, ท่าไม้ตาย, Ultimate..."
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-cyan-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-200 font-bold block mb-1">ระดับขั้น ORV Rank</label>
                    <p className="text-[10px] text-slate-500 mb-1.5">กำหนดความหายากและภาพลักษณ์ของสกิล</p>
                    <select
                      value={newSkillORVRank}
                      onChange={(e) => setNewSkillORVRank(e.target.value as ORVSkillRank)}
                      className="w-full px-2.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-bold outline-none cursor-pointer"
                    >
                      <option value="common">ธรรมดา (Common)</option>
                      <option value="rare">หายาก (Rare)</option>
                      <option value="hero">วีรชน (Hero)</option>
                      <option value="semi_myth">กึ่งมายา (Semi-Myth)</option>
                      <option value="legendary">ตำนาน (Legendary)</option>
                      <option value="myth">มายา (Myth)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-200 font-bold block mb-1">หมวดหมู่วิชา</label>
                    <p className="text-[10px] text-slate-500 mb-1.5">ใช้จัดกลุ่มสกิลในโปรไฟล์ตัวละคร</p>
                    <select
                      value={newSkillCategory}
                      onChange={(e) => setNewSkillCategory(e.target.value as any)}
                      className="w-full px-2.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none cursor-pointer"
                    >
                      <option value="general">วิชาทั่วไป</option>
                      <option value="innate">วิชาติดตัว (Innate)</option>
                      <option value="stigma">สติกม่า (Stigma)</option>
                      <option value="story">เรื่องเล่า (Story)</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-violet-500/20 bg-violet-950/15 p-4 space-y-2.5">
                <div>
                  <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-300" /><h4 className="text-sm font-black text-white">คำอธิบายและผลลัพธ์</h4></div>
                  <p className="text-[11px] text-slate-400 mt-1">บอกให้ชัดว่าสกิลทำอะไร ส่งผลกับใคร และเหมาะกับสถานการณ์แบบไหน</p>
                </div>
                <textarea
                  rows={4}
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="เช่น สร้างม่านหมอกเพื่อบดบังการมองเห็น ลดความเสียหายที่ได้รับ และเปิดจังหวะให้ทีมสวนกลับ..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white leading-relaxed focus:border-violet-400 outline-none resize-none"
                />
              </section>

              <section className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/35 to-indigo-950/25 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-cyan-100 flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-300" />ผลลัพธ์ในสนามรบ</h4>
                    <p className="text-[11px] text-cyan-100/60 mt-1">ข้อมูลชุดนี้จะถูกใช้คำนวณผลจริงเมื่อกดใช้สกิลในสนามรบ</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-400/10 border border-cyan-300/20 text-cyan-200 font-mono shrink-0">STEP 02</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-cyan-100 font-bold block mb-1">ผลหลัก</label>
                    <p className="text-[10px] text-cyan-100/55 mb-1.5">ประเภทของเอฟเฟกต์</p>
                    <select value={newSkillBattleEffect} onChange={(e) => setNewSkillBattleEffect(e.target.value as NonNullable<Skill['battleEffect']>)} className="w-full px-2.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none cursor-pointer">
                      <option value="damage">โจมตี / ดาเมจ</option>
                      <option value="heal">ฟื้นฟู HP</option>
                      <option value="defense">โล่ / ป้องกัน</option>
                      <option value="reflect">สะท้อนดาเมจ</option>
                      <option value="stun">ควบคุม / สตัน</option><option value="copy_ability">🧬 คัดลอกความสามารถศัตรู</option><option value="immortal">♾️ อมตะ / กัน True Damage</option><option value="damage_reduction">🛡️ ลดความเสียหาย</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-cyan-100 font-bold block mb-1">ค่าพลัง</label>
                    <p className="text-[10px] text-cyan-100/55 mb-1.5">ดาเมจ / ฟื้นฟู / โล่</p>
                    <input type="number" min={1} value={newSkillBattlePower} onChange={(e) => setNewSkillBattlePower(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none" />
                  </div>
                  <div>
                    <label className="text-cyan-100 font-bold block mb-1">คูลดาวน์</label>
                    <p className="text-[10px] text-cyan-100/55 mb-1.5">จำนวนเทิร์นที่ต้องรอ</p>
                    <div className="relative">
                      <input type="number" min={0} max={99} value={newSkillCooldownTurns} onChange={(e) => setNewSkillCooldownTurns(Number(e.target.value))} className="w-full px-3 py-2.5 pr-14 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">เทิร์น</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-400/15 bg-slate-950/35 px-3 py-2 text-[10px] leading-relaxed text-cyan-100/65">
                  เคล็ดลับ: ตั้งค่า <strong className="text-cyan-200">ค่าพลัง</strong> ให้สอดคล้องกับคำอธิบายด้านบน เพื่อให้ผู้เล่นเข้าใจผลของสกิลได้ทันที
                </div>

                <div className="rounded-xl border border-violet-500/25 bg-violet-950/10 p-3 space-y-2">
                  <div className="text-[11px] font-black text-violet-200">🧬 ความสามารถพิเศษ + ข้อเสียของสกิล</div>
                  <div className="text-[10px] text-slate-400">ตั้งระยะเวลาเอฟเฟกต์หลัก 1–10 เทิร์น และกำหนดข้อเสีย/Passive ที่ทำงานจริง</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-slate-400">ระยะเวลาเอฟเฟกต์
                      <input type="number" min={1} max={10} value={newSkillEffectDuration} onChange={e=>setNewSkillEffectDuration(Math.max(1,Math.min(10,Number(e.target.value)||1)))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    </label>
                    <div className="text-[10px] text-slate-500 pt-5">ใช้กับ Copy / Immortal / Damage Reduction และสถานะหลัก</div>
                  </div>
                  <div className="border-t border-violet-500/20 pt-2">
                    <div className="text-[10px] font-black text-rose-200 mb-2">⚠️ ข้อเสีย — ทำงานจริงหลังใช้สกิล</div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={newSkillDrawbackKind} onChange={e=>setNewSkillDrawbackKind(e.target.value as BattleExtraEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"><option value="bleeding">เสียเลือดต่อเทิร์น</option><option value="burn">เผาไหม้ตัวเอง</option><option value="poison">พิษตัวเอง</option><option value="stun">สตันตัวเอง</option><option value="damage_percent">รับดาเมจเพิ่ม %</option><option value="damage_reduction">ลดดาเมจตัวเอง %</option><option value="reduce_defense_percent">ลดป้องกันตัวเอง %</option></select>
                      <input type="number" min={0} value={newSkillDrawbackValue} onChange={e=>setNewSkillDrawbackValue(Number(e.target.value)||0)} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input type="number" min={1} max={10} value={newSkillDrawbackDuration} onChange={e=>setNewSkillDrawbackDuration(Math.max(1,Math.min(10,Number(e.target.value)||1)))} placeholder="ระยะเวลา" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                      <button type="button" onClick={()=>setNewSkillDrawbacks(prev=>[...prev,{kind:newSkillDrawbackKind,value:Math.max(0,Number(newSkillDrawbackValue)||0),duration:Math.max(1,Math.min(10,Number(newSkillDrawbackDuration)||1)),chance:100,target:'self'}])} className="rounded-lg bg-rose-500/20 px-2 py-2 text-xs font-black text-rose-100">+ เพิ่มข้อเสีย</button>
                    </div>
                    {newSkillDrawbacks.map((e,i)=><div key={i} className="flex items-center justify-between rounded bg-black/20 px-2 py-1 text-[10px] text-rose-200"><span>{e.kind} • {e.value} • {e.duration} เทิร์น</span><button type="button" onClick={()=>setNewSkillDrawbacks(prev=>prev.filter((_,j)=>j!==i))} className="text-rose-300">ลบ</button></div>)}
                  </div>
                  <div className="border-t border-violet-500/20 pt-2">
                    <div className="text-[10px] font-black text-fuchsia-200 mb-2">🌸 Passive ของสกิล</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newSkillPassiveName} onChange={e=>setNewSkillPassiveName(e.target.value)} placeholder="ชื่อ Passive" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                      <select value={newSkillPassiveKind} onChange={e=>setNewSkillPassiveKind(e.target.value as ItemPassiveEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"><option value="stack">Stack</option><option value="true_damage_at_max_stacks">ครบ Stack → True Damage</option><option value="true_damage_per_stack">True Damage / Stack</option><option value="damage">Damage</option><option value="damage_percent">Damage %</option><option value="heal">Heal</option><option value="heal_percent">Heal %</option><option value="buff_stat">Buff Stat</option><option value="shield">Shield</option><option value="reflect">Reflect</option><option value="repeat_attack_chance">Repeat Attack %</option><option value="critical_chance">Critical %</option></select>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <input type="number" value={newSkillPassiveValue} onChange={e=>setNewSkillPassiveValue(Number(e.target.value)||0)} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                      <input type="number" min={1} value={newSkillPassiveMaxStacks} onChange={e=>setNewSkillPassiveMaxStacks(Math.max(1,Number(e.target.value)||1))} placeholder="Max Stack" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                      <input type="number" min={1} value={newSkillPassiveDuration} onChange={e=>setNewSkillPassiveDuration(Math.max(1,Number(e.target.value)||1))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    </div>
                    <button type="button" onClick={()=>setNewSkillPassiveEffects(prev=>[...prev,{id:'skill-passive-'+Date.now(),name:newSkillPassiveName.trim()||'Passive ของสกิล',trigger:newSkillPassiveTrigger,kind:newSkillPassiveKind,value:Math.max(0,Number(newSkillPassiveValue)||0),chance:Math.max(0,Math.min(100,Number(newSkillPassiveChance)||0)),maxStacks:Math.max(1,Math.round(Number(newSkillPassiveMaxStacks)||1)),stackKey:newSkillPassiveStackKey.trim()||'skill',duration:Math.max(1,Number(newSkillPassiveDuration)||1)}])} className="mt-2 w-full rounded-lg bg-fuchsia-500/20 px-2 py-2 text-xs font-black text-fuchsia-100">+ เพิ่ม Passive</button>
                    {newSkillPassiveEffects.map((e,i)=><div key={e.id} className="flex items-center justify-between rounded bg-black/20 px-2 py-1 text-[10px] text-fuchsia-200"><span>{e.name} • {e.kind} • {e.value} • {e.duration} เทิร์น</span><button type="button" onClick={()=>setNewSkillPassiveEffects(prev=>prev.filter(x=>x.id!==e.id))} className="text-rose-300">ลบ</button></div>)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3 space-y-2">
                  <div className="text-[11px] font-black text-amber-200">💥 คริติคอล</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-slate-400">โอกาสคริติคอล (%)
                      <input type="number" min={0} max={100} value={newSkillCritChance} onChange={e=>setNewSkillCritChance(Math.max(0,Math.min(100,Number(e.target.value)||0)))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-amber-200 outline-none"/>
                    </label>
                    <label className="text-[10px] text-slate-400">ตัวคูณคริติคอล (x)
                      <input type="number" min={1} max={20} step={0.1} value={newSkillCritMultiplier} onChange={e=>setNewSkillCritMultiplier(Math.max(1,Number(e.target.value)||1))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-amber-200 outline-none"/>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-3 space-y-2">
                  <div className="text-[11px] font-black text-cyan-200">📊 สเตตัสสกิล — เพิ่มได้หลายรายการ</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newSkillStatKind} onChange={e=>setNewSkillStatKind(e.target.value as NonNullable<Skill['battleStats']>[number]['kind'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white">
                      <option value="attack_power">พลังโจมตี</option><option value="defense_power">พลังป้องกัน</option><option value="heal_percent">ฟื้น HP %</option><option value="accuracy_percent">ความแม่นยำ %</option><option value="speed">ความเร็ว</option><option value="status_chance_percent">โอกาสติดสถานะ %</option><option value="status_duration">ระยะเวลาสถานะ</option><option value="critical_chance_percent">โอกาสคริ %</option><option value="critical_multiplier">ตัวคูณคริ</option><option value="cooldown_turns">ลดคูลดาวน์</option>
                    </select>
                    <input type="number" step={0.1} value={newSkillStatValue} onChange={e=>setNewSkillStatValue(Number(e.target.value)||0)} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input type="number" min={1} value={newSkillStatDuration} onChange={e=>setNewSkillStatDuration(Math.max(1,Number(e.target.value)||1))} placeholder="ระยะเวลา (เทิร์น)" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    <button type="button" onClick={()=>setNewSkillBattleStats(prev=>[...prev,{kind:newSkillStatKind,value:Number(newSkillStatValue)||0,duration:Math.max(1,Number(newSkillStatDuration)||1)}])} className="rounded-lg bg-cyan-500/20 px-3 py-2 text-xs font-black text-cyan-100">+ เพิ่ม</button>
                  </div>
                  {newSkillBattleStats.map((stat,index)=><div key={index} className="flex items-center justify-between rounded-lg bg-black/20 px-2 py-1.5 text-[10px] text-slate-300"><span>{stat.kind} • {stat.value} • {stat.duration} เทิร์น</span><button type="button" onClick={()=>setNewSkillBattleStats(prev=>prev.filter((_,i)=>i!==index))} className="text-rose-300">ลบ</button></div>)}
                </div>

                <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-950/10 p-3 space-y-2">
                  <div className="text-[11px] font-black text-fuchsia-200">✨ เอฟเฟกต์เพิ่มเติม — เพิ่มได้หลายรายการและทำงานพร้อมกัน</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={newSkillExtraKind} onChange={e=>setNewSkillExtraKind(e.target.value as NonNullable<Skill['battleEffects']>[number]['kind'])} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white">
                      <option value="bleeding">เลือดไหล</option><option value="burn">เผาไหม้</option><option value="poison">พิษ</option><option value="freeze">Freeze</option><option value="stun">สตัน</option><option value="reduce_max_hp_percent">ลด MAX HP %</option><option value="reduce_defense_percent">ลดป้องกัน %</option><option value="damage_percent">เพิ่มดาเมจ %</option><option value="heal_percent">ฟื้น HP %</option><option value="shield">โล่</option><option value="reflect">สะท้อน %</option>
                    </select>
                    <input type="number" min={0} value={newSkillExtraValue} onChange={e=>setNewSkillExtraValue(Math.max(0,Number(e.target.value)||0))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min={1} value={newSkillExtraDuration} onChange={e=>setNewSkillExtraDuration(Math.max(1,Number(e.target.value)||1))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    <input type="number" min={0} max={100} value={newSkillExtraChance} onChange={e=>setNewSkillExtraChance(Math.max(0,Math.min(100,Number(e.target.value)||0)))} placeholder="โอกาส %" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
                    <button type="button" onClick={()=>setNewSkillExtraEffects(prev=>[...prev,{kind:newSkillExtraKind,value:Math.max(0,Number(newSkillExtraValue)||0),duration:Math.max(1,Number(newSkillExtraDuration)||1),chance:Math.max(0,Math.min(100,Number(newSkillExtraChance)||0)),target:['heal_percent','shield','reflect'].includes(newSkillExtraKind)?'self':'enemy',label:newSkillExtraKind==='freeze'?'Freeze':undefined}])} className="rounded-lg bg-fuchsia-500/20 px-2 py-2 text-xs font-black text-fuchsia-100">+ เพิ่ม</button>
                  </div>
                  {newSkillExtraEffects.map((effect,index)=><div key={index} className="flex items-center justify-between rounded-lg bg-black/20 px-2 py-1.5 text-[10px] text-slate-300"><span>{effect.kind} • {effect.value}{effect.kind.includes('percent')||effect.kind==='reflect'?'%':''} • {effect.duration} เทิร์น • {effect.chance ?? 100}%</span><button type="button" onClick={()=>setNewSkillExtraEffects(prev=>prev.filter((_,i)=>i!==index))} className="text-rose-300">ลบ</button></div>)}
                </div>
              </section>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
                <label className="text-xs text-emerald-200">🔁 โอกาสตีซ้ำอีก 1 รอบ (%)
                  <input type="number" min={0} max={100} step={0.001} value={newSkillRepeatAttackChance} onChange={(e) => setNewSkillRepeatAttackChance(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none" />
                  <span className="block mt-1 text-[10px] text-slate-500">0% = ไม่มีโอกาสตีซ้ำ • ใส่ทศนิยมได้ เช่น 0.1% หรือ 0.01%</span>
                </label>
                <label className="block mt-2 text-xs text-emerald-200">🔢 ตีซ้ำได้สูงสุดกี่รอบ
                  <input type="number" min={1} max={20} value={newSkillMaxRepeatAttacks} onChange={(e) => setNewSkillMaxRepeatAttacks(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none" />
                </label>
              </div>

              <section className="rounded-2xl border border-amber-500/25 bg-amber-950/15 p-4 space-y-2.5">
                <div className="flex items-center gap-2"><Crown className="w-4 h-4 text-amber-300" /><h4 className="text-sm font-black text-amber-100">ผลพิเศษเมื่อทะลุ Lv.10</h4></div>
                <p className="text-[11px] text-amber-100/60">เขียนความสามารถพิเศษที่จะปลดล็อกเมื่ออัปเกรดสกิลถึงเลเวล 10</p>
                <input
                  type="text"
                  value={newSkillPerk10}
                  onChange={(e) => setNewSkillPerk10(e.target.value)}
                  placeholder="เช่น ดาเมจรุนแรงขึ้นสองเท่าและฟื้นฟู HP ให้ทีม..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-amber-200 focus:border-amber-400 outline-none"
                />
              </section>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-slate-500 font-mono"><Sparkles className="w-3.5 h-3.5 text-cyan-300" />ตัวอย่างบนการ์ดสกิล</div>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-sm font-black text-white truncate">{newSkillName || 'ชื่อสกิลใหม่'}</div><div className="text-[11px] text-cyan-300 mt-0.5">{newSkillType || 'วิชาทั่วไป'} • Lv.1</div></div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-400/25 text-amber-200 shrink-0">{newSkillORVRank}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed line-clamp-2">{newSkillDesc || 'คำอธิบายสกิลจะแสดงตรงนี้ เพื่อให้ผู้เล่นเข้าใจผลลัพธ์ได้ในทันที'}</p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowAddSkillModal(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white cursor-pointer font-semibold rounded-xl hover:bg-slate-800/80"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 rounded-xl shadow-[0_0_18px_rgba(6,182,212,0.4)] cursor-pointer"
                >
                  บันทึกสกิลเข้าสู่สารบบ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Player Customize Own Stats */}
      {showStatEditModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-lg w-full shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[90vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-900/40 bg-slate-900/80 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                ปรับแต่งสเตตัสและพลังชีวิต (Adjust Stats & HP)
              </h3>
              <button
                onClick={() => setShowStatEditModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ปิด
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950 border border-rose-900/50">
                  <label className="text-rose-400 font-bold block mb-1">HP ปัจจุบัน</label>
                  <input
                    type="number"
                    value={tempHp}
                    onChange={(e) => setTempHp(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-sm outline-none focus:border-rose-500"
                  />
                </div>
                <div className="p-3 rounded-2xl bg-slate-950 border border-rose-900/50">
                  <label className="text-rose-400 font-bold block mb-1">HP สูงสุด (Max HP)</label>
                  <input
                    type="number"
                    value={tempMaxHp}
                    onChange={(e) => setTempMaxHp(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-sm outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-slate-400 text-[11px] font-bold block mb-1">พละกำลัง</label>
                  <input
                    type="number"
                    value={tempStats.strength}
                    onChange={(e) => setTempStats({ ...tempStats, strength: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-slate-400 text-[11px] font-bold block mb-1">ความทนทาน</label>
                  <input
                    type="number"
                    value={tempStats.durability}
                    onChange={(e) => setTempStats({ ...tempStats, durability: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-slate-400 text-[11px] font-bold block mb-1">ความว่องไว</label>
                  <input
                    type="number"
                    value={tempStats.agility}
                    onChange={(e) => setTempStats({ ...tempStats, agility: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <label className="text-slate-400 text-[11px] font-bold block mb-1">พลังเวท</label>
                  <input
                    type="number"
                    value={tempStats.magic}
                    onChange={(e) => setTempStats({ ...tempStats, magic: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">สถานะบัฟพิเศษ (Status Buffs)</label>
                <input
                  type="text"
                  value={tempBuffs}
                  onChange={(e) => setTempBuffs(e.target.value)}
                  placeholder="เช่น บัฟสายลมศักดิ์สิทธิ์ (Stack) - ความเร็วพุ่งทะยาน +15%..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">คุณลักษณะตัวละคร</label>
                <div className="min-h-10 p-2 rounded-xl bg-slate-950 border border-slate-700 flex flex-wrap gap-1.5 items-center">
                  {tempCharacteristics.map((characteristic, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-950/70 text-cyan-200 border border-cyan-700/60 text-xs font-semibold"
                    >
                      {characteristic}
                      <button
                        type="button"
                        onClick={() => handleRemoveCharacteristic(index)}
                        className="text-cyan-400 hover:text-rose-300 cursor-pointer"
                        aria-label="ลบคุณลักษณะ"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {tempCharacteristics.length === 0 && (
                    <span className="text-slate-500 text-xs">ยังไม่มีคุณลักษณะ</span>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    id="input-new-characteristic"
                    type="text"
                    value={newCharacteristic}
                    onChange={(e) => setNewCharacteristic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCharacteristic();
                      }
                    }}
                    placeholder="เช่น ผู้ดูดาราเริ่มต้น"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCharacteristic}
                    className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่ม
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStatEditModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveStats}
                  className="px-5 py-2 font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer"
                >
                  {isSavingStats ? 'กำลังบันทึก...' : 'บันทึกสเตตัส'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
