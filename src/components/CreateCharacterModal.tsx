import React, { useState } from 'react';
import { CharacterProfile } from '../types';
import { 
  UserPlus, 
  Sparkles, 
  X, 
  Check, 
  Star, 
  Eye, 
  User, 
  Image as ImageIcon,
  Shield,
  Coins,
  Heart,
  Zap,
  Upload,
  FolderOpen
} from 'lucide-react';
import confetti from '../utils/confetti';
import { processImageFile, DEFAULT_AVATAR_FALLBACK } from '../utils/imageUtils';

interface CreateCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (newChar: CharacterProfile) => void;
}

const SUGGESTED_CONSTELLATIONS = [

  'สังกัดกลุ่มดาว เจ้าของสวนดอกไม้ที่ถูกหลงลืม',
  'ปีศาจลวงตาแห่งเพลิงทมิฬ',
  'มังกรดำเพลิงอเวจี',
  'ผู้พิพากษาปีศาจแห่งไฟ',
  'นักโทษแห่งรัดเกล้าทองคำ',
  'สายลมหวนคืนสู่สวรรค์',
  'ไม่มีผู้สนับสนุน (ผู้อวตารอิสระ)'
];

export const CreateCharacterModal: React.FC<CreateCharacterModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [constellation, setConstellation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleProcessFile = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadStatus('กำลังประมวลผลรูป...');
      const result = await processImageFile(file, 512, 0.88);
      setAvatarUrl(result.dataUrl);
      setUploadStatus(`นำเข้ารูปสำเร็จ: ${result.fileName}`);
    } catch (err: any) {
      setUploadStatus(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถอัปโหลดได้'}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    const newChar: CharacterProfile = {
      id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: username.trim() || `user_${Date.now().toString().slice(-4)}`,
      displayName: displayName.trim(),
      nickname: nickname.trim() || 'ผู้อวตารคนใหม่',
      avatarUrl: avatarUrl.trim() || DEFAULT_AVATAR_FALLBACK,
      constellation: constellation.trim() || 'ไม่มีผู้สนับสนุน (ผู้อวตารอิสระ)',
      coins: 1000,
      hp: 20,
      maxHp: 20,
      powerScore: 1200,
      stats: {
        strength: 10,
        durability: 10,
        agility: 10,
        magic: 10,
      },
      skills: [
        {
          id: `sk-${Date.now()}-1`,
          name: 'การตื่นรู้ของผู้อวตาร (Awakening)',
          level: 1,
          type: 'สกิลติดตัว',
          category: 'innate',
          orvRank: 'rare',
          description: 'เพิ่มพลังป้องกันและสมาธิเมื่อเริ่มต้นก้าวเข้าสู่กระแสธารดวงดาว',
          multiplier: 1,
          upgradeCount: 0,
        }
      ],
      inventory: [
        {
          id: 'item-newbie-pot',
          instanceId: `inst-${Date.now()}`,
          name: 'น้ำยาฟื้นฟูเบื้องต้น',
          description: 'ฟื้นฟู 10 HP',
          price: 100,
          category: 'consumable',
          effectType: 'heal_hp',
          effectValue: 10,
          quantity: 2,
          isEquipped: false,
          usableByPlayers: true,
        }
      ],
      notifications: [
        {
          id: `notif-welcome-${Date.now()}`,
          title: 'ยินดีต้อนรับสู่ Star Stream System',
          message: `ตัวละคร "${displayName.trim()}" ได้รับการบันทึกลงสารบบแล้ว รับเหรียญสนับสนุนเริ่มต้น 1,000 Coins`,
          timestamp: Date.now(),
          read: false,
          type: 'system',
        }
      ],
      characteristics: ['ผู้อวตารเริ่มต้น [ทั่วไป]'],
      quests: [],
      lastUpdated: Date.now(),
      statUpgradeCount: 0,
    };

    onCreate(newChar);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-xl w-full shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-cyan-900/40 bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 p-0.5 shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  STAR STREAM • REGISTRATION
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                สร้างตัวละครผู้อวตารใหม่
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Live Preview Card */}
          <div className="relative overflow-hidden rounded-2xl p-4 border border-cyan-500/40 bg-gradient-to-r from-slate-950 via-indigo-950/60 to-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.15)] flex items-center gap-4">
            <img
              src={avatarUrl}
              alt="Avatar Preview"
              className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-400/80 shadow shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-white truncate">
                  {displayName || 'ตั้งชื่อผู้อวตาร...'}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                  Lv.1
                </span>
              </div>
              <p className="text-cyan-400 text-xs truncate">
                {nickname || 'ยังไม่ได้กำหนดสมญานาม'}
              </p>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                <Star className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-amber-300 font-semibold">{constellation || 'ไม่มีผู้สนับสนุน'}</span>
              </div>
            </div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-bold block mb-1">ชื่อตัวละคร (Display Name) *</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น ยู ซังอา, คิม ดกจา..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-300 font-bold block mb-1">สมญานาม (Nickname)</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="เช่น ผู้เดินทางแห่งค่ำคืน..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-bold block mb-1">รหัสบัญชีประจำตัว (Username/ID)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เว้นว่างเพื่อให้ระบบสุ่ม ID อัตโนมัติ"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          {/* Avatar Upload / Custom URL */}
          <div className="space-y-2">
            <label className="text-slate-300 font-bold block text-xs">
              รูปประจำตัวตัวละคร (Avatar)
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProcessFile(file);
                if (e.target) e.target.value = '';
              }}
              className="hidden"
            />

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-3.5">
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-cyan-500/50 bg-slate-900 shrink-0 shadow-md">
                <img
                  src={avatarUrl.trim() || DEFAULT_AVATAR_FALLBACK}
                  alt="Avatar Preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow transition-all"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                      <span>{isUploading ? 'กำลังประมวลผล...' : 'เลือกรูปภาพจากเครื่อง'}</span>
                  </button>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('');
                        setUploadStatus(null);
                      }}
                      className="text-xs px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer transition-all"
                    >
                      ล้างรูป
                    </button>
                  )}
                </div>

                <input
                  type="url"
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setUploadStatus(null);
                  }}
                  placeholder="หรือวางลิงก์รูปภาพ (Web Image URL)..."
                  className="w-full px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono outline-none focus:border-cyan-500"
                />

                {uploadStatus && (
                  <span className="text-[10px] text-teal-400 block font-mono">{uploadStatus}</span>
                )}
              </div>
            </div>
          </div>

          {/* Sponsor Constellation */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-bold block">กลุ่มดาวผู้สนับสนุน (Constellation)</label>
            <input
              type="text"
              value={constellation}
              onChange={(e) => setConstellation(e.target.value)}
              placeholder="พิมพ์เองหรือเลือกจากด้านล่าง..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white outline-none focus:border-cyan-500"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {SUGGESTED_CONSTELLATIONS.map((cName, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setConstellation(cName)}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border cursor-pointer transition-all ${
                    constellation === cName
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                      {cName}
                </button>
              ))}
            </div>
          </div>

          {/* Starter Bonuses */}
          <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-900/50 flex items-center justify-between text-[11px] text-cyan-300">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>เงินสนับสนุนเริ่มต้น: <strong>1,000 Coins</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              <span>HP เริ่มต้น: <strong>20/20</strong></span>
            </div>
          </div>

          {/* Footer inside form */}
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
              className="px-5 py-2 font-black text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              ลงทะเบียนตัวละคร
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
