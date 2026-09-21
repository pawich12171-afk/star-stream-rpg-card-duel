import React, { useState, useEffect, useRef } from 'react';
import { 
  CharacterProfile, 
  Item, 
  GachaReward, 
  GachaBanner,
  GachaConfig, 
  CardDuelRoom,
  Quest
} from './types';
import { INITIAL_CHARACTERS } from './initialData';
import { 
  subscribeToCharacters, 
  subscribeToShop, 
  subscribeToGachaRewards, 
  subscribeToGachaConfig, 
  subscribeToDuelRooms,
  updateCharacterInDB, updateCharacterStatusData,
  calculatePowerScore,
  addCharacterToDB, 
  deleteCharacterFromDB,
  transferCoinsBetweenCharacters,
  addShopItemToDB,
  deleteShopItemFromDB,
  updateGachaConfigInDB,
  addGachaRewardToDB,
  deleteGachaRewardFromDB,
  saveGachaBanner,
  deleteGachaBanner,
  grantItemToPlayer as grantItemToPlayerInDB,
  removeItemFromPlayer as removeItemFromPlayerInDB,
  resetDatabaseToDefaults,
  seedInitialDataIfNeeded
} from './services/characterService';
import { StatusWindow } from './components/StatusWindow';
import { ShopInventory } from './components/ShopInventory';
import { CardGame } from './components/CardGame';
import { GachaSystem } from './components/GachaSystem';
import { Leaderboard } from './components/Leaderboard';
import { QuestNotification } from './components/QuestNotification';
import { QuestBoard } from './components/QuestBoard';
import { AdminPanel } from './components/AdminPanel';
import { AdminCharacterBalancePanel } from './components/AdminCharacterBalancePanel';
import { TransferModal } from './components/TransferModal';
import { CharacterSelectModal } from './components/CharacterSelectModal';
import { CreateCharacterModal } from './components/CreateCharacterModal';
import { ProfileCustomizerModal } from './components/ProfileCustomizerModal';
import { BattleArena } from './components/BattleArena';
import { 
  Users, 
  ShoppingBag, 
  Gamepad2, 
  Gift, 
  Trophy, 
  Bell, 
  ShieldCheck, 
  Coins, 
  ChevronDown,
  Sparkles,
  Radio,
  Activity,
  ScrollText,
  Swords
} from 'lucide-react';
import confetti from './utils/confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<'status' | 'shop' | 'card_game' | 'gacha' | 'rankings' | 'notifications' | 'quests' | 'battle' | 'admin'>('status');

  // Real-time State
  const [characters, setCharacters] = useState<CharacterProfile[]>(() => [...INITIAL_CHARACTERS]);
  const [currentUserId, setCurrentUserId] = useState<string>(() => INITIAL_CHARACTERS[0]?.id || '');
  const [shopItems, setShopItems] = useState<Item[]>(() => []);
  const [gachaRewards, setGachaRewards] = useState<GachaReward[]>(() => []);
  const [gachaBanners, setGachaBanners] = useState<GachaBanner[]>(() => []);
  const [gachaConfig, setGachaConfig] = useState<GachaConfig>({
    pullCost: 500,
    tenPullCost: 4500,
    enabled: true,
    bannerTitle: "หีบสมบัติจักรวาลแห่งดวงดาว (Constellation Treasure)",
    bannerDescription: "โอกาสได้รับเหรียญรางวัลพิเศษ ไอเทมสเตตัส และสกิลระดับสวรรค์"
  });
  const [duelRooms, setDuelRooms] = useState<CardDuelRoom[]>(() => []);
  const [isRealtimeLinked, setIsRealtimeLinked] = useState(false);
  const charactersRef = useRef<CharacterProfile[]>([]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Admin Mode Toggle
  const [isAdminMode, setIsAdminMode] = useState<boolean>(true);

  // Modals
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [isCharSelectOpen, setIsCharSelectOpen] = useState<boolean>(false);
  const [isCreateCharOpen, setIsCreateCharOpen] = useState<boolean>(false);
  const [isProfileCustomizerOpen, setIsProfileCustomizerOpen] = useState<boolean>(false);

  // Wait for Firebase's initial read/seed before starting realtime listeners.
  // This prevents a stale local fallback or cache snapshot from repainting the UI
  // while the current server data is still being loaded.
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const initializeRealtimeData = async () => {
      // Never block the whole app on the initial database seed check.
      // If Supabase/API is slow or temporarily unavailable, listeners still
      // start and the service can use its local seed until the server responds.
      void seedInitialDataIfNeeded().catch((error) => {
        console.warn('Initial database seed check failed:', error);
      });

      if (disposed) return;

      cleanups.push(subscribeToCharacters((chars) => {
        charactersRef.current = chars;
        setCharacters(chars);
        setIsRealtimeLinked(true);
        if (chars.length > 0) {
          setCurrentUserId(prev => {
            if (prev && chars.some(c => c.id === prev)) return prev;
            try {
              const saved = localStorage.getItem('starstream_current_user_id');
              if (saved && chars.some(c => c.id === saved)) return saved;
            } catch (e) {}
            return chars[0].id;
          });
        }
      }));

      cleanups.push(subscribeToShop((items) => {
        setShopItems(items);
      }));

      cleanups.push(subscribeToGachaRewards((rewards) => {
        setGachaRewards(rewards);
      }));

      cleanups.push(subscribeToGachaBanners((banners) => {
        setGachaBanners(banners);
      }));

      cleanups.push(subscribeToGachaConfig((config) => {
        if (config) setGachaConfig(config);
      }));

      cleanups.push(subscribeToDuelRooms((rooms) => {
        setDuelRooms(rooms);
      }));
    };

    void initializeRealtimeData();

    // Hard fallback: the app must never remain on LINKING forever just because
    // the production API/Supabase request is slow or unavailable. If no
    // character snapshot has arrived after a few seconds, render the bundled
    // starter character so the UI is usable; a later server snapshot replaces it.
    const startupFallback = window.setTimeout(() => {
      if (disposed || charactersRef.current.length > 0) return;
      charactersRef.current = [...INITIAL_CHARACTERS];
      setCharacters([...INITIAL_CHARACTERS]);
      setCurrentUserId(INITIAL_CHARACTERS[0]?.id || '');
      setIsRealtimeLinked(false);
      console.warn('Realtime startup fallback: using bundled character data.');
    }, 4000);

    return () => {
      disposed = true;
      window.clearTimeout(startupFallback);
      cleanups.forEach(cleanup => cleanup());
    };
  }, []);

  // Keep the shell usable even if localStorage contains an empty collection
  // from an earlier failed sync. The realtime snapshot can still replace it.
  const currentUser = characters.find(c => c.id === currentUserId) || characters[0] || INITIAL_CHARACTERS[0];

  const handleSelectCharacter = (charId: string) => {
    setCurrentUserId(charId);
    try {
      localStorage.setItem('starstream_current_user_id', charId);
    } catch (e) {}
  };

  // Handlers
  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    const previous = charactersRef.current.find(character => character.id === updated.id);

    // Components often hold an older CharacterProfile in their closure.
    // Merge only the top-level fields that this action actually changed.
    // This prevents a stale Gacha/Shop/Battle/Admin object from restoring
    // an older Status, Coins, Inventory, Skills, etc.
    let committed: CharacterProfile;
    if (previous) {
      const merged: CharacterProfile = { ...previous };
      const ignoredKeys = new Set(['id', 'lastUpdated', 'powerScore']);
      (Object.keys(updated) as (keyof CharacterProfile)[]).forEach((key) => {
        if (ignoredKeys.has(key as string)) return;
        const before = JSON.stringify(previous[key]);
        const after = JSON.stringify(updated[key]);
        if (before !== after) {
          (merged as any)[key] = updated[key];
        }
      });
      committed = merged;
    } else {
      committed = { ...updated };
    }

    committed.powerScore = calculatePowerScore(committed);
    committed.lastUpdated = Math.max(
      Date.now(),
      Number(previous?.lastUpdated || 0) + 1,
      Number(updated.lastUpdated || 0) + 1
    );

    const oldList = charactersRef.current;
    charactersRef.current = oldList.some(c => c.id === committed.id)
      ? oldList.map(c => c.id === committed.id ? committed : c)
      : [...oldList, committed];
    setCharacters([...charactersRef.current]);

    try {
      await updateCharacterInDB(committed);
      return true;
    } catch (error) {
      charactersRef.current = previous
        ? charactersRef.current.map(c => c.id === previous.id ? previous : c)
        : charactersRef.current.filter(c => c.id !== committed.id);
      setCharacters([...charactersRef.current]);
      console.error('Failed to persist character update:', error);
      const detail = error instanceof Error ? error.message : String(error || 'ไม่ทราบสาเหตุ');
      alert('บันทึกข้อมูลตัวละครไม่สำเร็จ\\n\\n' + detail + '\\n\\nกรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลแล้วลองใหม่อีกครั้ง');
      return false;
    }
  };

  // Keep the React view in sync immediately with admin inventory mutations.
  // The service also broadcasts and persists the change; this closes the gap
  // before Firestore's next realtime snapshot reaches this tab.
  const handleGrantItemToPlayer = async (targetCharId: string, item: Item, quantity: number) => {
    const result = await grantItemToPlayerInDB(targetCharId, item, quantity);
    const updated = result.updatedChar;
    if (result.success && updated) {
      setCharacters(prev => prev.some(character => character.id === updated.id)
        ? prev.map(character => character.id === updated.id ? updated : character)
        : [...prev, updated]);
    }
    return result;
  };

  const handleRemoveItemFromPlayer = async (targetCharId: string, instanceId: string, quantity?: number) => {
    const result = await removeItemFromPlayerInDB(targetCharId, instanceId, quantity);
    const updated = result.updatedChar;
    if (result.success && updated) {
      setCharacters(prev => prev.some(character => character.id === updated.id)
        ? prev.map(character => character.id === updated.id ? updated : character)
        : [...prev, updated]);
    }
    return result;
  };

  const handleAddShopItem = async (item: Item): Promise<void> => {
    await addShopItemToDB(item);
    setShopItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
  };

  const handleDeleteShopItem = async (itemId: string): Promise<void> => {
    await deleteShopItemFromDB(itemId);
    setShopItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCreateCharacter = async (newChar: CharacterProfile) => {
    await addCharacterToDB(newChar);
    setCurrentUserId(newChar.id);
    confetti({ particleCount: 80, spread: 60 });
  };

  const handleDeleteCharacter = async (characterId: string): Promise<void> => {
    const target = charactersRef.current.find(character => character.id === characterId);
    if (!target) return;

    try {
      await deleteCharacterFromDB(characterId);
      const remaining = charactersRef.current.filter(character => character.id !== characterId);
      charactersRef.current = remaining;
      setCharacters(remaining);

      if (currentUserId === characterId) {
        const nextId = remaining[0]?.id || '';
        setCurrentUserId(nextId);
        try {
          if (nextId) localStorage.setItem('starstream_current_user_id', nextId);
          else localStorage.removeItem('starstream_current_user_id');
        } catch {}
      }

      alert('ลบตัวละคร "' + target.displayName + '" ออกจากระบบเรียบร้อยแล้ว');
    } catch (error: any) {
      console.error('Failed to delete character:', error);
      alert(error?.message || 'ลบตัวละครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleUpdateCharacterStatus = async (
    characterId: string,
    patch: Pick<CharacterProfile, 'stats' | 'hp' | 'maxHp' | 'statusBuffs' | 'characteristics'>
  ): Promise<boolean> => {
    try {
      const updated = await updateCharacterStatusData(characterId, patch);
      charactersRef.current = charactersRef.current.some(c => c.id === updated.id)
        ? charactersRef.current.map(c => c.id === updated.id ? updated : c)
        : [...charactersRef.current, updated];
      setCharacters([...charactersRef.current]);
      return true;
    } catch (error) {
      console.error('Failed to persist status update:', error);
      alert('บันทึกสเตตัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      return false;
    }
  };

  const handleUpdateCharacterCoins = (characterId: string, deltaCoins: number) => {
    const target = characters.find((char) => char.id === characterId);
    if (!target) return;
    void handleUpdateCharacter({
      ...target,
      coins: Math.max(0, target.coins + deltaCoins),
    });
  };

  const handleSetCharacterCoins = (characterId: string, newCoins: number) => {
    const target = characters.find((char) => char.id === characterId);
    if (!target) return;
    void handleUpdateCharacter({
      ...target,
      coins: Math.max(0, newCoins),
    });
  };

  const handleAssignQuest = async (targetCharId: string, quest: Quest): Promise<boolean> => {
    const target = characters.find(character => character.id === targetCharId);
    if (!target) return false;
    const assignedNotification = {
      id: 'notif-quest-assigned-' + Date.now(),
      title: 'ได้รับภารกิจใหม่จากแอดมิน',
      message: 'ภารกิจ “' + quest.title + '” ถูกมอบหมายให้คุณแล้ว เปิดเมนูภารกิจเพื่อดูรายละเอียด',
      timestamp: Date.now(),
      read: false,
      type: 'quest' as const,
    };
    return handleUpdateCharacter({
      ...target,
      quests: [quest, ...(target.quests || [])],
      notifications: [assignedNotification, ...(target.notifications || [])],
      lastUpdated: Date.now(),
    });
  };

  const handleReviewQuestProof = async (targetCharId: string, questId: string, approve: boolean): Promise<boolean> => {
    const target = characters.find(character => character.id === targetCharId);
    const quest = target?.quests?.find(item => item.id === questId);
    if (!target || !quest) return false;
    const nextCount = approve ? quest.currentCount : Math.max(0, quest.currentCount - 1);
    const completed = approve && nextCount >= Math.max(1, quest.targetCount || 1);
    const updatedQuest: Quest = {
      ...quest,
      currentCount: nextCount,
      isCompleted: completed,
      reviewStatus: approve ? (completed ? 'approved' : 'none') : 'rejected',
    };
    const reviewNotification = {
      id: 'notif-quest-review-' + Date.now(),
      title: approve ? 'แอดมินอนุมัติหลักฐานภารกิจ' : 'แอดมินไม่อนุมัติหลักฐานภารกิจ',
      message: approve
        ? (completed ? 'ภารกิจ “' + quest.title + '” สำเร็จแล้ว กดรับรางวัลได้เลย' : 'หลักฐานผ่านแล้ว ความคืบหน้าภารกิจ “' + quest.title + '” เพิ่มขึ้น')
        : 'หลักฐานของภารกิจ “' + quest.title + '” ยังไม่ผ่าน กรุณาส่งรูปใหม่',
      timestamp: Date.now(),
      read: false,
      type: 'quest' as const,
    };
    return handleUpdateCharacter({
      ...target,
      quests: (target.quests || []).map(item => item.id === questId ? updatedQuest : item),
      notifications: [reviewNotification, ...(target.notifications || [])],
      lastUpdated: Date.now(),
    });
  };

  const handleTransferCoins = async (senderId: string, recipientId: string, amount: number) => {
    try {
      const result = await transferCoinsBetweenCharacters(senderId, recipientId, amount);
      if (!result.success) {
        alert(result.message);
        return;
      }
      confetti({ particleCount: 60, spread: 50 });
      alert(result.message || `โอนเหรียญ ${amount.toLocaleString()} Coins สำเร็จแล้ว!`);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการโอนเหรียญ');
    }
  };

  // Waiting rooms count
  const waitingDuelRoomsCount = duelRooms.filter(r => r.status === 'waiting').length;
  const unreadNotifsCount = currentUser?.notifications?.filter(n => !n.read).length || 0;

  return (
    <div className="star-shell min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Main Navigation Bar */}
      <header className="star-topbar sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo and System Title */}
          <div className="flex items-center gap-3">
            <div className="star-brand-mark w-10 h-10 rounded-2xl p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  STAR STREAM
                </span>
               <span className="star-live-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
              <h1 className="text-sm md:text-base font-black text-white tracking-tight leading-none">
                ระบบกลุ่มดาวแห่งโชคชะตา (ORV)
              </h1>
            </div>
          </div>

          {/* Character Quick Switcher & Admin Switch */}
          <div className="flex items-center gap-3">
            {/* Coin Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold shadow-sm">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentUser.coins.toLocaleString()} C</span>
            </div>

            {/* Character Selector Button */}
            <button
              id="btn-character-switcher"
              onClick={() => setIsCharSelectOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer shadow"
            >
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="w-7 h-7 rounded-xl object-cover border border-cyan-500/40"
              />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white leading-none">
                  {currentUser.displayName}
                </div>
                <div className="text-[10px] text-cyan-400 leading-none mt-0.5">
                  {currentUser.nickname || 'ผู้อวตาร'}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {/* Admin Mode Badge Toggle */}
            <button
              id="btn-toggle-admin-header"
              onClick={() => {
                const next = !isAdminMode;
                setIsAdminMode(next);
                if (next) setActiveTab('admin');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow ${
                isAdminMode
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
              }`}
              title="สลับโหมดผู้ดูแลระบบ (Admin Mode)"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">โหมดผู้ดูแล:</span>
              <span>{isAdminMode ? 'ADMIN ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="star-nav bg-slate-900/60 border-b border-slate-800 px-4 md:px-8 py-2 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <button
            id="nav-tab-status"
            onClick={() => setActiveTab('status')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'status'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            หน้าต่างสถานะ (Status)
          </button>

          <button
            id="nav-tab-shop"
            onClick={() => setActiveTab('shop')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'shop'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            ร้านค้า & กระเป๋า (Shop)
          </button>

          <button
            id="nav-tab-card"
            onClick={() => setActiveTab('card_game')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'card_game'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            ศึกดวลไพ่ 21 (Card Duel)
            {waitingDuelRoomsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] animate-pulse flex items-center gap-1">
                <Radio className="w-2.5 h-2.5" />
                {waitingDuelRoomsCount} รอคน
              </span>
            )}
          </button>

          <button
            id="nav-tab-battle"
            onClick={() => setActiveTab('battle')}
            className={'star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ' + (activeTab === 'battle' ? 'is-active text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/60')}
          >
            <Swords className="w-4 h-4" />
            สนามรบทีม (Battle Arena)
          </button>

          <button
            id="nav-tab-gacha"
            onClick={() => setActiveTab('gacha')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'gacha'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Gift className="w-4 h-4" />
            สุ่มกาชาดวงดาว (Gacha)
          </button>

          <button
            id="nav-tab-rankings"
            onClick={() => setActiveTab('rankings')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'rankings'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-4 h-4" />
            อันดับกลุ่มดาว (Rankings)
          </button>

          <button
            id="nav-tab-notifications"
            onClick={() => setActiveTab('notifications')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'notifications'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Bell className="w-4 h-4" />
            การแจ้งเตือน
            {unreadNotifsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          {/* ADMIN TAB - ALWAYS ACCESSIBLE */}
          <button
            id="nav-tab-quests"
            onClick={() => setActiveTab('quests')}
            className={'star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ' + (activeTab === 'quests' ? 'is-active text-amber-200 font-black shadow-[0_0_20px_rgba(245,158,11,0.24)]' : 'text-amber-400 hover:bg-amber-950/40 border border-amber-500/40')}
          >
            <ScrollText className="w-4 h-4" />
            ภารกิจ
          </button>
          <button
            id="nav-tab-admin"
            onClick={() => setActiveTab('admin')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'admin'
                 ? 'is-active text-amber-200 font-black shadow-[0_0_20px_rgba(245,158,11,0.24)]'
                : 'text-amber-400 hover:bg-amber-950/40 border border-amber-500/40'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            ผู้ดูแลระบบ (Admin Panel)
          </button>
        </div>
      </nav>

      {/* Main Content View */}
      <main className="star-content flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/55 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.18em] text-slate-400">
            <Activity className="h-3.5 w-3.5 text-cyan-300" />
            <span>Constellation command deck</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span className={`h-1.5 w-1.5 rounded-full ${isRealtimeLinked ? 'bg-emerald-300' : 'bg-amber-300'} star-live-dot`} />
              {isRealtimeLinked ? 'REALTIME LINKED' : 'SYNCING'}
            </span>
            <span className="hidden text-slate-500 sm:inline">NODE 07 / ORV</span>
          </div>
        </div>
        {activeTab === 'status' && (
          <StatusWindow
            character={currentUser}
            onUpdateCharacter={handleUpdateCharacter}
            onPersistStatus={handleUpdateCharacterStatus}
            onOpenTransfer={() => setIsTransferOpen(true)}
            onOpenProfileCustomizer={() => setIsProfileCustomizerOpen(true)}
            onOpenCharacterSelect={() => setIsCharSelectOpen(true)}
            isAdmin={isAdminMode}
          />
        )}

        {activeTab === 'shop' && (
          <ShopInventory
            character={currentUser}
            shopItems={shopItems}
            onUpdateCharacter={handleUpdateCharacter}
            onAddShopItem={handleAddShopItem}
            onDeleteShopItem={handleDeleteShopItem}
            isAdmin={isAdminMode}
          />
        )}

        {activeTab === 'battle' && (
          <BattleArena
            currentUser={currentUser}
            allCharacters={characters}
            isAdmin={isAdminMode || currentUser.role === 'admin'}
          />
        )}

        {activeTab === 'card_game' && (
          <CardGame
            currentUser={currentUser}
            allCharacters={characters}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'gacha' && (
          <GachaSystem
            character={currentUser}
            gachaRewards={gachaRewards}
            gachaConfig={gachaConfig}
            gachaBanners={gachaBanners}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'rankings' && (
          <Leaderboard
            characters={characters}
            currentUserId={currentUser.id}
            onSelectCharacter={(c) => {
              handleSelectCharacter(c.id);
              setActiveTab('status');
            }}
          />
        )}

        {activeTab === 'notifications' && (
          <QuestNotification
            character={currentUser}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'quests' && (
          <QuestBoard
            character={currentUser}
            shopItems={shopItems}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            characters={characters}
            shopItems={shopItems}
            gachaRewards={gachaRewards}
            gachaConfig={gachaConfig}
            gachaBanners={gachaBanners}
            onUpdateCharacterCoins={handleUpdateCharacterCoins}
            onSetCharacterCoins={handleSetCharacterCoins}
            onAddShopItem={handleAddShopItem}
            onDeleteShopItem={handleDeleteShopItem}
            onGrantItem={handleGrantItemToPlayer}
            onRemoveItem={handleRemoveItemFromPlayer}
            onAssignQuest={handleAssignQuest}
            onReviewQuestProof={handleReviewQuestProof}
            onAddGachaReward={addGachaRewardToDB}
            onDeleteGachaReward={deleteGachaRewardFromDB}
            onSaveGachaBanner={saveGachaBanner}
            onDeleteGachaBanner={deleteGachaBanner}
            onUpdateGachaConfig={updateGachaConfigInDB}
            onDirectEditCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onResetToDefaults={() => { void resetDatabaseToDefaults(); }}
          />
        )}
        {activeTab === 'admin' && (
          <AdminCharacterBalancePanel
            characters={characters}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

      </main>

      {/* Modals */}
      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        sender={currentUser}
        allCharacters={characters}
        onTransfer={handleTransferCoins}
      />

      <CharacterSelectModal
        isOpen={isCharSelectOpen}
        onClose={() => setIsCharSelectOpen(false)}
        characters={characters}
        currentCharacterId={currentUser.id}
        onSelect={(c) => handleSelectCharacter(c.id)}
        onOpenCreate={() => setIsCreateCharOpen(true)}
      />

      <CreateCharacterModal
        isOpen={isCreateCharOpen}
        onClose={() => setIsCreateCharOpen(false)}
        onCreate={handleCreateCharacter}
      />

      <ProfileCustomizerModal
        character={currentUser}
        isOpen={isProfileCustomizerOpen}
        onClose={() => setIsProfileCustomizerOpen(false)}
        onSave={handleUpdateCharacter}
        allCharacters={characters}
        onSelectCharacter={(c) => handleSelectCharacter(c.id)}
      />
    </div>
  );
}
