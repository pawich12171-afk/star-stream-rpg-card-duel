import React, { useState } from 'react';
import { CharacterProfile, Item, Skill, Quest, GachaReward, GachaConfig, GachaRarity, MAX_GACHA_REWARDS } from '../types';
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
  onUpdateCharacterCoins: (characterId: string, deltaCoins: number) => void;
  onSetCharacterCoins: (characterId: string, newCoins: number) => void;
  onAddShopItem: (item: Item) => void | Promise<void>;
  onDeleteShopItem: (itemId: string) => void;
  onUpdateGachaConfig: (config: GachaConfig) => void;
  onAddGachaReward: (reward: GachaReward) => void;
  onDeleteGachaReward: (rewardId: string) => void;
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
  onAddShopItem,
  onDeleteShopItem,
  onUpdateGachaConfig,
  onAddGachaReward,
  onDeleteGachaReward,
  onDirectEditCharacter,
  onResetToDefaults,
  onToggleAdminRole,
  onDeleteCharacter,
  onGrantItem,
  onRemoveItem,
  onAssignQuest,
  onReviewQuestProof,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'shop' | 'inventory_spawner' | 'gacha_manage' | 'quests'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [coinInput, setCoinInput] = useState<number>(5000);

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
  const [spawnerMode, setSpawnerMode] = useState<'shop' | 'custom'>('shop');

  // Custom Item Spawner Form
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
  const [shopSearch, setShopSearch] = useState('');

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
  const [bannerTitleInput, setBannerTitleInput] = useState<string>(gachaConfig.bannerTitle || 'หีบสมบัติจักรวาลแห่งดวงดาว');
  const [bannerDescInput, setBannerDescInput] = useState<string>(gachaConfig.bannerDescription || 'สุ่มรับเหรียญรางวัลมหาศาล สกิลพิเศษระดับตำนาน และไอเทมสเตตัสหายาก');
  const [gachaEnabledInput, setGachaEnabledInput] = useState<boolean>(gachaConfig.enabled !== false);

  // New Gacha Reward Form
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardType, setNewRewardType] = useState<'coin' | 'item' | 'skill' | 'characteristic'>('coin');
  const [newRewardRate, setNewRewardRate] = useState<number>(10);
  const [newRewardRarity, setNewRewardRarity] = useState<GachaRarity>('rare');
  const [newRewardDesc, setNewRewardDesc] = useState('');
  const [newRewardCoinAmount, setNewRewardCoinAmount] = useState(2500);
  const [newRewardSelectedShopItemId, setNewRewardSelectedShopItemId] = useState(shopItems[0]?.id || '');
  const [newRewardCharacteristic, setNewRewardCharacteristic] = useState('');
  const [newRewardBattleEffect, setNewRewardBattleEffect] = useState<NonNullable<Skill['battleEffect']>>('damage');
  const [newRewardBattlePower, setNewRewardBattlePower] = useState(5);
  const [newRewardCooldownTurns, setNewRewardCooldownTurns] = useState(0);

  // Inline edit rate map
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  const selectedChar = characters.find(c => c.id === selectedCharId);
  const spawnerTargetChar = characters.find(c => c.id === spawnerTargetCharId) || characters[0];

  // Calculate total gacha rate sum
  const totalGachaRate = gachaRewards.reduce((sum, r) => sum + (Number(r.rate) || 0), 0);

  // Quick coin action handlers
  const handleAddCoins = () => {
    if (!selectedCharId) return;
    onUpdateCharacterCoins(selectedCharId, coinInput);
    alert(`เพิ่มเหรียญ ${coinInput.toLocaleString()} Coins ให้ผู้เล่น "${selectedChar?.displayName}" เรียบร้อยแล้ว!`);
  };

  const handleDeductCoins = () => {
    if (!selectedCharId) return;
    onUpdateCharacterCoins(selectedCharId, -coinInput);
    alert(`หักเหรียญ ${coinInput.toLocaleString()} Coins จากผู้เล่น "${selectedChar?.displayName}" เรียบร้อยแล้ว!`);
  };

  const handleSetExactCoins = () => {
    if (!selectedCharId) return;
    onSetCharacterCoins(selectedCharId, coinInput);
    alert(`กำหนดเหรียญให้ "${selectedChar?.displayName}" เป็น ${coinInput.toLocaleString()} Coins เรียบร้อยแล้ว!`);
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
    alert(`เพิ่มไอเทม "${newItem.name}" ลงร้านค้าสำเร็จแล้ว!`);
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
    } else {
      if (!customItemName.trim()) {
        alert('กรุณากรอกชื่อไอเทมที่ต้องการเสก');
        return;
      }
      itemToGrant = {
        id: `custom-spawn-${Date.now()}`,
        name: customItemName.trim(),
        price: customItemPrice,
        category: customItemCategory,
        rarity: customItemRarity,
        description: customItemDesc.trim() || 'ไอเทมที่เสกโดยผู้ดูแลระบบ Star Stream',
        icon: customItemCategory === 'consumable' ? (customItemEffectType === 'heal_hp' ? 'HeartPulse' : 'Heart') : 'Shield',
        effectType: customItemEffectType,
        effectValue: customItemEffectVal,
        hpBonus: (customItemEffectType === 'heal_hp' || customItemEffectType === 'boost_max_hp' || customItemCategory === 'equipment') ? (customItemHpBonus || customItemEffectVal) : undefined,
        targetStat: customItemEffectType === 'buff_stat' ? customItemTargetStat : undefined,
        usableByPlayers: true,
      };
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

    if (spawnerMode === 'custom') {
      setCustomItemName('');
      setCustomItemDesc('');
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

  // Save Gacha Config Handler
  const handleSaveGachaConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedConfig: GachaConfig = {
      pullCost: pullCostInput,
      tenPullCost: tenPullCostInput,
      bannerTitle: bannerTitleInput,
      bannerDescription: bannerDescInput,
      enabled: gachaEnabledInput,
    };
    onUpdateGachaConfig(updatedConfig);
    alert('บันทึกการตั้งค่าตู้กาชาเรียบร้อยแล้ว!');
  };

  // Create Gacha Reward Handler
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRewardName.trim()) {
      alert('กรุณากรอกชื่อของรางวัลกาชา');
      return;
    }

    if (gachaRewards.length >= MAX_GACHA_REWARDS) {
      alert(`ตู้กาชาเต็มแล้ว เพิ่มได้สูงสุด ${MAX_GACHA_REWARDS} รายการ`);
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
      rate: Number(newRewardRate) || 1,
      rarity: newRewardRarity,
      description: newRewardDesc.trim() || 'ของรางวัลกาชาใน Star Stream',
      coinAmount: newRewardType === 'coin' ? newRewardCoinAmount : undefined,
      itemData,
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
        battlePower: Math.max(1, Number(newRewardBattlePower) || 1),
        cooldownTurns: Math.max(0, Number(newRewardCooldownTurns) || 0),
        cooldown: Number(newRewardCooldownTurns) > 0 ? `${newRewardCooldownTurns} เทิร์น` : undefined,
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
      alert(`เพิ่มของรางวัล "${reward.name}" เข้าตู้กาชาสำเร็จ!`);
    } catch (error) {
      console.error('Error saving gacha reward:', error);
      alert('บันทึกของรางวัลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Save Inline Rate Change
  const handleSaveRateChange = async (reward: GachaReward) => {
    const newRate = editingRates[reward.id];
    if (newRate === undefined || isNaN(newRate)) return;
    try {
      await onAddGachaReward({
        ...reward,
        rate: Number(newRate),
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
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
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
          เสกไอเทม / ลบไอเทมผู้เล่น
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
                      {c.displayName} ({c.nickname}) - มี {c.coins.toLocaleString()} C [{c.role || 'player'}]
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
                      เหรียญปัจจุบัน: {selectedChar.coins.toLocaleString()} Coins
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-300 block mb-1">จำนวนเหรียญ:</label>
                <input
                  type="number"
                  value={coinInput}
                  onChange={(e) => setCoinInput(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono font-bold outline-none focus:border-amber-400"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[1000, 5000, 10000, 50000, 100000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCoinInput(amt)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-mono cursor-pointer"
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 space-y-2">
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
                            {char.coins.toLocaleString()} C
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
                เพิ่มไอเทมใหม่ในร้านค้า
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
                        {(shopItemPrice || 0).toLocaleString()} C
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

          {/* Right: Existing Shop Items List */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  รายการสินค้าในร้านค้าปัจจุบัน ({shopItems.length} ชิ้น)
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
                          {item.price.toLocaleString()} C
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
                  เหรียญปัจจุบัน: <span className="text-amber-300 font-mono font-bold">{spawnerTargetChar.coins.toLocaleString()} C</span> | 
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
                <button
                  type="button"
                  onClick={() => setSpawnerMode('custom')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    spawnerMode === 'custom'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  เสกไอเทมสร้างเอง
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
                          {item.name} [{item.rarity || 'common'}] - {item.price.toLocaleString()} C
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
          {/* Top: Gacha Config & Total Rate Progress */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gacha System Parameters */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                ตั้งค่าตู้กาชา (Gacha Configuration)
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
                    ผลรวมของเปอร์เซ็นต์เรทออกควรอยู่ที่ 100% เพื่อความสมดุล
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
                  เรทรวม: {totalGachaRate.toFixed(1)}%
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
                  const count = gachaRewards.filter(r => r.rarity === rarity).length;
                  const rateSum = gachaRewards
                    .filter(r => r.rarity === rarity)
                    .reduce((sum, r) => sum + (Number(r.rate) || 0), 0);
                  return (
                    <div key={rarity} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">{rarity}</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">{rateSum.toFixed(1)}%</div>
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
                <span className="ml-auto text-[10px] text-slate-400">{gachaRewards.length}/{MAX_GACHA_REWARDS}</span>
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
                    <label className="text-xs text-slate-300 block mb-1">ผูกกับไอเทมในร้านค้า:</label>
                    <select
                      value={newRewardSelectedShopItemId}
                      onChange={(e) => setNewRewardSelectedShopItemId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                    >
                      {shopItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} [{item.rarity || 'common'}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
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

                {newRewardType === 'skill' && (
                  <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3">
                    <div className="text-[11px] font-bold text-cyan-200">หมวดหมู่สกิลในสนามรบ</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select value={newRewardBattleEffect} onChange={(e) => setNewRewardBattleEffect(e.target.value as NonNullable<Skill['battleEffect']>)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none">
                        <option value="damage">โจมตี / ดาเมจ</option>
                        <option value="heal">ฟื้นฟู HP</option>
                        <option value="defense">โล่ / ป้องกัน</option>
                        <option value="reflect">สะท้อนดาเมจ</option>
                        <option value="stun">ควบคุม / สตัน</option>
                      </select>
                      <input type="number" min={1} value={newRewardBattlePower} onChange={(e) => setNewRewardBattlePower(Number(e.target.value))} placeholder="พลังผลลัพธ์" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none" />
                      <input type="number" min={0} max={99} value={newRewardCooldownTurns} onChange={(e) => setNewRewardCooldownTurns(Number(e.target.value))} placeholder="คูลดาวน์ (เทิร์น)" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white outline-none" />
                    </div>
                    <p className="text-[10px] leading-4 text-slate-400">สกิลที่สร้างจะถูกบันทึกพร้อมประเภท พลัง และคูลดาวน์ จึงนำไปใช้ในสนามรบได้ทันทีหลังได้รับจากกาชา</p>
                  </div>
                )}
                  <label className="text-xs text-slate-300 block mb-1">อัตราออก (Rate %)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={newRewardRate}
                    onChange={(e) => setNewRewardRate(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none font-mono"
                  />
                </div>

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
                  disabled={gachaRewards.length >= MAX_GACHA_REWARDS}
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
                ของรางวัลในตู้กาชาและตั้งเรทออก ({gachaRewards.length} รายการ)
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
                    {gachaRewards.map((rw) => {
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
                                step="0.1"
                                min={0.1}
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
    </div>
  );
};
