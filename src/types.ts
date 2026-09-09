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
  cooldownTurns?: number;
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
  hpBonus?: number;
  targetStat?: keyof CharacterStats;
  skillEnhanceTarget?: string;
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
}

export interface GachaConfig {
  pullCost: number;
  tenPullCost: number;
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
export type BattleSkillEffect = 'damage' | 'heal' | 'defense' | 'reflect' | 'stun';
export type BattleDiceEffect = 'damage' | 'critical' | 'heal' | 'miss' | 'stun' | 'defense' | 'reflect';

export interface BattleDiceFace {
  face: number;
  effect: BattleDiceEffect;
  value: number;
  label: string;
  description: string;
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
}

export interface BattleBot {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
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
  defenseValue?: number;
  defenseTurns?: number;
  reflectPercent?: number;
  reflectTurns?: number;
  skillCooldowns?: Record<string, number>;
  adminStatusEffects?: AdminStatusEffect[];
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
}
