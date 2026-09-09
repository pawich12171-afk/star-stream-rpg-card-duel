import React, { useState } from 'react';
import { CharacterProfile, GachaReward, GachaConfig, Skill, InventoryItem } from '../types';
import { 
  Sparkles, 
  Coins, 
  Gift, 
  Trophy, 
  CheckCircle2, 
  Package, 
  Star
} from 'lucide-react';
import confetti from '../utils/confetti';

interface GachaSystemProps {
  character: CharacterProfile;
  gachaRewards: GachaReward[];
  gachaConfig: GachaConfig;
  onUpdateCharacter: (updated: CharacterProfile) => void;
}

export const GachaSystem: React.FC<GachaSystemProps> = ({
  character,
  gachaRewards,
  gachaConfig,
  onUpdateCharacter,
}) => {
  const [isPulling, setIsPulling] = useState(false);
  const [pullResults, setPullResults] = useState<GachaReward[] | null>(null);
  const [filterRarity, setFilterRarity] = useState<string>('all');

  const pullCost = gachaConfig?.pullCost || 500;
  const tenPullCost = gachaConfig?.tenPullCost || 4500;

  // Helper to pick a random reward based on rate %
  const pickRandomReward = (rewardsList: GachaReward[]): GachaReward => {
    if (rewardsList.length === 0) {
      return {
        id: 'fallback',
        name: 'เหรียญปลอบใจ 100 Coins',
        type: 'coin',
        rate: 100,
        rarity: 'common',
        description: 'เหรียญปลอบใจ',
        coinAmount: 100,
      };
    }
    const totalWeight = rewardsList.reduce((sum, r) => sum + (r.rate || 1), 0);
    let randomNum = Math.random() * totalWeight;
    for (const reward of rewardsList) {
      if (randomNum < (reward.rate || 1)) {
        return reward;
      }
      randomNum -= (reward.rate || 1);
    }
    return rewardsList[rewardsList.length - 1];
  };

  // Perform Gacha Pull
  const handlePull = (count: number) => {
    const cost = count === 1 ? pullCost : tenPullCost;
    if (character.coins < cost) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${cost.toLocaleString()} C แต่คุณมี ${character.coins.toLocaleString()} C`);
      return;
    }
    if (gachaRewards.length === 0) {
      alert('ขณะนี้ไม่มีรายการของรางวัลในตู้กาชา');
      return;
    }

    setIsPulling(true);
    setPullResults(null);

    setTimeout(() => {
      const results: GachaReward[] = [];
      let totalCoinReward = 0;
      const newItemsToAdd: InventoryItem[] = [];
      const newSkillsToAdd: Skill[] = [];
      const newCharacteristicsToAdd: string[] = [];

      for (let i = 0; i < count; i++) {
        const reward = pickRandomReward(gachaRewards);
        results.push(reward);

        if (reward.type === 'coin' && reward.coinAmount) {
          totalCoinReward += reward.coinAmount;
        } else if (reward.type === 'item' && reward.itemData) {
          newItemsToAdd.push({
            ...reward.itemData,
            quantity: 1,
            instanceId: `inv-gacha-${Date.now()}-${i}`,
            isEquipped: false,
          });
        } else if (reward.type === 'skill') {
          // Older/admin-created skill rewards may not have skillData.
          // Build a valid skill from the reward itself so the pull is never lost.
          const fallbackRank: Skill['orvRank'] =
            reward.rarity === 'mythic' ? 'myth' :
            reward.rarity === 'legendary' ? 'legendary' :
            reward.rarity === 'epic' ? 'hero' :
            reward.rarity === 'rare' ? 'rare' : 'general';
          const skillReward: Skill = reward.skillData || {
            id: reward.id,
            name: reward.name.replace(/^สกิล:\s*/i, ''),
            level: 1,
            multiplier: 1,
            type: 'วิชาจากกาชา',
            description: reward.description || 'สกิลที่ได้รับจากตู้กาชา',
            category: 'general',
            orvRank: fallbackRank,
            battleEffect: /สะท้อน|reflect/i.test(`${reward.name} ${reward.description}`) ? 'reflect' : /ฟื้น|รักษา|heal/i.test(`${reward.name} ${reward.description}`) ? 'heal' : /ป้องกัน|เกราะ|โล่|shield/i.test(`${reward.name} ${reward.description}`) ? 'defense' : 'damage',
            battlePower: 5,
            cooldownTurns: 0,
          };
          newSkillsToAdd.push({
            ...skillReward,
            id: `skill-gacha-${Date.now()}-${i}`,
            upgradeCount: 0,
          });
        } else if (reward.type === 'characteristic' && reward.characteristic?.trim()) {
          newCharacteristicsToAdd.push(reward.characteristic.trim());
        }
      }

      const netCoinChange = totalCoinReward - cost;
      const updatedCoins = Math.max(0, character.coins + netCoinChange);

      const existingInventory = [...(character.inventory || [])];
      newItemsToAdd.forEach(newItem => {
        const existingIdx = existingInventory.findIndex(
          inv => inv.id === newItem.id && !inv.isEquipped && newItem.category === 'consumable'
        );
        if (existingIdx >= 0) {
          existingInventory[existingIdx].quantity += 1;
        } else {
          existingInventory.push(newItem);
        }
      });

      const existingSkills = [...(character.skills || [])];
      newSkillsToAdd.forEach(newSkill => {
        const existingSkill = existingSkills.find(s => s.name === newSkill.name);
        if (existingSkill) {
          existingSkill.level = Math.min(10, existingSkill.level + 1);
          existingSkill.battleEffect = newSkill.battleEffect ?? existingSkill.battleEffect;
          existingSkill.battlePower = newSkill.battlePower ?? existingSkill.battlePower;
          existingSkill.cooldownTurns = newSkill.cooldownTurns ?? existingSkill.cooldownTurns;
          existingSkill.cooldown = newSkill.cooldown ?? existingSkill.cooldown;
        } else {
          existingSkills.push(newSkill);
        }
      });

      const existingCharacteristics = [...(character.characteristics || [])];
      newCharacteristicsToAdd.forEach(newCharacteristic => {
        const alreadyHasCharacteristic = existingCharacteristics.some(
          characteristic => characteristic.trim().toLowerCase() === newCharacteristic.toLowerCase()
        );
        if (!alreadyHasCharacteristic) {
          existingCharacteristics.push(newCharacteristic);
        }
      });
      const updatedNotifications = [
        {
          id: `notif-gacha-${Date.now()}`,
          title: `สุ่มกาชาสำเร็จ (${count} ครั้ง)`,
          message: `ได้รับรางวัล: ${results.map(r => r.name).slice(0, 3).join(', ')}${results.length > 3 ? ` และอื่นๆ อีก ${results.length - 3} รายการ` : ''}`,
          timestamp: Date.now(),
          read: false,
          type: 'gacha' as const,
        },
        ...(character.notifications || []),
      ];

      onUpdateCharacter({
        ...character,
        coins: updatedCoins,
        inventory: existingInventory,
        skills: existingSkills,
        characteristics: existingCharacteristics,
        notifications: updatedNotifications,
      });

      setPullResults(results);
      setIsPulling(false);

      const hasHighTier = results.some(r => r.rarity === 'mythic' || r.rarity === 'legendary');
      if (hasHighTier) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
        });
      }
    }, 1200);
  };

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'mythic':
        return 'bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white border-amber-300 font-black shadow-[0_0_15px_rgba(245,158,11,0.6)]';
      case 'legendary':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold';
      case 'epic':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/60 font-bold';
      case 'rare':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-bold';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const filteredRewards = filterRarity === 'all' 
    ? gachaRewards 
    : gachaRewards.filter(r => r.rarity === filterRarity);

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 p-6 md:p-8 border border-purple-500/40 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-widest flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                STAR STREAM SUMMONING SYSTEM
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              {gachaConfig?.bannerTitle || "หีบสมบัติจักรวาลแห่งดวงดาว"}
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-xl leading-relaxed">
              {gachaConfig?.bannerDescription || "สุ่มรับเหรียญรางวัลมหาศาล สกิลพิเศษระดับตำนาน และไอเทมสเตตัสหายาก"}
            </p>
          </div>

          {/* Player Balance Card */}
          <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 flex items-center gap-4 shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">เหรียญของคุณ</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-amber-300">
                  {character.coins.toLocaleString()}
                </span>
                <span className="text-xs text-amber-500/80 font-mono">Coins</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summon Buttons Area */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            id="btn-gacha-single"
            onClick={() => handlePull(1)}
            disabled={isPulling || character.coins < pullCost}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>สุ่ม 1 ครั้ง ({pullCost.toLocaleString()} C)</span>
          </button>
          <button
            id="btn-gacha-ten"
            onClick={() => handlePull(10)}
            disabled={isPulling || character.coins < tenPullCost}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm shadow-[0_0_25px_rgba(245,158,11,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Gift className="w-4 h-4 text-slate-950" />
            <span>สุ่ม 10 ครั้ง ({tenPullCost.toLocaleString()} C)</span>
            <span className="text-[10px] bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded font-bold ml-1">
              ประหยัด {((pullCost * 10) - tenPullCost).toLocaleString()} C
            </span>
          </button>
        </div>
      </div>

      {/* Pulling Animation Overlay */}
      {isPulling && (
        <div className="bg-slate-900/95 border border-purple-500/60 rounded-3xl p-12 text-center shadow-2xl space-y-4 animate-pulse">
          <div className="w-20 h-20 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mx-auto flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-widest uppercase">
            [กลุ่มดาวกำลังจับตามองการเปิดหีบ...]
          </h3>
          <p className="text-xs text-slate-400">
            ระบบกำลังคำนวณและสุ่มรางวัลแห่งโชคชะตา
          </p>
        </div>
      )}

      {/* Results Section */}
      {pullResults && (
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              ผลการสุ่มกาชา ({pullResults.length} ชิ้น)
            </h3>
            <button
              onClick={() => setPullResults(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ปิดหน้าต่างผลลัพธ์
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {pullResults.map((reward, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border flex flex-col justify-between space-y-2 transition-all ${
                  reward.rarity === 'mythic'
                    ? 'bg-gradient-to-b from-amber-950/70 to-slate-900 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                    : reward.rarity === 'legendary'
                    ? 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-500/60 shadow'
                    : reward.rarity === 'epic'
                    ? 'bg-gradient-to-b from-purple-950/40 to-slate-900 border-purple-500/60 shadow'
                    : 'bg-slate-850/80 border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${getRarityBadge(reward.rarity)}`}>
                      {reward.rarity}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {reward.type === 'coin' ? 'เหรียญ' : reward.type === 'skill' ? 'สกิล' : reward.type === 'characteristic' ? 'คุณลักษณะ' : 'ไอเทม'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    {reward.name}
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed line-clamp-2">
                    {reward.description}
                  </p>
                  {reward.type === 'characteristic' && reward.characteristic && (
                    <p className="text-[11px] text-cyan-300 mt-1 font-semibold">
                      + {reward.characteristic}
                    </p>
                  )}
                </div>
                <div className="pt-2 border-t border-slate-800 text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  เพิ่มเข้าสู่ตัวละครแล้ว
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rewards Pool Rate Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              รายการของรางวัลและเรทออก (Drop Rate Pool)
            </h3>
            <p className="text-xs text-slate-400">
              Admin สามารถปรับแก้ของรางวัลและเปอร์เซ็นต์เรทออกได้ที่แท็บ Admin
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['all', 'mythic', 'legendary', 'epic', 'rare', 'common'].map(rarity => (
              <button
                key={rarity}
                onClick={() => setFilterRarity(rarity)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                  filterRarity === rarity
                    ? 'bg-cyan-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRewards.map((reward) => (
            <div
              key={reward.id}
              className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/80 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase ${getRarityBadge(reward.rarity)}`}>
                    {reward.rarity}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {reward.type === 'coin' ? 'เหรียญ' : reward.type === 'skill' ? 'สกิล' : 'ไอเทม'}
                  </span>
                </div>
                <div className="text-xs font-bold text-white truncate">{reward.name}</div>
                <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                  {reward.description}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-black text-amber-300">
                  {reward.rate}%
                </span>
                <span className="text-[9px] text-slate-500 block">เรทออก</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
