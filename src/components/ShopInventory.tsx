import React, { useState } from 'react';
import { CharacterProfile, Item, InventoryItem, GachaRarity } from '../types';
import { 
  ShoppingBag, 
  Package, 
  Coins, 
  Sparkles, 
  Trash2, 
  Plus,
  Heart,
  HeartPulse,
  Shield,
  Sword,
  Droplets,
  Flame,
  Flower2,
  Zap,
  Gem,
  Scroll,
  Check,
  Award,
  Crown,
  Info
} from 'lucide-react';
import confetti from '../utils/confetti';
import { syncCharacterHealth } from '../utils/healthSystem';

interface ShopInventoryProps {
  character: CharacterProfile;
  shopItems: Item[];
  onUpdateCharacter: (updated: CharacterProfile) => void | Promise<boolean | void>;
  onAddShopItem?: (item: Item) => void | Promise<void>;
  onDeleteShopItem?: (itemId: string) => void;
  isAdmin: boolean;
}

// Helper functions for items
const renderItemIcon = (iconName?: string, category?: string, effectType?: string, className = "w-5 h-5") => {
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

const getRarityBadge = (rarity?: string) => {
  switch (rarity) {
    case 'mythic':
      return {
        name: 'Mythic (มายาสงคราม)',
        badge: 'bg-rose-950/80 text-rose-300 border-rose-500/60',
        border: 'border-rose-500/50 hover:border-rose-400',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]',
        accentText: 'text-rose-400',
      };
    case 'legendary':
      return {
        name: 'Legendary (ตำนาน)',
        badge: 'bg-amber-950/80 text-amber-300 border-amber-500/60',
        border: 'border-amber-500/50 hover:border-amber-400',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        accentText: 'text-amber-400',
      };
    case 'epic':
      return {
        name: 'Epic (ยอดเยี่ยม)',
        badge: 'bg-purple-950/80 text-purple-300 border-purple-500/60',
        border: 'border-purple-500/50 hover:border-purple-400',
        glow: 'shadow-[0_0_15px_rgba(168,85,247,0.2)]',
        accentText: 'text-purple-400',
      };
    case 'rare':
      return {
        name: 'Rare (หายาก)',
        badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60',
        border: 'border-cyan-500/50 hover:border-cyan-400',
        glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]',
        accentText: 'text-cyan-400',
      };
    default:
      return {
        name: 'Common (ทั่วไป)',
        badge: 'bg-slate-800 text-slate-300 border-slate-700',
        border: 'border-slate-800 hover:border-slate-700',
        glow: '',
        accentText: 'text-slate-400',
      };
  }
};

const AVAILABLE_ICONS = [
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

export const ShopInventory: React.FC<ShopInventoryProps> = ({
  character,
  shopItems,
  onUpdateCharacter,
  onAddShopItem,
  onDeleteShopItem,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'shop' | 'inventory'>('shop');
  const [showAddItemModal, setShowAddItemModal] = useState(false);

  // New item form for admin
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState(500);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'consumable' | 'equipment'>('consumable');
  const [newItemRarity, setNewItemRarity] = useState<GachaRarity>('rare');
  const [newItemEffectType, setNewItemEffectType] = useState<'heal_hp' | 'boost_max_hp' | 'buff_stat' | 'enhance_skill' | 'custom'>('heal_hp');
  const [newItemEffectVal, setNewItemEffectVal] = useState(10);
  const [newItemHpBonus, setNewItemHpBonus] = useState(10);
  const [newItemStat, setNewItemStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [newItemSkillTarget, setNewItemSkillTarget] = useState('');
  const [newItemIcon, setNewItemIcon] = useState('HeartPulse');

  // Quick preset templates for shopkeeper
  const PRESET_TEMPLATES = [
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
      label: 'บัวหิมะสวรรค์ · ฟื้นเลือด +20 HP',
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
    {
      label: 'ดาบแสงดาว · STR +12',
      name: 'ดาบแสงดาวประกายฟ้า (Starlight Saber)',
      category: 'equipment' as const,
      rarity: 'epic' as const,
      price: 2500,
      effectType: 'buff_stat' as const,
      targetStat: 'strength' as const,
      effectVal: 12,
      hpBonus: 0,
      icon: 'Sword',
      desc: 'ดาบที่ส่องแสงระยิบระยับ เพิ่มพละกำลัง +12 หน่วย',
    },
  ];

  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setNewItemName(preset.name);
    setNewItemCategory(preset.category);
    setNewItemRarity(preset.rarity);
    setNewItemPrice(preset.price);
    setNewItemEffectType(preset.effectType);
    setNewItemEffectVal(preset.effectVal);
    setNewItemHpBonus(preset.hpBonus || preset.effectVal);
    setNewItemIcon(preset.icon);
    setNewItemDesc(preset.desc);
    if ('targetStat' in preset && preset.targetStat) {
      setNewItemStat(preset.targetStat);
    }
  };

  // Buy Item handler
  const handleBuyItem = (item: Item) => {
    if (character.coins < item.price) {
      alert('เหรียญไม่เพียงพอ! กรุณาสะสมเหรียญหรือให้ Admin เพิ่มเหรียญให้');
      return;
    }

    const newCoins = character.coins - item.price;
    const existingIndex = (character.inventory || []).findIndex(i => i.id === item.id && !i.isEquipped);
    let updatedInventory: InventoryItem[] = [...(character.inventory || [])];

    if (existingIndex > -1 && item.category === 'consumable') {
      updatedInventory[existingIndex] = {
        ...updatedInventory[existingIndex],
        quantity: updatedInventory[existingIndex].quantity + 1,
      };
    } else {
      updatedInventory.push({
        ...item,
        instanceId: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        quantity: 1,
        isEquipped: false,
      });
    }

    onUpdateCharacter({
      ...character,
      coins: newCoins,
      inventory: updatedInventory,
      notifications: [
        {
          id: `notif-buy-${Date.now()}`,
          title: "ซื้อไอเทมสำเร็จ",
          message: `คุณได้ซื้อ "${item.name}" ในราคา ${item.price.toLocaleString()} Coins เรียบร้อยแล้ว`,
          timestamp: Date.now(),
          read: false,
          type: "system",
        },
        ...(character.notifications || []),
      ],
    });

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 }
    });
  };

  // Use Item handler
  const handleUseItem = async (invItem: InventoryItem) => {
    let updatedChar = { ...character };
    let effectMessage = '';

    const isMaxHpBoost = 
      invItem.effectType === 'boost_max_hp' ||
      invItem.id.includes('maxhp') || 
      invItem.name.includes('ทองคำ') || 
      invItem.name.includes('Max HP') ||
      invItem.name.includes('หยาดโลหิต') ||
      invItem.name.includes('ชีพจร');

    if (isMaxHpBoost) {
      const healAmount = invItem.effectValue || invItem.hpBonus || 5;
      updatedChar.consumedMaxHpBonus = (updatedChar.consumedMaxHpBonus || 0) + healAmount;
      updatedChar = syncCharacterHealth(updatedChar);
      updatedChar.hp = Math.min(updatedChar.maxHp, (updatedChar.hp || 20) + healAmount);
      effectMessage = `ขยายค่า Max HP สูงสุดถาวร +${healAmount} หน่วย (ปัจจุบัน ${updatedChar.hp}/${updatedChar.maxHp} HP)`;
    } else if (invItem.effectType === 'heal_hp') {
      const healAmount = invItem.effectValue || invItem.hpBonus || 10;
      const currentHp = updatedChar.hp || 0;
      const maxHp = updatedChar.maxHp || 20;

      if (currentHp >= maxHp) {
        alert(`พลังชีวิตเต็มอยู่แล้ว (${currentHp}/${maxHp} HP) ยังไม่จำเป็นต้องฟื้นฟู`);
        return;
      }

      const newHp = Math.min(maxHp, currentHp + healAmount);
      const actualHealed = newHp - currentHp;
      updatedChar.hp = newHp;
      effectMessage = `ฟื้นฟูเลือด HP +${actualHealed} หน่วย (ปัจจุบัน ${newHp}/${maxHp} HP)`;
    } else if (invItem.effectType === 'buff_stat' && invItem.targetStat && invItem.effectValue) {
      const statName = invItem.targetStat;
      const amount = invItem.effectValue;
      updatedChar.stats = {
        ...updatedChar.stats,
        [statName]: (updatedChar.stats[statName] || 0) + amount,
      };
      // Stat boost also recalculates HP via pair formula
      updatedChar = syncCharacterHealth(updatedChar);
      effectMessage = `เพิ่มค่าสเตตัส ${statName.toUpperCase()} +${amount} หน่วยถาวร`;
    } else {
      effectMessage = `ใช้งาน "${invItem.name}" เรียบร้อยแล้ว`;
    }

    // Consume exactly the clicked inventory entry. Older records may not have instanceId,
    // so fall back to the item id instead of silently leaving the item unchanged.
    const currentInventory = [...(character.inventory || [])];
    const itemIndex = currentInventory.findIndex(item =>
      invItem.instanceId && item.instanceId
        ? item.instanceId === invItem.instanceId
        : item.id === invItem.id
    );

    if (itemIndex === -1) {
      alert('ไม่พบไอเทมชิ้นนี้ในกระเป๋า กรุณารีเฟรชแล้วลองใหม่');
      return;
    }

    const currentItem = currentInventory[itemIndex];
    const currentQuantity = Math.max(1, Number(currentItem.quantity) || 1);
    if (currentQuantity > 1) {
      currentInventory[itemIndex] = {
        ...currentItem,
        quantity: currentQuantity - 1,
      };
    } else {
      currentInventory.splice(itemIndex, 1);
    }
    updatedChar.inventory = currentInventory;

    updatedChar.notifications = [
      {
        id: `notif-use-${Date.now()}`,
        title: "ใช้งานไอเทม",
        message: `คุณได้ใช้ "${invItem.name}": ${effectMessage}`,
        timestamp: Date.now(),
        read: false,
        type: "system",
      },
      ...(updatedChar.notifications || []),
    ];

    try {
      const saved = await onUpdateCharacter(updatedChar);
      if (saved === false) return;
    } catch (error) {
      console.error('Failed to save item use:', error);
      alert('ใช้ไอเทมแล้ว แต่บันทึกลงฐานข้อมูลไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่');
      return;
    }
    alert(`ใช้งานสำเร็จ! ${effectMessage}`);
  };

  // Toggle Equip Equipment
  const handleToggleEquip = (invItem: InventoryItem) => {
    const isEquipping = !invItem.isEquipped;
    const updatedInventory = (character.inventory || []).map(item => {
      if (item.instanceId === invItem.instanceId) {
        return { ...item, isEquipped: isEquipping };
      }
      return item;
    });

    let updatedChar: CharacterProfile = {
      ...character,
      inventory: updatedInventory,
      notifications: [
        {
          id: `notif-equip-${Date.now()}`,
          title: isEquipping ? "สวมใส่อุปกรณ์" : "ถอดอุปกรณ์",
          message: isEquipping 
            ? `คุณได้สวมใส่ "${invItem.name}"${invItem.hpBonus ? ` (+${invItem.hpBonus} Max HP)` : ''}` 
            : `คุณได้ปลด "${invItem.name}" ออกจากตัว`,
          timestamp: Date.now(),
          read: false,
          type: "system",
        },
        ...(character.notifications || []),
      ],
    };

    // Synchronize health so equipment HP bonus immediately takes effect
    updatedChar = syncCharacterHealth(updatedChar);
    onUpdateCharacter(updatedChar);
  };

  // Admin create new item in shop
  const handleAdminSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !onAddShopItem) return;

    const created: Item = {
      id: `item-${Date.now()}`,
      name: newItemName.trim(),
      price: Math.max(1, newItemPrice),
      description: newItemDesc.trim() || 'ไอเทมพิเศษที่ลงทะเบียนโดยผู้ดูแลระบบ Star Stream',
      category: newItemCategory,
      rarity: newItemRarity,
      icon: newItemIcon,
      effectType: newItemEffectType,
      effectValue: newItemEffectVal,
      hpBonus: newItemEffectType === 'heal_hp' || newItemEffectType === 'boost_max_hp' || newItemCategory === 'equipment' ? (newItemHpBonus || newItemEffectVal) : undefined,
      targetStat: newItemEffectType === 'buff_stat' ? newItemStat : undefined,
      skillEnhanceTarget: newItemEffectType === 'enhance_skill' ? newItemSkillTarget : undefined,
      usableByPlayers: true,
      equipped: false,
    };

    try {
      await onAddShopItem(created);
    } catch (error) {
      console.error('Failed to save shop item:', error);
      alert('บันทึกไอเทมลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      return;
    }
    setShowAddItemModal(false);
    setNewItemName('');
    setNewItemDesc('');
    alert(`เพิ่มไอเทม "${created.name}" ลงร้านค้าเรียบร้อยแล้ว!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-3xl border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            id="tab-shop"
            onClick={() => setActiveTab('shop')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'shop'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            ร้านค้าดวงดาว (Shop)
          </button>
          <button
            id="tab-inventory"
            onClick={() => setActiveTab('inventory')}
            className={`px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Package className="w-4 h-4" />
            กระเป๋าเก็บของ (Inventory)
            <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-950 text-cyan-300 text-[10px] font-mono">
              {character.inventory?.length || 0}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-[0_0_10px_rgba(245,158,11,0.15)]">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>{character.coins.toLocaleString()} Coins</span>
          </div>

          {isAdmin && activeTab === 'shop' && (
            <button
              id="btn-admin-add-item"
              onClick={() => setShowAddItemModal(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + เพิ่มของในร้านค้า (Admin)
            </button>
          )}
        </div>
      </div>

      {/* SHOP VIEW */}
      {activeTab === 'shop' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-cyan-400" />
              สินค้าในร้านค้าดวงดาว ({shopItems.length} ชิ้น)
            </h2>
            <span className="text-xs text-slate-400">
              โอสถฟื้นฟูเลือด • ยาขยาย Max HP • อุปกรณ์สวมใส่
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shopItems.map(item => {
              const rarityInfo = getRarityBadge(item.rarity);
              const isMaxHpBooster = item.effectType === 'boost_max_hp' || item.name.includes('ทองคำ') || item.name.includes('Max HP') || item.name.includes('หยาดโลหิต');
              const isHealHp = item.effectType === 'heal_hp';

              return (
                <div
                  key={item.id}
                  className={`bg-slate-900/90 rounded-3xl p-5 border transition-all flex flex-col justify-between space-y-4 shadow-xl ${rarityInfo.border} ${rarityInfo.glow}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 shadow-inner">
                          {renderItemIcon(item.icon, item.category, item.effectType, "w-5 h-5")}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${rarityInfo.badge}`}>
                              {item.rarity || 'common'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              item.category === 'equipment'
                                ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                            }`}>
                              {item.category === 'equipment' ? 'อุปกรณ์' : 'ไอเทมใช้งาน'}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white mt-1 leading-snug">
                            {item.name}
                          </h3>
                        </div>
                      </div>

                      {isAdmin && onDeleteShopItem && (
                        <button
                          onClick={() => {
                            if (confirm(`ต้องการลบ "${item.name}" ออกจากร้านค้าใช่หรือไม่?`)) {
                              onDeleteShopItem(item.id);
                            }
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="ลบไอเทมออกจากร้านค้า"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Effect Badges */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {isMaxHpBooster && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[11px] font-bold">
                          <Heart className="w-3.5 h-3.5 text-rose-400" />
                          ขยาย Max HP ถาวร +{item.effectValue || item.hpBonus || 5} หน่วย
                        </span>
                      )}
                      {isHealHp && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold">
                          <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                          ฟื้นฟูเลือด HP +{item.effectValue || item.hpBonus || 10} หน่วย
                        </span>
                      )}
                      {item.category === 'equipment' && item.hpBonus && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/70 border border-blue-500/50 text-blue-300 text-[11px] font-bold">
                          <Shield className="w-3.5 h-3.5 text-blue-400" />
                          โบนัส Max HP +{item.hpBonus} หน่วยเมื่อสวมใส่
                        </span>
                      )}
                      {item.targetStat && item.effectValue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold">
                          +{item.effectValue} {item.targetStat.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-amber-400 font-black text-sm">
                      <Coins className="w-4 h-4" />
                      <span>{item.price.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 font-normal">Coins</span>
                    </div>

                    <button
                      id={`btn-buy-${item.id}`}
                      onClick={() => handleBuyItem(item)}
                      disabled={character.coins < item.price}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                        character.coins >= item.price
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {character.coins >= item.price ? 'ซื้อไอเทม' : 'เหรียญไม่พอ'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INVENTORY VIEW */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              ไอเทมในกระเป๋าของคุณ ({character.inventory?.length || 0} ชิ้น)
            </h2>
          </div>

          {(!character.inventory || character.inventory.length === 0) ? (
            <div className="text-center py-16 bg-slate-900/60 rounded-3xl border border-slate-800">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">ยังไม่มีไอเทมใดๆ ในกระเป๋า</p>
              <button
                onClick={() => setActiveTab('shop')}
                className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
              >
                ไปที่ร้านค้าเพื่อซื้อของ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {character.inventory.map(invItem => {
                const rarityInfo = getRarityBadge(invItem.rarity);
                const isMaxHpBooster = invItem.effectType === 'boost_max_hp' || invItem.name.includes('ทองคำ') || invItem.name.includes('Max HP') || invItem.name.includes('หยาดโลหิต');
                const isHealHp = invItem.effectType === 'heal_hp';

                return (
                  <div
                    key={invItem.instanceId}
                    className={`rounded-3xl p-5 border transition-all flex flex-col justify-between space-y-4 shadow-xl ${
                      invItem.isEquipped
                        ? 'bg-slate-900/95 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          {renderItemIcon(invItem.icon, invItem.category, invItem.effectType, "w-5 h-5")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${rarityInfo.badge}`}>
                              {invItem.rarity || 'common'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              invItem.category === 'equipment'
                                ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                            }`}>
                              {invItem.category === 'equipment' ? 'อุปกรณ์' : 'ไอเทมใช้งาน'}
                            </span>
                            {invItem.quantity > 1 && (
                              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/60">
                                x{invItem.quantity}
                              </span>
                            )}
                            {invItem.isEquipped && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                                สวมใส่อยู่
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-white mt-1 leading-snug truncate">
                            {invItem.name}
                          </h3>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                        {invItem.description}
                      </p>

                      {/* Badges in inventory */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isMaxHpBooster && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[11px] font-bold">
                            <Heart className="w-3.5 h-3.5 text-rose-400" />
                            ขยาย Max HP ถาวร +{invItem.effectValue || invItem.hpBonus || 5} หน่วย
                          </span>
                        )}
                        {isHealHp && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold">
                            <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                            ฟื้นฟูเลือด HP +{invItem.effectValue || invItem.hpBonus || 10} หน่วย
                          </span>
                        )}
                        {invItem.category === 'equipment' && invItem.hpBonus && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/70 border border-blue-500/50 text-blue-300 text-[11px] font-bold">
                            <Shield className="w-3.5 h-3.5 text-blue-400" />
                            โบนัส Max HP +{invItem.hpBonus} หน่วยเมื่อใส่
                          </span>
                        )}
                        {invItem.targetStat && invItem.effectValue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold">
                            +{invItem.effectValue} {invItem.targetStat.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {invItem.category === 'equipment'
                          ? (invItem.isEquipped ? 'ติดตั้งอยู่ · กำลังมอบพลัง' : 'ยังไม่ได้ใส่')
                          : 'พร้อมใช้งาน'}
                      </span>
                      <div className="flex items-center gap-2">
                        {invItem.category === 'equipment' ? (
                          <button
                            id={`btn-equip-${invItem.instanceId}`}
                            onClick={() => handleToggleEquip(invItem)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                              invItem.isEquipped
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow shadow-cyan-900/40'
                            }`}
                          >
                            {invItem.isEquipped ? 'ถอดออก' : 'สวมใส่'}
                          </button>
                        ) : (
                          <button
                            id={`btn-use-${invItem.instanceId}`}
                            onClick={() => handleUseItem(invItem)}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow shadow-emerald-900/30 transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            กดใช้งาน
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADMIN MODAL: Add New Shop Item (Redesigned & Prettier) */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl max-w-4xl w-full shadow-[0_0_50px_rgba(245,158,11,0.2)] flex flex-col my-4 max-h-[92vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-amber-900/40 bg-slate-900/90 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                    DOKKAEBI COMMERCE PORTAL
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">STAR STREAM COMMERCE</span>
                </div>
                <h3 className="text-lg font-black text-white flex items-center gap-2 mt-1">
                  <Plus className="w-5 h-5 text-amber-400" />
                  ลงทะเบียนสินค้าใหม่ในร้านค้า (Admin Shopkeeper)
                </h3>
              </div>
              <button
                onClick={() => setShowAddItemModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                        ลบ
              </button>
            </div>

            {/* Quick Templates Bar */}
            <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800/80">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-thin">
                <span className="text-amber-400 font-bold shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  เทมเพลตด่วน:
                </span>
                {PRESET_TEMPLATES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-amber-950/50 hover:border-amber-500/50 border border-slate-800 text-slate-200 hover:text-amber-300 font-medium whitespace-nowrap transition-all cursor-pointer text-[11px]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body: 2 Columns */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
              
              {/* Left Column: Form Fields */}
              <form id="admin-shop-item-form" onSubmit={handleAdminSubmitItem} className="lg:col-span-7 space-y-4">
                
                {/* Item Name */}
                <div>
                  <label className="text-slate-200 font-bold block mb-1">
                    ชื่อไอเทม / โอสถ *
                  </label>
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="เช่น โอสถสมานแผลดาราทมิฬ, เกราะอกเกล็ดมังกร..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-amber-500 outline-none transition-colors"
                  />
                </div>

                {/* Category & Rarity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-200 font-bold block mb-1">หมวดหมู่ไอเทม</label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setNewItemCategory('consumable')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          newItemCategory === 'consumable'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ไอเทมใช้งาน
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewItemCategory('equipment')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          newItemCategory === 'equipment'
                            ? 'bg-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        อุปกรณ์
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-200 font-bold block mb-1">ระดับความหายาก (Rarity)</label>
                    <select
                      value={newItemRarity}
                      onChange={(e) => setNewItemRarity(e.target.value as GachaRarity)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold outline-none cursor-pointer focus:border-amber-500"
                    >
                      <option value="common">Common (ทั่วไป)</option>
                      <option value="rare">Rare (หายาก)</option>
                      <option value="epic">Epic (ยอดเยี่ยม)</option>
                      <option value="legendary">Legendary (ตำนาน)</option>
                      <option value="mythic">Mythic (มายาสงคราม)</option>
                    </select>
                  </div>
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-200 font-bold">ราคาจำหน่าย (Coins) *</label>
                    <div className="flex items-center gap-1">
                      {[+100, +500, +1000, +3000].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => setNewItemPrice(prev => Math.max(1, prev + inc))}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-mono cursor-pointer"
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 font-mono font-bold text-sm outline-none focus:border-amber-500"
                    />
                    <Coins className="w-4 h-4 text-amber-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Effect Type Cards */}
                <div>
                  <label className="text-slate-200 font-bold block mb-1.5">
                    คุณสมบัติ / เอฟเฟกต์ของไอเทม
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemEffectType('heal_hp');
                        setNewItemHpBonus(10);
                        setNewItemIcon('HeartPulse');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        newItemEffectType === 'heal_hp'
                          ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1 text-white">
                        <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                        ฟื้นฟูเลือด HP
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">ฮีลเลือดปัจจุบัน</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewItemEffectType('boost_max_hp');
                        setNewItemHpBonus(5);
                        setNewItemIcon('Heart');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        newItemEffectType === 'boost_max_hp'
                          ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1 text-white">
                        <Heart className="w-3.5 h-3.5 text-rose-400" />
                        ขยาย Max HP ถาวร
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">เพิ่มขีดจำกัดเลือด</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewItemEffectType('buff_stat');
                        setNewItemIcon(newItemCategory === 'equipment' ? 'Shield' : 'Sparkles');
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        newItemEffectType === 'buff_stat'
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1 text-white">
                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                        เพิ่มสเตตัส / HP
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">STR, DUR, MAG...</p>
                    </button>
                  </div>
                </div>

                {/* Dynamic Value Settings for Health / Stats */}
                {(newItemEffectType === 'heal_hp' || newItemEffectType === 'boost_max_hp') && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-rose-300 font-bold flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-rose-400" />
                        {newItemEffectType === 'boost_max_hp' ? 'ขยายค่า Max HP ถาวร (+HP)' : 'ปริมาณการฟื้นฟูเลือด (+HP)'}
                      </label>
                      <div className="flex items-center gap-1">
                        {(newItemEffectType === 'boost_max_hp' ? [2, 5, 10, 15] : [5, 10, 15, 20, 50]).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setNewItemEffectVal(v);
                              setNewItemHpBonus(v);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[10px] font-bold cursor-pointer"
                          >
                            +{v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={newItemEffectVal}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setNewItemEffectVal(val);
                        setNewItemHpBonus(val);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-rose-700/60 text-rose-300 font-mono font-bold text-sm outline-none focus:border-rose-500"
                    />
                    <p className="text-[11px] text-rose-400/80">
                      {newItemEffectType === 'boost_max_hp'
                        ? 'เมื่อผู้เล่นดื่มโอสถนี้ จะเพิ่มหลอดเลือด Max HP สูงสุดอย่างถาวรทันที'
                        : 'เมื่อผู้เล่นดื่มโอสถนี้ จะฟื้นฟูพลังชีวิตปัจจุบันตามจำนวนที่กำหนด'}
                    </p>
                  </div>
                )}

                {/* Equipment / Stat Settings */}
                {newItemEffectType === 'buff_stat' && (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 font-bold block mb-1">สเตตัสเป้าหมาย</label>
                        <select
                          value={newItemStat}
                          onChange={(e) => setNewItemStat(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none cursor-pointer"
                        >
                          <option value="strength">พละกำลัง (Strength)</option>
                          <option value="durability">ความทนทาน (Durability)</option>
                          <option value="agility">ความว่องไว (Agility)</option>
                          <option value="magic">พลังเวท (Magic)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-300 font-bold block mb-1">ค่าสเตตัสที่เพิ่ม (+)</label>
                        <input
                          type="number"
                          value={newItemEffectVal}
                          onChange={(e) => setNewItemEffectVal(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    {newItemCategory === 'equipment' && (
                      <div className="pt-2 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-blue-300 font-bold flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-blue-400" />
                            โบนัส Max HP เมื่อสวมใส่ (+HP)
                          </label>
                          <div className="flex items-center gap-1">
                            {[4, 6, 8, 10, 15].map((hp) => (
                              <button
                                key={hp}
                                type="button"
                                onClick={() => setNewItemHpBonus(hp)}
                                className="px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 text-[10px] cursor-pointer"
                              >
                                +{hp}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={newItemHpBonus}
                          onChange={(e) => setNewItemHpBonus(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-blue-300 font-mono font-bold outline-none focus:border-blue-500"
                          placeholder="เช่น 8 (เพิ่มเลือดทันทีที่ใส่)"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          เมื่อผู้เล่นสวมใส่อุปกรณ์นี้ หลอด Max HP จะเพิ่มขึ้นตามค่าที่กำหนด และจะลดลงเมื่อถอดออก
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Icon Picker */}
                <div>
                  <label className="text-slate-200 font-bold block mb-1.5">
                    เลือกสัญลักษณ์ไอคอน (Icon)
                  </label>
                  <div className="grid grid-cols-6 gap-1.5 p-2 rounded-2xl bg-slate-950 border border-slate-800">
                    {AVAILABLE_ICONS.map((ic) => {
                      const IconComp = ic.icon;
                      const isSelected = newItemIcon === ic.id;
                      return (
                        <button
                          key={ic.id}
                          type="button"
                          onClick={() => setNewItemIcon(ic.id)}
                          className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow'
                              : 'hover:bg-slate-900 border border-transparent text-slate-400 hover:text-white'
                          }`}
                          title={ic.name}
                        >
                          <IconComp className="w-5 h-5" />
                          <span className="text-[9px] truncate max-w-full">{ic.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-slate-200 font-bold block mb-1">
                    คำอธิบายสรรพคุณ & เรื่องเล่า (Description)
                  </label>
                  <textarea
                    rows={2}
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    placeholder="เขียนสรรพคุณ เรื่องเล่า หรือความสามารถในการเสริมพลังชีวิต..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:border-amber-500 resize-none transition-colors"
                  />
                </div>
              </form>

              {/* Right Column: Live Hologram Preview Card */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-950/60 p-5 rounded-3xl border border-slate-800/80">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-slate-400 font-bold text-[11px] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      พรีวิวหน้าตาสินค้าในร้านค้าจริง
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">LIVE PREVIEW</span>
                  </div>

                  {/* Simulated Shop Card */}
                  <div className="mt-4">
                    {(() => {
                      const rarityInfo = getRarityBadge(newItemRarity);
                      return (
                        <div className={`bg-slate-900 rounded-3xl p-5 border transition-all flex flex-col justify-between space-y-4 shadow-2xl ${rarityInfo.border} ${rarityInfo.glow}`}>
                          <div>
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 shadow-inner">
                                {renderItemIcon(newItemIcon, newItemCategory, newItemEffectType, "w-6 h-6")}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${rarityInfo.badge}`}>
                                    {newItemRarity}
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                    newItemCategory === 'equipment'
                                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                  }`}>
                                    {newItemCategory === 'equipment' ? 'อุปกรณ์' : 'ไอเทมใช้งาน'}
                                  </span>
                                </div>
                                <h4 className="text-sm font-black text-white mt-1 leading-snug">
                                  {newItemName || 'ชื่อไอเทมตัวอย่าง'}
                                </h4>
                              </div>
                            </div>

                            <p className="text-xs text-slate-300 mt-3 leading-relaxed min-h-[38px]">
                              {newItemDesc || 'คำอธิบายสรรพคุณสินค้าจะปรากฏที่นี่...'}
                            </p>

                            {/* Live Effect Badges */}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {newItemEffectType === 'boost_max_hp' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-300 text-[11px] font-bold">
                                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                                  ขยาย Max HP ถาวร +{newItemEffectVal} หน่วย
                                </span>
                              )}
                              {newItemEffectType === 'heal_hp' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[11px] font-bold">
                                  <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                                  ฟื้นฟูเลือด HP +{newItemEffectVal} หน่วย
                                </span>
                              )}
                              {newItemCategory === 'equipment' && newItemHpBonus > 0 && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-500/60 text-blue-300 text-[11px] font-bold">
                                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                                  โบนัส Max HP +{newItemHpBonus} หน่วยเมื่อสวมใส่
                                </span>
                              )}
                              {newItemEffectType === 'buff_stat' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold">
                                  +{newItemEffectVal} {newItemStat.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-1 text-amber-400 font-black text-sm">
                              <Coins className="w-4 h-4" />
                              <span>{newItemPrice.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-400 font-normal">Coins</span>
                            </div>

                            <div className="px-3.5 py-1.5 rounded-xl bg-cyan-600/80 text-white text-xs font-bold flex items-center gap-1 opacity-90">
                              <ShoppingBag className="w-3.5 h-3.5" />
                              ซื้อไอเทม
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Dokkaebi Bureau Verification Seal */}
                  <div className="mt-4 p-3 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex items-center gap-2.5">
                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-[11px] text-amber-300 leading-tight">
                      สินค้าที่เพิ่มจะได้รับการรับรองโดยโทแกบี และผู้เล่นทุกคนจะสามารถกดซื้อได้ทันที
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="px-4 py-2.5 text-slate-400 hover:text-white cursor-pointer font-semibold transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    form="admin-shop-item-form"
                    className="px-6 py-2.5 font-black text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.4)] cursor-pointer flex items-center gap-2 transition-transform active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    ลงทะเบียนสินค้าสู่ร้านค้า
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
