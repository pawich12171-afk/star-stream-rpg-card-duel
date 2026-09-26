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
  conditions?: string | BattleSkillCondition[];
  skillUpgradeProgress?: {
    hpBonus: number; durability: number; strength: number; agility: number; magic: number; equipmentSlots: number;
    rewardPhase?: number; rewardValue?: number; totalUpgrades?: number; cycleCount?: number;
  };
  cost?: string;
  category?: 'innate' | 'stigma' | 'story' | 'general';
  orvRank?: ORVSkillRank;
  orvRankCustom?: string;
  perkLevel10?: string;
  statBonusPerLevel?: string;
  upgradeCount?: number;
  battleEffect?: BattleSkillEffect;
  battlePower?: number;
  /** หน่วยของค่าผลหลัก: จำนวนคงที่ หรือเปอร์เซ็นต์ของ Max HP (สำหรับฮีล/โล่) */
  battlePowerMode?: 'flat' | 'percent';
  /** วิธีคำนวณดาเมจ: คงที่ หรือผูกกับค่าสเตตัสของผู้โจมตี */
  damageScaling?: 'fixed' | 'strength' | 'durability' | 'agility' | 'magic';
  /** ตัวคูณของสเตตัส เช่น 1.5 = 150% ของค่า stat */
  damageScalingMultiplier?: number;
  cooldownTurns?: number;
  /** จำกัดจำนวนครั้งที่ใช้สกิลได้ในหนึ่งการต่อสู้ */
  battleUseLimit?: 'unlimited' | 'once_per_battle';
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
  /** ประเภทสกิลที่ Admin กำหนด */
  skillCategory?: BattleSkillCategory;
  /** เป้าหมายของผลหลัก เช่น ฮีลตัวเอง/ฮีลหมู่/บัฟหมู่ */
  targetMode?: BattleSkillTarget;
  /** กติกาการเลือกเป้าหมายสำหรับสกิลลูกน้อง/สกิลสนามรบ */
  targetConfig?: BattleSkillTargetConfig;
  /** เอฟเฟกต์บัฟ/ดีบัฟหลายรายการที่ Admin กำหนด */
  skillModifiers?: BattleSkillModifier[];
  /** ใช้กับลูกน้อง/มอน/บอสในสนามรบหรือไม่ */
  usableBySummons?: boolean;
  /** ค่าบัฟสเตตัสชั่วคราวของสกิล */
  buffStat?: keyof CharacterStats;
  buffAmount?: number;
  buffDuration?: number;
  /** ตั้งค่าสำหรับสกิลเสกลูกน้องของมอน/บอส */
  summonName?: string;
  summonMaxCount?: number;
  /** จำนวนลูกน้องที่ไอเทมเสกในแต่ละครั้งที่กดใช้ */
  summonPerUse?: number;
  summonHp?: number;
  summonDamage?: number;
  summonStrength?: number;
  summonDurability?: number;
  summonAgility?: number;
  summonMagic?: number;
  summonIsBoss?: boolean;
  summonSkills?: BattleBotSkill[];
  summonAvatarUrl?: string;
  summonAvatarFileName?: string;
  /** ลูกน้องแต่ละตัวสามารถมีค่าสเตตัส/สกิล/รูปแตกต่างกันได้ */
  summonUnits?: Array<{
    id: string;
    name: string;
    hp: number;
    strength: number;
    durability: number;
    agility: number;
    magic: number;
    avatarUrl?: string;
    avatarFileName?: string;
    skills?: BattleBotSkill[];
  }>;
}

export interface EquippedBonus {
  strength?: number;
  durability?: number;
  agility?: number;
  magic?: number;
  skillBonus?: string;
}

export type GachaRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
// Gacha reward pool has no hard item-count limit; storage/UI may paginate when needed.
export const MAX_GACHA_REWARDS = Number.MAX_SAFE_INTEGER;

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

export type ItemUseConditionType = 'hp_below_percent' | 'hp_above_percent' | 'turn_at_least' | 'stat_at_least' | 'stat_below' | 'summon_count_below' | 'summon_count_at_least';

export interface ItemUseCondition {
  id?: string;
  type: ItemUseConditionType;
  value: number;
  stat?: keyof CharacterStats;
  enabled?: boolean;
}

export interface Item {
  id: string;
  name: string;
  price: number;
  description: string;
  category: 'consumable' | 'equipment' | 'material';
  icon?: string;
  equipped?: boolean;
  effectType: 'heal_hp' | 'buff_stat' | 'enhance_skill' | 'custom' | 'boost_max_hp' | 'summon';
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
  /** ความสามารถชุบชีวิต */
  revivePercent?: number;
  /** ชุบเพื่อน/สมาชิกทีม */
  reviveAlly?: boolean;
  /** ล้างสถานะผิดปกติ */
  cleanseNegative?: boolean;
  /** โล่ป้องกันตามเปอร์เซ็นต์ */
  shieldPercent?: number;
  shieldDuration?: number;
  /** ลดความเสียหาย */
  damageReductionPercent?: number;
  damageReductionDuration?: number;
  /** โอกาสหลบหลีก */
  dodgeChancePercent?: number;
  /** ดูดเลือด */
  lifestealPercent?: number;
  /** ลดคูลดาวน์ */
  cooldownReductionPercent?: number;
  /** ทำให้ติดสถานะไม่ได้ชั่วคราว */
  statusImmunityDuration?: number;
  /** ทำให้เป้าหมายชะงัก */
  stunDuration?: number;
  /** ตัวคูณโอกาสทำงานของ Passive/Effect ระหว่างต่อสู้ */
  battlePassiveChanceMultiplier?: number;
  /** ระยะเวลาบัฟโชค (จำนวนเทิร์น) */
  battleLuckDuration?: number;
  /** ตัวคูณเรทกาชาเมื่อกดใช้ไอเทมก่อนสุ่ม เช่น 2 = เพิ่มน้ำหนักรางวัลตามระดับที่ตั้งไว้ 2 เท่า */
  gachaRateMultiplier?: number;
  /** ระดับความหายากขั้นต่ำที่ได้รับโบนัสเรทกาชา เช่น rare = Rare ขึ้นไป */
  gachaRateMinRarity?: GachaRarity;
  hpBonus?: number;
  /** โบนัสค่าสเตตัสที่ได้รับทันทีเมื่อสวมใส่อุปกรณ์ */
  equipmentStrengthBonus?: number;
  equipmentDurabilityBonus?: number;
  equipmentAgilityBonus?: number;
  equipmentMagicBonus?: number;
  equipmentMaxHpBonus?: number;
  /** โบนัสการต่อสู้ของอุปกรณ์เมื่อสวมใส่ */
  equipmentAttackPercent?: number;
  equipmentDefensePercent?: number;
  equipmentMagicPercent?: number;
  equipmentAttackDuration?: number;
  equipmentDefenseDuration?: number;
  equipmentMagicDuration?: number;
  targetStat?: keyof CharacterStats;
  /** เป้าหมายของเอฟเฟกต์หลักของไอเทม เช่น ฮีล/บัฟหมู่ */
  targetMode?: BattleSkillTarget;
  buffStat?: keyof CharacterStats;
  buffAmount?: number;
  buffDuration?: number;
  /** สกิลต่อสู้ที่ติดมากับไอเทม */
  battleSkills?: Skill[];
  skillEnhanceTarget?: string;
  skillEnhanceDesc?: string;
  usableByPlayers: boolean;
  rarity?: GachaRarity;
  passiveEffects?: ItemPassiveEffect[];
  /** ข้อเสีย/ผลย้อนกลับของไอเทมที่ผู้สร้างกำหนด */
  battleDrawbacks?: BattleExtraEffect[];
  /** ตั้งค่าสำหรับไอเทมเสกมอนสเตอร์/ลูกน้องระหว่างการต่อสู้ */
  summonName?: string;
  summonMaxCount?: number;
  summonHp?: number;
  summonStrength?: number;
  summonDurability?: number;
  summonAgility?: number;
  summonMagic?: number;
  summonSkills?: BattleBotSkill[];
  summonAvatarUrl?: string;
  summonAvatarFileName?: string;
  summonIsBoss?: boolean;
  summonUnits?: Array<{
    id: string;
    name: string;
    hp: number;
    strength: number;
    durability: number;
    agility: number;
    magic: number;
    avatarUrl?: string;
    avatarFileName?: string;
    skills?: BattleBotSkill[];
  }>;
  /** ไอเทมนี้สร้างโดย Admin สำหรับรางวัล/กาชาเท่านั้น ไม่แสดงในร้านค้า */
  adminOnly?: boolean;
  /** ไอเทมชนิดนี้รวมจำนวนในช่องเดียวกันได้ */
  stackable?: boolean;
  /** อนุญาตให้นำไอเทมนี้ไปใช้เป็นรางวัลแบบกำหนดเอง */
  rewardEligible?: boolean;
  /** เงื่อนไขที่ต้องผ่านก่อนผู้เล่นจะใช้ไอเทมได้ */
  useConditions?: ItemUseCondition[];
  /** ประเภทการเผยแพร่ของไอเทม */
  itemClass?: 'normal' | 'special' | 'limited';
  /** จำนวน Stock สูงสุดสำหรับไอเทม Limited */
  limitedStock?: number;
  /** สถานะการนำไอเทมกลางเข้า Shop */
  inShop?: boolean;
}

export interface CraftingIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  description?: string;
  ingredients: CraftingIngredient[];
  outputItemId: string;
  outputQuantity: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItem extends Item {
  quantity: number;
  instanceId: string;
  isEquipped?: boolean;
  equippedQuantity?: number;
}

export interface MarketplaceListing { id: string; sellerId: string; sellerName: string; item: InventoryItem; price: number; quantity: number; createdAt: number; updatedAt: number; }
export interface MarketplaceAuction { id: string; sellerId: string; sellerName: string; item: InventoryItem; quantity: number; startingPrice: number; currentBid: number; highestBidderId?: string; highestBidderName?: string; /** Coins ของผู้เสนอราคาสูงสุดถูกกันไว้แล้ว */ bidFundsReserved?: boolean; endsAt: number; createdAt: number; updatedAt: number; status: 'pending' | 'active' | 'completed' | 'cancelled'; }

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
  /** ค่าเงินพิเศษสำหรับความเป็นไปได้ (Possibility) */
  possibility?: number;
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
  /** เวอร์ชันการรีเซ็ตระบบอัปสกิลครั้งล่าสุด ใช้ migration ครั้งเดียวต่อข้อมูลตัวละคร */
  skillUpgradeResetVersion?: number;
  /** เวอร์ชันการปรับสมดุลโบนัสสกิลล่าสุด */
  skillUpgradeBalanceVersion?: number;
  /** เวอร์ชันล้าง progress อัปสกิลแบบเก่าที่ค้างอยู่ระดับตัวละคร */
  legacySkillProgressCleanupVersion?: number;
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
  /** จำนวนครั้งที่อัพช่องสวมใส่อุปกรณ์ทั่วไป */
  equipmentSlotUpgrades?: number;
  /** โบนัสสะสมจากการอัปสกิล: เพิ่มจริงทุกครั้ง และเมื่อจบรอบจะวนกลับมาเพิ่มต่อจากค่าที่มี */
  skillUpgradeProgress?: {
    hpBonus: number;
    durability: number;
    strength: number;
    agility: number;
    magic: number;
    equipmentSlots: number;
    /** phase ปัจจุบัน: 0=HP, 1=ทนทาน, 2=STR, 3=ความเร็ว, 4=เวท, 5=ช่องอุปกรณ์ */
    rewardPhase?: number;
    /** ค่ารางวัลครั้งล่าสุดใน phase ปัจจุบัน เช่น HP 4 หมายถึงครั้งถัดไป +8 */
    rewardValue?: number;
    totalUpgrades?: number;
    cycleCount?: number;
  };
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
  /** ค่าใช้จ่ายกาชาเป็น Possibility */
  pullCostPossibility?: number;
  tenPullCostPossibility?: number;
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
  /** อ้างอิงไอเทมกลางในคลังไอเทม */
  itemId?: string;
  skillData?: Skill;
  characteristic?: string;
  bannerId?: string;
}

export interface GachaConfig {
  pullCost: number;
  tenPullCost: number;
  pullCostPossibility?: number;
  tenPullCostPossibility?: number;
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

export type BattleMode = 'pvp' | 'pve' | 'random';
export type BattleSkillEffect = 'damage' | 'heal' | 'defense' | 'reflect' | 'stun' | 'copy_ability' | 'immortal' | 'damage_reduction' | 'summon' | 'buff_stat';
export type BattleSkillTarget =
  | 'self'
  | 'enemy'
  | 'ally'
  | 'selected_ally'
  | 'selected_enemy'
  | 'all_allies'
  | 'all_enemies'
  | 'all_combatants'
  | 'battlefield_allies'
  | 'battlefield_enemies'
  | 'selected_bots'
  | 'selected_bosses';

export type BattleSkillCategory =
  | 'attack'
  | 'buff'
  | 'debuff'
  | 'control'
  | 'heal'
  | 'defense'
  | 'summon'
  | 'utility';

export type BattleSkillEffectKind =
  | 'attack_damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'status'
  | 'shield'
  | 'cleanse'
  | 'summon';

export interface BattleSkillTargetConfig {
  mode: BattleSkillTarget;
  allowMultiple?: boolean;
  maxTargets?: number;
  selectedTargetIds?: string[];
  selectedTargetTypes?: Array<'player' | 'bot' | 'boss'>;
}

export interface BattleSkillModifier {
  id: string;
  kind: BattleSkillEffectKind;
  stat?: keyof CharacterStats;
  status?: AdminStatusEffectKind | BattleExtraEffectKind | string;
  value: number;
  duration?: number;
  chance?: number;
  label?: string;
}

export interface BattleBotPassiveTraits {
  /** ไม่รับสถานะผิดปกติ */
  statusImmunity?: boolean;
  /** ตัวคูณการฟื้นฟู HP ที่ได้รับจากทุกแหล่ง เช่น 2 = 2 เท่า */
  healingReceivedMultiplier?: number;
  /** ไม่สามารถถูกสกิลคัดลอกความสามารถ */
  copyImmunity?: boolean;
  /** ไม่ได้รับความเสียหายจากการสะท้อนกลับ */
  reflectImmunity?: boolean;
}

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

export type BattleRandomRewardType = 'coin' | 'item' | 'skill';

export interface BattleRandomReward {
  id: string;
  name: string;
  type: BattleRandomRewardType;
  rate: number;
  coinAmount?: number;
  itemData?: Item;
  skillData?: Skill;
}

export interface BattleBotDrop {
  id: string;
  type: 'coin' | 'item';
  name: string;
  amount: number;
  /** โอกาสดรอปของรายการนี้ (%) */
  dropChancePercent?: number;
  itemData?: Item;
}

export interface BattleConfig {
  id: string;
  enabled: boolean;
  sides: number;
  strengthPerDamage: number;
  faces: BattleDiceFace[];
  bossDice: BattleDiceConfig;
  /** ค่าเข้า PVE ด้วย Coins */
  battleEntryFeeCoins?: number;
  /** ค่าเข้าโหมดสุ่มด้วย Coins */
  randomBattleEntryFeeCoins?: number;
  /** ค่าเข้าโหมด PVE เป็น Possibility */
  battleEntryFeePossibility?: number;
  /** ค่าเข้าสนามโหมดสุ่มเป็น Possibility */
  randomBattleEntryFeePossibility?: number;
  randomBattleEntryFee?: number;
  /** ตารางรางวัลสุ่มของโหมดสุ่มมอน/บอส */
  randomBattleRewards?: BattleRandomReward[];
  updatedAt: number;
  victoryImageUrl?: string;
  victoryVideoUrl?: string;
  victoryTitle?: string;
  victoryMessage?: string;
}

export type BattleSkillConditionType =
  | 'hp_below_percent'
  | 'hp_above_percent'
  | 'target_hp_below_percent'
  | 'target_hp_above_percent'
  | 'turn_at_least'
  | 'chance_percent'
  | 'summon_count_below'
  | 'summon_count_at_least';

export interface BattleSkillCondition {
  id?: string;
  type: BattleSkillConditionType;
  value: number;
  enabled?: boolean;
}

export interface BattleBotSkill extends Skill {
  /** โอกาสที่ AI จะเลือกใช้สกิลนี้เมื่อถึงเทิร์น (%) */
  aiChancePercent?: number;
  /** เงื่อนไขเสริมของสกิลบอส/มอนสเตอร์ แต่ละรายการเปิดหรือปิดได้ */
  conditions?: BattleSkillCondition[];
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
  /** สกิลที่แอดมินยัดให้มอน/บอส และโอกาสที่ AI จะเลือกใช้ */
  skills?: BattleBotSkill[];
  /** ของดรอปเมื่อชนะมอน/บอสตัวนี้ */
  drops?: BattleBotDrop[];
  /** น้ำหนัก/โอกาสที่มอนหรือบอสตัวนี้จะถูกสุ่มเจอในโหมดสุ่ม (%) */
  encounterChancePercent?: number;
  /** Passive ป้องกัน/เพิ่มประสิทธิภาพเฉพาะตัวของมอนหรือบอส */
  passiveTraits?: BattleBotPassiveTraits;
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
  /** จำนวนครั้งที่สกิลแต่ละ ID ถูกใช้ในเกมนี้ */
  skillUses?: Record<string, number>;
  /** สกิลของลูกน้องที่ถูกเสกโดยมอน/บอส */
  skills?: BattleBotSkill[];
  traits?: string[];
  adminStatusEffects?: AdminStatusEffect[];
  equippedPassives?: ItemPassiveEffect[];
  /** ข้อเสียจากไอเทมที่สวมใส่ ซึ่งมีผลจริงในสนามรบ */
  equippedDrawbacks?: BattleExtraEffect[];
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
  /** เอฟเฟกต์จากไอเทมใช้ระหว่างต่อสู้ */
  dodgeChancePercent?: number;
  lifestealPercent?: number;
  cooldownReductionPercent?: number;
  statusImmunityTurns?: number;
  shieldPercent?: number;
  shieldTurns?: number;
  /** บัฟ/ดีบัฟ Stat ชั่วคราวจาก skillModifiers */
  skillStatModifiers?: Array<{ id: string; stat: keyof CharacterStats; delta: number; remaining: number }>;
  copiedAbility?: Skill;
  copiedAbilityTurns?: number;
  /** Passive ของมอน/บอส */
  passiveTraits?: BattleBotPassiveTraits;
}

export interface BattleLogEntry {
  id: string;
  timestamp: number;
  actorName: string;
  targetName?: string;
  actorType?: BattleCombatantType;
  targetType?: BattleCombatantType;
  message: string;
  roll?: number;
  damage?: number;
  effect?: BattleDiceEffect | 'stun_skip';
}

export interface BattleRoom {
  id: string;
  mode: BattleMode;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  createdBy: string;
  createdByName: string;
  teamA: BattleCombatant[];
  teamB: BattleCombatant[];
  turnActorId: string;
  round: number;
  log: BattleLogEntry[];
  winnerTeam?: 'a' | 'b' | 'draw';
  entryFeeCoins?: number;
  entryFeePossibility?: number;
  entryFeeCurrency?: 'coins' | 'possibility';
  victoryRewardCoins?: number;
  /** รางวัลสุ่มของโหมดสุ่มที่เลือกตั้งแต่สร้างห้อง */
  randomReward?: BattleRandomReward;
  /** ของดรอปที่ล็อกไว้จากมอน/บอสทั้งหมดในห้อง */
  battleDrops?: BattleBotDrop[];
  /** คิวศัตรูที่เหลือของโหมดสุ่ม หลังจากชนะตัวปัจจุบัน */
  randomBattleQueue?: BattleCombatant[];
  /** ลำดับศัตรูปัจจุบันในโหมดสุ่ม (1-3) */
  randomBattleStage?: number;
  rewardClaimedBy?: string;
  /** ผู้ชนะฝ่ายทีม A ที่รับรางวัลไปแล้ว แยกตามผู้เล่น */
  rewardClaims?: Record<string, number>;
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
  effect?: BattleDiceEffect | 'stun_skip';
}
