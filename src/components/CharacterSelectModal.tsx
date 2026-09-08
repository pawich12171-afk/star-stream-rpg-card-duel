import React from 'react';
import { CharacterProfile } from '../types';
import { calculateCharacterHealth } from '../utils/healthSystem';
import { 
  Users, 
  X, 
  Check, 
  Shield, 
  Coins, 
  Zap, 
  Star, 
  UserPlus,
  Crown,
  Heart
} from 'lucide-react';

interface CharacterSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: CharacterProfile[];
  currentCharacterId: string;
  onSelect: (char: CharacterProfile) => void;
  onOpenCreate: () => void;
}

export const CharacterSelectModal: React.FC<CharacterSelectModalProps> = ({
  isOpen,
  onClose,
  characters,
  currentCharacterId,
  onSelect,
  onOpenCreate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-2xl w-full shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-cyan-900/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 p-0.5 shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  STAR STREAM ARCHIVE
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                สารบบผู้อวตาร (Switch Incarnation)
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

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>แตะการ์ดตัวละครเพื่อสลับการควบคุมทันที ({characters.length} ตัวละคร):</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreate();
              }}
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              สร้างตัวละครใหม่
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {characters.map((char) => {
              const isCurrent = char.id === currentCharacterId;
              const healthData = calculateCharacterHealth(char);
              const displayMaxHp = healthData.totalMaxHp;
              const displayHp = Math.min(char.hp || displayMaxHp, displayMaxHp);

              return (
                <div
                  key={char.id}
                  onClick={() => {
                    onSelect(char);
                    onClose();
                  }}
                  className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    isCurrent
                      ? 'bg-gradient-to-br from-cyan-950/80 via-slate-900 to-indigo-950/70 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                      : 'bg-slate-950/80 border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900/90'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <img
                        src={char.avatarUrl}
                        alt={char.displayName}
                        className="w-13 h-13 rounded-2xl object-cover border border-cyan-500/40 group-hover:border-cyan-400 transition-colors shadow"
                      />
                      {isCurrent && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-black text-white truncate group-hover:text-cyan-300 transition-colors">
                          {char.displayName}
                        </h4>
                        {isCurrent && (
                          <span className="text-[9px] bg-cyan-400 text-slate-950 font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[11px] text-cyan-400 truncate mt-0.5">
                        {char.nickname || 'ผู้อวตาร'}
                      </p>

                      <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate mt-0.5">
                        <Star className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{char.constellation || 'ไม่มีผู้สนับสนุน'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Stat Footer in Card */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                    <div className="flex items-center gap-1 text-amber-300 font-bold">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>{char.coins.toLocaleString()} C</span>
                    </div>

                    <div className="flex items-center gap-1 text-slate-300">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{char.powerScore?.toLocaleString() || 0}</span>
                    </div>

                    <div className="flex items-center gap-1 text-rose-300">
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <span>{displayHp}/{displayMaxHp}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreate();
            }}
            className="px-4 py-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            สร้างผู้อวตารคนใหม่
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
};
