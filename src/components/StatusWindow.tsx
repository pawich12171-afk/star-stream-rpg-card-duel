import React, { useState } from 'react';
import { CharacterProfile, Skill, ORVSkillRank } from '../types';
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
  COMPOUND_RATE
} from '../utils/orvSkillSystem';

interface StatusWindowProps {
  character: CharacterProfile;
  onUpdateCharacter: (updated: CharacterProfile) => void;
  onOpenTransfer: () => void;
  onOpenProfileCustomizer?: () => void;
  onOpenCharacterSelect?: () => void;
  isAdmin: boolean;
}

export const StatusWindow: React.FC<StatusWindowProps> = ({
  character,
  onUpdateCharacter,
  onOpenTransfer,
  onOpenProfileCustomizer,
  onOpenCharacterSelect,
  isAdmin,
}) => {
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillType, setNewSkillType] = useState('วิชาทั่วไป');
  const [newSkillCategory, setNewSkillCategory] = useState<'general' | 'innate' | 'stigma' | 'story'>('general');
  const [newSkillORVRank, setNewSkillORVRank] = useState<ORVSkillRank>('rare');
  const [newSkillPerk10, setNewSkillPerk10] = useState('');
  const [newSkillBattleEffect, setNewSkillBattleEffect] = useState<NonNullable<Skill['battleEffect']>>('damage');
  const [newSkillBattlePower, setNewSkillBattlePower] = useState(5);
  const [newSkillCooldownTurns, setNewSkillCooldownTurns] = useState(3);

  const [showHpBreakdown, setShowHpBreakdown] = useState(false);
  const [showStatEditModal, setShowStatEditModal] = useState(false);
  const [tempStats, setTempStats] = useState({ ...character.stats });
  const [tempHp, setTempHp] = useState(character.hp);
  const [tempMaxHp, setTempMaxHp] = useState(character.maxHp);
  const [tempBuffs, setTempBuffs] = useState(character.statusBuffs || '');
  const [tempCharacteristics, setTempCharacteristics] = useState<string[]>(character.characteristics || []);
  const [newCharacteristic, setNewCharacteristic] = useState('');

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
  const nextStatUpgradeCost = Math.round(currentStatUpgradeCost * COMPOUND_RATE);

  const handleUpgradeTranscendenceStat = (statName: 'strength' | 'durability' | 'agility' | 'magic') => {
    if (!isAllStats100) {
      alert('ต้องมีสเตตัสครบ 100 ทุกค่าก่อนจึงจะปลดล็อกการอัปเกรดทะลุขีดจำกัด!');
      return;
    }
    if (character.coins < currentStatUpgradeCost) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${currentStatUpgradeCost.toLocaleString()} Coins (คุณมี ${character.coins.toLocaleString()} Coins)`);
      return;
    }

    const nextTimes = currentStatUpgradeTimes + 1;
    const newStats = {
      ...character.stats,
      [statName]: character.stats[statName] + 1,
    };

    const updatedChar: CharacterProfile = {
      ...character,
      coins: character.coins - currentStatUpgradeCost,
      stats: newStats,
      statUpgradeCount: nextTimes,
      notifications: [
        {
          id: `notif-stat-up-${Date.now()}`,
          title: 'อัปเกรดสเตตัสทะลุขีดจำกัดสำเร็จ!',
          message: `เพิ่มค่า ${statName} +1 (ปัจจุบัน Lv.${newStats[statName]}) ใช้เหรียญ ${currentStatUpgradeCost.toLocaleString()} Coins (ครั้งต่อไป +20% เป็น ${nextStatUpgradeCost.toLocaleString()} C)`,
          timestamp: Date.now(),
          read: false,
          type: 'system',
        },
        ...(character.notifications || []),
      ],
    };

    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.5 }
    });

    onUpdateCharacter(syncCharacterHealth(updatedChar));
  };

  const handleUpgradeSkill = (skillId: string) => {
    const targetSkill = character.skills.find(s => s.id === skillId);
    if (!targetSkill) return;

    const cost = calculateSkillUpgradeCost(targetSkill);
    if (character.coins < cost) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${cost.toLocaleString()} Coins (คุณมี ${character.coins.toLocaleString()} Coins)`);
      return;
    }

    const oldHpBonus = getSkillHpBonus(targetSkill);
    let triggeredAscension = false;
    let ascensionMultiplier = 1;
    let newLevelReached = 1;

    const updatedSkills = character.skills.map(skill => {
      if (skill.id === skillId) {
        let newLevel = skill.level + 1;
        let newMultiplier = skill.multiplier || 1;
        const upgradeCount = (skill.upgradeCount ?? (skill.level - 1)) + 1;

        if (newLevel > 10) {
          newMultiplier = newMultiplier * 2;
          newLevel = 1;
          triggeredAscension = true;
          ascensionMultiplier = newMultiplier;
        }
        newLevelReached = newLevel;

        return {
          ...skill,
          level: newLevel,
          multiplier: newMultiplier,
          upgradeCount,
        };
      }
      return skill;
    });

    const newCoins = character.coins - cost;
    const targetUpdated = updatedSkills.find(s => s.id === skillId)!;
    const newHpBonus = getSkillHpBonus(targetUpdated);
    const hpDiff = newHpBonus - oldHpBonus;

    if (triggeredAscension) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 }
      });
    }

    const hpDetails = hpDiff > 0
      ? ` • บัฟเลือดเพิ่มขึ้น: +${oldHpBonus} ➔ +${newHpBonus} HP (+${hpDiff} HP)`
      : (newHpBonus > 0 ? ` • มอบบัฟเลือด +${newHpBonus} HP` : '');

    const notifMessage = triggeredAscension
      ? `สกิล "${targetSkill.name}" จุติสวรรค์! ตัวคูณเพิ่มเป็น ${ascensionMultiplier}X ความสามารถเพิ่มขึ้นทวีคูณ และรีเซ็ตสู่รอบถัดไป Lv.1 (ใช้เหรียญ ${cost.toLocaleString()} C)`
      : `อัปเกรดสกิล "${targetSkill.name}" สู่ Lv.${newLevelReached} สำเร็จ! ความสามารถ +10% (รวม +${(newLevelReached - 1) * 10}%)${hpDetails} (ใช้เหรียญ ${cost.toLocaleString()} Coins)`;

    const updatedChar: CharacterProfile = {
      ...character,
      coins: newCoins,
      skills: updatedSkills,
      notifications: [
        {
          id: `notif-skill-up-${Date.now()}`,
          title: triggeredAscension ? 'สกิลจุติสวรรค์ (Ascension)!' : 'อัปเกรดสกิลสำเร็จ (+10% ความสามารถ)',
          message: notifMessage,
          timestamp: Date.now(),
          read: false,
          type: 'system',
        },
        ...(character.notifications || []),
      ],
    };

    onUpdateCharacter(syncCharacterHealth(updatedChar));
  };

  const handleDeleteSkill = (skillId: string) => {
    if (confirm('คุณต้องการลบสกิลนี้ใช่หรือไม่?')) {
      onUpdateCharacter({
        ...character,
        skills: character.skills.filter(s => s.id !== skillId),
      });
    }
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
      battlePower: Math.max(1, Number(newSkillBattlePower) || 1),
      cooldownTurns: Math.max(0, Math.min(99, Number(newSkillCooldownTurns) || 0)),
      cooldown: Number(newSkillCooldownTurns) > 0 ? `${newSkillCooldownTurns} เทิร์น` : undefined,
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
    setShowAddSkillModal(false);
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

  const handleSaveStats = () => {
    const updated = {
      ...character,
      stats: tempStats,
      hp: tempHp,
      maxHp: tempMaxHp,
      statusBuffs: tempBuffs,
      characteristics: tempCharacteristics,
    };
    onUpdateCharacter(syncCharacterHealth(updated));
    setShowStatEditModal(false);
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
                +20% รอบถัดไป ({nextStatUpgradeCost.toLocaleString()} C)
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
                    <button
                      type="button"
                      onClick={() => handleUpgradeTranscendenceStat(statKey)}
                      disabled={character.coins < currentStatUpgradeCost}
                      className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${
                        character.coins >= currentStatUpgradeCost
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>อัปเกรด (+1)</span>
                    </button>
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
                      id={`btn-upgrade-skill-${skill.id}`}
                      onClick={() => handleUpgradeSkill(skill.id)}
                      disabled={!canAfford}
                      className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                        canAfford
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      {skill.level >= 10 ? 'จุติสวรรค์ (x2)' : `อัปเกรด (+10%) • ${upgradePreview.cost.toLocaleString()} C`}
                    </button>
                    <button
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

      {/* MODAL: Add Skill */}
      {showAddSkillModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-md w-full shadow-[0_0_40px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[90vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-900/40 bg-slate-900/80 flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                จดจำและสร้างสกิลใหม่ (Create Skill)
              </h3>
              <button
                onClick={() => setShowAddSkillModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-4 h-4 hidden" />
                ปิด
              </button>
            </div>

            <form onSubmit={handleAddCustomSkill} className="p-5 space-y-3.5 text-xs overflow-y-auto">
              <div>
                <label className="text-slate-300 font-bold block mb-1">ชื่อสกิล / วิชา *</label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="เช่น ม่านหมอกสายลมหยก, ปราณเพลิงสะบั้นดารา..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">ระดับขั้น ORV Rank</label>
                  <select
                    value={newSkillORVRank}
                    onChange={(e) => setNewSkillORVRank(e.target.value as ORVSkillRank)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-bold outline-none cursor-pointer"
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
                  <label className="text-slate-300 font-bold block mb-1">หมวดหมู่วิชา</label>
                  <select
                    value={newSkillCategory}
                    onChange={(e) => setNewSkillCategory(e.target.value as any)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none cursor-pointer"
                  >
                    <option value="general">วิชาทั่วไป</option>
                    <option value="innate">วิชาติดตัว (Innate)</option>
                    <option value="stigma">สติกม่า (Stigma)</option>
                    <option value="story">เรื่องเล่า (Story)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">คำอธิบายและผลลัพธ์</label>
                <textarea
                  rows={2}
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="เขียนบรรยายผลของสกิล ดาเมจ หรือเกราะป้องกัน..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-cyan-500 outline-none resize-none"
                />
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3 space-y-2">
                <label className="text-cyan-200 font-bold block mb-1">หมวดหมู่ผลต่อสู้จริง</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={newSkillBattleEffect} onChange={(e) => setNewSkillBattleEffect(e.target.value as NonNullable<Skill['battleEffect']>)} className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold outline-none cursor-pointer">
                    <option value="damage">โจมตี / ดาเมจ</option>
                    <option value="heal">ฟื้นฟู HP</option>
                    <option value="defense">โล่ / ป้องกัน</option>
                    <option value="reflect">สะท้อนดาเมจ</option>
                    <option value="stun">ควบคุม / สตัน</option>
                  </select>
                  <input type="number" min={1} value={newSkillBattlePower} onChange={(e) => setNewSkillBattlePower(Number(e.target.value))} placeholder="พลังเอฟเฟกต์" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none" />
                  <input type="number" min={0} max={99} value={newSkillCooldownTurns} onChange={(e) => setNewSkillCooldownTurns(Number(e.target.value))} placeholder="คูลดาวน์ (เทิร์น)" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none" />
                </div>
                <p className="text-[10px] leading-4 text-slate-400">เลือกผลต่อสู้ที่ต้องการให้สกิลทำงานจริงในสนามรบ</p>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">ผลพิเศษเมื่อทะลุ Lv.10 (Perk Level 10)</label>
                <input
                  type="text"
                  value={newSkillPerk10}
                  onChange={(e) => setNewSkillPerk10(e.target.value)}
                  placeholder="เช่น ดาเมจรุนแรงขึ้นสองเท่าและฟื้นเลือด..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 text-xs focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddSkillModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer"
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
                  บันทึกสเตตัส
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
