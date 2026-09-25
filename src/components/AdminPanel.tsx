import { formatCoins, parseCoinAmount } from '../utils/formatNumber';
import React, { useEffect, useState } from 'react';
import { CharacterProfile, Item, Skill, Quest, GachaReward, GachaBanner, GachaConfig, GachaRarity, BattleExtraEffect, BattleSkillStat, ItemPassiveEffect } from '../types';
import { 
  ShieldCheck, 
  Coins, 
  Trash2, 
  Plus, 
  Package, 
  Sparkles, 
  RefreshCw,
  Gift,
  Search,
  Store,
  Sliders,
  Wand2,
  AlertTriangle,
  Save,
  CheckCircle2,
  Users,
  Heart,
  HeartPulse,
  Shield,
  Sword,
  Flame,
  Flower2,
  Droplets,
  Crown,
  Gem,
  Zap,
  Scroll,
  ScrollText
} from 'lucide-react';
import { syncCharacterHealth } from '../utils/healthSystem';

interface AdminPanelProps {
  characters: CharacterProfile[];
  shopItems: Item[];
  gachaRewards: GachaReward[];
  gachaConfig: GachaConfig;
  gachaBanners?: GachaBanner[];
  onUpdateCharacterCoins: (characterId: string, deltaCoins: number) => void;
  onSetCharacterCoins: (characterId: string, newCoins: number) => void;
  onUpdateCharacterPossibility?: (characterId: string, delta: number) => void | Promise<void>;
  onAddShopItem: (item: Item) => void | Promise<void>;
  onUpdateShopItem: (item: Item) => void | Promise<void>;
  onDeleteShopItem: (itemId: string) => void;
  onUpdateGachaConfig: (config: GachaConfig) => void;
  onAddGachaReward: (reward: GachaReward) => void;
  onDeleteGachaReward: (rewardId: string) => void;
  onSaveGachaBanner: (banner: GachaBanner) => void | Promise<void>;
  onDeleteGachaBanner: (bannerId: string) => void | Promise<void>;
  onDirectEditCharacter: (char: CharacterProfile) => void;
  onResetToDefaults: () => void;
  onToggleAdminRole?: (char: CharacterProfile) => void;
  onDeleteCharacter?: (charId: string) => void;
  onGrantItem?: (targetId: string, item: Item, quantity: number) => Promise<{ success: boolean; message: string }>;
  onRemoveItem?: (targetId: string, instanceId: string, quantity?: number) => Promise<{ success: boolean; message: string }>;
  onAssignQuest?: (targetId: string, quest: Quest) => Promise<boolean>;
  onReviewQuestProof?: (targetId: string, questId: string, approve: boolean) => Promise<boolean>;
}

const AVAILABLE_SHOP_ICONS = [
  { id: 'HeartPulse', name: 'โอสถฟื้นฟู', icon: HeartPulse },
  { id: 'Heart', name: 'หัวใจชีพจร', icon: Heart },
  { id: 'Flame', name: 'หยาดโลหิต', icon: Flame },
  { id: 'Flower2', name: 'บัวสวรรค์', icon: Flower2 },
  { id: 'Droplets', name: 'น้ำทิพย์', icon: Droplets },
  { id: 'Shield', name: 'ชุดเกราะ', icon: Shield },
  { id: 'Sword', name: 'ศัตราวุธ', icon: Sword },
  { id: 'Sparkles', name: 'ละอองดาว', icon: Sparkles },
  { id: 'Gem', name: 'อัญมณี', icon: Gem },
  { id: 'Zap', name: 'สายฟ้า', icon: Zap },
  { id: 'Scroll', name: 'คัมภีร์', icon: Scroll },
  { id: 'Crown', name: 'มงกุฎ', icon: Crown },
];

const renderAdminItemIcon = (iconName?: string, category?: string, effectType?: string, className = "w-4 h-4") => {
  if (iconName === 'HeartPulse' || effectType === 'heal_hp') return <HeartPulse className={`${className} text-rose-400`} />;
  if (iconName === 'Heart' || effectType === 'boost_max_hp') return <Heart className={`${className} text-rose-500`} />;
  if (iconName === 'Shield' || category === 'equipment') return <Shield className={`${className} text-blue-400`} />;
  if (iconName === 'Sword') return <Sword className={`${className} text-amber-300`} />;
  if (iconName === 'Flame') return <Flame className={`${className} text-orange-400`} />;
  if (iconName === 'Flower2') return <Flower2 className={`${className} text-emerald-400`} />;
  if (iconName === 'Droplets') return <Droplets className={`${className} text-cyan-400`} />;
  if (iconName === 'Zap') return <Zap className={`${className} text-yellow-300`} />;
  if (iconName === 'Gem') return <Gem className={`${className} text-purple-400`} />;
  if (iconName === 'Scroll') return <Scroll className={`${className} text-amber-200`} />;
  if (iconName === 'Crown') return <Crown className={`${className} text-yellow-400`} />;
  if (iconName === 'Sparkles') return <Sparkles className={`${className} text-amber-300`} />;
  return <Package className={`${className} text-cyan-400`} />;
};

const getAdminRarityBadge = (rarity?: string) => {
  switch (rarity) {
    case 'mythic':
      return {
        name: 'Mythic',
        badge: 'bg-rose-950/80 text-rose-300 border-rose-500/60',
        border: 'border-rose-500/50',
      };
    case 'legendary':
      return {
        name: 'Legendary',
        badge: 'bg-amber-950/80 text-amber-300 border-amber-500/60',
        border: 'border-amber-500/50',
      };
    case 'epic':
      return {
        name: 'Epic',
        badge: 'bg-purple-950/80 text-purple-300 border-purple-500/60',
        border: 'border-purple-500/50',
      };
    case 'rare':
      return {
        name: 'Rare',
        badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60',
        border: 'border-cyan-500/50',
      };
    default:
      return {
        name: 'Common',
        badge: 'bg-slate-800 text-slate-300 border-slate-700',
        border: 'border-slate-800',
      };
  }
};

const SHOP_PRESET_TEMPLATES = [
  {
    label: 'ยาเรืองแสง · ฟื้นเลือด +10 HP',
    name: 'โอสถฟื้นฟูกายาดวงดาว (Star Vitality Potion)',
    category: 'consumable' as const,
    rarity: 'common' as const,
    price: 180,
    effectType: 'heal_hp' as const,
    effectVal: 10,
    hpBonus: 10,
    icon: 'HeartPulse',
    desc: 'โอสถสมานแผลกลั่นจากละอองดาว ฟื้นฟูเลือด HP +10 หน่วยทันทีเมื่อกดดื่ม',
  },
  {
    label: 'บัวหิมะ · ฟื้นเลือด +20 HP',
    name: 'โอสถบัวหิมะเก้าสวรรค์ (Nine Heavens Snow Lotus Elixir)',
    category: 'consumable' as const,
    rarity: 'rare' as const,
    price: 480,
    effectType: 'heal_hp' as const,
    effectVal: 20,
    hpBonus: 20,
    icon: 'Flower2',
    desc: 'สุดยอดสมุนไพรสวรรค์ ฟื้นฟูบาดแผลฉกรรจ์ ฟื้นฟูเลือด HP +20 หน่วยทันที',
  },
  {
    label: 'แก่นโลหิต · Max HP +5',
    name: 'แก่นโลหิตราชันบรรพกาล (Ancient King Blood Essence)',
    category: 'consumable' as const,
    rarity: 'epic' as const,
    price: 1800,
    effectType: 'boost_max_hp' as const,
    effectVal: 5,
    hpBonus: 5,
    icon: 'Flame',
    desc: 'หยาดโลหิตอันศักดิ์สิทธิ์ ขยายค่าพลังชีวิตสูงสุดถาวร (Max HP) +5 หน่วยอย่างถาวร',
  },
  {
    label: 'โอสถทองคำ · Max HP +10',
    name: 'มหาโอสถทองคำจุติ (Supreme Golden Core Elixir)',
    category: 'consumable' as const,
    rarity: 'legendary' as const,
    price: 3500,
    effectType: 'boost_max_hp' as const,
    effectVal: 10,
    hpBonus: 10,
    icon: 'Sparkles',
    desc: 'มหาโอสถในตำนานแห่ง Star Stream ชำระเส้นชีพจร ขยายค่า Max HP ถาวร +10 หน่วย',
  },
  {
    label: 'เกราะมังกร · HP +8 / DUR +8',
    name: 'เกราะหนักเกล็ดมังกรนิล (Obsidian Dragon Plate)',
    category: 'equipment' as const,
    rarity: 'epic' as const,
    price: 2800,
    effectType: 'buff_stat' as const,
    targetStat: 'durability' as const,
    effectVal: 8,
    hpBonus: 8,
    icon: 'Shield',
    desc: 'ชุดเกราะเกล็ดมังกร เสริมความทนทาน +8 และมอบโบนัส Max HP +8 หน่วยเมื่อสวมใส่',
  },
  {
    label: 'สร้อยคอชีพจร · HP +6',
    name: 'สร้อยคอทับทิมโลหิตวิญญาณ (Soul Blood Ruby Amulet)',
    category: 'equipment' as const,
    rarity: 'rare' as const,
    price: 1700,
    effectType: 'buff_stat' as const,
    targetStat: 'durability' as const,
    effectVal: 4,
    hpBonus: 6,
    icon: 'Heart',
    desc: 'สร้อยคออาคมที่เต้นเป็นจังหวะ มอบโบนัส Max HP +6 หน่วย และความทนทาน +4 เมื่อสวมใส่',
  },
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  characters,
  shopItems,
  gachaRewards,
  gachaConfig,
  onUpdateCharacterCoins,
  onSetCharacterCoins,
  onUpdateCharacterPossibility,
  onAddShopItem,
  onUpdateShopItem,
  onDeleteShopItem,
  onUpdateGachaConfig,
  onAddGachaReward,
  onDeleteGachaReward,
  onSaveGachaBanner,
  onDeleteGachaBanner,
  gachaBanners,
  onDirectEditCharacter,
  onResetToDefaults,
  onToggleAdminRole,
  onDeleteCharacter,
  onGrantItem,
  onRemoveItem,
  onAssignQuest,
  onReviewQuestProof,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'shop' | 'admin_items' | 'inventory_spawner' | 'gacha_manage' | 'quests'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [coinInput, setCoinInput] = useState('5000');

  const [questTitle, setQuestTitle] = useState('');
  const [questDescription, setQuestDescription] = useState('');
  const [questKind, setQuestKind] = useState<'progress' | 'question' | 'proof'>('progress');
  const [questQuestion, setQuestQuestion] = useState('');
  const [questAnswer, setQuestAnswer] = useState('');
  const [questTargetCount, setQuestTargetCount] = useState(1);
  const [questRewardCoins, setQuestRewardCoins] = useState(500);
  const [questRewardItemName, setQuestRewardItemName] = useState('');

  // Selected player for inventory & spawner
  const [spawnerTargetCharId, setSpawnerTargetCharId] = useState<string>(characters[0]?.id || '');
  const [selectedShopItemToSpawnId, setSelectedShopItemToSpawnId] = useState<string>(shopItems[0]?.id || '');
  const [spawnQuantity, setSpawnQuantity] = useState<number>(1);
  const [spawnerMode, setSpawnerMode] = useState<'shop'>('shop');

  // Legacy custom spawner state is retained only for backwards-compatible data; the UI no longer exposes it.
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState<'consumable' | 'equipment'>('equipment');
  const [customItemRarity, setCustomItemRarity] = useState<GachaRarity>('rare');
  const [customItemPrice, setCustomItemPrice] = useState(1000);
  const [customItemEffectType, setCustomItemEffectType] = useState<'heal_hp' | 'boost_max_hp' | 'buff_stat' | 'enhance_skill' | 'custom'>('buff_stat');
  const [customItemEffectVal, setCustomItemEffectVal] = useState(15);
  const [customItemHpBonus, setCustomItemHpBonus] = useState(15);
  const [customItemTargetStat, setCustomItemTargetStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [customItemDesc, setCustomItemDesc] = useState('');

  // New Shop Item Form
  const [shopItemName, setShopItemName] = useState('');
  const [shopItemPrice, setShopItemPrice] = useState(500);
  const [shopItemCategory, setShopItemCategory] = useState<'consumable' | 'equipment'>('consumable');
  const [shopItemRarity, setShopItemRarity] = useState<GachaRarity>('rare');
  const [shopItemEffectType, setShopItemEffectType] = useState<'heal_hp' | 'boost_max_hp' | 'buff_stat' | 'enhance_skill' | 'custom'>('heal_hp');
  const [shopItemEffectVal, setShopItemEffectVal] = useState(10);
  const [shopItemHpBonus, setShopItemHpBonus] = useState(10);
  const [shopItemTargetStat, setShopItemTargetStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [shopItemSkillTarget, setShopItemSkillTarget] = useState('');
  const [shopItemIcon, setShopItemIcon] = useState('HeartPulse');
  const [shopItemDesc, setShopItemDesc] = useState('');
  const [shopItemAdminOnly, setShopItemAdminOnly] = useState(true);
  const [shopItemInShop, setShopItemInShop] = useState(false);
  const [shopItemRewardEligible, setShopItemRewardEligible] = useState(true);
  const [shopItemStackable, setShopItemStackable] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [shopSearch, setShopSearch] = useState('');

  const [newRewardSelectedShopItemId, setNewRewardSelectedShopItemId] = useState(shopItems[0]?.id || '');

  useEffect(() => {
    if (shopItems.length === 0) {
      setSelectedShopItemToSpawnId('');
      setNewRewardSelectedShopItemId('');
      return;
    }
    if (!shopItems.some(item => item.id === selectedShopItemToSpawnId)) {
      setSelectedShopItemToSpawnId(shopItems[0].id);
    }
    if (!shopItems.some(item => item.id === newRewardSelectedShopItemId)) {
      setNewRewardSelectedShopItemId(shopItems[0].id);
    }
  }, [shopItems, selectedShopItemToSpawnId, newRewardSelectedShopItemId]);

  const applyShopPreset = (preset: typeof SHOP_PRESET_TEMPLATES[0]) => {
    setShopItemName(preset.name);
    setShopItemCategory(preset.category);
    setShopItemRarity(preset.rarity);
    setShopItemPrice(preset.price);
    setShopItemEffectType(preset.effectType);
    setShopItemEffectVal(preset.effectVal);
    setShopItemHpBonus(preset.hpBonus || preset.effectVal);
    setShopItemIcon(preset.icon);
    setShopItemDesc(preset.desc);
    if ('targetStat' in preset && preset.targetStat) {
      setShopItemTargetStat(preset.targetStat as any);
    }
  };

  // Gacha Config State
  const [pullCostInput, setPullCostInput] = useState<number>(gachaConfig.pullCost || 500);
  const [tenPullCostInput, setTenPullCostInput] = useState<number>(gachaConfig.tenPullCost || 4500);
  const [multiPullCountInput, setMultiPullCountInput] = useState<number>(gachaConfig.multiPullCount || 20);
  const [multiPullCountsInput, setMultiPullCountsInput] = useState<string>((gachaConfig.multiPullCounts || [20, 30, 50]).join(','));
  const [bannerTitleInput, setBannerTitleInput] = useState<string>(gachaConfig.bannerTitle || 'หีบสมบัติจักรวาลแห่งดวงดาว');
  const [bannerDescInput, setBannerDescInput] = useState<string>(gachaConfig.bannerDescription || 'สุ่มรับเหรียญรางวัลมหาศาล สกิลพิเศษระดับตำนาน และไอเทมสเตตัสหายาก');
  const [gachaEnabledInput, setGachaEnabledInput] = useState<boolean>(gachaConfig.enabled !== false);
  const safeGachaBanners = Array.isArray(gachaBanners) ? gachaBanners : [];
  const [selectedBannerId, setSelectedBannerId] = useState<string>(safeGachaBanners[0]?.id || 'main');
  const [newBannerName, setNewBannerName] = useState('ตู้กาชาใหม่');
  const [newBannerTitle, setNewBannerTitle] = useState('หีบสมบัติแห่งดวงดาว');
  const [newBannerDesc, setNewBannerDesc] = useState('ตู้กาชาพิเศษ');
  const [newBannerPullCost, setNewBannerPullCost] = useState(500);
  const [newBannerTenCost, setNewBannerTenCost] = useState(4500);
  const [newBannerPullCostPossibility, setNewBannerPullCostPossibility] = useState(1);
  const [newBannerTenCostPossibility, setNewBannerTenCostPossibility] = useState(10);
  const [newBannerMultiPullCounts, setNewBannerMultiPullCounts] = useState('20,30,50');
  const [newBannerMultiPullCount, setNewBannerMultiPullCount] = useState(20);
  const [newBannerEnabled, setNewBannerEnabled] = useState(true);
  const selectedBanner = safeGachaBanners.find(b => b.id === selectedBannerId);

  useEffect(() => {
    if (safeGachaBanners.length === 0) {
      setSelectedBannerId('main');
      return;
    }
    if (!safeGachaBanners.some(b => b.id === selectedBannerId)) {
      setSelectedBannerId(safeGachaBanners[0].id);
    }
  }, [safeGachaBanners, selectedBannerId]);
  const [editBannerName, setEditBannerName] = useState('');
  const [editBannerTitle, setEditBannerTitle] = useState('');
  const [editBannerDesc, setEditBannerDesc] = useState('');
  const [editBannerPullCost, setEditBannerPullCost] = useState(500);
  const [editBannerTenCost, setEditBannerTenCost] = useState(4500);
  const [editBannerPullCostPossibility, setEditBannerPullCostPossibility] = useState(1);
  const [editBannerTenCostPossibility, setEditBannerTenCostPossibility] = useState(10);
  const [editBannerMultiPullCounts, setEditBannerMultiPullCounts] = useState('20,30,50');
  const [editBannerMultiPullCount, setEditBannerMultiPullCount] = useState(20);
  const [editBannerEnabled, setEditBannerEnabled] = useState(true);
  useEffect(() => {
    if (!selectedBanner) return;
    setEditBannerName(selectedBanner.name); setEditBannerTitle(selectedBanner.bannerTitle); setEditBannerDesc(selectedBanner.bannerDescription);
    setEditBannerPullCost(selectedBanner.pullCost); setEditBannerTenCost(selectedBanner.tenPullCost); setEditBannerPullCostPossibility(selectedBanner.pullCostPossibility ?? selectedBanner.pullCost); setEditBannerTenCostPossibility(selectedBanner.tenPullCostPossibility ?? selectedBanner.tenPullCost); setEditBannerMultiPullCounts((selectedBanner.multiPullCounts || [20, 30, 50]).join(',')); setEditBannerMultiPullCount(selectedBanner.multiPullCount || 20); setEditBannerEnabled(selectedBanner.enabled);
  }, [selectedBannerId, safeGachaBanners]);

  // New Gacha Reward Form
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardType, setNewRewardType] = useState<'coin' | 'item' | 'skill' | 'characteristic'>('coin');
  const [newRewardRate, setNewRewardRate] = useState<number>(10);
  const [newRewardRarity, setNewRewardRarity] = useState<GachaRarity>('rare');
  const [newRewardDesc, setNewRewardDesc] = useState('');
  const [newRewardCoinAmount, setNewRewardCoinAmount] = useState(2500);
  const [newRewardCharacteristic, setNewRewardCharacteristic] = useState('');
  const [newRewardBattleEffect, setNewRewardBattleEffect] = useState<NonNullable<Skill['battleEffect']>>('damage');
  const [newRewardBattlePower, setNewRewardBattlePower] = useState(5);
  const [newSummonName, setNewSummonName] = useState('ลูกน้อง');
  const [newSummonMaxCount, setNewSummonMaxCount] = useState(1);
  const [newSummonHp, setNewSummonHp] = useState(20);
  const [newSummonDamage, setNewSummonDamage] = useState(5);
  const [newSummonAgility, setNewSummonAgility] = useState(1);
  const [newSummonSkillsText, setNewSummonSkillsText] = useState('[]');
  const [newRewardDamageScaling, setNewRewardDamageScaling] = useState<NonNullable<Skill['damageScaling']>>('fixed');
  const [newRewardDamageScalingMultiplier, setNewRewardDamageScalingMultiplier] = useState(1);
  const [editingSkillRewardId, setEditingSkillRewardId] = useState<string | null>(null);
  const [editingSkillName, setEditingSkillName] = useState('');
  const [editingSkillDesc, setEditingSkillDesc] = useState('');
  const [editingSkillEffect, setEditingSkillEffect] = useState<NonNullable<Skill['battleEffect']>>('damage');
  const [editingSkillPower, setEditingSkillPower] = useState(5);
  const [editingSkillScaling, setEditingSkillScaling] = useState<NonNullable<Skill['damageScaling']>>('fixed');
  const [editingSkillScalingMultiplier, setEditingSkillScalingMultiplier] = useState(1);
  const [editingSkillCooldown, setEditingSkillCooldown] = useState(0);
  const [editingSkillEffectDuration, setEditingSkillEffectDuration] = useState(1);
  const [editingSkillCritChance, setEditingSkillCritChance] = useState(0);
  const [editingSkillCritMultiplier, setEditingSkillCritMultiplier] = useState(2);
  const [editingSkillRepeatChance, setEditingSkillRepeatChance] = useState(0);
  const [editingSkillMaxRepeats, setEditingSkillMaxRepeats] = useState(1);
  const [editingSkillDrawbacksText, setEditingSkillDrawbacksText] = useState('[]');
  const [editingSkillEffectsText, setEditingSkillEffectsText] = useState('[]');
  const [editingSkillPassivesText, setEditingSkillPassivesText] = useState('[]');
  const [editingSkillAdvancedMode, setEditingSkillAdvancedMode] = useState<'form' | 'json'>('form');
  const [editingDrawbackKind, setEditingDrawbackKind] = useState<BattleExtraEffect['kind']>('bleeding');
  const [editingDrawbackValue, setEditingDrawbackValue] = useState(10);
  const [editingDrawbackDuration, setEditingDrawbackDuration] = useState(1);
  const [editingDrawbackChance, setEditingDrawbackChance] = useState(100);
  const [editingEffectKind, setEditingEffectKind] = useState<BattleExtraEffect['kind']>('poison');
  const [editingEffectValue, setEditingEffectValue] = useState(10);
  const [editingEffectDuration, setEditingEffectDuration] = useState(1);
  const [editingEffectChance, setEditingEffectChance] = useState(100);
  const [editingEffectTarget, setEditingEffectTarget] = useState<'self' | 'enemy'>('enemy');
  const [editingPassiveName, setEditingPassiveName] = useState('Passive ของสกิล');
  const [editingPassiveTrigger, setEditingPassiveTrigger] = useState<ItemPassiveEffect['trigger']>('turn_start');
  const [editingPassiveKind, setEditingPassiveKind] = useState<ItemPassiveEffect['kind']>('stack');
  const [editingPassiveValue, setEditingPassiveValue] = useState(1);
  const [editingPassiveMaxStacks, setEditingPassiveMaxStacks] = useState(6);
  const [editingPassiveChance, setEditingPassiveChance] = useState(100);
  const [editingPassiveDuration, setEditingPassiveDuration] = useState(1);
  const [editingPassiveStackKey, setEditingPassiveStackKey] = useState('flower');
  const [editingPassiveTargetStat, setEditingPassiveTargetStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [newRewardCooldownTurns, setNewRewardCooldownTurns] = useState(0);
  const [newRewardDrawbacks, setNewRewardDrawbacks] = useState<BattleExtraEffect[]>([]);
  const [newDrawbackKind, setNewDrawbackKind] = useState<BattleExtraEffect['kind']>('bleeding');
  const [newDrawbackValue, setNewDrawbackValue] = useState(10);
  const [newDrawbackDuration, setNewDrawbackDuration] = useState(1);
  const [newRewardCritChance, setNewRewardCritChance] = useState(0);
  const [newRewardCritMultiplier, setNewRewardCritMultiplier] = useState(2);
  const [newSkillPassiveEffects, setNewSkillPassiveEffects] = useState<ItemPassiveEffect[]>([]);
  const [newSkillPassiveName, setNewSkillPassiveName] = useState('Passive ติดตัวของสกิล');
  const [newSkillPassiveTrigger, setNewSkillPassiveTrigger] = useState<ItemPassiveEffect['trigger']>('turn_start');
  const [newSkillPassiveKind, setNewSkillPassiveKind] = useState<ItemPassiveEffect['kind']>('stack');
  const [newSkillPassiveValue, setNewSkillPassiveValue] = useState(1);
  const [newSkillPassiveMaxStacks, setNewSkillPassiveMaxStacks] = useState(6);
  const [newSkillPassiveChance, setNewSkillPassiveChance] = useState(100);
  const [newSkillPassiveStackKey, setNewSkillPassiveStackKey] = useState('flower');
  const [newSkillPassiveTargetStat, setNewSkillPassiveTargetStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [newSkillPassiveDuration, setNewSkillPassiveDuration] = useState(1);
  const [newRewardRepeatAttackChance, setNewRewardRepeatAttackChance] = useState(0);
  const [newRewardMaxRepeatAttacks, setNewRewardMaxRepeatAttacks] = useState(1);
  const [newRewardBattleEffects, setNewRewardBattleEffects] = useState<BattleExtraEffect[]>([]);
  const [newRewardEffectKind, setNewRewardEffectKind] = useState<BattleExtraEffect['kind']>('bleeding');
  const [newRewardEffectValue, setNewRewardEffectValue] = useState(15);
  const [newRewardEffectDuration, setNewRewardEffectDuration] = useState(1);
  const [newRewardEffectChance, setNewRewardEffectChance] = useState(100);
  const [newRewardBattleStats, setNewRewardBattleStats] = useState<BattleSkillStat[]>([]);
  const [newRewardStatKind, setNewRewardStatKind] = useState<BattleSkillStat['kind']>('attack_power');
  const [newRewardStatValue, setNewRewardStatValue] = useState(15);
  const [newRewardStatDuration, setNewRewardStatDuration] = useState(1);

  // Inline edit rate map
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  const selectedChar = characters.find(c => c.id === selectedCharId);
  const spawnerTargetChar = characters.find(c => c.id === spawnerTargetCharId) || characters[0];

  // Calculate total gacha rate sum
  const selectedBannerRewards = gachaRewards.filter(r => r.bannerId === selectedBannerId || (!r.bannerId && selectedBannerId === 'main'));
  const totalGachaRate = selectedBannerRewards.reduce((sum, r) => sum + (Number(r.rate) || 0), 0);

  // Quick coin action handlers
  const handleAddCoins = () => {
    if (!selectedCharId) return;
    const amount = parseCoinAmount(coinInput);
    if (amount <= 0) return alert('กรุณาระบุจำนวนเหรียญที่ถูกต้อง เช่น 1m หรือ 1,000,000');
    onUpdateCharacterCoins(selectedCharId, amount);
    alert(`เพิ่มเหรียญ ${formatCoins(coinInput)} Coins ให้ผู้เล่น "${selectedChar?.displayName}" เรียบร้อยแล้ว!`);
  };

  const handleDeductCoins = () => {
    if (!selectedCharId) return;
    const amount = parseCoinAmount(coinInput);
    if (amount <= 0) return alert('กรุณาระบุจำนวนเหรียญที่ถูกต้อง เช่น 1m หรือ 1,000,000');
    onUpdateCharacterCoins(selectedCharId, -amount);
    alert(`หักเหรียญ ${formatCoins(coinInput)} Coins จากผู้เล่น "${selectedChar?.displayName}" เรียบร้อยแล้ว!`);
  };

  const handleSetExactCoins = () => {
    if (!selectedCharId) return;
    const amount = parseCoinAmount(coinInput);
    if (amount < 0) return alert('กรุณาระบุจำนวนเหรียญที่ถูกต้อง เช่น 1m หรือ 1,000,000');
    onSetCharacterCoins(selectedCharId, amount);
    alert(`กำหนดเหรียญให้ "${selectedChar?.displayName}" เป็น ${formatCoins(coinInput)} Coins เรียบร้อยแล้ว!`);
  };

  const handleAddPossibility = async () => {
    if (!selectedCharId || !onUpdateCharacterPossibility) return;
    const amount = parseCoinAmount(coinInput);
    if (amount <= 0) return alert('กรุณาระบุจำนวนความเป็นไปได้ที่ถูกต้อง');
    await onUpdateCharacterPossibility(selectedCharId, amount);
    alert(`เสกความเป็นไปได้ +${formatCoins(amount)} ให้ "${selectedChar?.displayName}" เรียบร้อยแล้ว!`);
  };

  // Add Item to Shop Handler
  const handleCreateShopItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopItemName.trim()) {
      alert('กรุณากรอกชื่อไอเทม');
      return;
    }

    const newItem: Item = {
      id: `item-${Date.now()}`,
      name: shopItemName.trim(),
      price: Math.max(1, shopItemPrice),
      category: shopItemCategory,
      rarity: shopItemRarity,
      description: shopItemDesc.trim() || 'ไอเทมพิเศษที่ลงทะเบียนโดยผู้ดูแลระบบ Star Stream',
      icon: shopItemIcon,
      effectType: shopItemEffectType,
      effectValue: shopItemEffectVal,
      hpBonus: (shopItemEffectType === 'heal_hp' || shopItemEffectType === 'boost_max_hp' || shopItemCategory === 'equipment') ? (shopItemHpBonus || shopItemEffectVal) : undefined,
      targetStat: shopItemEffectType === 'buff_stat' ? shopItemTargetStat : undefined,
      skillEnhanceTarget: shopItemEffectType === 'enhance_skill' ? shopItemSkillTarget : undefined,
      usableByPlayers: true,
      equipped: false,
      adminOnly: !shopItemInShop,
      inShop: shopItemInShop,
      rewardEligible: shopItemRewardEligible,
      stackable: shopItemStackable,
    };

    try {
      await onAddShopItem(newItem);
    } catch (error) {
      console.error('Failed to save admin shop item:', error);
      alert('บันทึกไอเทมลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      return;
    }
    setShopItemName('');
    setShopItemDesc('');
    setShopItemAdminOnly(false);
    alert(shopItemAdminOnly ? `สร้างไอเทมรางวัล "${newItem.name}" สำเร็จแล้ว! ไอเทมนี้จะไม่แสดงในร้านค้า` : `เพิ่มไอเทม "${newItem.name}" ลงร้านค้าสำเร็จแล้ว!`);
  };


  // Grant Item Handler
  const handleGrantItemToPlayer = async () => {
    if (!spawnerTargetChar) {
      alert('กรุณาเลือกผู้เล่นเป้าหมาย');
      return;
    }

    let itemToGrant: Item | null = null;
    if (spawnerMode === 'shop') {
      const found = shopItems.find(i => i.id === selectedShopItemToSpawnId);
      if (!found) {
        alert('กรุณาเลือกไอเทมจากร้านค้า');
        return;
      }
      itemToGrant = found;
    }

    if (onGrantItem) {
      const res = await onGrantItem(spawnerTargetChar.id, itemToGrant, spawnQuantity);
      alert(res.message);
    } else {
      // Fallback direct edit
      const currentInv = [...(spawnerTargetChar.inventory || [])];
      currentInv.push({
        ...itemToGrant,
        instanceId: `inst-${Date.now()}`,
        quantity: spawnQuantity,
        isEquipped: false
      });
      onDirectEditCharacter(syncCharacterHealth({
        ...spawnerTargetChar,
        inventory: currentInv,
      }));
      alert(`เสกไอเทม "${itemToGrant.name}" (x${spawnQuantity}) ให้ผู้เล่น ${spawnerTargetChar.displayName} เรียบร้อยแล้ว!`);
    }
  };

  // Remove Item from Player Handler
  const handleRemovePlayerItem = async (instanceId: string, itemName: string) => {
    if (!confirm(`คุณต้องการลบไอเทม "${itemName}" ออกจากตัวผู้เล่น "${spawnerTargetChar.displayName}" ใช่หรือไม่?`)) {
      return;
    }

    if (onRemoveItem) {
      const res = await onRemoveItem(spawnerTargetChar.id, instanceId);
      alert(res.message);
    } else {
      const currentInv = (spawnerTargetChar.inventory || []).filter(i => i.instanceId !== instanceId && i.id !== instanceId);
      onDirectEditCharacter({
        ...spawnerTargetChar,
        inventory: currentInv
      });
      alert(`ลบไอเทม "${itemName}" เรียบร้อยแล้ว!`);
    }
  };

  const parseMultiPullCounts = (value: string): number[] => Array.from(new Set(value.split(',').map(v => Math.floor(Number(v.trim()))).filter(v => Number.isFinite(v) && v > 10 && v <= 1000))).sort((a, b) => a - b);
  const handleUpdateGachaBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBanner) return;
    try {
      await onSaveGachaBanner({
        ...selectedBanner,
        name: editBannerName.trim() || selectedBanner.name,
        bannerTitle: editBannerTitle.trim() || selectedBanner.bannerTitle,
        bannerDescription: editBannerDesc.trim() || selectedBanner.bannerDescription,
        pullCost: Math.max(1, Number(editBannerPullCost) || 1),
        tenPullCost: Math.max(100, Number(editBannerTenCost) || 100),
        pullCostPossibility: Math.max(1, Number(editBannerPullCostPossibility) || 1),
        tenPullCostPossibility: Math.max(1, Number(editBannerTenCostPossibility) || 1),
        multiPullCounts: parseMultiPullCounts(editBannerMultiPullCounts),
        multiPullCount: Math.max(11, Math.floor(Number(editBannerMultiPullCount) || 20)),
        enabled: editBannerEnabled,
        updatedAt: Date.now(),
      });
      alert('บันทึกการตั้งค่าตู้กาชาเรียบร้อยแล้ว');
    } catch (error) { console.error(error); alert('บันทึกตู้กาชาไม่สำเร็จ'); }
  };

  const handleCreateGachaBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBannerName.trim()) { alert('กรุณากรอกชื่อตู้กาชา'); return; }
    const banner: GachaBanner = {
      id: `banner-${Date.now()}`,
      name: newBannerName.trim(),
      pullCost: Math.max(1, Number(newBannerPullCost) || 1),
      tenPullCost: Math.max(100, Number(newBannerTenCost) || 100),
      pullCostPossibility: Math.max(1, Number(newBannerPullCostPossibility) || 1),
      tenPullCostPossibility: Math.max(1, Number(newBannerTenCostPossibility) || 1),
      multiPullCounts: parseMultiPullCounts(newBannerMultiPullCounts),
        multiPullCount: Math.max(11, Math.floor(Number(newBannerMultiPullCount) || 20)),
      enabled: newBannerEnabled,
      bannerTitle: newBannerTitle.trim() || newBannerName.trim(),
      bannerDescription: newBannerDesc.trim() || 'ตู้กาชาพิเศษ',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await onSaveGachaBanner(banner);
      setSelectedBannerId(banner.id);
      setNewBannerName('ตู้กาชาใหม่');
      alert(`สร้างตู้กาชา "${banner.name}" สำเร็จแล้ว`);
    } catch (error) {
      console.error(error);
      alert('สร้างตู้กาชาไม่สำเร็จ');
    }
  };

  // Save Gacha Config Handler
  const handleSaveGachaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const mainBanner = safeGachaBanners.find(b => b.id === 'main');
    if (!mainBanner) {
      alert('ยังไม่มี gacha_banners/main กรุณาสร้าง/seed ตู้หลักก่อน');
      return;
    }
    try {
      await onSaveGachaBanner({
        ...mainBanner,
        pullCost: Math.max(1, Number(pullCostInput) || 1),
        tenPullCost: Math.max(100, Number(tenPullCostInput) || 100),
        pullCostPossibility: Math.max(1, Number(gachaConfig.pullCostPossibility) || 1),
        tenPullCostPossibility: Math.max(1, Number(gachaConfig.tenPullCostPossibility) || 10),
        bannerTitle: bannerTitleInput.trim() || mainBanner.name,
        bannerDescription: bannerDescInput.trim() || 'ตู้กาชาพิเศษ',
        multiPullCounts: parseMultiPullCounts(multiPullCountsInput),
      multiPullCount: Math.max(11, Math.floor(Number(multiPullCountInput) || 20)),
        enabled: gachaEnabledInput,
        updatedAt: Date.now(),
      });
      alert('บันทึกการตั้งค่าตู้หลักลง gacha_banners/main แล้ว!');
    } catch (error) {
      console.error(error);
      alert('บันทึกตู้หลักไม่สำเร็จ');
    }
  };

  const openSkillEditor = (reward: GachaReward) => {
    if (reward.type !== 'skill' || !reward.skillData) return;
    const skill = reward.skillData;
    setEditingSkillRewardId(reward.id);
    setEditingSkillName(skill.name || reward.name);
    setEditingSkillDesc(skill.description || reward.description || '');
    setEditingSkillEffect(skill.battleEffect || 'damage');
    setEditingSkillPower(Math.max(1, Number(skill.battlePower) || 1));
    setEditingSkillScaling(skill.damageScaling || 'fixed');
    setEditingSkillScalingMultiplier(Math.max(0, Number(skill.damageScalingMultiplier) || 1));
    setEditingSkillCooldown(Math.max(0, Number(skill.cooldownTurns) || 0));
    setEditingSkillCritChance(Math.max(0, Number(skill.battleCriticalChance) || 0));
    setEditingSkillCritMultiplier(Math.max(1, Number(skill.battleCriticalMultiplier) || 1));
    setEditingSkillRepeatChance(Math.max(0, Number(skill.repeatAttackChance) || 0));
    setEditingSkillMaxRepeats(Math.max(1, Number(skill.maxRepeatAttacks) || 1));
    setEditingSkillEffectDuration(Math.max(1, Math.min(10, Number(skill.battleEffectDuration) || 1)));
    setEditingSkillDrawbacksText(JSON.stringify(skill.battleDrawbacks || [], null, 2));
    setEditingSkillEffectsText(JSON.stringify(skill.battleEffects || [], null, 2));
    setEditingSkillPassivesText(JSON.stringify(skill.passiveEffects || [], null, 2));
    setEditingSkillAdvancedMode('form');
  };

  const saveEditedSkill = async () => {
    const reward = gachaRewards.find(item => item.id === editingSkillRewardId);
    if (!reward?.skillData) return;
    const oldSkill = reward.skillData;
    let parsedDrawbacks: BattleExtraEffect[] = [];
    let parsedEffects: BattleExtraEffect[] = [];
    let parsedPassives: ItemPassiveEffect[] = [];
    try {
      if (editingSkillAdvancedMode === 'form') {
        parsedDrawbacks = JSON.parse(editingSkillDrawbacksText || '[]');
        parsedEffects = JSON.parse(editingSkillEffectsText || '[]');
        parsedPassives = JSON.parse(editingSkillPassivesText || '[]');
      } else {
        parsedDrawbacks = JSON.parse(editingSkillDrawbacksText || '[]');
        parsedEffects = JSON.parse(editingSkillEffectsText || '[]');
        parsedPassives = JSON.parse(editingSkillPassivesText || '[]');
      }
      if (!Array.isArray(parsedDrawbacks)) throw new Error('drawbacks');
      if (!Array.isArray(parsedEffects)) throw new Error('effects');
      if (!Array.isArray(parsedPassives)) throw new Error('passives');
    } catch (error) {
      const message = String(error);
      if (message.includes('drawbacks')) alert('JSON ข้อเสียไม่ถูกต้อง');
      else if (message.includes('effects')) alert('JSON เอฟเฟกต์ไม่ถูกต้อง');
      else if (message.includes('passives')) alert('JSON Passive ไม่ถูกต้อง');
      else alert('JSON ของสกิลไม่ถูกต้อง');
      return;
    }
    const skill: Skill = {
      ...oldSkill,
      name: editingSkillName.trim() || oldSkill.name,
      description: editingSkillDesc.trim() || oldSkill.description,
      battleEffect: editingSkillEffect,
      battleEffectDuration: Math.max(1, Math.min(10, Math.round(Number(editingSkillEffectDuration) || 1))),
      battlePower: Math.max(1, Number(editingSkillPower) || 1),
      damageScaling: editingSkillScaling,
      damageScalingMultiplier: Math.max(0, Number(editingSkillScalingMultiplier) || 0),
      cooldownTurns: Math.max(0, Number(editingSkillCooldown) || 0),
      cooldown: Number(editingSkillCooldown) > 0 ? Number(editingSkillCooldown) + ' เทิร์น' : undefined,
      battleCriticalChance: Math.max(0, Math.min(100, Number(editingSkillCritChance) || 0)),
      battleCriticalMultiplier: Math.max(1, Number(editingSkillCritMultiplier) || 1),
      repeatAttackChance: Math.max(0, Math.min(100, Number(editingSkillRepeatChance) || 0)),
      maxRepeatAttacks: Math.max(1, Math.min(20, Number(editingSkillMaxRepeats) || 1)),
      battleEffects: parsedEffects.length ? parsedEffects : undefined,
      battleDrawbacks: parsedDrawbacks.length ? parsedDrawbacks : undefined,
      passiveEffects: parsedPassives.length ? parsedPassives : undefined,
    };
    try {
      await onAddGachaReward({ ...reward, name: skill.name, description: skill.description, skillData: skill });
      setEditingSkillRewardId(null);
      alert('แก้ไขสกิลเรียบร้อยแล้ว');
    } catch (error) {
      console.error(error);
      alert('แก้ไขสกิลไม่สำเร็จ');
    }
  };

  // Create Gacha Reward Handler
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRewardName.trim()) {
      alert('กรุณากรอกชื่อของรางวัลกาชา');
      return;
    }

    let itemData: Item | undefined = undefined;
    if (newRewardType === 'item') {
      const foundItem = shopItems.find(i => i.id === newRewardSelectedShopItemId);
      if (foundItem) {
        itemData = foundItem;
      }
    }

    const reward: GachaReward = {
      id: `reward-${Date.now()}`,
      name: newRewardName.trim(),
      type: newRewardType,
      rate: Math.max(0, Number(newRewardRate) || 0),
      rarity: newRewardRarity,
      description: newRewardDesc.trim() || 'ของรางวัลกาชาใน Star Stream',
      bannerId: selectedBannerId || 'main',
      coinAmount: newRewardType === 'coin' ? newRewardCoinAmount : undefined,
      itemData,
      itemId: itemData?.id,
      characteristic: newRewardType === 'characteristic' ? newRewardCharacteristic.trim() : undefined,
      skillData: newRewardType === 'skill' ? {
        id: `skill-template-${Date.now()}`,
        name: newRewardName.trim(),
        level: 1,
        multiplier: 1,
        type: 'สกิลต่อสู้จากกาชา',
        category: 'general',
        description: newRewardDesc.trim() || 'สกิลต่อสู้ที่ได้รับจากตู้กาชา',
        battleEffect: newRewardBattleEffect,
        battleEffectDuration: Math.max(1, Math.min(10, Math.round(Number(newRewardEffectDuration) || 1))),
        battlePower: Math.max(1, Number(newRewardBattlePower) || 1),
        damageScaling: newRewardDamageScaling,
        damageScalingMultiplier: Math.max(0, Number(newRewardDamageScalingMultiplier) || 0),
        cooldownTurns: Math.max(0, Number(newRewardCooldownTurns) || 0),
        cooldown: Number(newRewardCooldownTurns) > 0 ? `${newRewardCooldownTurns} เทิร์น` : undefined,
        battleCriticalChance: Math.max(0, Math.min(100, Number(newRewardCritChance) || 0)),
        battleCriticalMultiplier: Math.max(1, Number(newRewardCritMultiplier) || 1),
        repeatAttackChance: Math.max(0, Math.min(100, Number(newRewardRepeatAttackChance) || 0)),
        passiveEffects: newSkillPassiveEffects.length ? newSkillPassiveEffects : undefined,
        maxRepeatAttacks: Math.max(1, Math.min(20, Number(newRewardMaxRepeatAttacks) || 1)),
        battleEffects: newRewardBattleEffects.length ? [...newRewardBattleEffects] : undefined,
        battleDrawbacks: newRewardDrawbacks.length ? [...newRewardDrawbacks] : undefined,
        battleStats: [...newRewardBattleStats],
      } : undefined,
    };

    try {
      await onAddGachaReward(reward);
      setNewRewardName('');
      setNewRewardDesc('');
      setNewRewardCharacteristic('');
      setNewRewardBattleEffect('damage');
      setNewRewardBattlePower(5);
      setNewRewardCooldownTurns(0);
      setNewRewardEffectDuration(1);
      setNewRewardDrawbacks([]);
      setNewDrawbackKind('bleeding');
      setNewDrawbackValue(10);
      setNewDrawbackDuration(1);
      setNewRewardCritChance(0);
      setNewRewardCritMultiplier(2);
      setNewSkillPassiveEffects([]);
      setNewSkillPassiveName('Passive ติดตัวของสกิล');
      setNewSkillPassiveTrigger('turn_start');
      setNewSkillPassiveKind('stack');
      setNewSkillPassiveValue(1);
      setNewSkillPassiveMaxStacks(6);
      setNewSkillPassiveChance(100);
      setNewSkillPassiveStackKey('flower');
      setNewSkillPassiveTargetStat('strength');
      setNewSkillPassiveDuration(1);
      setNewRewardRepeatAttackChance(0);
      setNewRewardMaxRepeatAttacks(1);
      setNewRewardBattleEffects([]);
      setNewRewardBattleStats([]);
      setNewRewardStatKind('attack_power');
      setNewRewardStatValue(15);
      setNewRewardStatDuration(1);
      setNewRewardEffectKind('bleeding');
      setNewRewardEffectValue(15);
      setNewRewardEffectDuration(1);
      setNewRewardEffectChance(100);
      alert(`เพิ่มของรางวัล "${reward.name}" เข้าตู้กาชาสำเร็จ!`);
    } catch (error) {
      console.error('Error saving gacha reward:', error);
      alert('บันทึกของรางวัลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Save Inline Rate Change
  const handleSaveRateChange = async (reward: GachaReward) => {
    const newRate = editingRates[reward.id];
    const normalizedRate = Number(newRate);
    if (newRate === undefined || !Number.isFinite(normalizedRate) || normalizedRate < 0) {
      alert('เรทต้องเป็นตัวเลขตั้งแต่ 0% ขึ้นไป');
      return;
    }
    try {
      await onAddGachaReward({
        ...reward,
        rate: normalizedRate,
      });
      setEditingRates(prev => {
        const next = { ...prev };
        delete next[reward.id];
        return next;
      });
      alert(`อัปเดตเรทของ "${reward.name}" เป็น ${newRate}% เรียบร้อยแล้ว!`);
    } catch (error) {
      console.error('Error saving gacha rate:', error);
      alert('บันทึกเรทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleAssignQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAssignQuest) return;
    if (!selectedCharId) {
      alert('กรุณาเลือกผู้เล่นเป้าหมาย');
      return;
    }
    if (!questTitle.trim()) {
      alert('กรุณากรอกชื่อภารกิจ');
      return;
    }
    if (questKind === 'question' && (!questQuestion.trim() || !questAnswer.trim())) {
      alert('กรุณากรอกคำถามและคำตอบของภารกิจ');
      return;
    }
    const quest: Quest = {
      id: 'quest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: questTitle.trim(),
      description: questDescription.trim() || 'ภารกิจพิเศษจากแอดมิน Star Stream',
      kind: questKind,
      question: questKind === 'question' ? questQuestion.trim() : undefined,
      answer: questKind === 'question' ? questAnswer.trim() : undefined,
      targetCount: Math.max(1, Number(questTargetCount) || 1),
      currentCount: 0,
      rewardCoins: Math.max(0, Number(questRewardCoins) || 0),
      rewardItemName: questRewardItemName || undefined,
      isCompleted: false,
      isClaimed: false,
      createdAt: Date.now(),
    };
    const success = await onAssignQuest(selectedCharId, quest);
    if (success) {
      setQuestTitle('');
      setQuestDescription('');
      setQuestQuestion('');
      setQuestAnswer('');
      setQuestTargetCount(1);
      setQuestRewardCoins(500);
      setQuestRewardItemName('');
      alert('มอบภารกิจ “' + quest.title + '” ให้ผู้เล่นสำเร็จแล้ว');
    }
  };

  const pendingProofs = characters.flatMap(character => (character.quests || [])
    .filter(quest => quest.reviewStatus === 'pending' && quest.proofDataUrl)
    .map(quest => ({ character, quest })));

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-3xl bg-slate-900/90 border border-amber-500/40 p-6 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                DOKKAEBI SYSTEM ADMIN CONSOLE
              </span>
            </div>
            <h2 className="text-xl font-black text-white">
              แผงควบคุมผู้ดูแลระบบ (Admin Dashboard)
            </h2>
            <p className="text-xs text-slate-400">
              เพิ่ม/ลบของในร้านค้า, เสกและลบไอเทมผู้เล่น, ตั้งค่าของรางวัลและเรทออกกาชา
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm('ต้องการรีเซ็ตฐานข้อมูลกลับเป็นค่าเริ่มต้นหรือไม่?')) {
                onResetToDefaults();
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            รีเซ็ตระบบ (Reset DB)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative z-[100] flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'users'
              ? 'bg-amber-500 text-slate-950 font-black shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Coins className="w-4 h-4" />
          จัดการผู้เล่นและเหรียญ
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'shop'
              ? 'bg-amber-500 text-slate-950 font-black shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store className="w-4 h-4" />
          จัดการร้านค้า (เพิ่ม/ลบของ)
        </button>

        <button
          onClick={() => setActiveTab('inventory_spawner')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'inventory_spawner'
              ? 'bg-amber-500 text-slate-950 font-black shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wand2 className="w-4 h-4 text-purple-400" />
          จัดการคลังผู้เล่น / ลบไอเทม
        </button>
        <button
          onClick={() => setActiveTab('quests')}
          className={'px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ' + (activeTab === 'quests' ? 'bg-amber-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white')}
        >
          <ScrollText className="w-4 h-4 text-cyan-300" />
          มอบภารกิจให้ผู้เล่น
        </button>
        <button
          onClick={() => setActiveTab('gacha_manage')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'gacha_manage'
              ? 'bg-amber-500 text-slate-950 font-black shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          ตั้งค่ากาชาและเรทออก
        </button>
      </div>

      {/* ==================== TAB 1: USERS & COINS ==================== */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Quick Coin Action Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                ปรับเหรียญผู้เล่น (Coins)
              </h3>
              <div>
                <label className="text-xs text-slate-300 block mb-1">เลือกผู้เล่น:</label>
                <select
                  value={selectedCharId}
                  onChange={(e) => setSelectedCharId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-amber-400 cursor-pointer"
                >
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.nickname}) - มี {formatCoins(c.coins)} C [{c.role || 'player'}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedChar && (
                <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center gap-3">
                  <img
                    src={selectedChar.avatarUrl}
                    alt={selectedChar.displayName}
                    className="w-12 h-12 rounded-xl object-cover border border-amber-500/40"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      {selectedChar.displayName}
                      {selectedChar.role === 'admin' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                          แอดมิน
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-serif">"{selectedChar.nickname}"</div>
                    <div className="text-xs font-mono font-bold text-amber-300 mt-0.5">
                      เหรียญปัจจุบัน: {formatCoins(selectedChar.coins)} Coins<br />ความเป็นไปได้: {formatCoins(selectedChar.possibility || 0)}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-300 block mb-1">จำนวน Coins / ความเป็นไปได้:</label>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="เช่น 1m, 1.5m หรือ 1,000,000"
                  value={coinInput}
                  onChange={(e) => setCoinInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono font-bold outline-none focus:border-amber-400"
                />
                <div className="text-[10px] text-slate-500">รองรับ 1,000,000 = 1m · 1b = 1,000,000,000 · 1t = 1,000,000,000,000 · พิมพ์ตัวอักษร K/M/B/T ได้</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[1000, 5000, 10000, 50000, 100000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCoinInput(String(amt))}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-mono cursor-pointer"
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 space-y-2">
                {onUpdateCharacterPossibility && (
                  <button type="button" onClick={handleAddPossibility} className="w-full py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> ✨ เสกความเป็นไปได้ +{coinInput || 0}
                  </button>
                )}
                <button
                  onClick={handleAddCoins}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  + เพิ่มเหรียญ (Add Coins)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDeductCoins}
                    className="py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    - หักเหรียญ
                  </button>
                  <button
                    onClick={handleSetExactCoins}
                    className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    = กำหนดจำนวนเป๊ะ
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Character Table */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  รายชื่อผู้เล่นทั้งหมด ({characters.length} คน)
                </h3>
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ค้นหาชื่อผู้เล่น..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="pb-3">ผู้เล่น</th>
                      <th className="pb-3">บทบาท</th>
                      <th className="pb-3">เหรียญ (Coins)</th>
                      <th className="pb-3">พลังรบ</th>
                      <th className="pb-3 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {characters
                      .filter(c => c.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((char) => (
                        <tr key={char.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 flex items-center gap-2.5">
                            <img
                              src={char.avatarUrl}
                              alt={char.displayName}
                              className="w-8 h-8 rounded-lg object-cover border border-cyan-500/40"
                            />
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                {char.displayName}
                              </div>
                              <div className="text-[10px] text-slate-400">"{char.nickname}"</div>
                            </div>
                          </td>
                          <td className="py-2.5">
                            {char.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                                แอดมิน
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                                ผู้เล่น
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono font-bold text-amber-400">
                            {formatCoins(char.coins)} C
                          </td>
                          <td className="py-2.5 font-mono text-cyan-400">
                            {char.powerScore?.toLocaleString() || 0}
                          </td>
                          <td className="py-2.5 text-right space-x-1">
                            {onToggleAdminRole && (
                              <button
                                onClick={() => onToggleAdminRole(char)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  char.role === 'admin'
                                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/60'
                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                                }`}
                                title={char.role === 'admin' ? "ถอดบทบาทแอดมิน" : "แต่งตั้งแอดมิน"}
                              >
                                {char.role === 'admin' ? "ปลดแอดมิน" : "+แอดมิน"}
                              </button>
                            )}
                            {onDeleteCharacter && characters.length > 1 && (
                              <button
                                onClick={() => {
                                  if (confirm(`คุณต้องการลบตัวละคร "${char.displayName}" ใช่หรือไม่?`)) {
                                    onDeleteCharacter(char.id);
                                  }
                                }}
                                className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                title="ลบตัวละคร"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: SHOP ADMIN ==================== */}
      {activeTab === 'shop' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Add New Item to Shop Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-400" />
                🧰 สร้างไอเทม (ร้านค้า / รางวัลพิเศษ)
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Admin Shop
              </span>
            </div>

            {/* Quick Preset Templates */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                แม่แบบด่วน (กดเลือกเพื่อเติมข้อมูลทันที):
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {SHOP_PRESET_TEMPLATES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyShopPreset(preset)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-amber-950/40 hover:border-amber-500/50 border border-slate-700/70 text-[10px] text-left text-slate-200 font-medium transition-all cursor-pointer truncate flex items-center gap-1"
                    title={preset.name}
                  >
                    <span className="truncate">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateShopItem} className="space-y-3 pt-1">
              <div>
                <label className="text-xs text-slate-300 block mb-1">ชื่อไอเทม *</label>
                <input
                  type="text"
                  required
                  value={shopItemName}
                  onChange={(e) => setShopItemName(e.target.value)}
                  placeholder="เช่น โอสถฟื้นฟูกายาดวงดาว, แก่นโลหิต..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ราคา (Coins) *</label>
                  <input
                    type="number"
                    min={1}
                    value={shopItemPrice}
                    onChange={(e) => setShopItemPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ประเภท</label>
                  <select
                    value={shopItemCategory}
                    onChange={(e) => setShopItemCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  >
                    <option value="consumable">ไอเทมใช้งาน / โอสถ (Consumable)</option>
                    <option value="equipment">อุปกรณ์สวมใส่ (Equipment)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ความหายาก</label>
                  <select
                    value={shopItemRarity}
                    onChange={(e) => setShopItemRarity(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  >
                    <option value="common">Common (ทั่วไป)</option>
                    <option value="rare">Rare (หายาก)</option>
                    <option value="epic">Epic (ยอดเยี่ยม)</option>
                    <option value="legendary">Legendary (ตำนาน)</option>
                    <option value="mythic">Mythic (มายาสงคราม)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ประเภทเอฟเฟกต์</label>
                  <select
                    value={shopItemEffectType}
                    onChange={(e) => setShopItemEffectType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  >
                    <option value="heal_hp">ฟื้นฟูเลือด HP (Heal)</option>
                    <option value="boost_max_hp">ขยาย Max HP ถาวร (Permanent)</option>
                    <option value="buff_stat">เพิ่มค่าสเตตัส (Buff Stat)</option>
                    <option value="enhance_skill">เสริมพลังสกิล (Enhance)</option>
                    <option value="custom">กำหนดเอง (Custom)</option>
                  </select>
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="text-xs text-slate-300 block mb-1">ไอคอนไอเทม:</label>
                <div className="grid grid-cols-6 gap-1 p-1.5 rounded-xl bg-slate-800/60 border border-slate-700">
                  {AVAILABLE_SHOP_ICONS.map((ico) => {
                    const IconComponent = ico.icon;
                    const isSelected = shopItemIcon === ico.id;
                    return (
                      <button
                        key={ico.id}
                        type="button"
                        onClick={() => setShopItemIcon(ico.id)}
                        className={`p-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/30 border border-amber-400 text-amber-300 shadow-sm'
                            : 'bg-slate-900/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                        title={ico.name}
                      >
                        <IconComponent className="w-4 h-4" />
                        <span className="text-[8px] truncate w-full text-center">{ico.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional effect inputs */}
              {shopItemEffectType === 'heal_hp' && (
                <div>
                  <label className="text-xs text-rose-300 font-bold block mb-1">ปริมาณการฟื้นฟูเลือด (+HP ทันทีเมื่อดื่ม):</label>
                  <input
                    type="number"
                    min={1}
                    value={shopItemEffectVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setShopItemEffectVal(val);
                      setShopItemHpBonus(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-rose-500/40 text-rose-200 text-xs outline-none font-mono font-bold"
                  />
                </div>
              )}

              {shopItemEffectType === 'boost_max_hp' && (
                <div>
                  <label className="text-xs text-rose-300 font-bold block mb-1">ขยายค่าพลังชีวิตสูงสุดถาวร (+Max HP):</label>
                  <input
                    type="number"
                    min={1}
                    value={shopItemEffectVal}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setShopItemEffectVal(val);
                      setShopItemHpBonus(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-rose-500/60 text-rose-200 text-xs outline-none font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    *เมื่อผู้เล่นกดดื่ม Max HP จะเพิ่มขึ้นอย่างถาวรในระบบคำนวณเลือด
                  </span>
                </div>
              )}

              {shopItemEffectType === 'buff_stat' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">สเตตัสเป้าหมาย</label>
                      <select
                        value={shopItemTargetStat}
                        onChange={(e) => setShopItemTargetStat(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                      >
                        <option value="strength">พละกำลัง (STR)</option>
                        <option value="durability">ความทนทาน (DUR)</option>
                        <option value="agility">ความว่องไว (AGI)</option>
                        <option value="magic">พลังเวท (MAG)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">ค่าสเตตัส (+)</label>
                      <input
                        type="number"
                        value={shopItemEffectVal}
                        onChange={(e) => setShopItemEffectVal(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                      />
                    </div>
                  </div>

                  {shopItemCategory === 'equipment' && (
                    <div>
                      <label className="text-xs text-emerald-300 block mb-1">โบนัสเลือด Max HP เมื่อสวมใส่ (+HP Bonus):</label>
                      <input
                        type="number"
                        min={0}
                        value={shopItemHpBonus}
                        onChange={(e) => setShopItemHpBonus(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 text-xs outline-none font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {shopItemEffectType === 'enhance_skill' && (
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ชื่อสกิลเป้าหมายที่ได้รับบัฟ</label>
                  <input
                    type="text"
                    value={shopItemSkillTarget}
                    onChange={(e) => setShopItemSkillTarget(e.target.value)}
                    placeholder="เช่น ระบำร่มพิรุณโปรยปราย"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-300 block mb-1">คำอธิบายไอเทม</label>
                <textarea
                  rows={2}
                  value={shopItemDesc}
                  onChange={(e) => setShopItemDesc(e.target.value)}
                  placeholder="เขียนบรรยายสรรพคุณ..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                />
              </div>

              {/* Live Preview Card */}
              <div className="p-3 rounded-xl bg-gradient-to-b from-slate-800/80 to-slate-900/90 border border-amber-500/30 shadow-inner space-y-1.5">
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                  <span>ตัวอย่างสินค้าในร้านค้า (Live Preview)</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase ${getAdminRarityBadge(shopItemRarity).badge}`}>
                    {shopItemRarity}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    {renderAdminItemIcon(shopItemIcon, shopItemCategory, shopItemEffectType, "w-5 h-5")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {shopItemName.trim() || 'ชื่อไอเทมใหม่'}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">
                      {shopItemDesc.trim() || 'คำอธิบายสินค้าในร้านค้า...'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {formatCoins(shopItemPrice || 0)} C
                      </span>
                      {shopItemEffectType === 'heal_hp' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-bold">
                          +{shopItemEffectVal} HP
                        </span>
                      )}
                      {shopItemEffectType === 'boost_max_hp' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950/90 border border-rose-500/60 text-rose-200 font-black">
                          +{shopItemEffectVal} Max HP (ถาวร)
                        </span>
                      )}
                      {shopItemEffectType === 'buff_stat' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-bold">
                          +{shopItemEffectVal} {shopItemTargetStat.toUpperCase()}
                        </span>
                      )}
                      {shopItemCategory === 'equipment' && shopItemHpBonus > 0 && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                          +{shopItemHpBonus} Max HP
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Store className="w-4 h-4" />
                บันทึกไอเทมลงร้านค้า
              </button>
            </form>
          </div>

          {/* Admin-only reward items: persisted in shop_items with adminOnly=true. */}
          <div className="rounded-3xl border border-fuchsia-500/30 bg-slate-900 p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-fuchsia-300" />
                  คลังไอเทมพิเศษ ({shopItems.filter(item => item.adminOnly).length} ชิ้น)
                </h3>
                <p className="text-xs text-slate-400">
                  ไอเทมที่สร้างจากหน้านี้ถูกบันทึกลงฐานข้อมูลจริง ใช้เสกให้ผู้เล่นหรือเลือกเป็นรางวัลกาชาได้ และไม่แสดงในร้านค้าปกติ
                </p>
              </div>
            </div>

            {shopItems.filter(item => item.adminOnly).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-center text-xs text-slate-500">
                ยังไม่มีไอเทมพิเศษ — สร้างจากแบบฟอร์มด้านบนได้เลย
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="pb-3">ชื่อไอเทม</th>
                      <th className="pb-3">ประเภท / Effect</th>
                      <th className="pb-3">ความหายาก</th>
                      <th className="pb-3 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {shopItems
                      .filter(item => item.adminOnly)
                      .filter(item =>
                        item.name.toLowerCase().includes(shopSearch.toLowerCase()) ||
                        item.description.toLowerCase().includes(shopSearch.toLowerCase())
                      )
                      .map(item => (
                        <tr key={item.id} className="hover:bg-fuchsia-950/20">
                          <td className="py-3">
                            <div className="font-bold text-white flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-fuchsia-950/40 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
                                {renderAdminItemIcon(item.icon, item.category, item.effectType, "w-3.5 h-3.5")}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate">{item.name}</div>
                                <div className="text-[10px] text-slate-500 truncate max-w-xs">{item.description}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-slate-300">
                            <div>{item.category === 'equipment' ? 'อุปกรณ์' : 'ของใช้'} · {item.effectType}</div>
                            {item.effectType === 'buff_stat' && item.targetStat && (
                              <div className="text-[10px] text-cyan-300">+{item.effectValue || 0} {item.targetStat}</div>
                            )}
                            {item.effectType === 'boost_max_hp' && (
                              <div className="text-[10px] text-rose-300">+{item.effectValue || 0} Max HP</div>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-950/30 px-2 py-1 text-[10px] font-black text-fuchsia-200">
                              {item.rarity || 'common'}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`ลบไอเทมพิเศษ "${item.name}" ออกจากคลังรางวัลและฐานข้อมูลใช่หรือไม่?`)) return;
                                try {
                                  await onDeleteShopItem(item.id);
                                  alert(`ลบไอเทมพิเศษ "${item.name}" เรียบร้อยแล้ว`);
                                } catch (error) {
                                  console.error('Failed to delete admin-only item:', error);
                                  alert('ลบไอเทมพิเศษไม่สำเร็จ กรุณาลองใหม่');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-[10px] font-bold text-rose-300 hover:bg-rose-900/40 transition-colors cursor-pointer"
                              title="ลบไอเทมพิเศษออกจากฐานข้อมูล"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              ลบถาวร
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: Existing Shop Items List */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  รายการไอเทมที่สร้างไว้ ({shopItems.filter(item => !item.adminOnly).length} ชิ้น)
                </h3>
                <p className="text-xs text-slate-400">
                  สามารถตรวจสอบและกดลบของออกจากร้านค้าได้ทันที
                </p>
              </div>
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="ค้นหาไอเทม..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                    <th className="pb-3">ชื่อสินค้า</th>
                    <th className="pb-3">ประเภท</th>
                    <th className="pb-3">ความหายาก</th>
                    <th className="pb-3">ราคา</th>
                    <th className="pb-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {shopItems
                    .filter(item => !item.adminOnly)
                    .filter(item => item.name.toLowerCase().includes(shopSearch.toLowerCase()) || item.description.toLowerCase().includes(shopSearch.toLowerCase()))
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5">
                          <div className="font-bold text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                              {renderAdminItemIcon(item.icon, item.category, item.effectType, "w-3.5 h-3.5")}
                            </div>
                            <span>{item.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 max-w-xs truncate pl-8">
                            {item.description}
                          </div>
                          <div className="flex items-center gap-1.5 pl-8 mt-1 flex-wrap">
                            {item.effectType === 'heal_hp' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-mono font-bold">
                                +{item.effectValue} HP (ฟื้นฟู)
                              </span>
                            )}
                            {item.effectType === 'boost_max_hp' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-500/60 text-rose-200 font-mono font-black">
                                +{item.effectValue} Max HP (ถาวร)
                              </span>
                            )}
                            {item.effectType === 'buff_stat' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 font-mono">
                                +{item.effectValue} {item.targetStat?.toUpperCase()}
                              </span>
                            )}
                            {item.hpBonus && item.hpBonus > 0 && item.effectType !== 'heal_hp' && item.effectType !== 'boost_max_hp' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                                +{item.hpBonus} Max HP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-slate-300">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px]">
                            {item.category === 'equipment' ? 'อุปกรณ์' : 'ไอเทมใช้งาน'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${getAdminRarityBadge(item.rarity).badge}`}>
                            {item.rarity || 'common'}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono font-bold text-amber-300">
                          {formatCoins(item.price)} C
                        </td>
                        <td className="py-2.5 text-right space-x-1">
                          <button
                            onClick={() => {
                              setActiveTab('inventory_spawner');
                              setSelectedShopItemToSpawnId(item.id);
                              setSpawnerMode('shop');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-950/50 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-[10px] font-bold transition-all cursor-pointer"
                            title="เสกไอเทมนี้ให้ผู้เล่น"
                          >
                            เสกไอเทมนี้
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`คุณต้องการลบ "${item.name}" ออกจากร้านค้าใช่หรือไม่?`)) {
                                onDeleteShopItem(item.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition-colors cursor-pointer"
                            title="ลบออกจากร้านค้า"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: INVENTORY SPAWNER & MANAGER ==================== */}
      {activeTab === 'inventory_spawner' && (
        <div className="space-y-6">
          {/* Target Player Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={spawnerTargetChar.avatarUrl}
                alt={spawnerTargetChar.displayName}
                className="w-12 h-12 rounded-2xl object-cover border border-cyan-500/50"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{spawnerTargetChar.displayName}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-800">
                    {spawnerTargetChar.role || 'player'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  เหรียญปัจจุบัน: <span className="text-amber-300 font-mono font-bold">{formatCoins(spawnerTargetChar.coins)} C</span> | 
                  ของในตัว: <span className="text-cyan-300 font-bold font-mono">{spawnerTargetChar.inventory?.length || 0} ชิ้น</span>
                </p>
              </div>
            </div>

            <div className="w-full md:w-auto flex items-center gap-2">
              <label className="text-xs text-slate-300 whitespace-nowrap">เลือกผู้เล่นเป้าหมาย:</label>
              <select
                value={spawnerTargetCharId}
                onChange={(e) => setSpawnerTargetCharId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-amber-400 cursor-pointer"
              >
                {characters.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.inventory?.length || 0} ชิ้น)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Spawn Item Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-purple-400" />
                  เสกไอเทมให้ "{spawnerTargetChar.displayName}"
                </h3>
              </div>

              {/* Mode Toggle */}
              <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setSpawnerMode('shop')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    spawnerMode === 'shop'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  เลือกจากร้านค้า
                </button>

              </div>

              {spawnerMode === 'shop' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">เลือกไอเทมที่จะเสก:</label>
                    <select
                      value={selectedShopItemToSpawnId}
                      onChange={(e) => setSelectedShopItemToSpawnId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    >
                      {shopItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.rarity || 'common'}] - {formatCoins(item.price)} C
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">จำนวนที่ต้องการเสก:</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={spawnQuantity}
                      onChange={(e) => setSpawnQuantity(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>

                  <button
                    onClick={handleGrantItemToPlayer}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
                  >
                    <Gift className="w-4 h-4" />
                    เสกไอเทมเข้าร่างผู้เล่นทันที
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">ชื่อไอเทมเสก *</label>
                    <input
                      type="text"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      placeholder="เช่น คมดาบเทพจุติ..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">ระดับความหายาก</label>
                      <select
                        value={customItemRarity}
                        onChange={(e) => setCustomItemRarity(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                      >
                        <option value="common">Common</option>
                        <option value="rare">Rare</option>
                        <option value="epic">Epic</option>
                        <option value="legendary">Legendary</option>
                        <option value="mythic">Mythic</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">ประเภท</label>
                      <select
                        value={customItemCategory}
                        onChange={(e) => setCustomItemCategory(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                      >
                        <option value="equipment">อุปกรณ์สวมใส่</option>
                        <option value="consumable">ไอเทมใช้งาน</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">ประเภทเอฟเฟกต์</label>
                      <select
                        value={customItemEffectType}
                        onChange={(e) => setCustomItemEffectType(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                      >
                        <option value="buff_stat">เพิ่มสเตตัส (Buff Stat)</option>
                        <option value="heal_hp">ฟื้นฟูเลือด HP</option>
                        <option value="boost_max_hp">ขยาย Max HP ถาวร</option>
                      </select>
                    </div>
                    {customItemEffectType === 'buff_stat' ? (
                      <div>
                        <label className="text-xs text-slate-300 block mb-1">สเตตัสเป้าหมาย</label>
                        <select
                          value={customItemTargetStat}
                          onChange={(e) => setCustomItemTargetStat(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                        >
                          <option value="strength">+ พละกำลัง (STR)</option>
                          <option value="durability">+ ความทนทาน (DUR)</option>
                          <option value="agility">+ ความว่องไว (AGI)</option>
                          <option value="magic">+ พลังเวท (MAG)</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-rose-300 font-bold block mb-1">
                          {customItemEffectType === 'heal_hp' ? 'ปริมาณการฟื้นฟู (+HP)' : 'ขยาย Max HP ถาวร (+)'}
                        </label>
                        <input
                          type="number"
                          value={customItemEffectVal}
                          onChange={(e) => setCustomItemEffectVal(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-rose-500/40 text-rose-200 text-xs font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {customItemEffectType === 'buff_stat' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-300 block mb-1">ค่าสเตตัส (+)</label>
                        <input
                          type="number"
                          value={customItemEffectVal}
                          onChange={(e) => setCustomItemEffectVal(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
                        />
                      </div>
                      {customItemCategory === 'equipment' && (
                        <div>
                          <label className="text-xs text-emerald-300 block mb-1">โบนัสเลือด (+Max HP)</label>
                          <input
                            type="number"
                            min={0}
                            value={customItemHpBonus}
                            onChange={(e) => setCustomItemHpBonus(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 text-xs font-mono"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">คำอธิบาย</label>
                    <textarea
                      rows={2}
                      value={customItemDesc}
                      onChange={(e) => setCustomItemDesc(e.target.value)}
                      placeholder="เขียนสรรพคุณไอเทม..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">จำนวนที่เสก:</label>
                    <input
                      type="number"
                      min={1}
                      value={spawnQuantity}
                      onChange={(e) => setSpawnQuantity(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>

                  <button
                    onClick={handleGrantItemToPlayer}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
                  >
                    <Wand2 className="w-4 h-4" />
                    เสกไอเทมกำหนดเองให้ผู้เล่นทันที
                  </button>
                </div>
              )}
            </div>

            {/* Right: Player Inventory View & Delete Items */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" />
                    คลังไอเทมของผู้เล่น "{spawnerTargetChar.displayName}" ({spawnerTargetChar.inventory?.length || 0} ชิ้น)
                  </h3>
                  <p className="text-xs text-slate-400">
                    สามารถตรวจสอบและกดลบไอเทมออกจากตัวผู้เล่นได้ทันที
                  </p>
                </div>
              </div>

              {(!spawnerTargetChar.inventory || spawnerTargetChar.inventory.length === 0) ? (
                <div className="p-8 rounded-2xl bg-slate-800/40 border border-slate-800 text-center text-slate-500 text-xs">
                  ผู้เล่นคนนี้ยังไม่มีไอเทมใดๆ ในกระเป๋า
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {spawnerTargetChar.inventory.map((invItem) => (
                    <div
                      key={invItem.instanceId || invItem.id}
                      className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-slate-600 flex items-start justify-between gap-2 transition-all shadow"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white">{invItem.name}</span>
                          {invItem.quantity > 1 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                              x{invItem.quantity}
                            </span>
                          )}
                          {invItem.isEquipped && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[9px] font-bold">
                              [สวมใส่อยู่]
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {invItem.description}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 uppercase">
                            {invItem.rarity || 'common'}
                          </span>
                          {invItem.effectType === 'buff_stat' && (
                            <span className="text-[10px] text-cyan-300 font-mono">
                              +{invItem.effectValue} {invItem.targetStat?.toUpperCase()}
                            </span>
                          )}
                          {invItem.effectType === 'heal_hp' && (
                            <span className="text-[10px] text-emerald-300 font-mono">
                              +{invItem.effectValue} HP
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemovePlayerItem(invItem.instanceId || invItem.id, invItem.name)}
                        className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900 border border-rose-800/50 text-rose-400 hover:text-rose-300 transition-all cursor-pointer shrink-0"
                        title="ลบไอเทมนี้ออกจากตัวผู้เล่น"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: GACHA SYSTEM ADMIN ==================== */}
      {activeTab === 'quests' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form onSubmit={handleAssignQuest} className="lg:col-span-2 bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 space-y-5 shadow-xl">
              <div><h3 className="text-sm font-black text-white flex items-center gap-2"><ScrollText className="w-4 h-4 text-cyan-300" />สร้างภารกิจและมอบหมาย</h3><p className="text-xs text-slate-400 mt-1">เลือกผู้เล่น แล้วกำหนดวิธีทำภารกิจให้ชัดเจน</p></div>
              <div><label className="text-xs text-slate-300 block mb-1">ผู้เล่นเป้าหมาย</label><select value={selectedCharId} onChange={e => setSelectedCharId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-cyan-400"><option value="">เลือกผู้เล่น</option>{characters.map(char => <option key={char.id} value={char.id}>{char.displayName} (@{char.username})</option>)}</select></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-300 block mb-1">ชื่อภารกิจ *</label><input value={questTitle} onChange={e => setQuestTitle(e.target.value)} placeholder="เช่น ตอบคำถามจากแอดมิน" className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-cyan-400" /></div>
                <div><label className="text-xs text-slate-300 block mb-1">วิธีทำภารกิจ</label><select value={questKind} onChange={e => { const value=e.target.value as 'progress' | 'question' | 'proof'; setQuestKind(value); if(value==='question') setQuestTargetCount(1); }} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-cyan-400"><option value="question">ตอบคำถาม</option><option value="proof">ส่งรูปหลักฐาน</option><option value="progress">เพิ่มความคืบหน้า + ส่งรูป</option></select></div>
              </div>
              <div><label className="text-xs text-slate-300 block mb-1">รายละเอียดภารกิจ</label><textarea value={questDescription} onChange={e => setQuestDescription(e.target.value)} rows={2} placeholder="อธิบายสิ่งที่ผู้เล่นต้องทำ" className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-cyan-400 resize-none" /></div>
              {questKind === 'question' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl bg-purple-500/5 border border-purple-500/20 p-3"><div><label className="text-xs text-purple-200 block mb-1">คำถาม *</label><textarea value={questQuestion} onChange={e => setQuestQuestion(e.target.value)} rows={3} placeholder="เช่น ดาวเคราะห์ใดอยู่ใกล้ดวงอาทิตย์ที่สุด" className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none resize-none" /></div><div><label className="text-xs text-purple-200 block mb-1">คำตอบที่ถูกต้อง *</label><input value={questAnswer} onChange={e => setQuestAnswer(e.target.value)} placeholder="เช่น ดาวพุธ" className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none" /></div></div>}
              {questKind !== 'question' && <div><label className="text-xs text-slate-300 block mb-1">จำนวนครั้งที่ต้องส่งหลักฐาน</label><input type="number" min="1" value={questTargetCount} onChange={e => setQuestTargetCount(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none focus:border-cyan-400" /></div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="text-xs text-slate-300 block mb-1">รางวัล Coins</label><input type="number" min="0" value={questRewardCoins} onChange={e => setQuestRewardCoins(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none focus:border-amber-400" /></div><div><label className="text-xs text-slate-300 block mb-1">ไอเทมรางวัล</label><select value={questRewardItemName} onChange={e => setQuestRewardItemName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-purple-400"><option value="">ไม่รับไอเทม</option>{shopItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div></div>
              <button type="submit" className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2"><ScrollText className="w-4 h-4" />มอบภารกิจให้ผู้เล่น</button>
            </form>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl"><h3 className="text-sm font-bold text-white">วิธีทำงาน</h3><div className="space-y-3 text-xs text-slate-400 leading-relaxed"><p>• ตอบคำถาม: ผู้เล่นพิมพ์คำตอบและระบบตรวจทันที</p><p>• ส่งรูปหลักฐาน: แอดมินต้องอนุมัติก่อนภารกิจสำเร็จ</p><p>• เพิ่มความคืบหน้า: ทุกครั้งที่ส่งรูปจะเพิ่ม 1 ครั้ง</p></div></div>
          </div>
          {pendingProofs.length > 0 && <div className="bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 space-y-4"><div><h3 className="text-sm font-black text-white">หลักฐานรอตรวจ ({pendingProofs.length})</h3><p className="text-xs text-slate-400 mt-1">ตรวจรูปของผู้เล่น แล้วกดอนุมัติหรือไม่อนุมัติ</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{pendingProofs.map(({ character, quest }) => <div key={character.id + '-' + quest.id} className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-3"><div className="flex justify-between gap-3"><div><div className="text-xs font-bold text-white">{quest.title}</div><div className="text-[11px] text-cyan-300">ผู้เล่น: {character.displayName}</div></div><div className="text-[10px] text-slate-500">{quest.currentCount}/{quest.targetCount}</div></div><img src={quest.proofDataUrl} alt="หลักฐานภารกิจ" className="w-full max-h-64 object-contain rounded-xl bg-black/40" />{quest.proofNote && <div className="text-[11px] text-slate-300">หมายเหตุ: {quest.proofNote}</div>}<div className="grid grid-cols-2 gap-2"><button type="button" onClick={async () => { const ok=await onReviewQuestProof?.(character.id, quest.id, true); if(ok) alert('อนุมัติหลักฐานแล้ว'); }} className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">อนุมัติ</button><button type="button" onClick={async () => { const ok=await onReviewQuestProof?.(character.id, quest.id, false); if(ok) alert('ส่งกลับให้ผู้เล่นแล้ว'); }} className="py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer">ไม่อนุมัติ</button></div></div>)}</div></div>}
        </div>
      )}

      {activeTab === 'gacha_manage' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-purple-500/30 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white">🎰 จัดการตู้กาชา</h3>
                <p className="text-[11px] text-slate-400">สร้างได้หลายตู้ • ตั้งราคา • เปิด/ปิด • ลบตู้</p>
              </div>
              <span className="text-[10px] text-purple-300">{safeGachaBanners.length} ตู้</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {safeGachaBanners.map(b => (
                <div key={b.id} className={`rounded-2xl border p-3 ${selectedBannerId === b.id ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-800/50'}`}>
                  <button type="button" onClick={() => setSelectedBannerId(b.id)} className="w-full text-left">
                    <div className="text-xs font-black text-white">{b.name}</div>
                    <div className="text-[10px] text-slate-400">C: {b.pullCost.toLocaleString()} / 10 = {b.tenPullCost.toLocaleString()} • P: {(b.pullCostPossibility ?? 1).toLocaleString()} / 10 = {(b.tenPullCostPossibility ?? 10).toLocaleString()}</div>
                    <div className={`text-[9px] mt-1 ${b.enabled ? 'text-emerald-400' : 'text-rose-400'}`}>{b.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</div>
                  </button>
                  <button type="button" onClick={async () => { if (!confirm(`ลบตู้ "${b.name}" หรือไม่?`)) return; try { await onDeleteGachaBanner(b.id); if (selectedBannerId === b.id) setSelectedBannerId(safeGachaBanners.find(x => x.id !== b.id)?.id || 'main'); } catch (e: any) { alert(e?.message || 'ลบตู้ไม่สำเร็จ'); } }} className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> ลบตู้
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleCreateGachaBanner} className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2 border-t border-slate-800">
              <input value={newBannerName} onChange={e=>setNewBannerName(e.target.value)} placeholder="ชื่อตู้" className="px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs md:col-span-2" />
              <input type="number" min={10} value={newBannerPullCost} onChange={e=>setNewBannerPullCost(Number(e.target.value))} placeholder="1 ครั้ง" className="px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              <input type="number" min={100} value={newBannerTenCost} onChange={e=>setNewBannerTenCost(Number(e.target.value))} placeholder="10 ครั้ง Coins" className="px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              <input type="number" min={1} value={newBannerPullCostPossibility} onChange={e=>setNewBannerPullCostPossibility(Number(e.target.value))} placeholder="1 ครั้ง Possibility" className="px-2 py-2 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-100 text-xs" />
              <input type="number" min={1} value={newBannerTenCostPossibility} onChange={e=>setNewBannerTenCostPossibility(Number(e.target.value))} placeholder="10 ครั้ง Possibility" className="px-2 py-2 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-100 text-xs" />
              <input type="number" min={11} value={newBannerMultiPullCount} onChange={e=>setNewBannerMultiPullCount(Number(e.target.value))} placeholder="เลือกสุ่ม เช่น 20" className="px-2 py-2 rounded-xl bg-purple-950/50 border border-purple-500/50 text-purple-100 text-xs" />
              <input value={newBannerMultiPullCounts} onChange={e=>setNewBannerMultiPullCounts(e.target.value)} placeholder="สุ่มเพิ่ม เช่น 20,30,50" className="px-2 py-2 rounded-xl bg-purple-950/50 border border-purple-500/50 text-purple-100 text-xs md:col-span-2" />
              <input value={newBannerTitle} onChange={e=>setNewBannerTitle(e.target.value)} placeholder="หัวข้อ" className="px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              <button type="submit" className="px-3 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-black text-xs"><Plus className="w-3 h-3 inline mr-1"/>สร้างตู้</button>
              <input value={newBannerDesc} onChange={e=>setNewBannerDesc(e.target.value)} placeholder="คำอธิบาย" className="col-span-2 md:col-span-5 px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              <label className="text-[10px] text-slate-300 flex items-center gap-2"><input type="checkbox" checked={newBannerEnabled} onChange={e=>setNewBannerEnabled(e.target.checked)} /> เปิดใช้งาน</label>
            </form>

            {selectedBanner && (
              <form onSubmit={handleUpdateGachaBanner} className="rounded-2xl border border-amber-500/30 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-amber-300">ตั้งค่าตู้ที่เลือก</div>
                    <div className="text-[10px] text-slate-500">กำลังแก้ไข: {selectedBanner.name}</div>
                  </div>
                  <span className="text-[10px] text-cyan-300 font-mono">{selectedBanner.id}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input value={editBannerName} onChange={e => setEditBannerName(e.target.value)} placeholder="ชื่อตู้" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                  <input value={editBannerTitle} onChange={e => setEditBannerTitle(e.target.value)} placeholder="หัวข้อบนหน้าสุ่ม" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                  <input type="number" min={10} value={editBannerPullCost} onChange={e => setEditBannerPullCost(Number(e.target.value))} placeholder="ราคา 1 ครั้ง" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                  <input type="number" min={100} value={editBannerTenCost} onChange={e => setEditBannerTenCost(Number(e.target.value))} placeholder="ราคา 10 ครั้ง Coins" className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                  <input type="number" min={1} value={editBannerPullCostPossibility} onChange={e => setEditBannerPullCostPossibility(Number(e.target.value))} placeholder="1 ครั้ง Possibility" className="px-3 py-2 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-100 text-xs" />
                  <input type="number" min={1} value={editBannerTenCostPossibility} onChange={e => setEditBannerTenCostPossibility(Number(e.target.value))} placeholder="10 ครั้ง Possibility" className="px-3 py-2 rounded-xl bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-100 text-xs" />
                  <div className="md:col-span-2 rounded-xl border-2 border-purple-500/40 bg-purple-950/30 p-3">
                    <label className="text-xs font-black text-purple-200 block mb-1">✨ จำนวนสุ่มเพิ่มเติม (มากกว่า 10 ครั้ง)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="number" min={11} value={editBannerMultiPullCount} onChange={e => setEditBannerMultiPullCount(Number(e.target.value))} placeholder="เลือกสุ่ม เช่น 20" className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-purple-500/40 text-white text-xs font-mono" />
                      <input value={editBannerMultiPullCounts} onChange={e => setEditBannerMultiPullCounts(e.target.value)} placeholder="ตัวเลือกอื่น เช่น 20,30,50" className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-purple-500/40 text-white text-xs font-mono" />
                    </div>
                    <p className="text-[10px] text-purple-200/70 mt-1">ใส่หลายจำนวนคั่นด้วย , เช่น 20,30,50 แล้วกด “บันทึกตู้ที่เลือก”</p>
                  </div>
                  <textarea value={editBannerDesc} onChange={e => setEditBannerDesc(e.target.value)} placeholder="คำอธิบายตู้" className="md:col-span-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs min-h-16" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={editBannerEnabled} onChange={e => setEditBannerEnabled(e.target.checked)} />
                    เปิดให้ผู้เล่นเลือกตู้และสุ่ม
                  </label>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black">
                    <Save className="w-3 h-3 inline mr-1" />บันทึกตู้ที่เลือก
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Legacy config controls are kept only as a shortcut to gacha_banners/main. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gacha System Parameters */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                ตั้งค่าตู้หลัก (gacha_banners/main)
              </h3>
              <form onSubmit={handleSaveGachaConfig} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">ค่าสุ่ม 1 ครั้ง (Coins)</label>
                    <input
                      type="number"
                      min={10}
                      value={pullCostInput}
                      onChange={(e) => setPullCostInput(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">ค่าสุ่ม 10 ครั้ง (Coins)</label>
                    <input
                      type="number"
                      min={100}
                      value={tenPullCostInput}
                      onChange={(e) => setTenPullCostInput(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-purple-500/60 bg-purple-950/40 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-300" />
                    <label className="text-sm font-black text-purple-100">จำนวนสุ่มเพิ่มเติม มากกว่า 10 ครั้ง</label>
                  </div>
                  <p className="text-[10px] text-purple-200/80">กำหนดปุ่มสุ่มจำนวนมากสำหรับผู้เล่น เช่น 20, 30, 50 ครั้ง</p>
                  <input
                    type="number"
                    min={11}
                    value={multiPullCountInput}
                    onChange={(e) => setMultiPullCountInput(Number(e.target.value))}
                    placeholder="เช่น 20"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border-2 border-purple-500/50 text-white text-sm font-mono font-bold outline-none focus:border-purple-300"
                  />
                  <p className="text-[10px] text-purple-300">เลือกจำนวนสุ่มหลัก เช่น 20 ครั้ง — ค่าใช้จ่าย = ค่าสุ่ม 1 ครั้ง × จำนวนครั้ง</p>
                  <input
                    type="text"
                    value={multiPullCountsInput}
                    onChange={(e) => setMultiPullCountsInput(e.target.value)}
                    placeholder="20,30,50"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border-2 border-purple-500/50 text-white text-sm font-mono font-bold outline-none focus:border-purple-300"
                  />
                  <p className="text-[10px] text-purple-300">ใส่ตัวเลขคั่นด้วยเครื่องหมาย , เช่น 20,30,50 แล้วกด “บันทึกการตั้งค่าตู้กาชา”</p>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">ชื่อแบนเนอร์กาชา</label>
                  <input
                    type="text"
                    value={bannerTitleInput}
                    onChange={(e) => setBannerTitleInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">คำอธิบายแบนเนอร์</label>
                  <input
                    type="text"
                    value={bannerDescInput}
                    onChange={(e) => setBannerDescInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="gachaEnabled"
                    checked={gachaEnabledInput}
                    onChange={(e) => setGachaEnabledInput(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400"
                  />
                  <label htmlFor="gachaEnabled" className="text-xs text-white font-bold cursor-pointer">
                    เปิดให้ผู้เล่นสุ่มกาชา (Enabled)
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  บันทึกการตั้งค่าตู้กาชา
                </button>
              </form>
            </div>

            {/* Total Rate Validator & Distribution */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    ตรวจสอบผลรวมเรทออกกาชา (Total Rate Validation)
                  </h3>
                  <p className="text-xs text-slate-400">
                    ค่านี้ใช้ตรวจเรทของตู้ที่เลือกด้านบนเท่านั้น
                  </p>
                </div>
                <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 ${
                  Math.abs(totalGachaRate - 100) < 0.1
                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/50 text-amber-300 border-amber-500/40'
                }`}>
                  {Math.abs(totalGachaRate - 100) < 0.1 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  เรทรวม: {totalGachaRate.toFixed(3)}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex border border-slate-700">
                <div
                  style={{ width: `${Math.min(100, totalGachaRate)}%` }}
                  className={`h-full transition-all duration-500 ${
                    Math.abs(totalGachaRate - 100) < 0.1
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : totalGachaRate > 100
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  }`}
                />
              </div>

              {/* Rarity Summary Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                {(['mythic', 'legendary', 'epic', 'rare', 'common'] as GachaRarity[]).map((rarity) => {
                  const count = selectedBannerRewards.filter(r => r.rarity === rarity).length;
                  const rateSum = selectedBannerRewards
                    .filter(r => r.rarity === rarity)
                    .reduce((sum, r) => sum + (Number(r.rate) || 0), 0);
                  return (
                    <div key={rarity} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">{rarity}</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">{rateSum.toFixed(3)}%</div>
                      <div className="text-[10px] text-slate-500">({count} รางวัล)</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom: Add Reward Form & Rewards Pool Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add New Reward Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                เพิ่มของรางวัลใหม่ในตู้กาชา
                <span className="ml-auto text-[10px] text-slate-400">{gachaRewards.length} รายการ</span>
              </h3>
              <form onSubmit={handleCreateReward} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ชื่อของรางวัล *</label>
                  <input
                    type="text"
                    required
                    value={newRewardName}
                    onChange={(e) => setNewRewardName(e.target.value)}
                    placeholder="เช่น รางวัล 10,000 เหรียญ..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">ประเภท</label>
                    <select
                      value={newRewardType}
                      onChange={(e) => setNewRewardType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    >
                      <option value="coin">เหรียญ (Coins)</option>
                      <option value="item">ไอเทม (Item)</option>
                      <option value="skill">สกิล (Skill)</option>
                       <option value="characteristic">คุณลักษณะ (Trait)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">ระดับความหายาก</label>
                    <select
                      value={newRewardRarity}
                      onChange={(e) => setNewRewardRarity(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    >
                      <option value="common">Common (ทั่วไป)</option>
                      <option value="rare">Rare (หายาก)</option>
                      <option value="epic">Epic (ยอดเยี่ยม)</option>
                      <option value="legendary">Legendary (ตำนาน)</option>
                      <option value="mythic">Mythic (มายาสงคราม)</option>
                    </select>
                  </div>
                </div>

                {newRewardType === 'coin' && (
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">จำนวนเหรียญที่จะได้รับ (Coins)</label>
                    <input
                      type="number"
                      min={1}
                      value={newRewardCoinAmount}
                      onChange={(e) => setNewRewardCoinAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                    />
                  </div>
                )}

                {newRewardType === 'item' && (
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">เลือกไอเทมจากคลังรางวัล (รวมไอเทมพิเศษ):</label>
                    <select
                      value={newRewardSelectedShopItemId}
                      onChange={(e) => setNewRewardSelectedShopItemId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    >
                      {shopItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.adminOnly ? '🎁 [ไอเทมพิเศษ] ' : ''}{item.name} [{item.rarity || 'common'}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {newRewardType === 'characteristic' && (
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">คุณลักษณะที่ผู้เล่นจะได้รับ</label>
                    <input
                      type="text"
                      required
                      value={newRewardCharacteristic}
                      onChange={(e) => setNewRewardCharacteristic(e.target.value)}
                      placeholder="เช่น ผู้ดูดาราเริ่มต้น"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-cyan-200 text-xs outline-none focus:border-cyan-400"
                    />
                  </div>
                )}

                {/* Skill Passive Settings — each passive has its own independent configuration */}
                <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-fuchsia-200">✨ Passive ติดตัวของสกิลกาชา</div>
                      <div className="text-[10px] text-slate-400">แยกตั้งค่าเป็นราย Passive — กดเพิ่มแล้วค่าจะถูกเก็บเป็นคนละรายการ ไม่ปนกัน</div>
                    </div>
                    <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-[9px] text-fuchsia-200">SKILL PASSIVE</span>
                  </div>

                  <div className="rounded-lg border border-fuchsia-500/20 bg-black/20 p-3 space-y-2">
                    <div className="text-[10px] font-black text-fuchsia-200">① สร้าง Passive ใหม่ 1 อัน</div>
                    <input value={newSkillPassiveName} onChange={e => setNewSkillPassiveName(e.target.value)} placeholder="ชื่อ Passive เช่น ดอกไม้สะสม" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select value={newSkillPassiveKind} onChange={e => setNewSkillPassiveKind(e.target.value as ItemPassiveEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                        <option value="stack">🌸 สะสม Stack</option>
                        <option value="true_damage_at_max_stacks">💥 ครบ Stack → True Damage</option>
                        <option value="true_damage_per_stack">💠 True Damage ต่อ Stack</option>
                        <option value="damage">⚔️ Damage</option>
                        <option value="damage_percent">⚔️ Damage %</option>
                        <option value="heal">❤️ Heal</option>
                        <option value="heal_percent">❤️ Heal %</option>
                        <option value="buff_stat">📈 Buff Stat</option>
                        <option value="shield">🛡️ Shield</option>
                        <option value="reflect">↩️ Reflect %</option>
                        <option value="repeat_attack_chance">🔁 Repeat Attack %</option>
                        <option value="critical_chance">🎯 Critical %</option>
                      </select>
                      <select value={newSkillPassiveTrigger} onChange={e => setNewSkillPassiveTrigger(e.target.value as ItemPassiveEffect['trigger'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                        <option value="turn_start">ทุกต้นเทิร์น</option>
                        <option value="attack">ทุกครั้งที่โจมตี</option>
                      </select>
                    </div>

                    {newSkillPassiveKind === 'stack' && (
                      <div className="rounded-lg border border-pink-500/20 bg-pink-950/10 p-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input type="number" min={1} step={1} value={newSkillPassiveValue} onChange={e => setNewSkillPassiveValue(Number(e.target.value))} placeholder="เพิ่ม Stack ต่อครั้ง" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={1} step={1} value={newSkillPassiveMaxStacks} onChange={e => setNewSkillPassiveMaxStacks(Number(e.target.value))} placeholder="Max Stack" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input value={newSkillPassiveStackKey} onChange={e => setNewSkillPassiveStackKey(e.target.value)} placeholder="ชื่อกอง Stack เช่น flower" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                      </div>
                    )}

                    {newSkillPassiveKind === 'true_damage_at_max_stacks' && (
                      <div className="rounded-lg border border-red-500/20 bg-red-950/10 p-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input type="number" min={1} step={1} value={newSkillPassiveMaxStacks} onChange={e => setNewSkillPassiveMaxStacks(Number(e.target.value))} placeholder="ต้องครบกี่ Stack" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={0} step={1} value={newSkillPassiveValue} onChange={e => setNewSkillPassiveValue(Number(e.target.value))} placeholder="True Damage" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-red-200" />
                        <input value={newSkillPassiveStackKey} onChange={e => setNewSkillPassiveStackKey(e.target.value)} placeholder="ใช้ Stack Key เดียวกับตัวสะสม เช่น flower" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                      </div>
                    )}

                    {newSkillPassiveKind === 'true_damage_per_stack' && (
                      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input type="number" min={0} step={0.1} value={newSkillPassiveValue} onChange={e => setNewSkillPassiveValue(Number(e.target.value))} placeholder="True Damage ต่อ 1 Stack" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input value={newSkillPassiveStackKey} onChange={e => setNewSkillPassiveStackKey(e.target.value)} placeholder="Stack Key เช่น flower" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                      </div>
                    )}

                    {['damage','damage_percent','heal','heal_percent','repeat_attack_chance','critical_chance','shield','reflect'].includes(newSkillPassiveKind) && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-2">
                        <label className="text-[10px] text-slate-400">
                          {newSkillPassiveKind === 'damage' ? '⚔️ Damage จำนวน' :
                           newSkillPassiveKind === 'damage_percent' ? '⚔️ Damage เพิ่ม (%)' :
                           newSkillPassiveKind === 'heal' ? '❤️ Heal จำนวน' :
                           newSkillPassiveKind === 'heal_percent' ? '❤️ Heal (%)' :
                           newSkillPassiveKind === 'repeat_attack_chance' ? '🔁 โอกาสตีซ้ำ (%)' :
                           newSkillPassiveKind === 'critical_chance' ? '🎯 โอกาสคริติคอล (%)' :
                           newSkillPassiveKind === 'shield' ? '🛡️ Shield จำนวน' : '↩️ Reflect (%)'}
                          <input type="number" min={0} step={0.001} value={newSkillPassiveValue} onChange={e => setNewSkillPassiveValue(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        </label>
                      </div>
                    )}

                    {newSkillPassiveKind === 'buff_stat' && (
                      <div className="rounded-lg border border-blue-500/20 bg-blue-950/10 p-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select value={newSkillPassiveTargetStat} onChange={e => setNewSkillPassiveTargetStat(e.target.value as any)} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>
                        <input type="number" step={0.1} value={newSkillPassiveValue} onChange={e => setNewSkillPassiveValue(Number(e.target.value))} placeholder="เพิ่มค่าสเตตัส" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={1} value={newSkillPassiveDuration} onChange={e => setNewSkillPassiveDuration(Number(e.target.value))} placeholder="ระยะเวลา (เทิร์น)" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                      </div>
                    )}

                    <div className="rounded-lg border border-yellow-500/20 bg-yellow-950/10 p-2">
                      <label className="text-[10px] text-slate-400">โอกาสทำงานของ Passive นี้ (%)
                        <input type="number" min={0} max={100} step={0.001} value={newSkillPassiveChance} onChange={e => setNewSkillPassiveChance(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-yellow-200" />
                      </label>
                    </div>

                    <button type="button" onClick={() => setNewSkillPassiveEffects(prev => [...prev, {
                      id: `skill-passive-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
                      name: newSkillPassiveName.trim() || 'Skill Passive',
                      trigger: newSkillPassiveTrigger,
                      kind: newSkillPassiveKind,
                      value: Math.max(0, Number(newSkillPassiveValue) || 0),
                      chance: Math.max(0, Math.min(100, Number(newSkillPassiveChance) || 0)),
                      maxStacks: Math.max(1, Math.round(Number(newSkillPassiveMaxStacks) || 1)),
                      stackKey: newSkillPassiveStackKey.trim() || 'flower',
                      duration: Math.max(1, Math.round(Number(newSkillPassiveDuration) || 1)),
                      targetStat: newSkillPassiveKind === 'buff_stat' ? newSkillPassiveTargetStat : undefined
                    }])} className="w-full rounded-lg bg-fuchsia-500/25 px-3 py-2 text-xs font-black text-fuchsia-100">＋ เพิ่ม Passive นี้เป็นรายการแยก</button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-slate-300">② Passive ที่เพิ่มแล้ว — แต่ละอันแยกค่ากัน</div>
                    {newSkillPassiveEffects.length === 0 && <div className="rounded-lg border border-dashed border-slate-700 p-3 text-center text-[10px] text-slate-500">ยังไม่มี Passive — เพิ่มจากช่องด้านบน</div>}
                    {newSkillPassiveEffects.map((effect, index) => (
                      <div key={effect.id} className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-black text-fuchsia-100">#{index + 1} {effect.name}</div>
                          <button type="button" onClick={() => setNewSkillPassiveEffects(prev => prev.filter(item => item.id !== effect.id))} className="rounded bg-rose-500/15 px-2 py-1 text-[9px] text-rose-300">ลบ Passive นี้</button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-slate-300 sm:grid-cols-4">
                          <span>ประเภท: {effect.kind}</span><span>Trigger: {effect.trigger}</span><span>ค่า: {effect.value}</span><span>โอกาส: {effect.chance ?? 100}%</span>
                          {['stack','true_damage_at_max_stacks','true_damage_per_stack'].includes(effect.kind) && <><span>Stack: {effect.maxStacks}</span><span>Key: {effect.stackKey}</span></>}
                          {effect.kind === 'buff_stat' && <span>Stat: {effect.targetStat}</span>}
                          {effect.duration && ['buff_stat','shield','reflect'].includes(effect.kind) && <span>ระยะเวลา: {effect.duration} เทิร์น</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {newRewardType === 'skill' && (
                  <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3">
                    <div className="text-[11px] font-bold text-cyan-200">หมวดหมู่สกิลในสนามรบ</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select value={newRewardBattleEffect} onChange={(e) => setNewRewardBattleEffect(e.target.value as NonNullable<Skill['battleEffect']>)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none">
                        <option value="damage">โจมตี / ดาเมจ</option><option value="heal">ฟื้นฟู HP</option><option value="defense">โล่ / ป้องกัน</option><option value="reflect">สะท้อนดาเมจ</option><option value="stun">ควบคุม / สตัน</option><option value="copy_ability">🧬 คัดลอกความสามารถศัตรู</option><option value="immortal">♾️ อมตะ</option><option value="damage_reduction">🛡️ ลดความเสียหาย</option><option value="summon">🧿 เสกลูกน้อง</option>
                      </select>
                      <input type="number" min={1} value={newRewardBattlePower} onChange={(e) => setNewRewardBattlePower(Number(e.target.value))} placeholder="พลังผลลัพธ์" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none" />
                      <input type="number" min={0} max={99} value={newRewardCooldownTurns} onChange={(e) => setNewRewardCooldownTurns(Number(e.target.value))} placeholder="คูลดาวน์ (เทิร์น)" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none" /><input type="number" min={1} max={10} value={newRewardEffectDuration} onChange={(e) => setNewRewardEffectDuration(Number(e.target.value))} placeholder="ระยะเวลาเอฟเฟกต์ (เทิร์น)" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none" />
                    </div>
                    <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
                      <div className="mb-2 text-[11px] font-black text-violet-200">✨ ความสามารถพิเศษของสกิลกาชา <span className="font-normal text-slate-400">(ใส่หรือไม่ใส่ก็ได้)</span></div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-violet-500/20 bg-black/20 p-2 text-[10px] text-slate-300">
                          <b className="text-white">🧬 คัดลอกความสามารถศัตรู</b>
                          <div className="mt-1">เลือกประเภทด้านบนเป็น “คัดลอกความสามารถศัตรู” แล้วกำหนดระยะเวลา 1–10 เทิร์น ระบบจะคัดลอกสกิล/Passive ของศัตรูที่พบในสนามรบและลบเมื่อครบเวลา</div>
                        </div>
                        <div className="rounded-lg border border-violet-500/20 bg-black/20 p-2 text-[10px] text-slate-300">
                          <b className="text-white">♾️ อมตะ</b>
                          <div className="mt-1">เลือก “อมตะ” แล้วกำหนดระยะเวลา 1–10 เทิร์น ระบบจะกันดาเมจรวมถึง True Damage ตามระยะเวลาที่ตั้ง</div>
                        </div>
                        <div className="rounded-lg border border-violet-500/20 bg-black/20 p-2 text-[10px] text-slate-300">
                          <b className="text-white">🛡️ ลดความเสียหาย</b>
                          <div className="mt-1">เลือก “ลดความเสียหาย” ค่า “พลังผลลัพธ์” = เปอร์เซ็นต์ลดดาเมจ และช่อง “ระยะเวลา” = จำนวนเทิร์น</div>
                        </div>
                        <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-2 text-[10px] text-slate-300">
                          <b className="text-rose-200">⚠️ ข้อเสียของสกิล</b>
                          <div className="mt-1">ด้านล่างสามารถเพิ่มข้อเสียได้หลายรายการ เช่น เลือดไหล/พิษ/เผาไหม้/สตันตัวเอง/ลดป้องกัน พร้อมค่าและระยะเวลา และมีผลจริงตอนใช้สกิล</div>
                        </div>
                      </div>
                    </div>

                    {newRewardBattleEffect === 'summon' && (<div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2"><div className="text-[10px] font-black text-cyan-200">🧿 ตั้งค่าลูกน้อง</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><input value={newSummonName} onChange={e=>setNewSummonName(e.target.value)} placeholder="ชื่อลูกน้อง" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/><input type="number" min={1} max={20} value={newSummonMaxCount} onChange={e=>setNewSummonMaxCount(Number(e.target.value))} placeholder="จำนวนสูงสุด" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/><input type="number" min={1} value={newSummonHp} onChange={e=>setNewSummonHp(Number(e.target.value))} placeholder="HP ต่อตัว" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/><input type="number" min={1} value={newSummonDamage} onChange={e=>setNewSummonDamage(Number(e.target.value))} placeholder="Damage ต่อตัว" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/><input type="number" min={0} value={newSummonAgility} onChange={e=>setNewSummonAgility(Number(e.target.value))} placeholder="Speed / AGI" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/></div><textarea value={newSummonSkillsText} onChange={e=>setNewSummonSkillsText(e.target.value)} placeholder='JSON สกิลลูกน้อง' className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] font-mono text-white"/><div className="text-[9px] text-slate-500">กำหนดสกิลลูกน้องเป็น JSON array และใช้ aiChancePercent กำหนดโอกาสใช้</div></div>)}

                    {newRewardBattleEffect === 'damage' && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-2">
                        <div className="text-[10px] font-black text-amber-200 mb-2">⚔️ สูตรคำนวณดาเมจ</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <select value={newRewardDamageScaling} onChange={e => setNewRewardDamageScaling(e.target.value as NonNullable<Skill['damageScaling']>)} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                            <option value="fixed">ค่าพลังสกิลคงที่</option><option value="strength">ตามพละกำลัง (STR)</option><option value="durability">ตามความแข็งแกร่ง/ทนทาน (DUR)</option><option value="agility">ตามความว่องไว (AGI)</option><option value="magic">ตามพลังเวท (MAG)</option>
                          </select>
                          <input type="number" min={0} step={0.1} value={newRewardDamageScalingMultiplier} onChange={e => setNewRewardDamageScalingMultiplier(Number(e.target.value))} placeholder="ตัวคูณ เช่น 1 หรือ 0.5" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        </div>
                        <div className="text-[9px] text-slate-500 mt-1">ตัวอย่าง STR 80 × 1 = 80 ดาเมจ ก่อนเอฟเฟกต์อื่น</div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[10px] text-slate-400">โอกาสคริติคอล (%)<input type="number" min={0} max={100} value={newRewardCritChance} onChange={(e) => setNewRewardCritChance(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-amber-200 outline-none" /></label>
                      <label className="text-[10px] text-slate-400">ตัวคูณคริติคอล (เช่น 2 = x2)<input type="number" min={1} max={20} step={0.1} value={newRewardCritMultiplier} onChange={(e) => setNewRewardCritMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-amber-200 outline-none" /></label>
                    </div>
                    <label className="text-[10px] text-slate-400">🔁 โอกาสตีซ้ำอีก 1 รอบ (%)
                      <input type="number" min={0} max={100} step={0.001} value={newRewardRepeatAttackChance} onChange={(e) => setNewRewardRepeatAttackChance(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-emerald-200 outline-none" />
                      <span className="block mt-1 text-[9px] text-slate-500">0% = ไม่มีโอกาสตีซ้ำ</span>
                    </label>
                    <label className="block mt-2 text-[10px] text-slate-400">🔢 ตีซ้ำได้สูงสุดกี่รอบ
                      <input type="number" min={1} max={20} value={newRewardMaxRepeatAttacks} onChange={(e) => setNewRewardMaxRepeatAttacks(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-emerald-200 outline-none" />
                    </label>


                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-2">
                      <div className="mb-2 text-[10px] font-black text-cyan-200">📊 สเตตัสสกิล — เพิ่มได้หลายรายการ และใช้จริงในการต่อสู้</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <select value={newRewardStatKind} onChange={e => setNewRewardStatKind(e.target.value as BattleSkillStat['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                          <option value="attack_power">พลังโจมตี</option>
                          <option value="defense_power">พลังป้องกัน</option>
                          <option value="heal_percent">ฟื้น HP %</option>
                          <option value="accuracy_percent">ความแม่นยำ %</option>
                          <option value="speed">ความเร็ว</option>
                          <option value="status_chance_percent">โอกาสติดสถานะ %</option>
                          <option value="status_duration">ระยะเวลาสถานะ</option>
                          <option value="critical_chance_percent">โอกาสคริ %</option>
                          <option value="critical_multiplier">ตัวคูณคริ</option>
                          <option value="cooldown_turns">ลดคูลดาวน์</option>
                        </select>
                        <input type="number" step="0.1" value={newRewardStatValue} onChange={e => setNewRewardStatValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={1} value={newRewardStatDuration} onChange={e => setNewRewardStatDuration(Math.max(1, Number(e.target.value) || 1))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <button type="button" onClick={() => setNewRewardBattleStats(prev => [...prev, { kind: newRewardStatKind, value: Number(newRewardStatValue) || 0, duration: Math.max(1, Number(newRewardStatDuration) || 1) }])} className="rounded-lg bg-cyan-500/20 px-2 py-2 text-xs font-black text-cyan-100">+ เพิ่ม</button>
                      </div>
                      {newRewardBattleStats.map((stat, index) => (
                        <div key={index} className="mt-1 flex items-center justify-between rounded bg-black/20 px-2 py-1 text-[10px] text-slate-300">
                          <span>{stat.kind} • {stat.value} • {stat.duration} เทิร์น</span>
                          <button type="button" onClick={() => setNewRewardBattleStats(prev => prev.filter((_, i) => i !== index))} className="text-rose-300">ลบ</button>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-2">
                      <div className="mb-2 text-[10px] font-black text-fuchsia-200">เอฟเฟกต์เพิ่มเติมของสกิล — เพิ่มได้หลายรายการและทำงานพร้อมกัน</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <select value={newRewardEffectKind} onChange={e => setNewRewardEffectKind(e.target.value as BattleExtraEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                          <option value="bleeding">เลือดไหล</option><option value="burn">เผาไหม้</option><option value="poison">พิษ</option><option value="freeze">Freeze</option><option value="stun">สตัน</option><option value="reduce_max_hp_percent">ลด MAX HP %</option><option value="reduce_defense_percent">ลดป้องกัน %</option><option value="damage_percent">เพิ่มดาเมจ %</option><option value="heal_percent">ฟื้น HP %</option><option value="shield">โล่</option><option value="reflect">สะท้อน %</option>
                        </select>
                        <input type="number" min={0} value={newRewardEffectValue} onChange={e => setNewRewardEffectValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={1} value={newRewardEffectDuration} onChange={e => setNewRewardEffectDuration(Number(e.target.value))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={0} max={100} value={newRewardEffectChance} onChange={e => setNewRewardEffectChance(Number(e.target.value))} placeholder="โอกาส %" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <button type="button" onClick={() => setNewRewardBattleEffects(prev => [...prev, { kind: newRewardEffectKind, value: Math.max(0, Number(newRewardEffectValue) || 0), duration: Math.max(1, Number(newRewardEffectDuration) || 1), chance: Math.max(0, Math.min(100, Number(newRewardEffectChance) || 0)), target: ['heal_percent','shield','reflect'].includes(newRewardEffectKind) ? 'self' : 'enemy' }])} className="rounded-lg bg-fuchsia-500/20 px-2 py-2 text-xs font-black text-fuchsia-100">+ เพิ่ม</button>
                      </div>
                      {newRewardBattleEffects.map((effect, index) => <div key={index} className="mt-1 flex items-center justify-between rounded bg-black/20 px-2 py-1 text-[10px] text-slate-300"><span>{effect.kind} • {effect.value}{effect.kind.includes('percent') || effect.kind === 'reflect' ? '%' : ''} • {effect.duration} เทิร์น • {effect.chance ?? 100}%</span><button type="button" onClick={() => setNewRewardBattleEffects(prev => prev.filter((_, i) => i !== index))} className="text-rose-300">ลบ</button></div>)}
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-2">
                      <div className="mb-2 text-[10px] font-black text-rose-200">⚠️ ข้อเสียของสกิล — ผลย้อนกลับทำงานจริง</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <select value={newDrawbackKind} onChange={e=>setNewDrawbackKind(e.target.value as BattleExtraEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white">
                          <option value="bleeding">เสียเลือดต่อเทิร์น</option><option value="burn">เผาไหม้ตัวเอง</option><option value="poison">พิษตัวเอง</option><option value="stun">สตันตัวเอง</option><option value="damage_percent">เพิ่มดาเมจที่ได้รับ/ผลเสีย %</option><option value="damage_reduction">ลดความเสียหายตัวเอง</option><option value="reduce_defense_percent">ลดป้องกันตัวเอง %</option>
                        </select>
                        <input type="number" min={0} value={newDrawbackValue} onChange={e=>setNewDrawbackValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <input type="number" min={1} max={10} value={newDrawbackDuration} onChange={e=>setNewDrawbackDuration(Number(e.target.value))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white" />
                        <button type="button" onClick={()=>setNewRewardDrawbacks(prev=>[...prev,{kind:newDrawbackKind,value:Math.max(0,Number(newDrawbackValue)||0),duration:Math.max(1,Math.min(10,Math.round(Number(newDrawbackDuration)||1))),chance:100,target:'self'}])} className="rounded-lg bg-rose-500/20 px-2 py-2 text-xs font-black text-rose-100">+ เพิ่มข้อเสีย</button>
                      </div>
                      {newRewardDrawbacks.map((effect,index)=><div key={index} className="mt-1 flex items-center justify-between rounded bg-black/20 px-2 py-1 text-[10px] text-rose-200"><span>{effect.kind} • {effect.value} • {effect.duration} เทิร์น</span><button type="button" onClick={()=>setNewRewardDrawbacks(prev=>prev.filter((_,i)=>i!==index))} className="text-rose-300">ลบ</button></div>)}
                    </div>
                    <p className="text-[10px] leading-4 text-slate-400">สกิลที่สร้างจะบันทึกประเภท พลัง คูลดาวน์ โอกาสคริติคอล ตัวคูณคริ และเอฟเฟกต์หลายรายการ แล้วนำไปคำนวณจริงในสนามรบ</p>
                  </div>
                )}
                  <label className="text-xs text-slate-300 block mb-1">อัตราออก (Rate %)</label>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={newRewardRate}
                    onChange={(e) => setNewRewardRate(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                  />
                <div>
                  <label className="text-xs text-slate-300 block mb-1">คำอธิบาย</label>
                  <textarea
                    rows={2}
                    value={newRewardDesc}
                    onChange={(e) => setNewRewardDesc(e.target.value)}
                    placeholder="เขียนบรรยายของรางวัล..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-black text-xs shadow cursor-pointer transition-all"
                >
                  เพิ่มของรางวัลลงตู้กาชา
                </button>
              </form>
            </div>

            {/* Current Rewards Pool Table with Inline Rate Editing */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-400" />
                ของรางวัลในตู้กาชาและตั้งเรทออก ({gachaRewards.filter(r => r.bannerId === selectedBannerId || (!r.bannerId && selectedBannerId === 'main')).length} รายการ)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="pb-3">รางวัล</th>
                      <th className="pb-3">ประเภท</th>
                      <th className="pb-3">ความหายาก</th>
                      <th className="pb-3">เรทออก (%)</th>
                      <th className="pb-3 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedBannerRewards.map((rw) => {
                      const currentVal = editingRates[rw.id] !== undefined ? editingRates[rw.id] : rw.rate;
                      const hasChanged = editingRates[rw.id] !== undefined && editingRates[rw.id] !== rw.rate;
                      return (
                        <tr key={rw.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 font-bold text-white">
                            {rw.name}
                            {rw.coinAmount && (
                              <span className="text-[10px] text-amber-300 font-mono block">
                                +{rw.coinAmount.toLocaleString()} Coins
                              </span>
                            )}
                            {rw.characteristic && (
                              <span className="text-[10px] text-cyan-300 font-mono block">
                                +{rw.characteristic}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-300 capitalize">
                            {rw.type === 'characteristic' ? 'คุณลักษณะ' : rw.type}
                          </td>
                          <td className="py-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-800 text-slate-300 uppercase">
                              {rw.rarity}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.001"
                                min={0}
                                value={currentVal}
                                onChange={(e) => setEditingRates(prev => ({
                                  ...prev,
                                  [rw.id]: Number(e.target.value)
                                }))}
                                className="w-18 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-amber-400 font-mono font-bold text-xs outline-none"
                              />
                              <span className="text-[11px] text-slate-400">%</span>
                              {hasChanged && (
                                <button
                                  onClick={() => handleSaveRateChange(rw)}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                                  title="บันทึกเรทใหม่"
                                >
                                  บันทึก
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            {rw.type === 'skill' && rw.skillData && (
                              <button onClick={() => openSkillEditor(rw)} className="px-2 py-1 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-[10px] font-bold cursor-pointer mr-1">✏️ แก้สกิล</button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`คุณต้องการลบ "${rw.name}" ออกจากตู้กาชาใช่หรือไม่?`)) {
                                  onDeleteGachaReward(rw.id);
                                }
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingSkillRewardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between"><div><h3 className="text-lg font-black text-white">✏️ แก้ไขสกิลที่สร้างไว้</h3><p className="text-xs text-slate-400">แก้ไขภายหลังได้ และบันทึกลงฐานข้อมูลทันที</p></div><button type="button" onClick={() => setEditingSkillRewardId(null)} className="text-slate-400">✕</button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={editingSkillName} onChange={e => setEditingSkillName(e.target.value)} placeholder="ชื่อสกิล" className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" />
              <select value={editingSkillEffect} onChange={e => setEditingSkillEffect(e.target.value as NonNullable<Skill['battleEffect']>)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"><option value="damage">โจมตี / ดาเมจ</option><option value="heal">ฟื้นฟู HP</option><option value="defense">ป้องกัน</option><option value="reflect">สะท้อน</option><option value="stun">สตัน</option><option value="copy_ability">🧬 คัดลอกความสามารถศัตรู</option><option value="immortal">♾️ อมตะ / กัน True Damage</option><option value="damage_reduction">🛡️ ลดความเสียหาย</option></select>
              <textarea value={editingSkillDesc} onChange={e => setEditingSkillDesc(e.target.value)} placeholder="คำอธิบาย" className="sm:col-span-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white min-h-20" />
              <label className="text-[10px] text-slate-400">พลังสกิล<input type="number" min={1} value={editingSkillPower} onChange={e => setEditingSkillPower(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></label>
              <label className="text-[10px] text-slate-400">คูลดาวน์<input type="number" min={0} value={editingSkillCooldown} onChange={e => setEditingSkillCooldown(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /><input type="number" min={1} max={10} value={editingSkillEffectDuration} onChange={e => setEditingSkillEffectDuration(Math.max(1, Math.min(10, Number(e.target.value)||1)))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" placeholder="ระยะเวลาเอฟเฟกต์" /></label>
              {editingSkillEffect === 'damage' && <div className="sm:col-span-2 rounded-2xl border border-amber-500/30 bg-amber-950/10 p-3"><div className="text-xs font-black text-amber-200 mb-2">⚔️ ดาเมจตามค่าสเตตัส</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><select value={editingSkillScaling} onChange={e => setEditingSkillScaling(e.target.value as NonNullable<Skill['damageScaling']>)} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"><option value="fixed">ค่าพลังสกิลคงที่</option><option value="strength">พละกำลัง (STR)</option><option value="durability">ความแข็งแกร่ง/ทนทาน (DUR)</option><option value="agility">ความว่องไว (AGI)</option><option value="magic">พลังเวท (MAG)</option></select><input type="number" min={0} step={0.1} value={editingSkillScalingMultiplier} onChange={e => setEditingSkillScalingMultiplier(Number(e.target.value))} placeholder="ตัวคูณ" className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></div><div className="text-[10px] text-slate-500 mt-1">เช่น STR 100 × 1.5 = 150 ดาเมจ</div></div>}
              <label className="text-[10px] text-slate-400">โอกาสคริ %<input type="number" min={0} max={100} step={0.1} value={editingSkillCritChance} onChange={e => setEditingSkillCritChance(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></label>
              <label className="text-[10px] text-slate-400">ตัวคูณคริ<input type="number" min={1} step={0.1} value={editingSkillCritMultiplier} onChange={e => setEditingSkillCritMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></label>
            <div className="rounded-xl border border-violet-500/25 bg-violet-950/10 p-3 space-y-2 sm:col-span-2">
              <div className="text-[11px] font-black text-violet-200">✨ ความสามารถพิเศษของสกิลกาชา — แก้ไขได้ครบ</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">ระยะเวลาเอฟเฟกต์ (1–10 เทิร์น)
                  <input type="number" min={1} max={10} value={editingSkillEffectDuration} onChange={e=>setEditingSkillEffectDuration(Math.max(1,Math.min(10,Number(e.target.value)||1)))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"/>
                </label>
                <div className="text-[10px] text-slate-500 pt-5">Copy / Immortal / Damage Reduction / สถานะหลัก ใช้ระยะเวลานี้</div>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-violet-500/25 bg-violet-950/10 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-black text-violet-200">🧩 ข้อเสีย / เอฟเฟกต์เพิ่มเติม / Passive</div>
                    <div className="text-[10px] text-slate-400">เลือกได้ว่าจะใช้แบบฟอร์มสำเร็จรูปเหมือนตอนสร้างสกิล หรือแก้ JSON โดยตรง</div>
                  </div>
                  <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
                    <button type="button" onClick={() => setEditingSkillAdvancedMode('form')} className={`rounded-md px-3 py-1 text-[10px] font-black ${editingSkillAdvancedMode === 'form' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>🧩 แบบเลือก</button>
                    <button type="button" onClick={() => setEditingSkillAdvancedMode('json')} className={`rounded-md px-3 py-1 text-[10px] font-black ${editingSkillAdvancedMode === 'json' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>{"</>"} JSON</button>
                  </div>
                </div>
                {editingSkillAdvancedMode === 'form' ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 space-y-2">
                      <div className="text-[10px] font-black text-rose-200">⚠️ ข้อเสียของสกิล</div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <select value={editingDrawbackKind} onChange={e=>setEditingDrawbackKind(e.target.value as BattleExtraEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white">
                          <option value="bleeding">เสียเลือดต่อเทิร์น</option><option value="burn">เผาไหม้ตัวเอง</option><option value="poison">พิษตัวเอง</option><option value="stun">สตันตัวเอง</option><option value="damage_percent">เพิ่มดาเมจที่ได้รับ %</option><option value="damage_reduction">ลดความเสียหายตัวเอง</option><option value="reduce_defense_percent">ลดป้องกันตัวเอง %</option>
                        </select>
                        <input type="number" min={0} value={editingDrawbackValue} onChange={e=>setEditingDrawbackValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={1} max={10} value={editingDrawbackDuration} onChange={e=>setEditingDrawbackDuration(Number(e.target.value))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={0} max={100} value={editingDrawbackChance} onChange={e=>setEditingDrawbackChance(Number(e.target.value))} placeholder="โอกาส %" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                      </div>
                      <button type="button" onClick={()=>{const e={kind:editingDrawbackKind,value:Math.max(0,Number(editingDrawbackValue)||0),duration:Math.max(1,Math.min(10,Math.round(Number(editingDrawbackDuration)||1))),chance:Math.max(0,Math.min(100,Number(editingDrawbackChance)||0)),target:'self'}; setEditingSkillDrawbacksText(JSON.stringify([...JSON.parse(editingSkillDrawbacksText||'[]'),e],null,2));}} className="rounded-lg bg-rose-500/20 px-3 py-2 text-[10px] font-black text-rose-100">＋ เพิ่มข้อเสีย</button>
                      <pre className="max-h-24 overflow-auto rounded-lg bg-black/20 p-2 text-[9px] text-rose-200">{editingSkillDrawbacksText}</pre>
                    </div>

                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-2">
                      <div className="text-[10px] font-black text-cyan-200">✨ เอฟเฟกต์เพิ่มเติม</div>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <select value={editingEffectKind} onChange={e=>setEditingEffectKind(e.target.value as BattleExtraEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white">
                          <option value="bleeding">เลือดออก</option><option value="burn">เผาไหม้</option><option value="poison">พิษ</option><option value="freeze">แช่แข็ง</option><option value="stun">สตัน</option><option value="reduce_max_hp_percent">ลด Max HP %</option><option value="reduce_defense_percent">ลดป้องกัน %</option><option value="damage_percent">Damage %</option><option value="heal_percent">Heal %</option><option value="shield">Shield</option><option value="reflect">Reflect</option><option value="damage_reduction">ลดความเสียหาย</option>
                        </select>
                        <input type="number" min={0} value={editingEffectValue} onChange={e=>setEditingEffectValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={1} max={10} value={editingEffectDuration} onChange={e=>setEditingEffectDuration(Number(e.target.value))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={0} max={100} value={editingEffectChance} onChange={e=>setEditingEffectChance(Number(e.target.value))} placeholder="โอกาส %" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <select value={editingEffectTarget} onChange={e=>setEditingEffectTarget(e.target.value as 'self'|'enemy')} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"><option value="enemy">ศัตรู</option><option value="self">ตัวเอง</option></select>
                      </div>
                      <button type="button" onClick={()=>{const e={kind:editingEffectKind,value:Math.max(0,Number(editingEffectValue)||0),duration:Math.max(1,Math.min(10,Math.round(Number(editingEffectDuration)||1))),chance:Math.max(0,Math.min(100,Number(editingEffectChance)||0)),target:editingEffectTarget}; setEditingSkillEffectsText(JSON.stringify([...JSON.parse(editingSkillEffectsText||'[]'),e],null,2));}} className="rounded-lg bg-cyan-500/20 px-3 py-2 text-[10px] font-black text-cyan-100">＋ เพิ่มเอฟเฟกต์</button>
                      <pre className="max-h-24 overflow-auto rounded-lg bg-black/20 p-2 text-[9px] text-cyan-200">{editingSkillEffectsText}</pre>
                    </div>

                    <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 space-y-2">
                      <div className="text-[10px] font-black text-fuchsia-200">✨ Passive ของสกิล</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input value={editingPassiveName} onChange={e=>setEditingPassiveName(e.target.value)} placeholder="ชื่อ Passive" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <select value={editingPassiveKind} onChange={e=>setEditingPassiveKind(e.target.value as ItemPassiveEffect['kind'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white">
                          <option value="stack">🌸 สะสม Stack</option><option value="true_damage_at_max_stacks">💥 ครบ Stack → True Damage</option><option value="true_damage_per_stack">💠 True Damage ต่อ Stack</option><option value="damage">⚔️ Damage</option><option value="damage_percent">⚔️ Damage %</option><option value="heal">❤️ Heal</option><option value="heal_percent">❤️ Heal %</option><option value="buff_stat">📈 Buff Stat</option><option value="shield">🛡️ Shield</option><option value="reflect">↩️ Reflect %</option><option value="repeat_attack_chance">🔁 Repeat Attack %</option><option value="critical_chance">🎯 Critical %</option>
                        </select>
                        <select value={editingPassiveTrigger} onChange={e=>setEditingPassiveTrigger(e.target.value as ItemPassiveEffect['trigger'])} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"><option value="turn_start">ทุกต้นเทิร์น</option><option value="attack">ทุกครั้งที่โจมตี</option></select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input type="number" min={0} step={0.1} value={editingPassiveValue} onChange={e=>setEditingPassiveValue(Number(e.target.value))} placeholder="ค่า" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={1} value={editingPassiveMaxStacks} onChange={e=>setEditingPassiveMaxStacks(Number(e.target.value))} placeholder="Max Stack" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={0} max={100} value={editingPassiveChance} onChange={e=>setEditingPassiveChance(Number(e.target.value))} placeholder="โอกาส %" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <input type="number" min={1} max={10} value={editingPassiveDuration} onChange={e=>setEditingPassiveDuration(Number(e.target.value))} placeholder="เทิร์น" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input value={editingPassiveStackKey} onChange={e=>setEditingPassiveStackKey(e.target.value)} placeholder="Stack Key เช่น flower" className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"/>
                        <select value={editingPassiveTargetStat} onChange={e=>setEditingPassiveTargetStat(e.target.value as any)} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-[10px] text-white"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>
                        <button type="button" onClick={()=>{const e={id:`skill-passive-edit-${Date.now()}`,name:editingPassiveName.trim()||'Skill Passive',trigger:editingPassiveTrigger,kind:editingPassiveKind,value:Math.max(0,Number(editingPassiveValue)||0),chance:Math.max(0,Math.min(100,Number(editingPassiveChance)||0)),maxStacks:Math.max(1,Math.round(Number(editingPassiveMaxStacks)||1)),stackKey:editingPassiveStackKey.trim()||'flower',duration:Math.max(1,Math.round(Number(editingPassiveDuration)||1)),targetStat:editingPassiveKind==='buff_stat'?editingPassiveTargetStat:undefined}; setEditingSkillPassivesText(JSON.stringify([...JSON.parse(editingSkillPassivesText||'[]'),e],null,2));}} className="rounded-lg bg-fuchsia-500/20 px-3 py-2 text-[10px] font-black text-fuchsia-100">＋ เพิ่ม Passive</button>
                      </div>
                      <pre className="max-h-32 overflow-auto rounded-lg bg-black/20 p-2 text-[9px] text-fuchsia-200">{editingSkillPassivesText}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] text-rose-200 block">⚠️ ข้อเสีย (JSON)
                      <textarea value={editingSkillDrawbacksText} onChange={e=>setEditingSkillDrawbacksText(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-rose-500/20 bg-slate-800 px-2 py-2 text-[10px] text-rose-100 font-mono"/>
                    </label>
                    <label className="text-[10px] text-cyan-200 block">เอฟเฟกต์เพิ่มเติม (JSON)
                      <textarea value={editingSkillEffectsText} onChange={e=>setEditingSkillEffectsText(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-cyan-500/20 bg-slate-800 px-2 py-2 text-[10px] text-cyan-100 font-mono"/>
                    </label>
                    <label className="text-[10px] text-fuchsia-200 block">Passive ของสกิล (JSON)
                      <textarea value={editingSkillPassivesText} onChange={e=>setEditingSkillPassivesText(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-fuchsia-500/20 bg-slate-800 px-2 py-2 text-[10px] text-fuchsia-100 font-mono"/>
                    </label>
                  </div>
                )}
              </div>
            </div>
              <label className="text-[10px] text-slate-400">โอกาสตีซ้ำ %<input type="number" min={0} max={100} step={0.1} value={editingSkillRepeatChance} onChange={e => setEditingSkillRepeatChance(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></label>
              <label className="text-[10px] text-slate-400">ตีซ้ำสูงสุด<input type="number" min={1} max={20} value={editingSkillMaxRepeats} onChange={e => setEditingSkillMaxRepeats(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white" /></label>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingSkillRewardId(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">ยกเลิก</button><button type="button" onClick={saveEditedSkill} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black">💾 บันทึกการแก้ไข</button></div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

