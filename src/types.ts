export interface CharacterStats {
  strength: number;
  durability: number;
  agility: number;
  magic: number;
}

export type ORVSkillRank =
  | 'general'
  | 'rare'
  | 'hero'
  | 'semi_myth'
  | 'legendary'
  | 'myth'
  | 'transcendent';

export type BattleSkillStatKind = 'attack_power' | 'defense_power' | 'heal_percent' | 'accuracy_percent' | 'speed' | 'status_chance_percent' | 'status_duration' | 'critical_chance_percent' | 'critical_multiplier' | 'cooldown_turns';

export interface BattleSkillStat { kind: BattleSkillStatKind; value: number; duration?: number; }

export interface Skill {
  id: string;
  name: string;
  level: number;
  maxLevel?: number;
  multiplier: number;
  type?: string;
  description: string;
  cooldown?: string;
  conditions?: string;
  cost?: string;
  category?: 'innate' | 'stigma' | 'story' | 'general';
  orvRank?: ORVSkillRank;
  orvRankCustom?: string;
  perkLevel10?: string;
  statBonusPerLevel?: string;
  upgradeCount?: number;
  battleEffect?: BattleSkillEffect;
  battlePower?: number;
  /** วิธีคำนวณดาเมจ: คงที่ หรือผูกกับค่าสเตตัสของผู้โจมตี */
  damageScaling?: 'fixed' | 'strength' | 'durability' | 'agility' | 'magic';
  /** ตัวคูณของสเตตัส เช่น 1.5 = 150% ของค่า stat */
  damageScalingMultiplier?: number;
  cooldownTurns?: number;
  /** ระยะเวลาของเอฟเฟกต์หลักของสกิล (เทิร์น) */
  battleEffectDuration?: number;
  battleCriticalChance?: number;
  battleCriticalMultiplier?: number;
  repeatAttackChance?: number;
  passiveEffects?: ItemPassiveEffect[];
  maxRepeatAttacks?: number;
  battleEffects?: BattleExtraEffect[];
  /** ข้อเสีย/ผลย้อนกลับของสกิลที่ผู้สร้างกำหนด และมีผลจริงในสนามรบ */
  battleDrawbacks?: BattleExtraEffect[];
  battleStats?: BattleSkillStat[];
}

export interface EquippedBonus {
  strength?: number;
  durability?: number;
  agility?: number;
  magic?: number;
  skillBonus?: string;
}

export type GachaRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const MAX_GACHA_REWARDS = 20;

export type ItemPassiveTrigger = 'turn_start' | 'attack';
export type ItemPassiveKind = 'stack' | 'true_damage_per_stack' | 'true_damage_at_max_stacks' | 'damage' | 'damage_percent' | 'heal' | 'heal_percent' | 'buff_stat' | 'shield' | 'reflect' | 'repeat_attack_chance' | 'critical_chance';

export interface ItemPassiveEffect {
  id: string;
  name: string;
  trigger: ItemPassiveTrigger;
  kind: ItemPassiveKind;
  value: number;
  chance?: number;
  duration?: number;
  maxStacks?: number;
  stackKey?: string;
  targetStat?: keyof CharacterStats;
  description?: string;
}

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
  /** ฟื้น HP เป็นเปอร์เซ็นต์ของ Max HP เมื่อใช้ไอเทม */
  healPercent?: number;
  /** โบนัสความเสียหายระหว่างต่อสู้ (%) เมื่อใช้ไอเทม */
  battleDamagePercent?: number;
  /** ระยะเวลาบัฟดาเมจ (จำนวนเทิร์น) */
  battleDamageDuration?: number;
  /** ตัวคูณโชคระหว่างต่อสู้ เช่น 2 = โอกาส Passive/Effect/Crit เพิ่มเป็น 2 เท่า */
  battleLuckMultiplier?: number;
  /** โบนัสโอกาสคริติคอลจากไอเทม (%) */
  battleCriticalChancePercent?: number;
  /** โบนัสโอกาสตีซ้ำจากไอเทม (%) */
  battleRepeatAttackChancePercent?: number;
  /** ตัวคูณโอกาสทำงานของ Passive/Effect ระหว่างต่อสู้ */
  battlePassiveChanceMultiplier?: number;
  /** ระยะเวลาบัฟโชค (จำนวนเทิร์น) */
  battleLuckDuration?: number;
  /** ตัวคูณเรทกาชาเมื่อกดใช้ไอเทมก่อนสุ่ม เช่น 2 = เพิ่มน้ำหนักรางวัลตามระดับที่ตั้งไว้ 2 เท่า */
  gachaRateMultiplier?: number;
  /** ระดับความหายากขั้นต่ำที่ได้รับโบนัสเรทกาชา เช่น rare = Rare ขึ้นไป */
  gachaRateMinRarity?: GachaRarity;
  hpBonus?: number;
  targetStat?: keyof CharacterStats;
  skillEnhanceTarget?: string;
  skillEnhanceDesc?: string;
  usableByPlayers: boolean;
  rarity?: GachaRarity;
  passiveEffects?: ItemPassiveEffect[];
}

export interface InventoryItem extends Item {
  quantity: number;
  instanceId: string;
  isEquipped?: boolean;
  equippedQuantity?: number;
}

export interface MarketplaceListing { id: string; sellerId: string; sellerName: string; item: InventoryItem; price: number; quantity: number; createdAt: number; updatedAt: number; }
export interface MarketplaceAuction { id: string; sellerId: string; sellerName: string; item: InventoryItem; quantity: number; startingPrice: number; currentBid: number; highestBidderId?: string; highestBidderName?: string; /** Coins ของผู้เสนอราคาสูงสุดถูกกันไว้แล้ว */ bidFundsReserved?: boolean; endsAt: number; createdAt: number; updatedAt: number; status: 'active' | 'completed' | 'cancelled'; }

export interface ChatMessage { id: string; senderId: string; senderName: string; senderAvatar?: string; message: string; createdAt: number; }

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

export type AdminStatusEffectKind =
  | 'bleeding'
  | 'burn'
  | 'poison'
  | 'reflect'
  | 'curse'
  | 'regen'
  | 'shield'
  | 'stun'
  | 'weakness'
  | 'slow';

export interface AdminStatusEffect {
  id: string;
  kind: AdminStatusEffectKind;
  name: string;
  mode: 'buff' | 'nerf';
  power: number;
  duration: number;
  remaining: number;
  appliedAt: number;
  source: 'admin';
  description: string;
}

export interface AdminBalanceModifier {
  id: string;
  kind: 'hp' | 'stat' | 'skill' | 'status';
  mode: 'buff' | 'nerf';
  amount?: number;
  stat?: keyof CharacterStats;
  skillId?: string;
  effectId?: string;
  createdAt: number;
}

export interface AdminBalanceSnapshot {
  hp: number;
  maxHp: number;
  stats: CharacterStats;
  skills: Skill[];
  capturedAt: number;
}

export interface CharacterProfile {
  id: string;
  username: string;
  displayName: string;
  nickname: string;
  avatarUrl: string;
  quote?: string;
  age?: string;
  constellation: string;
  characteristics: string[];
  storySummary?: string;
  statusBuffs?: string;
  coins: number;
  /** รูปแบบการแสดง Coins ของผู้เล่น: compact = 1K/1M, full = 1,000/1,000,000 */
  coinDisplayMode?: 'compact' | 'full';
  hp: number;
  maxHp: number;
  stats: CharacterStats;
  skills: Skill[];
  inventory: InventoryItem[];
  quests: Quest[];
  notifications: NotificationItem[];
  powerScore: number;
  lastUpdated: number;
  role?: 'admin' | 'player';
  sponsorModifier?: string;
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
  statUpgradeCount?: number;
  consumedMaxHpBonus?: number;
  avatarFrame?: string;
  bannerTheme?: string;
  customBannerUrl?: string;
  badgeTitle?: string;
  profileTitleBadge?: string;
  accentColor?: string;
  personalBio?: string;
  bio?: string;

  // Temporary administrator balance controls.
  // The snapshot is restored when all admin modifiers are removed, so
  // admin nerfs/buffs do not permanently overwrite the character's base data.
  adminBalanceSnapshot?: AdminBalanceSnapshot;
  adminBalanceModifiers?: AdminBalanceModifier[];
  adminStatusEffects?: AdminStatusEffect[];
  equippedPassives?: ItemPassiveEffect[];
  passiveStacks?: Record<string, number>;
  /** Character Traits shown and activated for the battle UI. */
  traits?: string[];
  /** ตัวคูณเรทกาชาที่เปิดใช้ไว้ รอการสุ่มครั้งถัดไป */
  pendingGachaRateMultiplier?: number;
  /** ระดับขั้นต่ำของรางวัลที่ได้รับโบนัสเรทกาชาในคำสั่งสุ่มครั้งถัดไป */
  pendingGachaRateMinRarity?: GachaRarity;
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

export interface GachaBanner {
  id: string;
  name: string;
  pullCost: number;
  tenPullCost: number;
  /** จำนวนครั้งแบบหลายสุ่มที่ผู้เล่นเลือกได้ นอกเหนือจาก 1 และ 10 */
  multiPullCounts?: number[];
  /** จำนวนสุ่มแบบเลือกค่าเดียวจากช่องตั้งค่า Admin */
  multiPullCount?: number;
  enabled: boolean;
  bannerTitle: string;
  bannerDescription: string;
  createdAt: number;
  updatedAt: number;
}

export interface GachaReward {
  id: string;
  name: string;
  type: 'coin' | 'item' | 'skill' | 'characteristic';
  rate: number;
  rarity: GachaRarity;
  description: string;
  coinAmount?: number;
  itemData?: Item;
  skillData?: Skill;
  characteristic?: string;
  bannerId?: string;
}

export interface GachaConfig {
  pullCost: number;
  tenPullCost: number;
  /** จำนวนครั้งแบบหลายสุ่มที่ผู้เล่นเลือกได้ */
  multiPullCounts?: number[];
  /** จำนวนสุ่มแบบเลือกค่าเดียวจากช่องตั้งค่า Admin */
  multiPullCount?: number;
  enabled: boolean;
  bannerTitle: string;
  bannerDescription: string;
}

export type CardSuit = '♠' | '♥' | '♦' | '♣';
export interface PlayingCard {
  suit: CardSuit;
  suitName: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  value: string;
  numValue: number;
  color: 'red' | 'black';
}

export interface CardDuelRoom {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  opponentId?: string;
  opponentName?: string;
  opponentAvatar?: string;
  invitedPlayerId?: string;
  betAmount: number;
  status: 'waiting' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
  requiredPlayersCount: number;
  readyPlayers: string[];
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

export type BattleMode = 'pvp' | 'pve';
export type BattleSkillEffect = 'damage' | 'heal' | 'defense' | 'reflect' | 'stun' | 'copy_ability' | 'immortal' | 'damage_reduction';

export type BattleExtraEffectKind = 'bleeding' | 'burn' | 'poison' | 'freeze' | 'stun' | 'reduce_max_hp_percent' | 'reduce_defense_percent' | 'damage_percent' | 'heal_percent' | 'shield' | 'reflect' | 'damage_reduction';

export interface BattleExtraEffect { kind: BattleExtraEffectKind; value: number; duration?: number; chance?: number; target?: 'self' | 'enemy'; label?: string; }
export type BattleDiceEffect = 'damage' | 'critical' | 'heal' | 'miss' | 'stun' | 'defense' | 'reflect';

export interface BattleDiceFace {
  face: number;
  effect: BattleDiceEffect;
  value: number;
  label: string;
  description: string;
  extraEffects?: BattleExtraEffect[];
}

export interface BattleDiceConfig {
  enabled: boolean;
  sides: number;
  strengthPerDamage: number;
  faces: BattleDiceFace[];
}

export interface BattleConfig {
  id: string;
  enabled: boolean;
  sides: number;
  strengthPerDamage: number;
  faces: BattleDiceFace[];
  bossDice: BattleDiceConfig;
  updatedAt: number;
  victoryImageUrl?: string;
  victoryVideoUrl?: string;
  victoryTitle?: string;
  victoryMessage?: string;
}

export interface BattleBot {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  /** Uploaded image data URI or regular URL. */
  avatarFileName?: string;
  isBoss: boolean;
  stats: CharacterStats;
  hp: number;
  maxHp: number;
  aiProfile?: 'balanced' | 'aggressive' | 'defensive';
  createdAt: number;
  updatedAt: number;
}

export type BattleCombatantType = 'player' | 'bot';
export interface BattleCombatant {
  id: string;
  sourceId: string;
  name: string;
  avatarUrl: string;
  type: BattleCombatantType;
  team: 'a' | 'b';
  stats: CharacterStats;
  hp: number;
  maxHp: number;
  isBoss?: boolean;
  stunnedTurns?: number;
  frozenTurns?: number;
  defenseValue?: number;
  defenseTurns?: number;
  reflectPercent?: number;
  reflectTurns?: number;
  skillCooldowns?: Record<string, number>;
  adminStatusEffects?: AdminStatusEffect[];
  equippedPassives?: ItemPassiveEffect[];
  activeSkillPassives?: ItemPassiveEffect[];
  passiveStacks?: Record<string, number>;
  /** โบนัสโจมตีจากไอเทมที่ใช้ระหว่างต่อสู้ */
  itemDamagePercent?: number;
  /** เทิร์นที่เหลือของโบนัสโจมตีจากไอเทม */
  itemDamageTurns?: number;
  /** ตัวคูณโชคจากไอเทมระหว่างต่อสู้ */
  itemLuckMultiplier?: number;
  /** โบนัสโอกาสคริติคอลจากไอเทม (%) */
  itemCriticalChancePercent?: number;
  /** โบนัสโอกาสตีซ้ำจากไอเทม (%) */
  itemRepeatAttackChancePercent?: number;
  /** ตัวคูณโอกาสทำงานของ Passive/Effect จากไอเทม */
  itemPassiveChanceMultiplier?: number;
  /** เทิร์นที่เหลือของบัฟโชคจากไอเทม */
  itemLuckTurns?: number;
  immortalTurns?: number;
  damageReductionPercent?: number;
  damageReductionTurns?: number;
  copiedAbility?: Skill;
  copiedAbilityTurns?: number;
  skills?: Skill[];
}

export interface BattleLogEntry {
  id: string;
  timestamp: number;
  actorName: string;
  message: string;
  roll?: number;
  damage?: number;
  effect?: BattleDiceEffect | 'stun_skip';
}

export interface BattleRoom {
  id: string;
  mode: BattleMode;
  status: 'active' | 'completed' | 'cancelled';
  createdBy: string;
  createdByName: string;
  teamA: BattleCombatant[];
  teamB: BattleCombatant[];
  turnActorId: string;
  round: number;
  log: BattleLogEntry[];
  winnerTeam?: 'a' | 'b' | 'draw';
  entryFeeCoins?: number;
  victoryRewardCoins?: number;
  rewardClaimedBy?: string;
  /** จำนวนครั้งที่ผู้เล่นใช้ไอเทมระหว่างการต่อสู้ครั้งนี้ */
  battleItemUses?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BattleRollResult {
  roll: number;
  face: BattleDiceFace;
  damage: number;
  heal: number;
  message: string;
  skillEffect?: BattleSkillEffect;
  skillPower?: number;
  cooldownRemaining?: number;
  trueDamage?: number;
}
