import React from 'react';
import { CharacterProfile, InventoryItem, Item, Quest } from '../types';
import { CheckCircle2, Circle, Coins, Gift, ScrollText, Sparkles } from 'lucide-react';

interface QuestBoardProps {
  character: CharacterProfile;
  shopItems: Item[];
  onUpdateCharacter: (updated: CharacterProfile) => void | Promise<boolean>;
}

export const QuestBoard: React.FC<QuestBoardProps> = ({ character, shopItems, onUpdateCharacter }) => {
  const quests = [...(character.quests || [])].sort((a, b) => b.createdAt - a.createdAt);

  const handleClaimQuest = (quest: Quest) => {
    const isComplete = quest.isCompleted || quest.currentCount >= quest.targetCount;
    if (!isComplete || quest.isClaimed) return;

    const rewardItem = quest.rewardItemName
      ? shopItems.find(item => item.name === quest.rewardItemName)
      : undefined;
    const rewardItemInstance: InventoryItem | undefined = rewardItem
      ? {
          ...rewardItem,
          instanceId: 'quest-' + quest.id + '-' + Date.now(),
          quantity: 1,
          isEquipped: false,
        }
      : undefined;
    const rewardMessage = [
      quest.rewardCoins > 0 ? quest.rewardCoins.toLocaleString() + ' Coins' : '',
      rewardItem?.name || (quest.rewardItemName ? quest.rewardItemName + ' (ไม่พบในร้านค้า)' : ''),
    ].filter(Boolean).join(' และ ') || 'รางวัลพิเศษ';

    const updatedQuest = { ...quest, isCompleted: true, isClaimed: true };
    const updatedQuests = (character.quests || []).map(item => item.id === quest.id ? updatedQuest : item);
    const updatedInventory = rewardItemInstance
      ? [...(character.inventory || []), rewardItemInstance]
      : character.inventory;

    onUpdateCharacter({
      ...character,
      coins: character.coins + Math.max(0, quest.rewardCoins || 0),
      inventory: updatedInventory,
      quests: updatedQuests,
      notifications: [
        {
          id: 'notif-quest-claimed-' + Date.now(),
          title: 'รับรางวัลภารกิจสำเร็จ',
          message: 'คุณได้รับ ' + rewardMessage + ' จากภารกิจ “' + quest.title + '”',
          timestamp: Date.now(),
          read: false,
          type: 'quest',
        },
        ...(character.notifications || []),
      ],
      lastUpdated: Date.now(),
    });
  };

  return (
    <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-400" />
            ภารกิจดวงดาว ({quests.length})
          </h2>
          <p className="text-xs text-slate-400 mt-1">ภารกิจที่ได้รับมอบหมายจากแอดมินและรางวัลที่รอปลดล็อก</p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 font-bold">
          ภารกิจที่ยังไม่รับรางวัล: {quests.filter(quest => !quest.isClaimed).length}
        </div>
      </div>

      {quests.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-500 text-xs">
          <ScrollText className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          ยังไม่มีภารกิจที่ได้รับมอบหมาย
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {quests.map(quest => {
            const target = Math.max(1, quest.targetCount || 1);
            const current = Math.min(target, Math.max(0, quest.currentCount || 0));
            const progress = Math.round((current / target) * 100);
            const isComplete = quest.isCompleted || current >= target;
            return (
              <div key={quest.id} className="rounded-2xl bg-slate-950/60 border border-slate-800 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      {quest.isClaimed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : isComplete ? <Gift className="w-5 h-5 text-amber-300" /> : <Circle className="w-5 h-5 text-slate-500" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">{quest.title}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{quest.description}</p>
                    </div>
                  </div>
                  <span className={'text-[10px] px-2 py-1 rounded-full font-bold border ' + (quest.isClaimed ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : isComplete ? 'text-amber-200 bg-amber-500/10 border-amber-500/30' : 'text-slate-400 bg-slate-800 border-slate-700')}>
                    {quest.isClaimed ? 'รับรางวัลแล้ว' : isComplete ? 'สำเร็จแล้ว' : 'กำลังทำ'}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1.5">
                    <span className="text-slate-400">ความคืบหน้า</span>
                    <span className="text-cyan-300">{current} / {target} ({progress}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all" style={{ width: progress + '%' }} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-200 border border-amber-500/20">
                    <Coins className="w-3.5 h-3.5" /> {Math.max(0, quest.rewardCoins || 0).toLocaleString()} Coins
                  </span>
                  {quest.rewardItemName && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 text-purple-200 border border-purple-500/20">
                      <Sparkles className="w-3.5 h-3.5" /> {quest.rewardItemName}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!isComplete || quest.isClaimed}
                  onClick={() => handleClaimQuest(quest)}
                  className="w-full py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  {quest.isClaimed ? 'รับรางวัลเรียบร้อยแล้ว' : isComplete ? 'รับรางวัลภารกิจ' : 'ทำภารกิจให้ครบก่อนรับรางวัล'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
