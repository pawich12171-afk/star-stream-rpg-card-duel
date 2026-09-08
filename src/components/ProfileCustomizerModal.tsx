import React, { useState, useEffect, useRef } from 'react';
import { CharacterProfile } from '../types';
import { 
  Palette, 
  Sparkles, 
  X, 
  Check, 
  Eye, 
  User, 
  Star, 
  Award, 
  Quote as QuoteIcon, 
  Tag, 
  Plus, 
  RefreshCw,
  Image as ImageIcon,
  Upload,
  FolderOpen,
  AlertCircle,
  Crop,
  Layers,
  ChevronDown
} from 'lucide-react';
import confetti from '../utils/confetti';
import { 
  processImageFile, 
  DEFAULT_AVATAR_FALLBACK, 
  CURATED_AVATARS,
  ProcessedImageResult 
} from '../utils/imageUtils';

interface ProfileCustomizerModalProps {
  character: CharacterProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: CharacterProfile) => void;
  allCharacters?: CharacterProfile[];
  onSelectCharacter?: (char: CharacterProfile) => void;
}

// Curated ORV Constellation Sponsor Presets
const CONSTELLATION_PRESETS = [
  'สังกัดกลุ่มดาว เจ้าของสวนดอกไม้ที่ถูกหลงลืม',
  'ปีศาจลวงตาแห่งเพลิงทมิฬ',
  'มังกรดำเพลิงอเวจี',
  'ผู้พิพากษาปีศาจแห่งไฟ',
  'นักโทษแห่งรัดเกล้าทองคำ',
  'ราชินีแห่งฤดูใบไม้ผลิที่มืดมิดที่สุด',
  'สายลมหวนคืนสู่สวรรค์',
  'ผู้เขียนตอนจบอันเป็นนิรันดร์',
  'เทพผู้พิทักษ์แห่งการหลับใหล',
  'ช่างตีเหล็กแห่งรุ่งอรุณแรก',
  'ไม่มีผู้สนับสนุน (ผู้อวตารอิสระ)'
];

// Curated Honor Badge Title Presets
const BADGE_PRESETS = [
  'ภัยพิบัติแห่งคลื่นสะท้อน',
  'ราชันผู้ไร้บัลลังก์',
  'ผู้กอบกู้เรื่องเล่า',
  'ผู้พิทักษ์โดมโซล',
  'นักอ่านคนเดียวที่รอดชีวิต',
  'วีรชนแห่งโชคชะตา',
  'ผู้สังหารผู้กอบกู้โลก',
  'ผู้บุกเบิกแห่งกลุ่มดาว',
  'นักล่าปีศาจแห่งเงามืด'
];

// Suggested Characteristics with Rarity Markers
const SUGGESTED_CHARACTERISTICS = [
  'เจ้าของสวนดอกไม้ [ทั่วไป]',
  'โหยหาอดีต [ทั่วไป]',
  'ไร้สุข [ทั่วไป]',
  'สุขุมและเยือกเย็น [ทั่วไป]',
  'จิตใจเด็ดเดี่ยว [หายาก]',
  'ผู้เชี่ยวชาญร่มศึกโบราณ [หายาก]',
  'สัญชาตญาณสังหาร [หายาก]',
  'นักอ่านผู้รอบรู้ [ตำนาน]',
  'ผู้กอบกู้เรื่องเล่า [ตำนาน]',
  'ดวงตาแห่งปราชญ์ [มายา]',
  'กายาเพลิงทมิฬ [มายา]'
];

// Curated Quotes
const QUOTE_PRESETS = [
  '“ แม้เหล่ากิ่งก้านจัก ร่วงหล่นสู่พื้นดินอีกครา... แต่รากไม้... ที่ยังไม่ตาย จะผลิใบใหม่อีกครั้ง ”',
  '“ หากสายลมและเรื่องเล่ายังคงอยู่ ข้าจะกวัดแกว่งร่มคันนี้เพื่อทะลวงโชคชะตา ”',
  '“ เรื่องราวนี้... จะไม่มีวันจบลงอย่างสูญเปล่า ”',
  '“ มีเพียงนักอ่านคนเดียวเท่านั้น ที่จะรู้ว่าจุดจบของโลกนี้เป็นอย่างไร ”',
  '“ ข้าคือผู้รอดชีวิตเพียงคนเดียวในเรื่องเล่าที่ไม่มีใครอ่านจนจบ ”'
];

export const ProfileCustomizerModal: React.FC<ProfileCustomizerModalProps> = ({
  character,
  isOpen,
  onClose,
  onSave,
  allCharacters = [],
  onSelectCharacter,
}) => {
  const [activeTab, setActiveTab] = useState<'avatar' | 'identity' | 'constellation' | 'traits'>('avatar');
  
  // Profile form state
  const [displayName, setDisplayName] = useState(character.displayName);
  const [nickname, setNickname] = useState(character.nickname || '');
  const [avatarUrl, setAvatarUrl] = useState(character.avatarUrl || DEFAULT_AVATAR_FALLBACK);
  const [constellation, setConstellation] = useState(character.constellation || '');
  const [badgeTitle, setBadgeTitle] = useState(character.badgeTitle || '');
  const [quote, setQuote] = useState(character.quote || '');
  
  // Traits state as individual chips
  const [characteristics, setCharacteristics] = useState<string[]>(
    character.characteristics && character.characteristics.length > 0 
      ? [...character.characteristics] 
      : ['ผู้อวตารเริ่มต้น [ทั่วไป]']
  );
  const [customTraitInput, setCustomTraitInput] = useState('');
  const [traitRarity, setTraitRarity] = useState<'ทั่วไป' | 'หายาก' | 'ตำนาน' | 'มายา'>('ทั่วไป');

  // Avatar framing & upload states
  const [frameGlow, setFrameGlow] = useState<'cyan' | 'gold' | 'crimson' | 'purple'>('cyan');
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize state when character or modal open status changes (FIX STALE STATE BUG)
  useEffect(() => {
    if (character && isOpen) {
      setDisplayName(character.displayName || '');
      setNickname(character.nickname || '');
      setAvatarUrl(character.avatarUrl || DEFAULT_AVATAR_FALLBACK);
      setConstellation(character.constellation || '');
      setBadgeTitle(character.badgeTitle || '');
      setQuote(character.quote || '');
      setCharacteristics(
        character.characteristics && character.characteristics.length > 0
          ? [...character.characteristics]
          : ['ผู้อวตารเริ่มต้น [ทั่วไป]']
      );
      setUploadStatus(null);
      setImageLoadError(false);
    }
  }, [character?.id, isOpen]);

  if (!isOpen) return null;

  // Handle local file selection and compression
  const handleProcessFile = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadStatus('กำลังประมวลผลและปรับขนาดภาพ...');
      setImageLoadError(false);

      const result: ProcessedImageResult = await processImageFile(file, 512, 0.88);
      setAvatarUrl(result.dataUrl);
      setUploadStatus(`นำเข้ารูปสำเร็จ: ${result.fileName} (${result.sizeKb} KB)`);
    } catch (err: any) {
      setUploadStatus(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถอัปโหลดได้'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // reset input value so re-uploading the same file still triggers
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleAddTrait = (traitToAdd?: string) => {
    const raw = traitToAdd || customTraitInput.trim();
    if (!raw) return;
    
    let finalTrait = raw;
    if (!traitToAdd && !raw.includes('[')) {
      finalTrait = `${raw} [${traitRarity}]`;
    }

    if (!characteristics.includes(finalTrait)) {
      setCharacteristics([...characteristics, finalTrait]);
    }
    if (!traitToAdd) {
      setCustomTraitInput('');
    }
  };

  const handleRemoveTrait = (traitToRemove: string) => {
    setCharacteristics(characteristics.filter(t => t !== traitToRemove));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...character,
      displayName: displayName.trim() || character.displayName,
      nickname: nickname.trim(),
      avatarUrl: avatarUrl.trim() || character.avatarUrl,
      constellation: constellation.trim(),
      badgeTitle: badgeTitle.trim() || '',
      quote: quote.trim(),
      characteristics,
    });
    
    confetti({
      particleCount: 60,
      spread: 60,
      origin: { y: 0.6 }
    });

    onClose();
  };

  // Helper for trait tag color
  const getTraitBadgeClass = (trait: string) => {
    if (trait.includes('มายา')) {
      return 'bg-rose-950/70 border-rose-500/70 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)]';
    }
    if (trait.includes('ตำนาน')) {
      return 'bg-amber-950/70 border-amber-500/70 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]';
    }
    if (trait.includes('หายาก')) {
      return 'bg-purple-950/70 border-purple-500/70 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]';
    }
    return 'bg-cyan-950/60 border-cyan-700/60 text-cyan-300';
  };

  // Frame glow classes
  const getFrameGlowClass = () => {
    switch (frameGlow) {
      case 'gold':
        return 'border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.6)]';
      case 'crimson':
        return 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.6)]';
      case 'purple':
        return 'border-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.6)]';
      default:
        return 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.6)]';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-3xl max-w-2xl w-full shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
        
        {/* Modal Header & Character Switcher */}
        <div className="relative px-5 py-4 border-b border-cyan-900/40 bg-slate-900/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 p-0.5 shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Palette className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  STAR STREAM • PROFILE ATELIER
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                ตกแต่งและดูโปรไฟล์ตัวละคร
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Character Switcher Dropdown */}
            {allCharacters.length > 1 && onSelectCharacter && (
              <div className="relative flex items-center">
                <select
                  aria-label="สลับดูและตกแต่งโปรไฟล์ตัวละคร"
                  value={character.id}
                  onChange={(e) => {
                    const selected = allCharacters.find(c => c.id === e.target.value);
                    if (selected) {
                      onSelectCharacter(selected);
                    }
                  }}
                  className="bg-slate-800 hover:bg-slate-750 text-cyan-300 font-bold text-xs py-1.5 pl-3 pr-7 rounded-xl border border-cyan-500/40 outline-none cursor-pointer appearance-none transition-all shadow-sm"
                >
                  {allCharacters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.nickname || 'ผู้อวตาร'})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-cyan-400 absolute right-2 pointer-events-none" />
              </div>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* REAL-TIME LIVE HOLOGRAPHIC PROFILE CARD PREVIEW */}
          <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5 border-2 border-cyan-500/50 bg-gradient-to-r from-slate-950 via-indigo-950/70 to-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.2)]">
            <div className="absolute top-2 right-2.5 flex items-center gap-1 text-[10px] font-mono text-cyan-400/80 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
              <Eye className="w-3 h-3 text-cyan-400" />
              <span>ตัวอย่างสด (Live Status Preview)</span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
              <div className="relative shrink-0">
                <img
                  src={avatarUrl}
                  alt={displayName}
                  onError={() => setImageLoadError(true)}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 transition-all ${
                    imageFit === 'cover' ? 'object-cover' : 'object-contain bg-slate-950'
                  } ${getFrameGlowClass()}`}
                />
                <span className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] px-2 py-0.2 rounded-full border border-yellow-200 shadow">
                  INCARNATION
                </span>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-base sm:text-lg font-black text-white truncate">
                    {displayName || 'ระบุชื่อตัวละคร'}
                  </h3>
                  {badgeTitle && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/60 flex items-center gap-1 shadow-sm">
                      <Award className="w-3 h-3 text-amber-400" />
                      {badgeTitle}
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-cyan-400 truncate">
                  {nickname || 'ยังไม่มีฉายาสมญานาม'}
                </p>

                <p className="text-[11px] text-slate-300 flex items-center gap-1 truncate">
                  <Star className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-slate-400">กลุ่มดาว:</span>
                  <span className="font-semibold text-amber-300">{constellation || 'ไม่มีผู้สนับสนุน'}</span>
                </p>
              </div>
            </div>

            {/* Error fallback alert if image failed */}
            {imageLoadError && (
              <div className="mt-3 p-2 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>ลิงก์รูปภาพไม่สามารถแสดงผลได้ กรุณานำเข้ารูปใหม่จากเครื่องหรือเลือกจากพรีเซ็ต</span>
              </div>
            )}

            {/* Quote in Live Preview */}
            {quote && (
              <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-cyan-200/90 italic flex items-start gap-1.5">
                <QuoteIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{quote}</span>
              </div>
            )}

            {/* Trait chips preview */}
            {characteristics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-400">คุณลักษณะ:</span>
                {characteristics.map((c, i) => (
                  <span
                    key={i}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium ${getTraitBadgeClass(c)}`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* TAB NAVIGATION */}
          <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('avatar')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'avatar'
                  ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="truncate">รูป & กรอบ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('identity')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'identity'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span className="truncate">ชื่อ & ฉายา</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('constellation')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'constellation'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="truncate">กลุ่มดาว & ยศ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('traits')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'traits'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="truncate">คุณลักษณะ & คำคม</span>
            </button>
          </div>

          {/* TAB 1: AVATAR & FRAMING STUDIO */}
          {activeTab === 'avatar' && (
            <div className="space-y-4">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* Main Avatar Staging & Customizer Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                    ห้องตกแต่งและจัดวางรูปโปรไฟล์ (Avatar Studio)
                  </span>
                  <span className="text-[10px] text-cyan-400">
                    {avatarUrl.startsWith('data:') ? 'รูปจากเครื่อง' : 'รูปออนไลน์'}
                  </span>
                </div>

                {/* Staging Layout: Preview + Controls */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Dedicated Avatar Frame Preview */}
                  <div className="relative shrink-0 flex flex-col items-center">
                    <div className="relative group">
                      <img
                        src={avatarUrl}
                        alt="Avatar Preview"
                        onError={() => setImageLoadError(true)}
                        className={`w-28 h-28 rounded-2xl border-2 transition-all shadow-xl ${
                          imageFit === 'cover' ? 'object-cover' : 'object-contain bg-slate-900'
                        } ${getFrameGlowClass()}`}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center text-white text-xs font-bold gap-1 cursor-pointer"
                        title="คลิกเพื่อเปลี่ยนรูปจากเครื่อง"
                      >
                        <FolderOpen className="w-5 h-5 text-cyan-400" />
                        <span>เปลี่ยนรูป</span>
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400 mt-2 font-mono">
                      ตัวอย่างรูปโปรไฟล์
                    </span>
                  </div>

                  {/* Frame & Fit Controls */}
                  <div className="flex-1 w-full space-y-3">
                    {/* Frame Glow Selector */}
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        เลือกออร่ากรอบดวงดาว (Constellation Frame Aura)
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFrameGlow('cyan')}
                          className={`py-1.5 px-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            frameGlow === 'cyan'
                              ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          ฟ้ากระแสธาร
                        </button>
                        <button
                          type="button"
                          onClick={() => setFrameGlow('gold')}
                          className={`py-1.5 px-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            frameGlow === 'gold'
                              ? 'bg-amber-950 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          ประกายทองคำ
                        </button>
                        <button
                          type="button"
                          onClick={() => setFrameGlow('crimson')}
                          className={`py-1.5 px-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            frameGlow === 'crimson'
                              ? 'bg-rose-950 border-rose-400 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          เพลิงทมิฬ
                        </button>
                        <button
                          type="button"
                          onClick={() => setFrameGlow('purple')}
                          className={`py-1.5 px-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            frameGlow === 'purple'
                              ? 'bg-purple-950 border-purple-400 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          ห้วงลึกดารา
                        </button>
                      </div>
                    </div>

                    {/* Image Fit Mode */}
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1.5 flex items-center gap-1">
                        <Crop className="w-3.5 h-3.5 text-cyan-400" />
                        การจัดวางภาพ (Image Fit)
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setImageFit('cover')}
                          className={`flex-1 py-1.5 px-3 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            imageFit === 'cover'
                              ? 'bg-cyan-950 border-cyan-400 text-cyan-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          เต็มกรอบ (Cover)
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageFit('contain')}
                          className={`flex-1 py-1.5 px-3 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                            imageFit === 'contain'
                              ? 'bg-cyan-950 border-cyan-400 text-cyan-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          พอดีสัดส่วน (Contain)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload from Device Drag & Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`p-4 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-2 ${
                    isDragOver
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                      : 'border-slate-700 hover:border-cyan-500/60 bg-slate-900/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
                    <Upload className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      นำรูปเข้าจากเครื่องคอมพิวเตอร์ หรือสมาร์ทโฟน
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      ลากไฟล์รูปภาพมาวางที่นี่ หรือกดปุ่มด้านล่างเพื่อเลือกไฟล์ (รองรับ JPG, PNG, WEBP)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="mt-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                      <span>{isUploading ? 'กำลังประมวลผล...' : 'เลือกรูปภาพจากเครื่อง'}</span>
                  </button>

                  {uploadStatus && (
                    <div className={`text-[11px] font-mono mt-1 font-semibold ${
                      uploadStatus.includes('สำเร็จ') ? 'text-teal-400' : uploadStatus.includes('ข้อผิดพลาด') ? 'text-rose-400' : 'text-cyan-400'
                    }`}>
                      {uploadStatus}
                    </div>
                  )}
                </div>
              </div>

              {/* Curated Presets Gallery (Removed human stock photos) */}
              {CURATED_AVATARS.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      คลังรูปอวตารสำเร็จรูป (Star Stream Presets)
                    </label>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {CURATED_AVATARS.map((preset) => {
                      const isSelected = avatarUrl === preset.url;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setAvatarUrl(preset.url);
                            setImageLoadError(false);
                            setUploadStatus(`เลือกอวตาร: ${preset.name}`);
                          }}
                          title={preset.name}
                          className={`group relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer p-0.5 ${
                            isSelected
                              ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)] scale-105'
                              : 'border-slate-800 hover:border-slate-600 hover:scale-102'
                          }`}
                        >
                          <img
                            src={preset.url}
                            alt={preset.name}
                            className="w-full h-full object-cover rounded-lg"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-cyan-600/30 flex items-center justify-center">
                              <Check className="w-4 h-4 text-white drop-shadow" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Image URL fallback */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="text-[11px] text-slate-400 font-medium block">
                  หรือระบุลิงก์รูปภาพออนไลน์ (Custom Web URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => {
                      setAvatarUrl(e.target.value);
                      setImageLoadError(false);
                    }}
                    placeholder="https://your-image-host.example/avatar.jpg"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl(DEFAULT_AVATAR_FALLBACK);
                      setImageLoadError(false);
                      setUploadStatus('คืนค่ารูปเริ่มต้นแล้ว');
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                    title="คืนค่าเป็นรูปเริ่มต้น"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    รีเซ็ต
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IDENTITY (NAME & NICKNAME) */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    ชื่อที่แสดง (Display Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="เช่น ยอน แชวอน (Yeon Chae-won)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    สมญานาม (Nickname / ฉายา)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="เช่น ภัยพิบัติแห่งคลื่นสะท้อน, ราชันผู้ไร้บัลลังก์"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Quick Character Overview */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <span className="text-slate-400 font-semibold block">รหัสประจำตัวผู้อวตารในระบบ:</span>
                <div className="flex items-center justify-between text-slate-300 font-mono bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                  <span>ID: {character.id}</span>
                  <span className="text-cyan-400">Username: @{character.username}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONSTELLATION & TITLES */}
          {activeTab === 'constellation' && (
            <div className="space-y-4">
              {/* Sponsor Constellation */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  กลุ่มดาวผู้สนับสนุน (Sponsor Constellation)
                </label>
                <input
                  type="text"
                  value={constellation}
                  onChange={(e) => setConstellation(e.target.value)}
                  placeholder="เช่น สังกัดกลุ่มดาว เจ้าของสวนดอกไม้ที่ถูกหลงลืม..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold outline-none focus:border-cyan-500 shadow-inner"
                />

                {/* Quick Constellation Presets */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5">
                    กลุ่มดาวชื่อดังใน Star Stream (คลิกเพื่อเลือกทันที):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CONSTELLATION_PRESETS.map((presetName, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setConstellation(presetName)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          constellation === presetName
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-sm'
                            : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {presetName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Honor Badge Title */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  ป้ายเกียรติยศ (Honor Badge Title)
                </label>
                <input
                  type="text"
                  value={badgeTitle}
                  onChange={(e) => setBadgeTitle(e.target.value)}
                  placeholder="เช่น ภัยพิบัติแห่งคลื่นสะท้อน, ผู้พิทักษ์โดม..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500 shadow-inner"
                />

                {/* Quick Badge Presets */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5">
                    ป้ายเกียรติยศแนะนำ:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {BADGE_PRESETS.map((presetBadge, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBadgeTitle(presetBadge)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          badgeTitle === presetBadge
                            ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-bold shadow'
                            : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-amber-200 hover:border-slate-700'
                        }`}
                      >
                        {presetBadge}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRAITS & QUOTES */}
          {activeTab === 'traits' && (
            <div className="space-y-4">
              {/* Characteristics Manager */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-cyan-400" />
                    คุณลักษณะและเรื่องเล่าส่วนตัว (Characteristics)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    มีทั้งหมด {characteristics.length} คุณลักษณะ
                  </span>
                </div>

                {/* Active Traits Cloud */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 min-h-[60px] flex flex-wrap gap-1.5 items-center">
                  {characteristics.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">ยังไม่มีคุณลักษณะ ให้เลือกจากคำแนะนำด้านล่างหรือพิมพ์เพิ่ม</span>
                  ) : (
                    characteristics.map((trait, index) => (
                      <span
                        key={index}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border font-medium ${getTraitBadgeClass(trait)}`}
                      >
                        <span>{trait}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTrait(trait)}
                          className="hover:text-white p-0.5 cursor-pointer transition-colors"
                          title="ลบคุณลักษณะนี้"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Add Custom Trait Form */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={customTraitInput}
                      onChange={(e) => setCustomTraitInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTrait();
                        }
                      }}
                      placeholder="พิมพ์คุณลักษณะใหม่ เช่น ผู้พิชิตศึกเดือด..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500"
                    />
                    <select
                      value={traitRarity}
                      onChange={(e) => setTraitRarity(e.target.value as any)}
                      className="px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-cyan-300 font-semibold outline-none cursor-pointer"
                    >
                      <option value="ทั่วไป">ทั่วไป</option>
                      <option value="หายาก">หายาก</option>
                      <option value="ตำนาน">ตำนาน</option>
                      <option value="มายา">มายา</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddTrait()}
                    disabled={!customTraitInput.trim()}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มคุณลักษณะ
                  </button>
                </div>

                {/* Suggested Characteristics */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5">
                    คุณลักษณะแนะนำ (คลิกเพื่อเพิ่มทันที):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_CHARACTERISTICS.map((sug, i) => {
                      const isAdded = characteristics.includes(sug);
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={isAdded}
                          onClick={() => handleAddTrait(sug)}
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                            isAdded
                              ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed line-through'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-600 hover:text-cyan-300'
                          }`}
                        >
                          + {sug}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Quote Section */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                  <QuoteIcon className="w-3.5 h-3.5 text-cyan-400" />
                  คำคมประจำตัว (Personal Quote)
                </label>
                <textarea
                  rows={2}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  placeholder="เช่น “ แม้เหล่ากิ่งก้านจัก ร่วงหล่นสู่พื้นดินอีกครา... แต่รากไม้... ที่ยังไม่ตาย จะผลิใบใหม่อีกครั้ง ”"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-cyan-500 transition-all shadow-inner resize-none font-medium italic"
                />

                {/* Quick Quote Presets */}
                <div className="pt-1">
                  <span className="text-[10px] text-slate-400 block mb-1.5">
                    คำคมแนะนำ (คลิกเพื่อใช้งาน):
                  </span>
                  <div className="space-y-1">
                    {QUOTE_PRESETS.map((presetQuote, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setQuote(presetQuote)}
                        className={`w-full text-left text-[10px] p-2 rounded-lg border transition-all cursor-pointer truncate ${
                          quote === presetQuote
                            ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 font-semibold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {presetQuote}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-cyan-950/80 bg-slate-950/90 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 font-black text-xs text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 hover:to-teal-200 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
            <span>บันทึกการเปลี่ยนแปลง</span>
          </button>
        </div>

      </div>
    </div>
  );
};
