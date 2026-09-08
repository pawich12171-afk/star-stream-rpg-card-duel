import React, { useState } from 'react';
import { CharacterProfile } from '../types';
import { 
  Coins, 
  Send, 
  X, 
  Check, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles,
  User
} from 'lucide-react';
import confetti from '../utils/confetti';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  sender: CharacterProfile;
  allCharacters: CharacterProfile[];
  onTransfer: (senderId: string, recipientId: string, amount: number) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  sender,
  allCharacters,
  onTransfer,
}) => {
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState(500);

  if (!isOpen) return null;

  const validRecipients = allCharacters.filter(c => c.id !== sender.id);
  const selectedRecipient = validRecipients.find(c => c.id === recipientId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientId) {
      alert('กรุณาเลือกตัวละครผู้รับเหรียญ');
      return;
    }
    if (amount <= 0) {
      alert('กรุณาระบุจำนวนเหรียญที่มากกว่า 0');
      return;
    }
    if (amount > sender.coins) {
      alert(`เหรียญไม่เพียงพอ! คุณมี ${sender.coins.toLocaleString()} Coins แต่ระบุ ${amount.toLocaleString()} Coins`);
      return;
    }

    onTransfer(sender.id, recipientId, amount);
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 }
    });
    onClose();
  };

  const handleQuickAdd = (addVal: number) => {
    setAmount(prev => Math.min(sender.coins, prev + addVal));
  };

  const handlePercentage = (pct: number) => {
    const calculated = Math.floor((sender.coins * pct) / 100);
    setAmount(Math.max(1, calculated));
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl max-w-lg w-full shadow-[0_0_50px_rgba(245,158,11,0.2)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-amber-900/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-700 p-0.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-amber-400 font-bold uppercase">
                  STAR STREAM • COIN CONTRACT
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                โอนเหรียญกลุ่มดาว (Transfer Coins)
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Transfer Visual Preview Flow */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center relative">
            
            {/* Sender Box */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <img
                src={sender.avatarUrl}
                alt={sender.displayName}
                className="w-11 h-11 rounded-xl object-cover border border-amber-500/40 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-amber-400 font-bold block">ผู้โอน (คุณ):</span>
                <h4 className="text-xs font-black text-white truncate">{sender.displayName}</h4>
                <div className="text-[11px] font-mono font-black text-amber-300 flex items-center gap-1 mt-0.5">
                  <Coins className="w-3 h-3 text-amber-400" />
                  {sender.coins.toLocaleString()} C
                </div>
              </div>
            </div>

            {/* Recipient Box */}
            <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
              selectedRecipient 
                ? 'bg-slate-900/80 border-cyan-500/50 shadow-sm'
                : 'bg-slate-900/40 border-slate-800 border-dashed text-slate-500'
            }`}>
              {selectedRecipient ? (
                <>
                  <img
                    src={selectedRecipient.avatarUrl}
                    alt={selectedRecipient.displayName}
                    className="w-11 h-11 rounded-xl object-cover border border-cyan-500/40 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-cyan-400 font-bold block">ผู้รับโอน:</span>
                    <h4 className="text-xs font-black text-white truncate">{selectedRecipient.displayName}</h4>
                    <div className="text-[10px] text-slate-400 truncate">
                      {selectedRecipient.constellation || 'ไม่มีกลุ่มดาว'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full text-center py-2 text-slate-500 flex flex-col items-center gap-1">
                  <User className="w-5 h-5 opacity-40" />
                  <span>โปรดเลือกผู้รับโอนด้านล่าง</span>
                </div>
              )}
            </div>
          </div>

          {/* Recipient Selector */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-bold block flex items-center justify-between">
              <span>เลือกตัวละครผู้รับโอนเหรียญ *</span>
              <span className="text-[10px] text-slate-400">ทั้งหมด {validRecipients.length} คน</span>
            </label>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold outline-none focus:border-amber-500 cursor-pointer text-xs"
            >
              <option value="">-- แตะเพื่อเลือกผู้รับโอน --</option>
              {validRecipients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.nickname || 'ผู้อวตาร'}) • {c.coins.toLocaleString()} C
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-bold">จำนวนเหรียญที่ต้องการโอน (Coins) *</label>
              <span className="text-[11px] font-mono text-amber-400">
                เหลือหลังจากโอน: <strong>{Math.max(0, sender.coins - (amount || 0)).toLocaleString()} C</strong>
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min={1}
                max={sender.coins}
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border-2 border-slate-700 focus:border-amber-500 text-white font-mono text-base font-black outline-none shadow-inner"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-amber-400">
                COINS
              </span>
            </div>

            {/* Quick Adjustment Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleQuickAdd(100)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold cursor-pointer"
              >
                +100
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(500)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold cursor-pointer"
              >
                +500
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(1000)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold cursor-pointer"
              >
                +1,000
              </button>
              <button
                type="button"
                onClick={() => handlePercentage(25)}
                className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[10px] font-bold cursor-pointer"
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => handlePercentage(50)}
                className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[10px] font-bold cursor-pointer"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => handlePercentage(100)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[10px] font-black cursor-pointer shadow"
              >
                MAX (ทั้งหมด)
              </button>
            </div>
          </div>

          {/* Dokkaebi System Guarantee Note */}
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50 flex items-center gap-2.5 text-[11px] text-amber-200/90">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>สัญญาธุรกรรมผ่าน Star Stream Bureau ได้รับการยืนยันแบบ Real-time ไม่มีค่าธรรมเนียมหักเหรียญ</span>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!recipientId || amount <= 0 || amount > sender.coins}
              className="px-6 py-2.5 font-black text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 hover:from-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.5)] cursor-pointer flex items-center gap-2"
            >
              <Send className="w-4 h-4 stroke-[2.5]" />
              <span>ยืนยันการโอน {amount ? amount.toLocaleString() : 0} C</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
