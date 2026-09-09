export interface CharacterStats {
  strength: number;     // พละกำลัง
  durability: number;   // ความทนทาน (Stamina)
  agility: number;      // ความว่องไว (Agility)
  magic: number;        // พลังเวท / มานา
}

export type ORVSkillRank = 
  | 'general'       // ทั่วไป (F~E)
  | 'rare'          // หายาก (D~C)
  | 'hero'          // วีรชน (B)
  | 'semi_myth'     // กึ่งตำนาน (A)
  | 'legendary'     // ตำนาน (S)
  | 'myth'          // เรื่องเล่ายักษ์ / มายาสงคราม (Myth / SSS)
  | 'transcendent'; // เหนือมนุษย์ / เทพจุติ

export interface Skill {
  id: string;
  name: string;
  level: number;
  maxLevel?: number;    // default 10
  multiplier: number;   // เริ่มต้น 1, เมื่ออัปเกิน 10 จะคูณ x2 ทวีคูณ
  type?: string;        // ทั่วไป, ท่าไม้ตาย, Ultimate
  description: string;
  cooldown?: string;
  conditions?: string;
  cost?: string;
  category?: 'innate' | 'stigma' | 'story' | 'general'; // หมวดหมู่
  // ORV Rank & Level Up System Details
  orvRank?: ORVSkillRank; // ระดับแร็งก์ในโลก ORV
  orvRankCustom?: string; // ระดับกำหนดเอง
  perkLevel10?: string;   // ความสามารถพิเศษปลดล็อกเมื่อ Lv.10
  statBonusPerLevel?: string; // ค่าสเตตัสที่ได้ต่อเลเวล
  upgradeCount?: number;  // จำนวนครั้งที่อัปเกรดเพื่อคำนวณเงินดอกเบี้ย 20%
}

export interface EquippedBonus {
  strength?: number;
  durability?: number;
  agility?: number;
  magic?: number;
  skillBonus?: string; // บัฟสกิลเฉพาะ
}

export type GachaRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const MAX_GACHA_REWARDS = 20;

export interface Item {
  id: string;
  name: string;
  price: number;
  description: string;
  category: 'consumable' | 'equipment';
  icon?: string;
  equipped?: boolean;
  effectType: 'heal_hp' | 'buff_stat' | 'enhance_skill' | 'custom' | 'boost_max_hp';
  effectValue?: number;
  hpBonus?: number; // โบนัสเลือด HP เพิ่มเติม (สำหรับอุปกรณ์สวมใส่ หรือโอสถ)
  targetStat?: keyof CharacterStats;
  skillEnhanceTarget?: string; // ชื่อสกิลที่เพิ่มพลัง
  skillEnhanceDesc?: string;
  usableByPlayers: boolean;
  rarity?: GachaRarity;
}

export interface InventoryItem extends Item {
  quantity: number;
  instanceId: string;
  isEquipped?: boolean;
}

export type QuestKind = 'progress' | 'question' | 'proof';
export type QuestReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Quest {
  id: string;
  title: string;
  description: string;
  kind?: QuestKind;
  question?: string;
  answer?: string;
  targetCount: number;
  currentCount: number;
  rewardCoins: number;
  rewardItemName?: string;
  isCompleted: boolean;
  isClaimed: boolean;
  createdAt: number;
  proofDataUrl?: string;
  proofNote?: string;
  proofSubmittedAt?: number;
  reviewStatus?: QuestReviewStatus;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'quest' | 'trade' | 'system' | 'admin' | 'gacha' | 'game';
}

export interface CharacterProfile {
  id: string;
  username: string;
  displayName: string;
  nickname: string;          // สมญานาม
  avatarUrl: string;
  quote?: string;            // ประโยคประจำตัว
  age?: string;
  constellation: string;     // กลุ่มดาวผู้สนับสนุน
  characteristics: string[]; // คุณลักษณะ
  storySummary?: string;     // เรื่องเล่าที่ครอบครอง
  statusBuffs?: string;      // เอฟเฟกต์สถานะปัจจุบัน
  coins: number;             // เหรียญปัจจุบัน
  hp: number;
  maxHp: number;
  stats: CharacterStats;
  skills: Skill[];
  inventory: InventoryItem[];
  quests: Quest[];
  notifications: NotificationItem[];
  powerScore: number;        // สำหรับจัดอันดับ Leaderboard
  lastUpdated: number;
  role?: 'admin' | 'player'; // ผู้ดูแลระบบ หรือ ผู้เล่น
  sponsorModifier?: string;  // พรจากผู้สนับสนุน
  stigma?: {
    name: string;
    sponsor?: string;
    level: number;
    description: string;
  };
  stories?: {
    id: string;
    name: string;
    description: string;
    acquiredAt?: string;
    rank?: string;
  }[];
  // Stat Transcendence (ทะลุขีดจำกัด 100 อัปเกรดแบบดอกเบี้ยทบต้น 20%)
  statUpgradeCount?: number; // จำนวนครั้งที่อัปเกรดสเตตัสทะลุ 100
  consumedMaxHpBonus?: number; // โบนัสเลือดสูงสุด (Max HP) ถาวรจากการดื่มโอสถทองคำ/แก่นโลหิต

  // Profile Decorations & Personalization
  avatarFrame?: string;      // 'default' | 'gold_stigma' | 'demon_king' | 'celestial_lotus' | 'void_abyss' | 'cyber_neon' | 'crimson_blood'
  bannerTheme?: string;      // 'cosmos' | 'abyss' | 'golden_throne' | 'cherry_blossom' | 'crimson_blood' | 'cyberpunk'
  customBannerUrl?: string;  // ภาพแบนเนอร์กำหนดเอง
  badgeTitle?: string;       // ฉายาเกียรติยศ
  profileTitleBadge?: string;// ฉายารอง
  accentColor?: string;      // 'cyan' | 'amber' | 'purple' | 'emerald' | 'rose'
  personalBio?: string;      // ประวัติส่วนตัว
  bio?: string;              // ประวัติสังเขป
}

export interface TransactionHistory {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  timestamp: number;
  note?: string;
}

// GACHA TYPES
export interface GachaReward {
  id: string;
  name: string;
  type: 'coin' | 'item' | 'skill' | 'characteristic';
  rate: number;              // Drop rate in % (e.g. 15.5 for 15.5%)
  rarity: GachaRarity;
  description: string;
  coinAmount?: number;
  itemData?: Item;
  skillData?: Skill;
  characteristic?: string;
}

export interface GachaConfig {
  pullCost: number;          // ค่าสุ่ม 1 ครั้ง (เช่น 500 Coins)
  tenPullCost: number;       // ค่าสุ่ม 10 ครั้ง (เช่น 4500 Coins)
  enabled: boolean;
  bannerTitle: string;
  bannerDescription: string;
}

// CARD 21 DUEL TYPES
export type CardSuit = '♠' | '♥' | '♦' | '♣';

export interface PlayingCard {
  suit: CardSuit;
  suitName: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  value: string;             // 'A', '2'-'10', 'J', 'Q', 'K'
  numValue: number;          // 1-11
  color: 'red' | 'black';
}

export interface CardDuelRoom {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  opponentId?: string;       // ผู้เล่นที่ถูกเชิญ หรือเข้าร่วม
  opponentName?: string;
  opponentAvatar?: string;
  invitedPlayerId?: string;  // ID ผู้เล่นที่ถูกเชิญเฉพาะเจาะจง
  betAmount: number;
  status: 'waiting' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
  requiredPlayersCount: number; // ปกติ 2 คน
  readyPlayers: string[];       // ID ผู้เล่นที่พร้อม
  turn?: 'creator' | 'opponent';
  creatorHand: PlayingCard[];
  opponentHand: PlayingCard[];
  creatorStanding: boolean;
  opponentStanding: boolean;
  deck: PlayingCard[];
  winner?: 'creator' | 'opponent' | 'tie' | null;
  resultReason?: string;
  createdAt: number;
  updatedAt: number;
}
