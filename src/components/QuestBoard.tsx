import React, { useState } from 'react';
import { CharacterProfile, InventoryItem, Item, Quest } from '../types';
import { CheckCircle2, Circle, Coins, Gift, ImagePlus, Loader2, ScrollText, Send, Sparkles } from 'lucide-react';

interface QuestBoardProps {
  character: CharacterProfile;
  shopItems: Item[];
  onUpdateCharacter: (updated: CharacterProfile) => void | Promise<boolean>;
}

const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
    image.onload = () => {
      const maxSize = 900;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('เตรียมรูปไม่สำเร็จ'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});

export const QuestBoard: React.FC<QuestBoardProps> = ({ character, shopItems, onUpdateCharacter }) => {
  const quests = [...(character.quests || [])].sort((a, b) => b.createdAt - a.createdAt);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [proofNotes, setProofNotes] = useState<Record<string, string>>({});
  const [busyQuestId, setBusyQuestId] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<Record<string, string>>({});

  const saveQuest = (quest: Quest, notification?: { title: string; message: string }) => {
    const updatedQuests = (character.quests || []).map(item => item.id === quest.id ? quest : item);
    onUpdateCharacter({
      ...character,
      quests: updatedQuests,
      notifications: notification ? [
        {
          id: 'notif-quest-' + Date.now(),
          title: notification.title,
          message: notification.message,
          timestamp: Date.now(),
          read: false,
          type: 'quest',
        },
        ...(character.notifications || []),
      ] : character.notifications,
      lastUpdated: Date.now(),
    });
  };

  const handleSubmitAnswer = (quest: Quest) => {
    const submitted = (answers[quest.id] || '').trim();
    const expected = (quest.answer || '').trim();
    if (!submitted) {
      setAnswerFeedback(prev => ({ ...prev, [quest.id]: 'กรุณาพิมพ์คำตอบก่อนส่ง' }));
      return;
    }
    if (!expected || submitted.toLocaleLowerCase() !== expected.toLocaleLowerCase()) {
      setAnswerFeedback(prev => ({ ...prev, [quest.id]: 'คำตอบยังไม่ถูกต้อง ลองใหม่ได้ครับ' }));
      return;
    }
    setAnswerFeedback(prev => ({ ...prev, [quest.id]: 'ตอบถูกต้อง ภารกิจสำเร็จแล้ว' }));
    saveQuest({ ...quest, currentCount: quest.targetCount, isCompleted: true, reviewStatus: 'approved' }, {
      title: 'ตอบคำถามภารกิจถูกต้อง',
      message: 'ภารกิจ “' + quest.title + '” สำเร็จแล้ว กดรับรางวัลได้เลย',
    });
  };

  const handleProofUpload = async (quest: Quest, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || quest.reviewStatus === 'pending' || quest.isCompleted) return;
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    setBusyQuestId(quest.id);
    try {
      const proofDataUrl = await compressImage(file);
      const target = Math.max(1, quest.targetCount || 1);
      const nextCount = Math.min(target, Math.max(0, quest.currentCount || 0) + 1);
      saveQuest({
        ...quest,
        currentCount: nextCount,
        proofDataUrl,
        proofNote: (proofNotes[quest.id] || '').trim() || undefined,
        proofSubmittedAt: Date.now(),
        reviewStatus: 'pending',
        isCompleted: false,
      }, {
        title: 'ส่งหลักฐานภารกิจแล้ว',
        message: 'หลักฐานของภารกิจ “' + quest.title + '” ถูกส่งให้แอดมินตรวจสอบแล้ว',
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'เตรียมรูปไม่สำเร็จ');
    } finally {
      setBusyQuestId(null);
    }
  };

  const handleClaimQuest = (quest: Quest) => {
    if (!quest.isCompleted || quest.isClaimed) return;
    const rewardItem = quest.rewardItemName ? shopItems.find(item => item.name === quest.rewardItemName) : undefined;
    const rewardItemInstance: InventoryItem | undefined = rewardItem ? {
      ...rewardItem,
      instanceId: 'quest-' + quest.id + '-' + Date.now(),
      quantity: 1,
      isEquipped: false,
    } : undefined;
    const rewardMessage = [
      quest.rewardCoins > 0 ? quest.rewardCoins.toLocaleString() + ' Coins' : '',
      rewardItem?.name || (quest.rewardItemName ? quest.rewardItemName + ' (ไม่พบในร้านค้า)' : ''),
    ].filter(Boolean).join(' และ ') || 'รางวัลพิเศษ';
    onUpdateCharacter({
      ...character,
      coins: character.coins + Math.max(0, quest.rewardCoins || 0),
      inventory: rewardItemInstance ? [...(character.inventory || []), rewardItemInstance] : character.inventory,
      quests: (character.quests || []).map(item => item.id === quest.id ? { ...quest, isClaimed: true } : item),
      notifications: [
        {
          id: 'notif-quest-reward-' + Date.now(),
          title: 'ได้รับรางวัลภารกิจ',
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
          <h2 className="text-xl font-black text-white flex items-center gap-2"><ScrollText className="w-5 h-5 text-amber-400" />ภารกิจดวงดาว ({quests.length})</h2>
          <p className="text-xs text-slate-400 mt-1">ทำภารกิจ ตอบคำถาม หรือส่งรูปหลักฐานให้แอดมินตรวจสอบ</p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 font-bold">ภารกิจที่ยังไม่รับรางวัล: {quests.filter(quest => !quest.isClaimed).length}</div>
      </div>

      {quests.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-500 text-xs"><ScrollText className="w-10 h-10 mx-auto text-slate-600 mb-2" />ยังไม่มีภารกิจที่ได้รับมอบหมาย</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {quests.map(quest => {
            const target = Math.max(1, quest.targetCount || 1);
            const current = Math.min(target, Math.max(0, quest.currentCount || 0));
            const progress = Math.round((current / target) * 100);
            const kind = quest.kind || 'progress';
            const isPending = quest.reviewStatus === 'pending';
            return (
              <div key={quest.id} className="rounded-2xl bg-slate-950/60 border border-slate-800 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">{quest.isClaimed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : quest.isCompleted ? <Gift className="w-5 h-5 text-amber-300" /> : <Circle className="w-5 h-5 text-slate-500" />}</div>
                    <div><h3 className="text-sm font-black text-white">{quest.title}</h3><p className="text-xs text-slate-400 mt-1 leading-relaxed">{quest.description}</p></div>
                  </div>
                  <span className={'text-[10px] px-2 py-1 rounded-full font-bold border ' + (quest.isClaimed ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : isPending ? 'text-cyan-200 bg-cyan-500/10 border-cyan-500/30' : quest.isCompleted ? 'text-amber-200 bg-amber-500/10 border-amber-500/30' : quest.reviewStatus === 'rejected' ? 'text-rose-300 bg-rose-500/10 border-rose-500/30' : 'text-slate-400 bg-slate-800 border-slate-700')}>
                    {quest.isClaimed ? 'รับรางวัลแล้ว' : isPending ? 'รอแอดมินตรวจ' : quest.isCompleted ? 'สำเร็จแล้ว' : quest.reviewStatus === 'rejected' ? 'ให้ส่งใหม่' : 'กำลังทำ'}
                  </span>
                </div>

                <div><div className="flex justify-between text-[11px] font-mono mb-1.5"><span className="text-slate-400">ความคืบหน้า</span><span className="text-cyan-300">{current} / {target} ({progress}%)</span></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all" style={{ width: progress + '%' }} /></div></div>

                {kind === 'question' ? (
                  <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-3 space-y-2">
                    <div className="text-xs font-bold text-purple-200">คำถามจากแอดมิน</div>
                    <div className="text-sm text-white leading-relaxed">{quest.question || quest.description}</div>
                    {!quest.isCompleted && <div className="flex gap-2"><input value={answers[quest.id] || ''} onChange={e => setAnswers(prev => ({ ...prev, [quest.id]: e.target.value }))} placeholder="พิมพ์คำตอบของคุณ..." className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-purple-400" /><button type="button" onClick={() => handleSubmitAnswer(quest)} className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"><Send className="w-4 h-4" /></button></div>}
                    {answerFeedback[quest.id] && <div className={'text-[11px] ' + (quest.isCompleted ? 'text-emerald-300' : 'text-amber-200')}>{answerFeedback[quest.id]}</div>}
                  </div>
                ) : !quest.isCompleted && (
                  <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2">
                    <div className="text-xs font-bold text-cyan-200">{kind === 'proof' ? 'ส่งรูปหลักฐานให้แอดมิน' : 'เพิ่มความคืบหน้าพร้อมหลักฐาน'}</div>
                    <textarea value={proofNotes[quest.id] || ''} onChange={e => setProofNotes(prev => ({ ...prev, [quest.id]: e.target.value }))} rows={2} placeholder="หมายเหตุถึงแอดมิน (ไม่บังคับ)" className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none resize-none" />
                    <label className={'w-full py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ' + (isPending || busyQuestId === quest.id ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer')}>
                      {busyQuestId === quest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                      {isPending ? 'ส่งหลักฐานแล้ว รอแอดมินตรวจ' : '＋ เพิ่มความคืบหน้าและแนบรูป'}
                      <input type="file" accept="image/*" disabled={isPending || busyQuestId === quest.id} onChange={event => void handleProofUpload(quest, event)} className="hidden" />
                    </label>
                    {quest.reviewStatus === 'rejected' && <div className="text-[11px] text-rose-300">แอดมินยังไม่อนุมัติหลักฐาน กรุณาส่งรูปใหม่</div>}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-200 border border-amber-500/20"><Coins className="w-3.5 h-3.5" />{Math.max(0, quest.rewardCoins || 0).toLocaleString()} Coins</span>{quest.rewardItemName && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 text-purple-200 border border-purple-500/20"><Sparkles className="w-3.5 h-3.5" />{quest.rewardItemName}</span>}</div>
                <button type="button" disabled={!quest.isCompleted || quest.isClaimed} onClick={() => handleClaimQuest(quest)} className="w-full py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-amber-500 hover:bg-amber-400 text-slate-950">{quest.isClaimed ? 'รับรางวัลเรียบร้อยแล้ว' : quest.isCompleted ? 'รับรางวัลภารกิจ' : 'ทำภารกิจให้ครบก่อนรับรางวัล'}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
