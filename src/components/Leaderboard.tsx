import React from 'react';
import { CharacterProfile } from '../types';
import { formatCoins } from '../utils/formatNumber';
import { Trophy, Coins, Zap, Star, ShieldCheck } from 'lucide-react';

interface LeaderboardProps {
  characters: CharacterProfile[];
  currentUserId: string;
  onSelectCharacter: (character: CharacterProfile) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  characters,
  currentUserId,
  onSelectCharacter,
}) => {
  const sorted = [...characters].sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));

  return (
    <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            ตารางอันดับกลุ่มดาว (Constellation Rankings)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            เรียงลำดับตามพลังรบรวม (Overall Power Score) ของอวตารในระบบ Star Stream
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((char, index) => {
          const isCurrentUser = char.id === currentUserId;
          return (
            <div
              key={char.id}
              onClick={() => onSelectCharacter(char)}
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                isCurrentUser
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                  : 'bg-slate-850/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                  index === 0
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : index === 1
                    ? 'bg-slate-300 text-slate-950 shadow-md'
                    : index === 2
                    ? 'bg-amber-700 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  #{index + 1}
                </div>

                <img
                  src={char.avatarUrl}
                  alt={char.displayName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                />

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">
                      {char.displayName}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                        (คุณ)
                      </span>
                    )}
                    {char.nickname && (
                      <span className="text-xs text-cyan-400">
                        ({char.nickname})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    กลุ่มดาว: {char.constellation || 'ไม่มี'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between sm:justify-end border-t sm:border-t-0 border-slate-800 pt-2 sm:pt-0 min-w-0 sm:max-w-[58%]">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    อุปกรณ์ที่สวมใส่อยู่ตอนนี้
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {char.inventory.filter(item => item.category === 'equipment' && (item.isEquipped || item.equipped)).length > 0 ? (
                      char.inventory
                        .filter(item => item.category === 'equipment' && (item.isEquipped || item.equipped))
                        .map(item => (
                          <span key={item.instanceId || item.id} className="inline-flex items-center gap-1 max-w-[180px] rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 truncate" title={item.name}>
                            {item.icon || '🛡️'} {item.name}
                            {Number(item.equippedQuantity || 1) > 1 && <span>×{Number(item.equippedQuantity)}</span>}
                          </span>
                        ))
                    ) : (
                      <span className="text-[10px] text-slate-600">ไม่ได้สวมใส่อุปกรณ์</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 justify-between sm:justify-end shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono">
                    <Coins className="w-3.5 h-3.5" />
                    <span>{formatCoins(char.coins)} C</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">พลังรบรวม</span>
                    <span className="text-base font-black text-white font-mono flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                      {char.powerScore?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
