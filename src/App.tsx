import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
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
  subscribeToGachaBanners,
  subscribeToGachaConfig, 
  subscribeToDuelRooms,
  updateCharacterInDB, updateCharacterStatusData,
  calculatePowerScore,
  addCharacterToDB, 
  deleteCharacterFromDB,
  transferCoinsBetweenCharacters,
  addShopItemToDB,
  updateShopItem,
  deleteShopItemFromDB,
  updateGachaConfigInDB,
  addGachaRewardToDB,
  deleteGachaRewardFromDB,
  saveGachaBanner,
  deleteGachaBanner,
  grantItemToPlayer as grantItemToPlayerInDB,
  removeItemFromPlayer as removeItemFromPlayerInDB,
  resetDatabaseToDefaults,
  seedInitialDataIfNeeded,
  subscribeToMarketplace,
  subscribeToMarketplaceAuctions,
  subscribeToCraftingRecipes,
  saveCraftingRecipe,
  deleteCraftingRecipe,
  craftRecipe,
  createMarketplaceListing,
  transferInventoryItem,
  createMarketplaceAuction,
  placeMarketplaceBid,
  finalizeMarketplaceAuction,
  cancelMarketplaceListing,
  cancelMarketplaceAuction,
  buyMarketplaceListing
} from './services/characterService';
import { StatusWindow } from './components/StatusWindow';
import { ShopInventory } from './components/ShopInventory';
import { GameCenter } from './components/GameCenter';
import { GachaSystem } from './components/GachaSystem';
import { Leaderboard } from './components/Leaderboard';
import { QuestNotification } from './components/QuestNotification';
import { QuestBoard } from './components/QuestBoard';
import { CraftingPanel } from './components/CraftingPanel';
import { AdminPanel } from './components/AdminPanel';
const ItemManagementPanel = lazy(() => import('./components/ItemManagementPanel').then(m => ({ default: m.ItemManagementPanel })));
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
  Swords,
  Package
} from 'lucide-react';
import confetti from './utils/confetti';
import { formatCoins, getCoinDisplayMode, type CoinDisplayMode } from './utils/formatNumber';

const isBundledAvatar = (value: unknown): boolean => {
  const avatar = String(value || '').trim();
  return !avatar || /^\/avatars\/(system|chaewon|hayeon|miyeon|sera)\.svg$/i.test(avatar);
};

const isPersistentCustomAvatar = (value: unknown): boolean => {
  const avatar = String(value || '').trim();
  if (!avatar || /^blob:/i.test(avatar)) return false;
  return !isBundledAvatar(avatar);
};

class BattleArenaErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; message: string}> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: String(error?.message || 'เกิดข้อผิดพลาดในระบบต่อสู้') };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Battle Arena runtime error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <div className="max-w-lg w-full rounded-2xl border border-rose-500/30 bg-slate-950 p-6 text-center">
            <div className="text-lg font-black text-white mb-2">ระบบต่อสู้มีปัญหา</div>
            <div className="text-sm text-slate-400 mb-3">ระบบป้องกันการเด้งทั้งเว็บทำงานแล้ว กรุณากลับเข้าหน้าต่อสู้อีกครั้ง</div>
            <div className="mb-4 rounded-xl bg-black/50 p-3 text-left text-xs text-rose-300 break-words">{this.state.message}</div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-slate-950"
            >
              โหลดระบบต่อสู้อีกครั้ง
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

class ItemPanelErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error('Item Management runtime error:', error); }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-[50vh] flex items-center justify-center p-8">
        <div className="max-w-lg w-full rounded-2xl border border-rose-500/30 bg-slate-950 p-6 text-center">
          <div className="text-lg font-black text-white mb-2">ระบบจัดการไอเทมมีปัญหา</div>
          <div className="text-sm text-slate-400 mb-4">ส่วนอื่นของเว็บไซต์ยังสามารถใช้งานได้</div>
          <button type="button" onClick={() => this.setState({hasError:false})} className="rounded-xl bg-fuchsia-500 px-4 py-2 font-bold text-slate-950">ลองโหลดใหม่</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  // Deployment sync checkpoint: keep main/Vercel source aligned.
  const [activeTab, setActiveTab] = useState<'status' | 'shop' | 'games' | 'gacha' | 'rankings' | 'notifications' | 'quests' | 'battle' | 'crafting' | 'admin' | 'items'>(() => {
    const fallback = 'status' as const;
    const allowed = ['status', 'shop', 'games', 'gacha', 'rankings', 'notifications', 'quests', 'battle', 'crafting', 'admin', 'items'] as const;
    try {
      // URL hash is the primary source because it survives a hard refresh
      // even when browser storage is unavailable/cleared by the environment.
      const hashTab = window.location.hash.replace(/^#/, '');
      if (allowed.includes(hashTab as typeof allowed[number])) {
        return hashTab as typeof allowed[number];
      }
      const saved = localStorage.getItem('starstream_active_tab');
      return allowed.includes(saved as typeof allowed[number]) ? saved as typeof allowed[number] : fallback;
    } catch {
      return fallback;
    }
  });

  // Real-time State
  const [characters, setCharacters] = useState<CharacterProfile[]>(() => []);
  const [coinDisplayMode, setCoinDisplayMode] = useState<CoinDisplayMode>(() => getCoinDisplayMode());
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    const fallback = '';
    try {
      // Keep the selected character in the URL as a second persistence layer.
      // This prevents a hard refresh from falling back to the first bundled
      // character when browser storage is unavailable or stale.
      const fromUrl = new URLSearchParams(window.location.search).get('character');
      const saved = localStorage.getItem('starstream_current_user_id');
      return fromUrl || saved || fallback;
    } catch {
      try {
        return new URLSearchParams(window.location.search).get('character') || fallback;
      } catch {
        return fallback;
      }
    }
  });
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
  const [marketplaceListings, setMarketplaceListings] = useState<import('./types').MarketplaceListing[]>(() => []);
  const [marketplaceAuctions, setMarketplaceAuctions] = useState<import('./types').MarketplaceAuction[]>(() => []);
  const [craftingRecipes, setCraftingRecipes] = useState<import('./types').CraftingRecipe[]>(() => []);
  const [isRealtimeLinked, setIsRealtimeLinked] = useState(false);
  const charactersRef = useRef<CharacterProfile[]>([]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    try {
      localStorage.setItem('starstream_active_tab', activeTab);
    } catch {
      // URL hash below is still enough to preserve the current page.
    }
    try {
      const nextHash = '#' + activeTab;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    } catch {
      // Ignore URL update failures.
    }
  }, [activeTab]);

  // Admin mode state must be initialized before any hook/dependency reads it.
  // Reading a const from a dependency array before its declaration causes a
  // production runtime TDZ error: "Cannot access 'isAdminMode' before initialization".
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    try { return localStorage.getItem('starstream_admin_mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('starstream_admin_mode', String(isAdminMode)); } catch {}
  }, [isAdminMode]);

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
            try {
              const saved = localStorage.getItem('starstream_current_user_id');
              if (saved && chars.some(c => c.id === saved)) {
                return saved;
              }
            } catch (e) {}
            if (prev && chars.some(c => c.id === prev)) return prev;
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
      cleanups.push(subscribeToMarketplace((listings) => setMarketplaceListings(listings)));
      cleanups.push(subscribeToMarketplaceAuctions((auctions) => setMarketplaceAuctions(auctions)));
      cleanups.push(subscribeToCraftingRecipes((recipes) => setCraftingRecipes(recipes)));
    };

    void initializeRealtimeData();

    // Do not fall back to bundled starter characters here.
    // A starter profile that was deleted from the shared database must never
    // reappear on refresh just because the realtime connection is slow/offline.
    // The UI stays in a neutral loading state until the server snapshot arrives.
    return () => {
      disposed = true;
      cleanups.forEach(cleanup => cleanup());
    };
  }, []);

  // Keep the shell usable even if localStorage contains an empty collection
  // from an earlier failed sync. The realtime snapshot can still replace it.
  const currentUser = (() => {
    const fallback = characters.find(Boolean);
    const candidate = characters.find(c => c && c.id === currentUserId) || fallback;
    if (!candidate) return null;
    // Realtime/API data can be partially populated after an old schema change.
    // Fill only missing UI-safe fields from the server character so one malformed
    // record cannot crash the initial screen.
    return {
      ...candidate,
      id: String(candidate.id || ''),
      username: String(candidate.username || ''),
      displayName: String(candidate.displayName || ''),
      nickname: String(candidate.nickname || ''),
      avatarUrl: String(candidate.avatarUrl || '/avatars/system.svg'),
      characteristics: Array.isArray(candidate.characteristics) ? candidate.characteristics : [],
      stats: { strength: 0, durability: 0, agility: 0, magic: 0, ...(candidate.stats || {}) },
      skills: Array.isArray(candidate.skills) ? candidate.skills : [],
      inventory: Array.isArray(candidate.inventory) ? candidate.inventory : [],
      quests: Array.isArray(candidate.quests) ? candidate.quests : [],
      notifications: Array.isArray(candidate.notifications) ? candidate.notifications : [],
      coins: Number.isFinite(Number(candidate.coins)) ? Number(candidate.coins) : 0,
      possibility: Number.isFinite(Number(candidate.possibility)) ? Number(candidate.possibility) : 0,
      hp: Number.isFinite(Number(candidate.hp)) ? Number(candidate.hp) : 0,
      maxHp: Number.isFinite(Number(candidate.maxHp)) ? Number(candidate.maxHp) : 1,
      lastUpdated: Number(candidate.lastUpdated) || 0,
      role: candidate?.role === 'admin' ? 'admin' : 'player',
    } as CharacterProfile;
  })();
  // Momi is the permanent owner. Other profiles can only use Admin Mode after Momi grants them the admin role.
  const isMomiProfile = (character: CharacterProfile | null | undefined): boolean => {
    if (!character) return false;
    const id = String(character.id || '').trim().toLowerCase();
    const username = String(character.username || '').trim().toLowerCase();
    const displayName = String(character.displayName || '').trim().toLowerCase();
    return id === '001' || username === '001' || id === 'momi' || username === 'momi' || displayName === 'momi' || displayName === 'โมมิ' || displayName.includes('(momi)');
  };
  const canUseAdminMode = Boolean(currentUser && (isMomiProfile(currentUser) || currentUser.role === 'admin'));

  // If the active profile is no longer allowed to use Admin Mode (for example
  // after switching characters or having the role revoked), immediately leave
  // the admin screen and disable the mode.
  useEffect(() => {
    if (!canUseAdminMode) {
      if (isAdminMode) setIsAdminMode(false);
      if (activeTab === 'admin' || activeTab === 'items') setActiveTab('status');
    }
  }, [canUseAdminMode, isAdminMode, activeTab]);

  const handleSelectCharacter = (charId: string) => {
    setCurrentUserId(charId);
    try {
      localStorage.setItem('starstream_current_user_id', charId);
    } catch (e) {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('character', charId);
      window.history.replaceState(null, '', url.toString());
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

        // Never let a stale Shop/Inventory/Battle/Admin object erase a custom
        // profile image while saving another field. Child screens can hold an
        // older CharacterProfile for a moment, especially after navigation or
        // a hard refresh.
        if (
          key === 'avatarUrl' &&
          isPersistentCustomAvatar(previous.avatarUrl) &&
          isBundledAvatar(updated.avatarUrl)
        ) {
          return;
        }

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
      const previous = charactersRef.current.find(character => character.id === updated.id);
      const committed = previous &&
        isPersistentCustomAvatar(previous.avatarUrl) &&
        isBundledAvatar(updated.avatarUrl)
        ? { ...updated, avatarUrl: previous.avatarUrl }
        : updated;
      charactersRef.current = charactersRef.current.some(character => character.id === committed.id)
        ? charactersRef.current.map(character => character.id === committed.id ? committed : character)
        : [...charactersRef.current, committed];
      setCharacters([...charactersRef.current]);
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
    // Update the Admin UI immediately. Do not make the form wait for a
    // Firestore network round-trip; the shop service already performs an
    // optimistic local write and persists it in the background.
    setShopItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
    void addShopItemToDB(item).catch((error) => {
      console.error('Failed to persist shop item to Firestore:', error);
    });
  };
  const handleUpdateShopItem = async (item: Item): Promise<void> => {
    setShopItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
    try {
      await updateShopItem(item);
    } catch (error) {
      console.error('Failed to update shop item:', error);
      throw error;
    }
  };


  const handleDeleteShopItem = async (itemId: string): Promise<void> => {
    await deleteShopItemFromDB(itemId);
    setShopItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCreateCharacter = async (newChar: CharacterProfile) => {
    await addCharacterToDB(newChar);
    setCurrentUserId(newChar.id);
    try {
      localStorage.setItem('starstream_current_user_id', newChar.id);
    } catch {}
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

  const handleUpdateCharacterPossibility = async (characterId: string, delta: number) => {
    const target = charactersRef.current.find(character => character.id === characterId);
    if (!target) return;
    const next = Math.max(0, (Number(target.possibility) || 0) + delta);
    await handleUpdateCharacter({ ...target, possibility: next, lastUpdated: Date.now() });
  };

  const handleTransferCoins = async (senderId: string, recipientId: string, amount: number, currency: 'coins' | 'possibility' = 'coins') => {
    try {
      if (currency === 'coins') {
        const result = await transferCoinsBetweenCharacters(senderId, recipientId, amount);
        if (!result.success) { alert(result.message); return; }
        confetti({ particleCount: 60, spread: 50 });
        alert(result.message || `โอนเหรียญ ${formatCoins(amount)} Coins สำเร็จแล้ว!`);
        return;
      }
      const sender = charactersRef.current.find(c => c.id === senderId);
      const recipient = charactersRef.current.find(c => c.id === recipientId);
      if (!sender || !recipient) { alert('ไม่พบตัวละครผู้โอนหรือผู้รับ'); return; }
      const balance = Number(sender.possibility) || 0;
      if (amount <= 0 || amount > balance) { alert('ความเป็นไปได้ไม่เพียงพอ'); return; }
      const now = Date.now();
      const savedSender = await handleUpdateCharacter({ ...sender, possibility: balance - amount, lastUpdated: now });
      if (!savedSender) return;
      const savedRecipient = await handleUpdateCharacter({ ...recipient, possibility: (Number(recipient.possibility) || 0) + amount, lastUpdated: now + 1 });
      if (!savedRecipient) return;
      confetti({ particleCount: 60, spread: 50 });
      alert(`โอนความเป็นไปได้ ${formatCoins(amount)} สำเร็จแล้ว!`);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการโอน');
    }
  };

  // Never render a deleted/missing profile while the first authoritative
  // character snapshot is still loading.
  if (!currentUser) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-5 text-center shadow-xl">
          <div className="text-sm font-black">STAR STREAM / LINKING</div>
          <div className="mt-2 text-xs text-slate-400">กำลังโหลดข้อมูลตัวละครจากฐานข้อมูล...</div>
        </div>
      </div>
    );
  }

  // Waiting rooms count
  const waitingDuelRoomsCount = duelRooms.filter(r => r.status === 'waiting').length;
  const unreadNotifsCount = currentUser?.notifications?.filter(n => !n.read).length || 0;
  const handleCoinDisplayModeChange = (mode: CoinDisplayMode) => {
    setCoinDisplayMode(mode);
    try {
      localStorage.setItem('starstream_coin_display_mode', mode);
    } catch {
      // Keep the setting for the current session if storage is unavailable.
    }
  };


  return (
    <div className="star-shell min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Main Navigation Bar */}
      <header className="star-topbar sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
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
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/* Coin Pill */}
            <div className="flex min-w-0 max-w-[44vw] shrink items-center gap-1 px-1.5 sm:max-w-[48vw] sm:gap-1.5 sm:px-2 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold shadow-sm">
              <Coins className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="min-w-0 truncate">{formatCoins(currentUser.coins, coinDisplayMode)} C</span>
              <span className="hidden sm:inline text-[9px] text-amber-500/70 shrink-0">({coinDisplayMode === 'compact' ? '1K' : '1,000'})</span>
              <div className="ml-auto flex shrink-0 rounded-lg overflow-hidden border border-amber-500/30">
                <button
                  type="button"
                  onClick={() => handleCoinDisplayModeChange('compact')}
                  className={`px-1.5 py-1 text-[9px] font-black ${coinDisplayMode === 'compact' ? 'bg-amber-500 text-slate-950' : 'bg-slate-950/60 text-amber-300 hover:bg-amber-900/50'}`}
                  title="แสดงเงินแบบย่อ เช่น 1K, 1M, 1B"
                >
                  1K
                </button>
                <button
                  type="button"
                  onClick={() => handleCoinDisplayModeChange('full')}
                  className={`px-1.5 py-1 text-[9px] font-black ${coinDisplayMode === 'full' ? 'bg-amber-500 text-slate-950' : 'bg-slate-950/60 text-amber-300 hover:bg-amber-900/50'}`}
                  title="แสดงเงินแบบเต็ม เช่น 1,000, 1,000,000"
                >
                  1,000
                </button>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-300 text-xs font-mono font-bold">
              ✨ {formatCoins(currentUser.possibility || 0)} P
            </div>

            {/* Character Selector Button */}
            <button
              id="btn-character-switcher"
              onClick={() => setIsCharSelectOpen(true)}
              className="flex min-w-0 flex-1 sm:flex-none sm:max-w-[48vw] items-center gap-2 px-2 sm:px-3 py-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer shadow"
            >
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="w-8 h-8 sm:w-7 sm:h-7 rounded-xl object-cover border border-cyan-500/40 shrink-0"
              />
              <div className="text-left min-w-0 flex-1">

                <div className="text-xs font-bold text-white leading-none">
                  {currentUser.displayName}
                </div>
                <div className="text-[10px] text-cyan-400 leading-none mt-0.5">
                  {currentUser.nickname || 'ผู้อวตาร'}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {/* Admin Mode: only Momi or a profile granted admin role can see/use it. */}
            {canUseAdminMode && (
              <button
                id="btn-toggle-admin-header"
                onClick={() => {
                  const next = !isAdminMode;
                  setIsAdminMode(next);
                  if (next) setActiveTab('admin');
                  else if (activeTab === 'admin') setActiveTab('status');
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
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}

      <nav className="star-nav bg-slate-900/60 border-b border-slate-800 px-2 sm:px-4 md:px-8 py-2 overflow-x-auto overflow-y-hidden nav-scroll-x">
        <div className="max-w-7xl mx-auto flex w-max min-w-max items-center gap-1.5 sm:gap-2">
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
            onClick={() => setActiveTab('games')}
             className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'games'
                 ? 'is-active text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            กิจกรรมเกม (Games)
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

          <button
            id="nav-tab-quests"
            onClick={() => setActiveTab('quests')}
            className={'star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ' + (activeTab === 'quests' ? 'is-active text-amber-200 font-black shadow-[0_0_20px_rgba(245,158,11,0.24)]' : 'text-amber-400 hover:bg-amber-950/40 border border-amber-500/40')}
          >
            <ScrollText className="w-4 h-4" />
            ภารกิจ
          </button>
          <button
            id="nav-tab-crafting"
            onClick={() => setActiveTab('crafting')}
            className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'crafting' ? 'is-active text-cyan-200 font-black shadow-[0_0_20px_rgba(34,211,238,0.24)]' : 'text-cyan-300 hover:bg-cyan-950/40 border border-cyan-500/40'}`}
          >
            <Package className="w-4 h-4" />
            คราฟต์ / วัตถุดิบ
          </button>
          {canUseAdminMode && isAdminMode && (
            <button
              id="nav-tab-items"
              onClick={() => setActiveTab('items')}
              className={`star-nav-tab px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'items' ? 'is-active text-fuchsia-200 font-black shadow-[0_0_20px_rgba(217,70,239,0.24)]' : 'text-fuchsia-300 hover:bg-fuchsia-950/40 border border-fuchsia-500/40'}`}
            >
              <Package className="w-4 h-4" />
              จัดการไอเทมของเว็บ
            </button>
          )}
          {canUseAdminMode && isAdminMode && (
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
          )}
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
            shopItems={shopItems.filter(item => item.inShop !== false && !item.adminOnly)}
            onUpdateCharacter={handleUpdateCharacter}
            onAddShopItem={handleAddShopItem}
            onUpdateShopItem={handleUpdateShopItem}
            onDeleteShopItem={handleDeleteShopItem}
            marketplaceListings={marketplaceListings}
            onCreateMarketplaceListing={(item, price, quantity) => createMarketplaceListing(currentUser.id, item, price, quantity)}
            onCancelMarketplaceListing={(listingId) => cancelMarketplaceListing(listingId, currentUser.id)}
            onBuyMarketplaceListing={async (listingId, quantity) => { const result = await buyMarketplaceListing(listingId, currentUser.id, quantity); if (!result.success) alert(result.message); return result.success; }}
            allCharacters={characters}
            onTransferItem={(recipientId, itemInstanceId, quantity) => transferInventoryItem(currentUser.id, recipientId, itemInstanceId, quantity)}
            marketplaceAuctions={marketplaceAuctions}
            onCreateMarketplaceAuction={(item, price, durationMs, quantity) => createMarketplaceAuction(currentUser.id, item, price, durationMs, quantity)}
            onPlaceMarketplaceBid={(auctionId, bid) => placeMarketplaceBid(auctionId, currentUser.id, bid)}
            onFinalizeMarketplaceAuction={(auctionId) => finalizeMarketplaceAuction(auctionId)}
            onCancelMarketplaceAuction={(auctionId) => cancelMarketplaceAuction(auctionId, currentUser.id)}
            isAdmin={isAdminMode}
          />
        )}

        {activeTab === 'crafting' && (
          <CraftingPanel
            character={currentUser}
            shopItems={shopItems}
            recipes={craftingRecipes}
            isAdmin={canUseAdminMode && isAdminMode}
            onCraft={async (recipe) => {
              const result = await craftRecipe(currentUser.id, recipe, shopItems);
              if (!result.success) { alert(result.message); return; }
              if (result.updatedChar) {
                charactersRef.current = charactersRef.current.map(c => c.id === result.updatedChar!.id ? result.updatedChar! : c);
                setCharacters([...charactersRef.current]);
              }
              alert('คราฟต์สำเร็จ: ' + recipe.name);
            }}
            onSaveRecipe={async (recipe) => { await saveCraftingRecipe(recipe); }}
            onDeleteRecipe={async (id) => { await deleteCraftingRecipe(id); }}
          />
        )}

        {activeTab === 'battle' && (
          <BattleArena
            currentUser={currentUser}
            allCharacters={characters}
            shopItems={shopItems}
            isAdmin={isAdminMode && canUseAdminMode}
          />
        )}

        {activeTab === 'games' && (
          <GameCenter
            currentUser={currentUser}
            onUpdateCharacter={handleUpdateCharacter}
          />
        )}

        {activeTab === 'gacha' && (
          <GachaSystem
            character={currentUser}
            gachaRewards={gachaRewards}
            gachaConfig={gachaConfig}
            shopItems={shopItems}
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

        {activeTab === 'items' && canUseAdminMode && isAdminMode && (
          <ItemPanelErrorBoundary>
            <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-slate-400">กำลังโหลดระบบจัดการไอเทม...</div>}>
              <ItemManagementPanel
                shopItems={shopItems}
                onAddItem={handleAddShopItem}
                onUpdateItem={handleUpdateShopItem}
                onDeleteItem={handleDeleteShopItem}
              />
            </Suspense>
          </ItemPanelErrorBoundary>
        )}

        {activeTab === 'admin' && canUseAdminMode && isAdminMode && (
          <AdminPanel
            characters={characters}
            shopItems={shopItems}
            gachaRewards={gachaRewards}
            gachaConfig={gachaConfig}
            gachaBanners={gachaBanners}
            onUpdateCharacterCoins={handleUpdateCharacterCoins}
            onSetCharacterCoins={handleSetCharacterCoins}
            onUpdateCharacterPossibility={handleUpdateCharacterPossibility}
            onAddShopItem={handleAddShopItem}
            onUpdateShopItem={handleUpdateShopItem}
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
            onToggleAdminRole={isMomiProfile(currentUser) ? (char) => {
              if (isMomiProfile(char)) return;
              void handleUpdateCharacter({ ...char, role: char.role === 'admin' ? 'player' : 'admin' });
            } : undefined}
            onResetToDefaults={() => { void resetDatabaseToDefaults(); }}
          />
        )}
        {activeTab === 'admin' && canUseAdminMode && isAdminMode && (
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
// Vercel production deployment trigger: status screen is the initial view.