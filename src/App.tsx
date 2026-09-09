import React, { useState, useEffect } from 'react';
import { 
  CharacterProfile, 
  Item, 
  GachaReward, 
  GachaConfig, 
  CardDuelRoom,
  Quest
} from './types';
import { 
  subscribeToCharacters, 
  subscribeToShop, 
  subscribeToGachaRewards, 
  subscribeToGachaConfig, 
  subscribeToDuelRooms,
  updateCharacterInDB, 
  addCharacterToDB, 
  transferCoinsBetweenCharacters,
  addShopItemToDB,
  deleteShopItemFromDB,
  updateGachaConfigInDB,
  addGachaRewardToDB,
  deleteGachaRewardFromDB,
  grantItemToPlayer,
  removeItemFromPlayer,
  resetDatabaseToDefaults
} from './services/characterService';
import { StatusWindow } from './components/StatusWindow';
import { ShopInventory } from './components/ShopInventory';
import { CardGame } from './components/CardGame';
import { GachaSystem } from './components/GachaSystem';
import { Leaderboard } from './components/Leaderboard';
import { QuestNotification } from './components/QuestNotification';
import { QuestBoard } from './components/QuestBoard';
import { AdminPanel } from './components/AdminPanel';
import { TransferModal } from './components/TransferModal';
import { CharacterSelectModal } from './components/CharacterSelectModal';
import { CreateCharacterModal } from './components/CreateCharacterModal';
import { ProfileCustomizerModal } from './components/ProfileCustomizerModal';
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
  ScrollText
} from 'lucide-react';
import confetti from './utils/confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<'status' | 'shop' | 'card_game' | 'gacha' | 'rankings' | 'notifications' | 'quests' | 'admin'>('status');

  // Real-time State
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [shopItems, setShopItems] = useState<Item[]>([]);
  const [gachaRewards, setGachaRewards] = useState<GachaReward[]>([]);
  const [gachaConfig, setGachaConfig] = useState<GachaConfig>({
    pullCost: 500,
    tenPullCost: 4500,
    enabled: true,
    bannerTitle: "หีบสมบัติจักรวาลแห่งดวงดาว (Constellation Treasure)",
    bannerDescription: "โอกาสได้รับเหรียญรางวัลพิเศษ ไอเทมสเตตัส และสกิลระดับสวรรค์"
  });
  const [duelRooms, setDuelRooms] = useState<CardDuelRoom[]>([]);
  const [isRealtimeLinked, setIsRealtimeLinked] = useState(false);

  // Admin Mode Toggle
  const [isAdminMode, setIsAdminMode] = useState<boolean>(true);

  // Modals
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [isCharSelectOpen, setIsCharSelectOpen] = useState<boolean>(false);
  const [isCreateCharOpen, setIsCreateCharOpen] = useState<boolean>(false);
  const [isProfileCustomizerOpen, setIsProfileCustomizerOpen] = useState<boolean>(false);

  // Subscribe to real-time data
  useEffect(() => {
    const unsubChars = subscribeToCharacters((chars) => {
      setCharacters(chars);
      setIsRealtimeLinked(true);
      if (chars.length > 0) {
        setCurrentUserId(prev => {
          if (prev && chars.some(c => c.id === prev)) return prev;
          return chars[0].id;
        });
      }
    });

    const unsubShop = subscribeToShop((items) => {
      setShopItems(items);
    });

    const unsubGachaRewards = subscribeToGachaRewards((rewards) => {
      setGachaRewards(rewards);
    });

    const unsubGachaConfig = subscribeToGachaConfig((config) => {
      if (config) setGachaConfig(config);
    });

    const unsubDuel = subscribeToDuelRooms((rooms) => {
      setDuelRooms(rooms);
    });

    return () => {
      unsubChars();
      unsubShop();
      unsubGachaRewards();
      unsubGachaConfig();
      unsubDuel();
    };
  }, []);

  const currentUser = characters.find(c => c.id === currentUserId) || characters[0];

  // Handlers
  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    const previous = characters.find(character => character.id === updated.id);
    // Update the visible state immediately; Firestore realtime listeners can lag
    // or be unavailable when the app is running in local fallback mode.
    setCharacters(prev => {
      const exists = prev.some(character => character.id === updated.id);
      return exists
        ? prev.map(character => character.id === updated.id ? updated : character)
        : [...prev, updated];
    });
    try {
      await updateCharacterInDB(updated);
      return true;
    } catch (error) {
      if (previous) {
        setCharacters(prev => prev.map(character => character.id === previous.id ? previous : character));
      }
      console.error('Failed to persist character update:', error);
      alert('บันทึกข้อมูลตัวละครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      return false;
    }
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

  if (!currentUser) {
    return (
      <div className="star-shell min-h-[100dvh] bg-slate-950 flex items-center justify-center text-cyan-300 font-mono p-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="flex items-center gap-3 text-xs tracking-[.18em] uppercase">
            <span className="w-2 h-2 rounded-full bg-cyan-300 star-live-dot" />
            <span>STAR STREAM / LINKING</span>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
            <div className="h-3 w-2/3 rounded-full star-skeleton" />
            <div className="h-3 w-full rounded-full star-skeleton" />
            <div className="h-3 w-5/6 rounded-full star-skeleton" />
            <p className="pt-2 text-xs text-slate-400">กำลังเชื่อมต่อโครงข่ายข้อมูลแบบเรียลไทม์...</p>
          </div>
        </div>
      </div>
    );
  }

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
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'rankings' && (
          <Leaderboard
            characters={characters}
            currentUserId={currentUser.id}
            onSelectCharacter={(c) => {
              setCurrentUserId(c.id);
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
            onUpdateCharacterCoins={handleUpdateCharacterCoins}
            onSetCharacterCoins={handleSetCharacterCoins}
            onAddShopItem={handleAddShopItem}
            onDeleteShopItem={handleDeleteShopItem}
            onGrantItem={grantItemToPlayer}
            onRemoveItem={removeItemFromPlayer}
            onAssignQuest={handleAssignQuest}
            onAddGachaReward={addGachaRewardToDB}
            onDeleteGachaReward={deleteGachaRewardFromDB}
            onUpdateGachaConfig={updateGachaConfigInDB}
            onDirectEditCharacter={handleUpdateCharacter}
            onResetToDefaults={() => { void resetDatabaseToDefaults(); }}
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
        onSelect={(c) => setCurrentUserId(c.id)}
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
        onSelectCharacter={(c) => setCurrentUserId(c.id)}
      />
    </div>
  );
}
