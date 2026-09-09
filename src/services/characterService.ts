import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { 
  CharacterProfile, 
  Item, 
  Quest, 
  InventoryItem, 
  GachaReward, 
  GachaConfig, 
  CardDuelRoom 
} from "../types";
import { 
  INITIAL_CHARACTERS, 
  INITIAL_SHOP_ITEMS, 
  INITIAL_GACHA_CONFIG, 
  INITIAL_GACHA_REWARDS 
} from "../initialData";
import { syncCharacterHealth } from "../utils/healthSystem";

const CHARACTERS_COLLECTION = "characters";
const SHOP_ITEMS_COLLECTION = "shop_items";
const GACHA_REWARDS_COLLECTION = "gacha_rewards";
const GACHA_CONFIG_COLLECTION = "gacha_config";
const CARD_DUEL_ROOMS_COLLECTION = "card_duel_rooms";

// Cross-tab broadcast channel for instant local reactivity
const broadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('star_stream_realtime_channel') 
  : null;

// Local fallback store
let localCharacters: CharacterProfile[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_characters');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(syncCharacterHealth);
      }
    }
  } catch (e) {}
  return INITIAL_CHARACTERS.map(syncCharacterHealth);
})();

let localShopItems: Item[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_shop_items');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((i: any) => i.id));
        const missing = INITIAL_SHOP_ITEMS.filter(i => !existingIds.has(i.id));
        return [...parsed, ...missing];
      }
    }
  } catch (e) {}
  return INITIAL_SHOP_ITEMS;
})();

let gachaDefaultsMigrationStarted = false;

let localGachaRewards: GachaReward[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_gacha_rewards');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return INITIAL_GACHA_REWARDS;
})();

let localGachaConfig: GachaConfig = (() => {
  try {
    const saved = localStorage.getItem('starstream_gacha_config');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return INITIAL_GACHA_CONFIG;
})();

let localDuelRooms: CardDuelRoom[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_duel_rooms');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
})();

function saveLocalAll() {
  try {
    localStorage.setItem('starstream_characters', JSON.stringify(localCharacters));
    localStorage.setItem('starstream_shop_items', JSON.stringify(localShopItems));
    localStorage.setItem('starstream_gacha_rewards', JSON.stringify(localGachaRewards));
    localStorage.setItem('starstream_gacha_config', JSON.stringify(localGachaConfig));
    localStorage.setItem('starstream_duel_rooms', JSON.stringify(localDuelRooms));
  } catch (e) {}
}

export function calculatePowerScore(char: CharacterProfile): number {
  const statTotal = 
    (char.stats?.strength || 0) * 15 +
    (char.stats?.durability || 0) * 15 +
    (char.stats?.agility || 0) * 15 +
    (char.stats?.magic || 0) * 20;

  let skillTotal = 0;
  char.skills?.forEach(s => {
    const effectiveLvl = (s.level || 1) * (s.multiplier || 1);
    skillTotal += effectiveLvl * 80;
  });

  let equipBonus = 0;
  char.inventory?.forEach(inv => {
    if (inv.isEquipped) {
      equipBonus += 300;
      if (inv.effectType === "buff_stat" && inv.effectValue) {
        equipBonus += inv.effectValue * 20;
      }
    }
  });

  const transcendenceBonus = (char.statUpgradeCount || 0) * 500;
  return Math.round(statTotal + skillTotal + equipBonus + (char.hp || 0) / 2 + transcendenceBonus);
}

// Seed initial data if Firestore is empty
export async function seedInitialDataIfNeeded() {
  try {
    const charsSnap = await getDocs(collection(db, CHARACTERS_COLLECTION));
    if (charsSnap.empty) {
      for (const char of INITIAL_CHARACTERS) {
        const score = calculatePowerScore(char);
        await setDoc(doc(db, CHARACTERS_COLLECTION, char.id), {
          ...char,
          powerScore: score,
        });
      }
    }
    const shopSnap = await getDocs(collection(db, SHOP_ITEMS_COLLECTION));
    if (shopSnap.empty) {
      for (const item of INITIAL_SHOP_ITEMS) {
        await setDoc(doc(db, SHOP_ITEMS_COLLECTION, item.id), item);
      }
    }
    const gachaRewardsSnap = await getDocs(collection(db, GACHA_REWARDS_COLLECTION));
    if (gachaRewardsSnap.empty) {
      for (const reward of INITIAL_GACHA_REWARDS) {
        await setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward);
      }
    }
    const gachaConfigSnap = await getDocs(collection(db, GACHA_CONFIG_COLLECTION));
    if (gachaConfigSnap.empty) {
      await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), INITIAL_GACHA_CONFIG);
    }
  } catch (err) {
    console.warn("Firestore seed check fallback to local:", err);
  }
}

// Subscribe to characters
export function subscribeToCharacters(callback: (chars: CharacterProfile[]) => void) {
  try {
    const q = collection(db, CHARACTERS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot) => {
      const list: CharacterProfile[] = [];
      snapshot.forEach((docSnap) => {
        const raw = { ...docSnap.data(), id: docSnap.id } as CharacterProfile;
        const synced = syncCharacterHealth(raw);
        list.push(synced);

        // Auto-fix legacy inflated HP or corrupted values in Firestore
        if (
          raw.maxHp !== synced.maxHp ||
          raw.hp > synced.maxHp ||
          (raw.maxHp && raw.maxHp > 200) ||
          raw.maxHp === 1500 ||
          raw.maxHp === 800 ||
          raw.maxHp === 950
        ) {
          updateDoc(docSnap.ref, {
            hp: synced.hp,
            maxHp: synced.maxHp,
            powerScore: calculatePowerScore(synced),
          }).catch(() => {});
        }
      });
      if (list.length > 0) {
        list.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
        localCharacters = list;
        saveLocalAll();
        callback(list);
      } else {
        localCharacters = localCharacters.map(syncCharacterHealth);
        callback(localCharacters);
      }
    }, (err) => {
      console.warn("Characters listener error, using local:", err);
      localCharacters = localCharacters.map(syncCharacterHealth);
      callback(localCharacters);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'CHARACTERS_UPDATE') {
          callback(localCharacters);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
  } catch (err) {
    callback(localCharacters);
    return () => {};
  }
}

// Subscribe to Shop items
export function subscribeToShop(callback: (items: Item[]) => void) {
  try {
    const q = collection(db, SHOP_ITEMS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot) => {
      const list: Item[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as Item);
      });
      if (list.length > 0) {
        localShopItems = list;
        saveLocalAll();
        callback(list);
      } else {
        callback(localShopItems);
      }
    }, (err) => {
      console.warn("Shop listener error, using local:", err);
      callback(localShopItems);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'SHOP_UPDATE') {
          callback(localShopItems);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
  } catch (err) {
    callback(localShopItems);
    return () => {};
  }
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = sanitizeForFirestore(value);
    }
  }
  return cleaned;
}

// Update Character
export async function updateCharacterData(char: CharacterProfile): Promise<void> {
  const synced = syncCharacterHealth(char);
  const score = calculatePowerScore(synced);
  const updated: CharacterProfile = {
    ...synced,
    powerScore: score,
    lastUpdated: Date.now(),
  };

  // Update local
  localCharacters = localCharacters.map(c => c.id === updated.id ? updated : c);
  if (!localCharacters.some(c => c.id === updated.id)) {
    localCharacters.push(updated);
  }
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  // Update Firestore
  try {
    const cleaned = sanitizeForFirestore(updated);
    await setDoc(doc(db, CHARACTERS_COLLECTION, updated.id), cleaned);
  } catch (err) {
    console.warn("Error updating character in Firestore:", err);
  }
}

// Delete Character
export async function deleteCharacter(charId: string): Promise<void> {
  localCharacters = localCharacters.filter(c => c.id !== charId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    await deleteDoc(doc(db, CHARACTERS_COLLECTION, charId));
  } catch (err) {
    console.warn("Error deleting character in Firestore:", err);
  }
}

// Transfer coins
export async function transferCoins(
  fromCharOrId: CharacterProfile | string,
  toCharId: string,
  amount: number,
  memoOrToName?: string
): Promise<{ success: boolean; message: string }> {
  if (amount <= 0) return { success: false, message: "จำนวนเหรียญต้องมากกว่า 0" };
  const senderId = typeof fromCharOrId === 'string' ? fromCharOrId : fromCharOrId.id;
  if (senderId === toCharId) return { success: false, message: "ไม่สามารถโอนเหรียญให้ตนเองได้" };

  const sender = localCharacters.find(c => c.id === senderId);
  const receiver = localCharacters.find(c => c.id === toCharId);
  if (!sender || !receiver) return { success: false, message: "ไม่พบข้อมูลผู้เล่น" };

  if (sender.coins < amount) {
    return { success: false, message: "เหรียญไม่เพียงพอสำหรับการโอน" };
  }

  sender.coins -= amount;
  receiver.coins += amount;
  receiver.notifications = [
    {
      id: `notif-transfer-${Date.now()}`,
      title: "ได้รับเหรียญ Coins โอนเข้าบัญชี",
      message: `ได้รับ ${amount.toLocaleString()} Coins จาก "${sender.displayName}"${memoOrToName ? ` (บันทึก: ${memoOrToName})` : ''}`,
      timestamp: Date.now(),
      read: false,
      type: "trade",
    },
    ...(receiver.notifications || [])
  ];

  await updateCharacterData(sender);
  await updateCharacterData(receiver);
  return { success: true, message: `โอนสำเร็จ ${amount.toLocaleString()} Coins!` };
}

// Add Shop item (Admin)
export async function addShopItem(item: Item): Promise<void> {
  const id = item.id || `item-${Date.now()}`;
  const fullItem = { ...item, id };
  localShopItems = [fullItem, ...localShopItems.filter(i => i.id !== id)];
  saveLocalAll();
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });

  try {
    await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), fullItem);
  } catch (err) {
    console.warn("Error adding shop item to Firestore:", err);
  }
}

// Delete Shop item (Admin)
export async function deleteShopItem(itemId: string): Promise<void> {
  localShopItems = localShopItems.filter(i => i.id !== itemId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });

  try {
    await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));
  } catch (err) {
    console.warn("Error deleting shop item in Firestore:", err);
  }
}

// Subscribe to Gacha Rewards
export function subscribeToGachaRewards(callback: (rewards: GachaReward[]) => void) {
  try {
    const q = collection(db, GACHA_REWARDS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot) => {
      const list: GachaReward[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as GachaReward);
      });
      const missingDefaults = INITIAL_GACHA_REWARDS.filter(
        defaultReward => !list.some(reward => reward.id === defaultReward.id)
      );
      const mergedList = [...list, ...missingDefaults].sort((a, b) => a.rate - b.rate);

      if (missingDefaults.length > 0 && !gachaDefaultsMigrationStarted) {
        gachaDefaultsMigrationStarted = true;
        void Promise.all(
          missingDefaults.map(reward =>
            setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward)
          )
        ).catch(err => {
          console.warn("Error migrating default gacha rewards:", err);
        });
      }

      if (mergedList.length > 0) {
        localGachaRewards = mergedList;
        saveLocalAll();
        callback(mergedList);
      } else {
        callback(localGachaRewards);
      }
    }, (err) => {
      console.warn("Gacha rewards listener error:", err);
      callback(localGachaRewards);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_REWARDS_UPDATE') {
          callback(localGachaRewards);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
  } catch (err) {
    callback(localGachaRewards);
    return () => {};
  }
}

// Subscribe to Gacha Config
export function subscribeToGachaConfig(callback: (config: GachaConfig) => void) {
  try {
    const docRef = doc(db, GACHA_CONFIG_COLLECTION, "main");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const cfg = snap.data() as GachaConfig;
        localGachaConfig = cfg;
        saveLocalAll();
        callback(cfg);
      } else {
        callback(localGachaConfig);
      }
    }, (err) => {
      console.warn("Gacha config listener error:", err);
      callback(localGachaConfig);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_CONFIG_UPDATE') {
          callback(localGachaConfig);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
  } catch (err) {
    callback(localGachaConfig);
    return () => {};
  }
}

// Update Gacha Config (Admin)
export async function updateGachaConfig(config: GachaConfig): Promise<void> {
  localGachaConfig = config;
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });

  try {
    await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config);
  } catch (err) {
    console.warn("Error updating gacha config in Firestore:", err);
  }
}

// Save or Update Gacha Reward (Admin)
export async function saveGachaReward(reward: GachaReward): Promise<void> {
  const id = reward.id || `gacha-r-${Date.now()}`;
  const fullReward = { ...reward, id };
  localGachaRewards = [fullReward, ...localGachaRewards.filter(r => r.id !== id)];
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });

  try {
    await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), fullReward);
  } catch (err) {
    console.warn("Error saving gacha reward in Firestore:", err);
  }
}

// Delete Gacha Reward (Admin)
export async function deleteGachaReward(rewardId: string): Promise<void> {
  localGachaRewards = localGachaRewards.filter(r => r.id !== rewardId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });

  try {
    await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));
  } catch (err) {
    console.warn("Error deleting gacha reward in Firestore:", err);
  }
}

// Admin Grant / Spawn Item to player's inventory
export async function grantItemToPlayer(
  targetCharId: string,
  item: Item,
  quantity: number = 1,
  adminName: string = "โทแกบีผู้ดูแลระบบ"
): Promise<{ success: boolean; message: string; updatedChar?: CharacterProfile }> {
  const char = localCharacters.find(c => c.id === targetCharId);
  if (!char) return { success: false, message: "ไม่พบตัวละครเป้าหมาย" };

  const currentInventory: InventoryItem[] = [...(char.inventory || [])];
  const existingIndex = currentInventory.findIndex(
    i => i.id === item.id && !i.isEquipped && i.category === 'consumable'
  );

  if (existingIndex > -1) {
    currentInventory[existingIndex] = {
      ...currentInventory[existingIndex],
      quantity: currentInventory[existingIndex].quantity + quantity
    };
  } else {
    currentInventory.push({
      ...item,
      instanceId: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      quantity: Math.max(1, quantity),
      isEquipped: false
    });
  }

  const notifs = [
    {
      id: `notif-spawn-${Date.now()}`,
      title: "ได้รับไอเทมพระราชทานจากแอดมิน!",
      message: `${adminName} ได้เสกไอเทม "${item.name}" (จำนวน ${quantity} ชิ้น) มอบให้แก่คุณ`,
      timestamp: Date.now(),
      read: false,
      type: "admin" as const
    },
    ...(char.notifications || [])
  ];

  const updated: CharacterProfile = {
    ...char,
    inventory: currentInventory,
    notifications: notifs,
    lastUpdated: Date.now()
  };

  await updateCharacterData(updated);
  return { 
    success: true, 
    message: `เสกไอเทม "${item.name}" (x${quantity}) ให้ ${char.displayName} สำเร็จ!`,
    updatedChar: updated
  };
}

// Admin Remove / Revoke Item from player's inventory
export async function removeItemFromPlayer(
  targetCharId: string,
  instanceId: string,
  quantityToRemove?: number,
  adminName: string = "โทแกบีผู้ดูแลระบบ"
): Promise<{ success: boolean; message: string; updatedChar?: CharacterProfile }> {
  const char = localCharacters.find(c => c.id === targetCharId);
  if (!char) return { success: false, message: "ไม่พบตัวละครเป้าหมาย" };

  const currentInventory: InventoryItem[] = [...(char.inventory || [])];
  const targetItemIndex = currentInventory.findIndex(i => i.instanceId === instanceId || i.id === instanceId);
  if (targetItemIndex === -1) {
    return { success: false, message: "ไม่พบไอเทมนี้ในคลังของผู้เล่น" };
  }

  const targetItem = currentInventory[targetItemIndex];
  const removedItemName = targetItem.name;

  if (quantityToRemove && quantityToRemove < targetItem.quantity) {
    currentInventory[targetItemIndex] = {
      ...targetItem,
      quantity: targetItem.quantity - quantityToRemove
    };
  } else {
    currentInventory.splice(targetItemIndex, 1);
  }

  const notifs = [
    {
      id: `notif-revoke-${Date.now()}`,
      title: "ระบบได้ทำการลบไอเทมออกจากคลัง",
      message: `${adminName} ได้ทำการลบไอเทม "${removedItemName}" ออกจากคลังกระเป๋าของคุณ`,
      timestamp: Date.now(),
      read: false,
      type: "admin" as const
    },
    ...(char.notifications || [])
  ];

  const updated: CharacterProfile = {
    ...char,
    inventory: currentInventory,
    notifications: notifs,
    lastUpdated: Date.now()
  };

  await updateCharacterData(updated);
  return { 
    success: true, 
    message: `ลบไอเทม "${removedItemName}" ออกจากคลังของ ${char.displayName} สำเร็จ!`,
    updatedChar: updated
  };
}

// Subscribe to Card Duel Rooms
export function subscribeToDuelRooms(callback: (rooms: CardDuelRoom[]) => void) {
  try {
    const q = collection(db, CARD_DUEL_ROOMS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot) => {
      const list: CardDuelRoom[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as CardDuelRoom);
      });
      if (list.length > 0) {
        list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
        localDuelRooms = list;
        saveLocalAll();
        callback(list);
      } else {
        callback(localDuelRooms);
      }
    }, (err) => {
      console.warn("Duel rooms listener error, using local:", err);
      callback(localDuelRooms);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'DUEL_ROOMS_UPDATE') {
          callback(localDuelRooms);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
  } catch (err) {
    callback(localDuelRooms);
    return () => {};
  }
}

// Create Card Duel Room
export async function createDuelRoom(room: CardDuelRoom): Promise<string> {
  const id = room.id || `room-${Date.now()}`;
  const fullRoom = {
    ...room,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  localDuelRooms = [fullRoom, ...localDuelRooms.filter(r => r.id !== id)];
  saveLocalAll();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  // If invitedPlayerId or opponentId is specified, notify them!
  const targetOpponentId = room.invitedPlayerId || room.opponentId;
  if (targetOpponentId) {
    const opp = localCharacters.find(c => c.id === targetOpponentId);
    if (opp) {
      opp.notifications = [
        {
          id: `notif-duel-invite-${Date.now()}`,
          title: "มีสารท้าดวลศึกไพ่ 21!",
          message: `"${room.creatorName}" ได้เชิญคุณเข้าร่วมศึกดวลไพ่ 21 เดิมพัน ${room.betAmount.toLocaleString()} Coins กดเข้าสู่โหมดการ์ดเกมเพื่อตอบรับคำท้า`,
          timestamp: Date.now(),
          read: false,
          type: "game" as const
        },
        ...(opp.notifications || [])
      ];
      await updateCharacterData(opp);
    }
  }

  try {
    await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, id), fullRoom);
  } catch (err) {
    console.warn("Error creating duel room in Firestore:", err);
  }
  return id;
}

// Update Card Duel Room
export async function updateDuelRoom(room: CardDuelRoom): Promise<void> {
  const updated = {
    ...room,
    updatedAt: Date.now()
  };
  localDuelRooms = localDuelRooms.map(r => r.id === updated.id ? updated : r);
  saveLocalAll();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  try {
    await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, room.id), updated);
  } catch (err) {
    console.warn("Error updating duel room in Firestore:", err);
  }
}

// Accept Card Duel Challenge / Join Room
export async function acceptDuelChallenge(roomId: string, opponent: CharacterProfile): Promise<void> {
  const room = localDuelRooms.find(r => r.id === roomId);
  if (!room) throw new Error("ไม่พบห้องดวลที่เลือก");
  if (room.status !== 'waiting') throw new Error("ห้องนี้มีผู้เข้าร่วมครบแล้วหรือการแข่งขันได้เริ่มขึ้นแล้ว");

  // Deduct/hold coins or prepare match
  const readyList = Array.from(new Set([...(room.readyPlayers || []), room.creatorId, opponent.id]));
  const isFullAndReady = readyList.length >= (room.requiredPlayersCount || 2);

  room.opponentId = opponent.id;
  room.opponentName = opponent.displayName;
  room.opponentAvatar = opponent.avatarUrl;
  room.readyPlayers = readyList;
  room.status = isFullAndReady ? 'ready' : 'waiting';
  room.updatedAt = Date.now();

  // Send immediate notifications to both players
  const creator = localCharacters.find(c => c.id === room.creatorId);
  if (creator) {
    creator.notifications = [
      {
        id: `notif-duel-ready-${Date.now()}`,
        title: "ผู้เล่นพร้อมเล่นครบตามจำนวนแล้ว!",
        message: `"${opponent.displayName}" ได้เข้าร่วมห้องดวลไพ่ 21 แล้ว! ผู้เล่นพร้อมครบตามจำนวนที่กำหนดไว้ทันที สามารถเริ่มการดวลได้เลย`,
        timestamp: Date.now(),
        read: false,
        type: "game" as const
      },
      ...(creator.notifications || [])
    ];
    await updateCharacterData(creator);
  }

  opponent.notifications = [
    {
      id: `notif-duel-accepted-${Date.now()}`,
      title: "เข้าร่วมศึกดวลไพ่ 21 สำเร็จ!",
      message: `คุณได้เข้าร่วมห้องดวลกับ "${room.creatorName}" แล้ว! ผู้เล่นครบตามจำนวนพร้อมเริ่มการประลองทันที`,
      timestamp: Date.now(),
      read: false,
      type: "game" as const
    },
    ...(opponent.notifications || [])
  ];
  await updateCharacterData(opponent);

  await updateDuelRoom(room);
}

// Cancel or Delete Card Duel Room
export async function cancelDuelRoom(roomId: string): Promise<void> {
  localDuelRooms = localDuelRooms.filter(r => r.id !== roomId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  try {
    await deleteDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId));
  } catch (err) {
    console.warn("Error deleting duel room in Firestore:", err);
  }
}

// Reset all database collections to initial values
export async function resetDatabaseToDefaults(): Promise<void> {
  localCharacters = INITIAL_CHARACTERS;
  localShopItems = INITIAL_SHOP_ITEMS;
  localGachaRewards = INITIAL_GACHA_REWARDS;
  localGachaConfig = INITIAL_GACHA_CONFIG;
  localDuelRooms = [];
  saveLocalAll();

  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  for (const char of INITIAL_CHARACTERS) {
    const score = calculatePowerScore(char);
    try {
      await setDoc(doc(db, CHARACTERS_COLLECTION, char.id), {
        ...char,
        powerScore: score,
      });
    } catch (e) {}
  }
  for (const item of INITIAL_SHOP_ITEMS) {
    try {
      await setDoc(doc(db, SHOP_ITEMS_COLLECTION, item.id), item);
    } catch (e) {}
  }
  for (const reward of INITIAL_GACHA_REWARDS) {
    try {
      await setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward);
    } catch (e) {}
  }
  try {
    await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), INITIAL_GACHA_CONFIG);
  } catch (e) {}
}

// Card 21 Match Bet Settlement
export async function settleCard21Bet(
  winnerChar: CharacterProfile,
  loserChar: CharacterProfile | null,
  betAmount: number,
  isTie: boolean,
  reason: string
): Promise<void> {
  if (betAmount <= 0) return;
  if (isTie) return;

  if (!loserChar) {
    const newCoins = winnerChar.coins + betAmount;
    await updateCharacterData({
      ...winnerChar,
      coins: newCoins,
      notifications: [
        {
          id: `notif-card21-win-${Date.now()}`,
          title: "ชนะศึกดวลไพ่ 21!",
          message: `${reason} ได้รับเหรียญรางวัล +${betAmount.toLocaleString()} Coins`,
          timestamp: Date.now(),
          read: false,
          type: "game",
        },
        ...winnerChar.notifications,
      ],
    });
  } else {
    await transferCoins(
      loserChar,
      winnerChar.id,
      betAmount,
      winnerChar.displayName
    );
  }
}

// Aliases
export const subscribeToShopItems = subscribeToShop;
export const updateCharacter = updateCharacterData;
export const updateCharacterInDB = updateCharacterData;
export const addCharacterToDB = updateCharacterData;
export const transferCoinsBetweenCharacters = transferCoins;
export const saveShopItem = addShopItem;
export const addShopItemToDB = addShopItem;
export const removeShopItem = deleteShopItem;
export const deleteShopItemFromDB = deleteShopItem;
export const removeGachaReward = deleteGachaReward;
export const deleteGachaRewardFromDB = deleteGachaReward;
export const addGachaRewardToDB = saveGachaReward;
export const updateGachaRewardInDB = saveGachaReward;
export const saveGachaConfig = updateGachaConfig;
export const updateGachaConfigInDB = updateGachaConfig;
