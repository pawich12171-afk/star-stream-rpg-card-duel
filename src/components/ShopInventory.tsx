import React, { useEffect, useRef, useState } from 'react';
import { CharacterProfile, Item, InventoryItem, GachaRarity, ItemPassiveEffect, MarketplaceListing, MarketplaceAuction } from '../types';
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
  Info,
  Search
} from 'lucide-react';
import confetti from '../utils/confetti';
import { syncCharacterHealth } from '../utils/healthSystem';
import { formatCoins } from '../utils/formatNumber';

interface ShopInventoryProps {
  character: CharacterProfile;
  shopItems: Item[];
  onUpdateCharacter: (updated: CharacterProfile) => void | Promise<boolean | void>;
  onAddShopItem?: (item: Item) => void | Promise<void>;
  onDeleteShopItem?: (itemId: string) => void;
  isAdmin: boolean;
  marketplaceListings?: MarketplaceListing[];
  onCreateMarketplaceListing?: (item: InventoryItem, price: number, quantity: number) => Promise<void>;
  onCancelMarketplaceListing?: (listingId: string) => Promise<void>;
  onBuyMarketplaceListing?: (listingId: string, quantity: number) => Promise<boolean>;
  allCharacters?: CharacterProfile[];
  onTransferItem?: (recipientId: string, itemInstanceId: string, quantity: number) => Promise<void>;
  marketplaceAuctions?: MarketplaceAuction[];
  onCreateMarketplaceAuction?: (item: InventoryItem, startingPrice: number, durationMs: number, quantity: number) => Promise<void>;
  onPlaceMarketplaceBid?: (auctionId: string, bid: number) => Promise<void>;
  onFinalizeMarketplaceAuction?: (auctionId: string) => Promise<void>;
  onCancelMarketplaceAuction?: (auctionId: string) => Promise<void>;
}

// Helper functions for items
const renderItemIcon = (iconName?: string, category?: string, effectType?: string, className = "w-5 h-5") => {
  // Uploaded item artwork can be stored in the icon field as a data URI or URL.
  const icon = String(iconName || '').trim();
  const isImageIcon = /^data:image\//i.test(icon) || /^https?:\/\//i.test(icon) || /^blob:/i.test(icon);
  if (isImageIcon) {
    return <img src={icon} alt="" className={className + " rounded-lg object-cover"} />;
  }
  if (iconName === 'HeartPulse' || effectType === 'heal_hp') return <HeartPulse className={className + " text-rose-400"} />;
  if (iconName === 'Heart' || effectType === 'boost_max_hp') return <Heart className={className + " text-rose-500"} />;
  if (iconName === 'Shield' || category === 'equipment') return <Shield className={className + " text-blue-400"} />;
  if (iconName === 'Sword') return <Sword className={className + " text-amber-300"} />;
  if (iconName === 'Flame') return <Flame className={className + " text-orange-400"} />;
  if (iconName === 'Flower2') return <Flower2 className={className + " text-emerald-400"} />;
  if (iconName === 'Droplets') return <Droplets className={className + " text-cyan-400"} />;
  if (iconName === 'Zap') return <Zap className={className + " text-yellow-300"} />;
  if (iconName === 'Gem') return <Gem className={className + " text-purple-400"} />;
  if (iconName === 'Scroll') return <Scroll className={className + " text-amber-200"} />;
  if (iconName === 'Crown') return <Crown className={className + " text-yellow-400"} />;
  return <Sparkles className={className + " text-amber-300"} />;
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

const getItemDetailLines = (item: Item): string[] => {
  const lines: string[] = [];
  const n = (value: unknown) => { const v = Number(value); return Number.isFinite(v) ? v : 0; };
  const add = (condition: unknown, text: string) => { if (condition) lines.push(text); };

  add(item.effectType === 'heal_hp' && n(item.effectValue) > 0, `ฟื้น HP +${n(item.effectValue)} หน่วย`);
  add(n(item.healPercent) > 0, `ฟื้น HP ${n(item.healPercent)}% ของ Max HP`);
  add(item.effectType === 'boost_max_hp' && n(item.effectValue) > 0, `เพิ่ม Max HP ถาวร +${n(item.effectValue)}`);
  add(n(item.hpBonus) > 0, `เพิ่ม Max HP +${n(item.hpBonus)}`);
  add(item.targetStat && n(item.effectValue) !== 0, `เพิ่ม ${String(item.targetStat).toUpperCase()} +${n(item.effectValue)}`);

  const statLabels: Record<string, string> = { strength: 'Strength', durability: 'Durability', agility: 'Agility', magic: 'Magic' };
  add(n(item.equipmentStrengthBonus) !== 0, `สวมใส่: Strength ${n(item.equipmentStrengthBonus) > 0 ? '+' : ''}${n(item.equipmentStrengthBonus)}`);
  add(n(item.equipmentDurabilityBonus) !== 0, `สวมใส่: Durability ${n(item.equipmentDurabilityBonus) > 0 ? '+' : ''}${n(item.equipmentDurabilityBonus)}`);
  add(n(item.equipmentAgilityBonus) !== 0, `สวมใส่: Agility ${n(item.equipmentAgilityBonus) > 0 ? '+' : ''}${n(item.equipmentAgilityBonus)}`);
  add(n(item.equipmentMagicBonus) !== 0, `สวมใส่: Magic ${n(item.equipmentMagicBonus) > 0 ? '+' : ''}${n(item.equipmentMagicBonus)}`);
  add(n(item.equipmentMaxHpBonus) !== 0, `สวมใส่: Max HP ${n(item.equipmentMaxHpBonus) > 0 ? '+' : ''}${n(item.equipmentMaxHpBonus)}`);
  add(n(item.equipmentAttackPercent) !== 0, `สวมใส่: พลังโจมตี ${n(item.equipmentAttackPercent) > 0 ? '+' : ''}${n(item.equipmentAttackPercent)}%${n(item.equipmentAttackDuration) > 0 ? ` นาน ${n(item.equipmentAttackDuration)} เทิร์น` : ''}`);
  add(n(item.equipmentDefensePercent) !== 0, `สวมใส่: พลังป้องกัน ${n(item.equipmentDefensePercent) > 0 ? '+' : ''}${n(item.equipmentDefensePercent)}%${n(item.equipmentDefenseDuration) > 0 ? ` นาน ${n(item.equipmentDefenseDuration)} เทิร์น` : ''}`);
  add(n(item.equipmentMagicPercent) !== 0, `สวมใส่: พลังเวท ${n(item.equipmentMagicPercent) > 0 ? '+' : ''}${n(item.equipmentMagicPercent)}%${n(item.equipmentMagicDuration) > 0 ? ` นาน ${n(item.equipmentMagicDuration)} เทิร์น` : ''}`);

  add(n(item.battleDamagePercent) !== 0, `เพิ่มดาเมจ ${n(item.battleDamagePercent)}%${n(item.battleDamageDuration) > 0 ? ` นาน ${n(item.battleDamageDuration)} เทิร์น` : ''}`);
  add(n(item.battleLuckMultiplier) > 1, `โชคต่อสู้ ×${n(item.battleLuckMultiplier)}${n(item.battleLuckDuration) > 0 ? ` นาน ${n(item.battleLuckDuration)} เทิร์น` : ''}`);
  add(n(item.battleCriticalChancePercent) !== 0, `โอกาสคริติคอล ${n(item.battleCriticalChancePercent)}%`);
  add(n(item.battleRepeatAttackChancePercent) !== 0, `โอกาสตีซ้ำ ${n(item.battleRepeatAttackChancePercent)}%`);
  add(n(item.battlePassiveChanceMultiplier) > 1, `โอกาสทำงาน Passive/Effect ×${n(item.battlePassiveChanceMultiplier)}`);
  add(n(item.damageReductionPercent) !== 0, `ลดความเสียหายที่ได้รับ ${n(item.damageReductionPercent)}%${n(item.damageReductionDuration) > 0 ? ` นาน ${n(item.damageReductionDuration)} เทิร์น` : ''}`);
  add(n(item.dodgeChancePercent) !== 0, `โอกาสหลบหลีก ${n(item.dodgeChancePercent)}%`);
  add(n(item.lifestealPercent) !== 0, `ดูดเลือด ${n(item.lifestealPercent)}%`);
  add(n(item.cooldownReductionPercent) !== 0, `ลดคูลดาวน์ ${n(item.cooldownReductionPercent)}%`);
  add(n(item.statusImmunityDuration) > 0, `ต้านทานสถานะผิดปกติ ${n(item.statusImmunityDuration)} เทิร์น`);
  add(n(item.stunDuration) > 0, `ทำให้เป้าหมายชะงัก ${n(item.stunDuration)} เทิร์น`);
  add(n(item.shieldPercent) > 0, `สร้างโล่ ${n(item.shieldPercent)}%${n(item.shieldDuration) > 0 ? ` นาน ${n(item.shieldDuration)} เทิร์น` : ''}`);
  add(n(item.revivePercent) > 0, `ชุบชีวิต ${n(item.revivePercent)}% ของ Max HP`);
  add(item.reviveAlly === true, 'สามารถชุบเพื่อน/สมาชิกทีมได้');
  add(item.cleanseNegative === true, 'ล้างสถานะผิดปกติด้านลบ');
  add(n(item.gachaRateMultiplier) > 1, `เพิ่มเรทกาชา ×${n(item.gachaRateMultiplier)}${item.gachaRateMinRarity ? ` สำหรับ ${item.gachaRateMinRarity} ขึ้นไป` : ''}`);

  if (item.effectType === 'enhance_skill' && (item.skillEnhanceTarget || item.skillEnhanceDesc)) {
    lines.push(`เสริมสกิล: ${item.skillEnhanceTarget || 'สกิลที่กำหนด'}${item.skillEnhanceDesc ? ` — ${item.skillEnhanceDesc}` : ''}`);
  }
  (item.passiveEffects || []).forEach(passive => {
    if (!passive) return;
    const target = passive.targetStat ? ` → ${statLabels[String(passive.targetStat)] || String(passive.targetStat)}` : '';
    const chance = n(passive.chance) > 0 && n(passive.chance) !== 100 ? ` (${n(passive.chance)}%)` : '';
    const duration = n(passive.duration) > 0 ? ` ${n(passive.duration)} เทิร์น` : '';
    const stacks = n(passive.maxStacks) > 0 ? ` สูงสุด ${n(passive.maxStacks)} สแต็ก` : '';
    lines.push(`Passive: ${passive.name || passive.kind} +${n(passive.value)}${target}${chance}${duration}${stacks}${passive.description ? ` — ${passive.description}` : ''}`);
  });

  return lines;
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
  marketplaceListings = [],
  onCreateMarketplaceListing,
  onCancelMarketplaceListing,
  onBuyMarketplaceListing,
  allCharacters = [], onTransferItem, marketplaceAuctions = [], onCreateMarketplaceAuction, onPlaceMarketplaceBid, onFinalizeMarketplaceAuction, onCancelMarketplaceAuction,
}) => {
  const [activeTab, setActiveTab] = useState<'shop' | 'inventory' | 'market'>('shop');
  const [marketSellItem, setMarketSellItem] = useState<InventoryItem | null>(null);
  const [marketSellPrice, setMarketSellPrice] = useState('');
  const [marketSellQuantity, setMarketSellQuantity] = useState('1');
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1');
  const [auctionItem, setAuctionItem] = useState<InventoryItem | null>(null);
  const [auctionPrice, setAuctionPrice] = useState('');
  const [auctionDuration, setAuctionDuration] = useState('3600000');
  const [auctionQuantity, setAuctionQuantity] = useState('1');
  const [bidValues, setBidValues] = useState<Record<string,string>>({});
  const [marketBuyingId, setMarketBuyingId] = useState<string | null>(null);
  const [marketBuyQuantity, setMarketBuyQuantity] = useState<Record<string,string>>({});
  const [marketActionBusy, setMarketActionBusy] = useState<'listing' | 'auction' | null>(null);
  const marketActionLockRef = useRef<'listing' | 'auction' | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [buyingItemId, setBuyingItemId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [editingBattleItem, setEditingBattleItem] = useState<Item | null>(null);
  const [editBattleLuckMultiplier, setEditBattleLuckMultiplier] = useState(1);
  const [editBattleLuckDuration, setEditBattleLuckDuration] = useState(1);
  const [editBattleCriticalChancePercent, setEditBattleCriticalChancePercent] = useState(0);
  const [editBattleRepeatAttackChancePercent, setEditBattleRepeatAttackChancePercent] = useState(0);
  const [editBattlePassiveChanceMultiplier, setEditBattlePassiveChanceMultiplier] = useState(1);
  const [editGachaRateMultiplier, setEditGachaRateMultiplier] = useState(1);
  const [editGachaRateMinRarity, setEditGachaRateMinRarity] = useState<GachaRarity>('rare');
  const [selectedInventoryKeys, setSelectedInventoryKeys] = useState<string[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [expandedItemDetails, setExpandedItemDetails] = useState<Record<string, boolean>>({});

  // Serialize purchases so rapid clicks cannot calculate from the same stale character.
  const characterRef = useRef(character);
  characterRef.current = character;
  const purchaseQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Synchronous lock: reject rapid clicks before React has time to re-render.
  const purchaseLockRef = useRef(false);

  // New item form for admin
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState(500);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'consumable' | 'equipment'>('consumable');
  const [newItemRarity, setNewItemRarity] = useState<GachaRarity>('rare');
  const [newItemEffectType, setNewItemEffectType] = useState<'heal_hp' | 'boost_max_hp' | 'buff_stat' | 'enhance_skill' | 'custom'>('heal_hp');
  const [newItemEffectVal, setNewItemEffectVal] = useState(10);
  const [newItemHealPercent, setNewItemHealPercent] = useState(0);
  const [newItemBattleDamagePercent, setNewItemBattleDamagePercent] = useState(0);
  const [newItemBattleDamageDuration, setNewItemBattleDamageDuration] = useState(1);
  const [newItemBattleLuckMultiplier, setNewItemBattleLuckMultiplier] = useState(1);
  const [newItemBattleLuckDuration, setNewItemBattleLuckDuration] = useState(1);
  const [newItemBattleCriticalChancePercent, setNewItemBattleCriticalChancePercent] = useState(0);
  const [newItemBattleRepeatAttackChancePercent, setNewItemBattleRepeatAttackChancePercent] = useState(0);
  const [newItemBattlePassiveChanceMultiplier, setNewItemBattlePassiveChanceMultiplier] = useState(1);
  const [newItemGachaRateMultiplier, setNewItemGachaRateMultiplier] = useState(1);
  const [newItemGachaRateMinRarity, setNewItemGachaRateMinRarity] = useState<GachaRarity>('rare');
  const [newItemHpBonus, setNewItemHpBonus] = useState(10);
  const [newItemStat, setNewItemStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [newItemSkillTarget, setNewItemSkillTarget] = useState('');
  const [newItemIcon, setNewItemIcon] = useState('HeartPulse');
  const [newItemPassives, setNewItemPassives] = useState<ItemPassiveEffect[]>([]);
  const [newPassiveName, setNewPassiveName] = useState('Passive ติดตัว');
  const [newPassiveTrigger, setNewPassiveTrigger] = useState<ItemPassiveEffect['trigger']>('attack');
  const [newPassiveKind, setNewPassiveKind] = useState<ItemPassiveEffect['kind']>('stack');
  const [newPassiveValue, setNewPassiveValue] = useState(1);
  const [newPassiveMaxStacks, setNewPassiveMaxStacks] = useState(6);
  const [newPassiveChance, setNewPassiveChance] = useState(100);
  const [newPassiveStackKey, setNewPassiveStackKey] = useState('flower');
  const [newPassiveTargetStat, setNewPassiveTargetStat] = useState<'strength' | 'durability' | 'agility' | 'magic'>('strength');
  const [newPassiveDuration, setNewPassiveDuration] = useState(1);

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
    setNewItemHealPercent(0);
    setNewItemBattleDamagePercent(0);
    setNewItemBattleDamageDuration(1);
    setNewItemGachaRateMultiplier(1);
    setNewItemHpBonus(preset.hpBonus || preset.effectVal);
    setNewItemIcon(preset.icon);
    setNewItemDesc(preset.desc);
    if ('targetStat' in preset && preset.targetStat) {
      setNewItemStat(preset.targetStat);
    }
  };

  // Buy Item handler
  const handleBuyItem = (item: Item) => {
    // Lock immediately on the first click. Do not queue duplicate clicks.
    if (purchaseLockRef.current) return;
    purchaseLockRef.current = true;
    setBuyingItemId(item.id);

    purchaseQueueRef.current = purchaseQueueRef.current.then(async () => {
      const currentCharacter = characterRef.current;
      const coins = Number(currentCharacter.coins);
      const price = Number(item.price);
      if (!Number.isFinite(price) || price <= 0) {
        alert('ไอเทมนี้มีราคาไม่ถูกต้อง กรุณาแจ้ง Admin');
        purchaseLockRef.current = false;
        setBuyingItemId(null);
        return;
      }
      if (!Number.isFinite(coins) || coins < price) {
        alert('เหรียญไม่เพียงพอ! กรุณาสะสมเหรียญหรือให้ Admin เพิ่มเหรียญให้');
        purchaseLockRef.current = false;
        setBuyingItemId(null);
        return;
      }

      const newCoins = coins - price;
      const currentInventory: InventoryItem[] = stackInventory((currentCharacter.inventory || []).map((invItem, index) => ({
        ...invItem,
        // Legacy inventory records may not have an instanceId. Give them a stable fallback
        // so React cannot reuse one card for another item after a purchase.
        instanceId: invItem.instanceId || `legacy-${invItem.id}-${index}`,
      })));
      const purchaseKey = [
        String(item.name || '').trim().toLocaleLowerCase(),
        String(item.category || ''),
        String(item.effectType || ''),
        String(item.targetStat || ''),
        String(item.effectValue ?? ''),
        String(item.hpBonus ?? ''),
        String(item.gachaRateMultiplier ?? ''),
        String(item.gachaRateMinRarity ?? 'rare'),
      ].join('|');
      const existingIndex = currentInventory.findIndex(i => [
        String(i.name || '').trim().toLocaleLowerCase(),
        String(i.category || ''),
        String(i.effectType || ''),
        String(i.targetStat || ''),
        String(i.effectValue ?? ''),
        String(i.hpBonus ?? ''),
        String(i.gachaRateMultiplier ?? ''),
      String(i.gachaRateMinRarity ?? 'rare'),
      ].join('|') === purchaseKey);
      const updatedInventory: InventoryItem[] = [...currentInventory];

      if (existingIndex > -1) {
        const old = updatedInventory[existingIndex];
        const nextQuantity = (Number(old.quantity) || 0) + 1;
        const oldEquipped = Math.max(0, Number(old.equippedQuantity) || (old.isEquipped ? 1 : 0));
        updatedInventory[existingIndex] = {
          ...old,
          quantity: nextQuantity,
          equippedQuantity: old.category === 'equipment' ? Math.min(oldEquipped, nextQuantity) : old.equippedQuantity,
          isEquipped: old.category === 'equipment' ? oldEquipped > 0 : old.isEquipped,
        };
      } else {
        updatedInventory.push({
          ...item,
          instanceId: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          quantity: 1,
          isEquipped: false,
          equippedQuantity: 0,
        });
      }

      // Buying a new gacha-rate potion starts a fresh boost slot.
      // Clear any stale one-shot multiplier left by an older consumed potion,
      // so purchasing ×40 can never leave an old ×100 displayed in Gacha.
      const isGachaBoostPurchase =
        item.category === 'consumable' && Number(item.gachaRateMultiplier) > 1;

      const updatedCharacter: CharacterProfile = {
        ...currentCharacter,
        coins: newCoins,
        inventory: updatedInventory,
        ...(isGachaBoostPurchase
          ? {
              pendingGachaRateMultiplier: 1,
              pendingGachaRateMinRarity: 'rare' as GachaRarity,
            }
          : {}),
        notifications: [
          {
            id: `notif-buy-${Date.now()}`,
            title: "ซื้อไอเทมสำเร็จ",
            message: `คุณได้ซื้อ "${item.name}" ในราคา ${formatCoins(item.price)} Coins เรียบร้อยแล้ว`,
            timestamp: Date.now(),
            read: false,
            type: "system",
          },
          ...(currentCharacter.notifications || []),
        ],
      };

      // Reserve the latest result for the next queued purchase.
      characterRef.current = updatedCharacter;
      try {
        const saved = await onUpdateCharacter(updatedCharacter);
        if (saved === false) {
          characterRef.current = currentCharacter;
          return;
        }
      } catch (error) {
        characterRef.current = currentCharacter;
        console.error('Failed to save purchase:', error);
        alert('ซื้อไอเทมแล้ว แต่บันทึกไม่สำเร็จ กรุณาลองใหม่');
        return;
      } finally {
        setBuyingItemId(current => current === item.id ? null : current);
        purchaseLockRef.current = false;
      }

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    }).catch(error => {
      purchaseLockRef.current = false;
      setBuyingItemId(current => current === item.id ? null : current);
      console.error('Purchase queue failed:', error);
      alert('การซื้อไอเทมล้มเหลว กรุณาลองใหม่');
    });
  };

  const handleUpdateItemPrice = async (item: Item) => {
    if (!isAdmin || !onAddShopItem) return;
    const price = Math.floor(Number(editingPrice));
    if (!Number.isFinite(price) || price <= 0) {
      alert('ราคาต้องเป็น Coins มากกว่า 0');
      return;
    }
    try {
      await onAddShopItem({ ...item, price });
      setEditingPriceId(null);
      setEditingPrice('');
      alert(`แก้ราคา "${item.name}" เป็น ${formatCoins(price)} Coins แล้ว`);
    } catch (error) {
      console.error('Failed to update shop item price:', error);
      alert('แก้ราคาไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  // Normalize legacy duplicate records into one stack per item id.
  // This also repairs inventories created before stacked equipment was introduced.
  const stackInventory = (items: InventoryItem[]): InventoryItem[] => {
    const map = new Map<string, InventoryItem>();
    items.forEach((raw, index) => {
      const item = {
        ...raw,
        instanceId: raw.instanceId || `legacy-stack-${raw.id}-${index}`,
        quantity: Math.max(1, Number(raw.quantity) || 1),
        equippedQuantity: raw.category === 'equipment'
          ? Math.max(0, Number(raw.equippedQuantity) || (raw.isEquipped ? 1 : 0))
          : raw.equippedQuantity,
      };
      // Stack by the actual item identity shown to the player.
      // Older shop/gacha data can contain different IDs for the same item,
      // so ID alone is not enough to repair legacy inventory.
      const key = [
        String(item.name || '').trim().toLocaleLowerCase(),
        String(item.category || ''),
        String(item.effectType || ''),
        String(item.targetStat || ''),
        String(item.effectValue ?? ''),
        String(item.hpBonus ?? ''),
        String(item.gachaRateMultiplier ?? ''),
        String(item.gachaRateMinRarity ?? 'rare'),
      ].join('|');
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }
      const oldEquipped = Math.max(0, Number(existing.equippedQuantity) || (existing.isEquipped ? 1 : 0));
      const addEquipped = item.category === 'equipment'
        ? Math.max(0, Number(item.equippedQuantity) || (item.isEquipped ? 1 : 0))
        : 0;
      existing.quantity = Math.max(1, Number(existing.quantity) || 1) + item.quantity;
      if (existing.category === 'equipment') {
        existing.equippedQuantity = Math.min(existing.quantity, oldEquipped + addEquipped);
        existing.isEquipped = existing.equippedQuantity > 0;
      }
    });
    return Array.from(map.values());
  };

  const getInventoryKey = (item: InventoryItem, index: number) => item.instanceId || `legacy-${item.id}-${index}`;

  // Use the same identity as stackInventory so deleting one copy from a stack
  // never removes the entire stack (including legacy records that were merged).
  const getStackIdentity = (item: InventoryItem) => [
    String(item.name || '').trim().toLocaleLowerCase(),
    String(item.category || ''),
    String(item.effectType || ''),
    String(item.targetStat || ''),
    String(item.effectValue ?? ''),
    String(item.hpBonus ?? ''),
    String(item.gachaRateMultiplier ?? ''),
    String(item.gachaRateMinRarity ?? 'rare'),
  ].join('|');

  const removeInventoryQuantityFromList = (
    inventory: InventoryItem[],
    sourceItem: InventoryItem,
    requestedQuantity: number
  ) => {
    const quantityToRemove = Math.max(
      1,
      Math.min(Math.floor(Number(requestedQuantity) || 1), Math.max(1, Number(sourceItem.quantity) || 1))
    );
    const identity = getStackIdentity(sourceItem);
    let remainingToRemove = quantityToRemove;

    return inventory.flatMap(item => {
      if (remainingToRemove <= 0 || getStackIdentity(item) !== identity) return [item];

      const quantity = Math.max(1, Number(item.quantity) || 1);
      const remove = Math.min(quantity, remainingToRemove);
      const nextQuantity = quantity - remove;
      remainingToRemove -= remove;

      if (nextQuantity <= 0) return [];

      if (item.category === 'equipment') {
        const equipped = Math.max(
          0,
          Math.min(quantity, Number(item.equippedQuantity) || (item.isEquipped ? 1 : 0))
        );
        const nextEquipped = Math.min(equipped, nextQuantity);
        return [{
          ...item,
          quantity: nextQuantity,
          equippedQuantity: nextEquipped,
          isEquipped: nextEquipped > 0,
        }];
      }

      return [{ ...item, quantity: nextQuantity }];
    });
  };

  const removeInventoryQuantity = (sourceItem: InventoryItem, requestedQuantity: number) =>
    removeInventoryQuantityFromList(character.inventory || [], sourceItem, requestedQuantity);

  const stackedInventory = stackInventory(character.inventory || []);
  // Persist the repaired stack once so legacy duplicate records are permanently merged.
  useEffect(() => {
    const original = character.inventory || [];
    const signature = (items: InventoryItem[]) => items.map(item => [
      item.id, item.name, item.category, item.effectType, item.targetStat, item.effectValue,
      item.hpBonus, item.gachaRateMultiplier, item.quantity, item.equippedQuantity, item.isEquipped
    ].join('~')).sort().join('||');
    if (signature(original) !== signature(stackedInventory)) {
      void onUpdateCharacter({
        ...character,
        inventory: stackedInventory,
        lastUpdated: Date.now() + 1,
      });
    }
  }, [character.id, character.inventory, stackedInventory]);

  const filteredInventory = stackedInventory.filter(item => {
    const query = inventorySearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return String(item.name || '').toLocaleLowerCase().includes(query);
  });

  const toggleInventorySelection = (key: string) => setSelectedInventoryKeys(current => current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
  const clearInventorySelection = () => setSelectedInventoryKeys([]);
  const deleteSelectedInventory = async () => {
    if (!selectedInventoryKeys.length) return;
    const selectedItems = stackedInventory.filter((item, index) => selectedInventoryKeys.includes(getInventoryKey(item, index)));
    if (!selectedItems.length) {
      clearInventorySelection();
      return;
    }

    const quantities = new Map<string, number>();
    for (const item of selectedItems) {
      const total = Math.max(1, Number(item.quantity) || 1);
      const answer = window.prompt(
        total > 1
          ? `ลบ "${item.name}" กี่ชิ้น? มีทั้งหมด x${total} (ใส่ 1-${total})`
          : `ต้องการลบ "${item.name}" ออกจากกระเป๋าใช่หรือไม่? ใส่ 1 เพื่อยืนยัน`,
        '1'
      );
      if (answer === null) return;
      const quantity = Math.floor(Number(answer));
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > total) {
        alert(`จำนวนของ "${item.name}" ไม่ถูกต้อง กรุณาใส่ 1-${total}`);
        return;
      }
      quantities.set(getStackIdentity(item), quantity);
    }

    if (!confirm(`ยืนยันลบไอเทมที่เลือก ${selectedItems.length} รายการตามจำนวนที่ระบุใช่หรือไม่?`)) return;

    let remaining = [...(character.inventory || [])];
    for (const item of selectedItems) {
      const quantity = quantities.get(getStackIdentity(item)) || 1;
      remaining = removeInventoryQuantityFromList(remaining, item, quantity);
    }

    try {
      await onUpdateCharacter({ ...character, inventory: remaining, lastUpdated: Date.now() + 1 });
      clearInventorySelection();
    } catch (error) {
      console.error('Failed to delete selected inventory:', error);
      alert('ลบไอเทมไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  // Use Item handler
  const maxHpSafe = (value: number) => Math.max(1, Number(value) || 20);

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
      const flatHeal = Number(invItem.effectValue || invItem.hpBonus || 0);
      const percentHeal = Math.max(0, Math.min(100, Number(invItem.healPercent) || 0));
      const healAmount = flatHeal + Math.floor((maxHpSafe(updatedChar.maxHp || 20)) * percentHeal / 100);
      const currentHp = updatedChar.hp || 0;
      const maxHp = updatedChar.maxHp || 20;

      if (currentHp >= maxHp) {
        alert(`พลังชีวิตเต็มอยู่แล้ว (${currentHp}/${maxHp} HP) ยังไม่จำเป็นต้องฟื้นฟู`);
        return;
      }

      const newHp = Math.min(maxHp, currentHp + healAmount);
      const actualHealed = newHp - currentHp;
      updatedChar.hp = newHp;
      effectMessage = `ฟื้นฟูเลือด HP +${actualHealed} หน่วย${percentHeal > 0 ? ` (${percentHeal}% + ${flatHeal} หน่วย)` : ''} (ปัจจุบัน ${newHp}/${maxHp} HP)`;
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

  // Stacked equipment: choose exactly how many copies to equip.
  const isAryaEquipment = (item: InventoryItem) => item.category === 'equipment' && /araya|arya/i.test(String(item.name || ''));

  const getEquippedQuantity = (item: InventoryItem) => Math.max(
    0,
    Math.min(
      Number(item.quantity) || 1,
      Number.isFinite(Number(item.equippedQuantity))
        ? Number(item.equippedQuantity)
        : (item.isEquipped ? 1 : 0)
    )
  );

  const getSpecialEquipmentType = (item: InventoryItem) => {
    const text = String(item.name || '').toLowerCase();
    const category = String(item.category || '').toLowerCase();
    const combined = text + ' ' + category;
    // Any item whose name starts with E.G.O Weapon/Gift/Suit belongs to that
    // one-slot group, e.g. "E.G.O Suit — Red Mist".
    if (/^e\.g\.o\s+weapon\b|^ego\s+weapon\b/.test(text)) return 'E.G.O Weapon';
    if (/^e\.g\.o\s+gift\b|^ego\s+gift\b/.test(text)) return 'E.G.O Gift';
    if (/^e\.g\.o\s+suit\b|^ego\s+suit\b/.test(text)) return 'E.G.O Suit';
    return null;
  };

  const getSpecialEquippedCount = (type: string) =>
    stackedInventory
      .filter(item => getSpecialEquipmentType(item) === type)
      .reduce((sum, item) => sum + getEquippedQuantity(item), 0);

  const getEquipmentStatTotal = (char: CharacterProfile = character) =>
    Math.max(0, Number(char.stats?.strength) || 0) +
    Math.max(0, Number(char.stats?.durability) || 0) +
    Math.max(0, Number(char.stats?.agility) || 0) +
    Math.max(0, Number(char.stats?.magic) || 0);

  // ช่องสวมใส่อุปกรณ์เริ่มต้น 20 ช่อง และเพิ่มทีละ 1 ช่องตามเงื่อนไขค่าสเตตเดิม
  const getEquipmentSlots = (char: CharacterProfile = character) =>
    20 + Math.max(0, Math.floor(Number(char.equipmentSlotUpgrades) || 0));

  const getNextEquipmentSlotRequirement = (char: CharacterProfile = character) => {
    const upgrades = Math.max(0, Math.floor(Number(char.equipmentSlotUpgrades) || 0));
    return Math.ceil(50 * Math.pow(1.1, upgrades));
  };

  const canEquipSpecialType = (item: InventoryItem) => {
    const type = getSpecialEquipmentType(item);
    if (!type) return true;
    const current = getEquippedQuantity(item);
    return current > 0 || getSpecialEquippedCount(type) < 1;
  };

  const getSpecialLimitLabel = (item: InventoryItem) => {
    const type = getSpecialEquipmentType(item);
    return type ? `ใส่ได้สูงสุด 1 ชิ้น • ${type} • 1/1` : null;
  };

  const getEquipmentLimitLabel = (item: InventoryItem) => {
    const special = getSpecialLimitLabel(item);
    if (special) return special;
    if (isAryaEquipment(item)) return 'ใส่ได้สูงสุด 1 ชิ้น • Arya';
    return null;
  };

  const handleUpgradeEquipmentSlot = async () => {
    const statTotal = getEquipmentStatTotal();
    const requirement = getNextEquipmentSlotRequirement();
    if (statTotal <= requirement) {
      alert(`ค่าสเตตรวมต้องมากกว่า ${requirement} จึงจะอัพช่องสวมใส่ได้\nปัจจุบัน: ${statTotal}`);
      return;
    }
    const upgrades = Math.max(0, Math.floor(Number(character.equipmentSlotUpgrades) || 0));
    const updatedChar: CharacterProfile = {
      ...character,
      equipmentSlotUpgrades: upgrades + 1,
      notifications: [
        {
          id: `notif-equip-slot-${Date.now()}`,
          title: 'เพิ่มช่องสวมใส่',
          message: `ปลดล็อกช่องสวมใส่เพิ่ม 1 ช่อง (รวม ${upgrades + 21} ช่อง)`,
          timestamp: Date.now(),
          read: false,
          type: 'system',
        },
        ...(character.notifications || []),
      ],
    };
    try {
      await onUpdateCharacter(updatedChar);
    } catch (error) {
      console.error('Failed to upgrade equipment slot:', error);
      alert('อัพช่องสวมใส่ไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleToggleEquip = (invItem: InventoryItem) => {
    const total = Math.max(1, Number(invItem.quantity) || 1);
    const current = getEquippedQuantity(invItem);
    const aryaTotal = stackedInventory
      .filter(item => isAryaEquipment(item))
      .reduce((sum, item) => sum + getEquippedQuantity(item), 0);
    const generalTotal = stackedInventory
      .filter(item => item.category === 'equipment' && !isAryaEquipment(item))
      .reduce((sum, item) => sum + getEquippedQuantity(item), 0);
    const slots = isAryaEquipment(invItem)
      ? Math.max(0, 1 - aryaTotal + current)
      : Math.max(0, getEquipmentSlots() - generalTotal + current);
    const max = Math.min(total, slots);
    const answer = window.prompt(
      `สวมใส่ "${invItem.name}" กี่อัน?\\nมีทั้งหมด ${total} อัน\\nปัจจุบันสวมใส่ ${current} อัน\\nเลือกได้ 0-${max} อัน`,
      String(current)
    );
    if (answer === null) return;
    const selected = Math.floor(Number(answer));
    if (!Number.isFinite(selected) || selected < 0 || selected > max) {
      alert(`จำนวนไม่ถูกต้อง กรุณาเลือก 0-${max} อัน`);
      return;
    }

    const updatedInventory = stackedInventory.map(item =>
      item.id === invItem.id && item.name === invItem.name
        ? { ...item, equippedQuantity: selected, isEquipped: selected > 0 }
        : item
    );

    let updatedChar: CharacterProfile = {
      ...character,
      inventory: updatedInventory,
      notifications: [
        {
          id: `notif-equip-${Date.now()}`,
          title: selected > 0 ? "สวมใส่อุปกรณ์" : "ถอดอุปกรณ์",
          message: selected > 0
            ? `คุณได้สวมใส่ "${invItem.name}" จำนวน ${selected} อัน`
            : `คุณได้ถอด "${invItem.name}" ออกทั้งหมด`,
          timestamp: Date.now(),
          read: false,
          type: "system",
        },
        ...(character.notifications || []),
      ],
    };

    updatedChar = syncCharacterHealth(updatedChar);
    onUpdateCharacter(updatedChar);
  };

  const equipmentStatTotal = getEquipmentStatTotal();
  const equipmentSlots = getEquipmentSlots();
  const nextSlotRequirement = getNextEquipmentSlotRequirement();

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
      healPercent: newItemEffectType === 'heal_hp' ? Math.max(0, Math.min(100, newItemHealPercent)) : undefined,
      battleDamagePercent: newItemCategory === 'consumable' ? Math.max(0, Math.min(1000, newItemBattleDamagePercent)) : undefined,
      battleDamageDuration: newItemCategory === 'consumable' && newItemBattleDamagePercent > 0 ? Math.max(1, Math.floor(newItemBattleDamageDuration)) : undefined,
      battleLuckMultiplier: newItemCategory === 'consumable' && newItemBattleLuckMultiplier > 1 ? Math.max(1, Math.min(20, newItemBattleLuckMultiplier)) : undefined,
      battleLuckDuration: newItemCategory === 'consumable' && newItemBattleLuckMultiplier > 1 ? Math.min(10, Math.max(1, Math.floor(newItemBattleLuckDuration))) : undefined,
      battleCriticalChancePercent: newItemCategory === 'consumable' && newItemBattleCriticalChancePercent > 0 ? Math.max(0, Math.min(100, newItemBattleCriticalChancePercent)) : undefined,
      battleRepeatAttackChancePercent: newItemCategory === 'consumable' && newItemBattleRepeatAttackChancePercent > 0 ? Math.max(0, Math.min(100, newItemBattleRepeatAttackChancePercent)) : undefined,
      battlePassiveChanceMultiplier: newItemCategory === 'consumable' && newItemBattlePassiveChanceMultiplier > 1 ? Math.max(1, Math.min(20, newItemBattlePassiveChanceMultiplier)) : undefined,
      gachaRateMultiplier: newItemCategory === 'consumable' && newItemGachaRateMultiplier > 1 ? Math.max(1, Math.min(1000, newItemGachaRateMultiplier)) : undefined,
      gachaRateMinRarity: newItemCategory === 'consumable' && newItemGachaRateMultiplier > 1 ? newItemGachaRateMinRarity : undefined,
      hpBonus: newItemEffectType === 'heal_hp' || newItemEffectType === 'boost_max_hp' || newItemCategory === 'equipment' ? (newItemHpBonus || newItemEffectVal) : undefined,
      targetStat: newItemEffectType === 'buff_stat' ? newItemStat : undefined,
      skillEnhanceTarget: newItemEffectType === 'enhance_skill' ? newItemSkillTarget : undefined,
      usableByPlayers: true,
      equipped: false,
      passiveEffects: newItemPassives.length ? newItemPassives : undefined,
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
    setNewItemPassives([]);
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
          <button type="button" id="tab-market" onClick={() => setActiveTab('market')} className={`px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'market' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Coins className="w-4 h-4" /> ตลาดผู้เล่น <span className="px-2 py-0.5 rounded-full bg-slate-950 text-violet-300 text-[10px]">{marketplaceListings.length}</span></button>
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
            <span>{formatCoins(character.coins)} Coins</span>
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
            {shopItems.filter(item => !item.adminOnly).map(item => {
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
                      {item.description || 'ไม่มีคำอธิบายไอเทม'}
                    </p>
                    <button type="button" className="mt-3 w-full rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/30 px-3 py-2 text-left text-xs font-black text-fuchsia-200" onClick={() => setExpandedItemDetails(prev => ({ ...prev, ['shop:' + String(item.id)]: !prev['shop:' + String(item.id)] }))}>
                      {expandedItemDetails['shop:' + String(item.id)] ? '▲ ซ่อนคุณสมบัติไอเทม' : '▼ ดูคุณสมบัติไอเทมทั้งหมด'}
                    </button>
                    {expandedItemDetails['shop:' + String(item.id)] && <div className="mt-2 rounded-2xl border border-fuchsia-500/20 bg-slate-950/70 p-3">
                      <div className="text-[11px] font-black text-fuchsia-200 mb-1">📋 คุณสมบัติทั้งหมด</div>
                      {getItemDetailLines(item).length > 0 ? <ul className="space-y-1 text-[11px] text-slate-300">{getItemDetailLines(item).map((line, i) => <li key={i} className="break-words">• {line}</li>)}</ul> : <div className="text-[11px] text-slate-500">ยังไม่ได้ระบุคุณสมบัติเพิ่มเติม</div>}
                    </div>}

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
                      {item.category === 'consumable' && Number(item.gachaRateMultiplier) > 1 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-500/50 text-purple-300 text-[11px] font-black">
                          🎰 เรทกาชา ×{Number(item.gachaRateMultiplier)}
                        </span>
                      )}
                      {item.targetStat && item.effectValue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold">
                          +{item.effectValue} {item.targetStat.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    {isAdmin && editingPriceId === item.id ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/60">
                          <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleUpdateItemPrice(item);
                              if (e.key === 'Escape') {
                                setEditingPriceId(null);
                                setEditingPrice('');
                              }
                            }}
                            className="w-full bg-transparent text-amber-300 font-black text-sm outline-none"
                            autoFocus
                          />
                          <span className="text-[10px] text-slate-400">Coins</span>
                        </div>
                        <button type="button" onClick={() => void handleUpdateItemPrice(item)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">บันทึก</button>
                        <button type="button" onClick={() => { setEditingPriceId(null); setEditingPrice(''); }} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer">ยกเลิก</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-amber-400 font-black text-sm">
                          <Coins className="w-4 h-4" />
                          <span>{formatCoins(item.price)}</span>
                          <span className="text-[10px] text-slate-400 font-normal">Coins</span>
                        </div>
                        {isAdmin && item.category === 'consumable' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBattleItem(item);
                              setEditBattleLuckMultiplier(Number(item.battleLuckMultiplier) || 1);
                              setEditBattleLuckDuration(Math.max(1, Math.floor(Number(item.battleLuckDuration) || 1)));
                              setEditBattleCriticalChancePercent(Math.max(0, Number(item.battleCriticalChancePercent) || 0));
                              setEditBattleRepeatAttackChancePercent(Math.max(0, Number(item.battleRepeatAttackChancePercent) || 0));
                              setEditBattlePassiveChanceMultiplier(Number(item.battlePassiveChanceMultiplier) || 1);
                              setEditGachaRateMultiplier(Number(item.gachaRateMultiplier) || 1);
                               setEditGachaRateMinRarity(item.gachaRateMinRarity || 'rare');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-bold cursor-pointer"
                          >
                            🍀 ตั้งค่าโชค
                          </button>
                        )}
                        {isAdmin && item.category === 'consumable' && (
                          <button type="button" onClick={() => {
                            setEditingBattleItem(item);
                            setEditGachaRateMultiplier(Math.max(1, Number(item.gachaRateMultiplier) || 1));
                             setEditGachaRateMinRarity(item.gachaRateMinRarity || 'rare');
                          }} className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/40 text-purple-300 hover:bg-purple-500/25 text-[11px] font-bold cursor-pointer">
                            🎰 ตั้งค่าเรทกาชา
                          </button>
                        )}
                        {isAdmin && onAddShopItem && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPriceId(item.id);
                              setEditingPrice(String(item.price));
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-[11px] font-bold cursor-pointer"
                          >
                            ✏️ แก้ราคา
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      id={`btn-buy-${item.id}`}
                      type="button"
                      onClick={() => handleBuyItem(item)}
                      disabled={purchaseLockRef.current || Number(character.coins) < Number(item.price)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                        character.coins >= item.price
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {purchaseLockRef.current && buyingItemId === item.id ? 'กำลังซื้อ...' : Number(character.coins) >= Number(item.price) ? 'ซื้อไอเทม' : 'เหรียญไม่พอ'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-violet-500/20 bg-slate-900/80 p-5">
            <h2 className="text-base font-black text-white">🏪 ตลาดผู้เล่น (Player Market)</h2>
            <p className="mt-1 text-xs text-slate-400">ผู้เล่นนำของจากกระเป๋ามาขายให้ผู้เล่นคนอื่นได้ ราคาเป็น Coins</p>
          </div>

          {marketplaceListings.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 py-16 text-center text-slate-500">
              ยังไม่มีไอเทมประกาศขาย
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {marketplaceListings.map(listing => (
                <div key={listing.id} className="space-y-4 rounded-3xl border border-violet-500/20 bg-slate-900/90 p-5 shadow-xl">                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950">
                      {renderItemIcon(listing.item.icon, listing.item.category, listing.item.effectType, "w-5 h-5")}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">{listing.item.name}</div>
                      <div className="text-[10px] text-violet-300">ผู้ขาย: {listing.sellerName}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">{listing.item.description}</p>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                    <div>
  <span className="font-black text-amber-300">🪙 {formatCoins(listing.price)} Coins / ชิ้น</span>
  <div className="text-[10px] text-slate-400 mt-1">คงเหลือ {Math.max(1, Number(listing.quantity) || Number(listing.item.quantity) || 1)} ชิ้น</div>
</div>
                    {listing.sellerId !== character.id && (
  <input type="number" min="1" max={Math.max(1, Number(listing.quantity) || Number(listing.item.quantity) || 1)} value={marketBuyQuantity[listing.id] || '1'} onChange={e => setMarketBuyQuantity(v => ({ ...v, [listing.id]: e.target.value }))} className="w-16 rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white" aria-label="จำนวนที่ซื้อ" />
)}
{listing.sellerId === character.id ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('ยกเลิกประกาศขายและนำของกลับกระเป๋าใช่หรือไม่?')) return;
                          try {
                            await onCancelMarketplaceListing?.(listing.id);
                          } catch (e) {
                            alert(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ');
                          }
                        }}
                        className="cursor-pointer rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"
                      >
                        ยกเลิกขาย
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={marketBuyingId === listing.id}
                        onClick={async () => {
                          const stock = Math.max(1, Number(listing.quantity) || Number(listing.item.quantity) || 1);
                          const qty = Math.max(1, Math.min(stock, Math.floor(Number(marketBuyQuantity[listing.id]) || 1)));
                          if (!confirm(`ยืนยันซื้อ ${listing.item.name} x${qty} ใช่หรือไม่?`)) return;
                          setMarketBuyingId(listing.id);
                          try {
                            const ok = await onBuyMarketplaceListing?.(listing.id, qty);
                            if (ok) setMarketBuyQuantity(value => ({ ...value, [listing.id]: '' }));
                          } finally {
                            setMarketBuyingId(null);
                          }
                        }}
                        className="cursor-pointer rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        {marketBuyingId === listing.id ? 'กำลังซื้อ...' : 'ซื้อ'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-3xl border border-amber-500/20 bg-slate-900/80 p-5">
            <h3 className="font-black text-white">🔨 การประมูล</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {marketplaceAuctions.length === 0 ? (
                <div className="text-xs text-slate-500">ยังไม่มีรายการประมูล</div>
              ) : (
                marketplaceAuctions.map((auction) => {
                  return (
                  <div key={auction.id} className="rounded-2xl border border-amber-500/20 bg-slate-950/60 p-4">
                    <div className="font-black text-white">{auction.item.name}</div>
                    <div className="text-[10px] text-slate-400">
                      ผู้ขาย {auction.sellerName} · เหลือ {Math.max(0, Math.ceil((auction.endsAt - Date.now()) / 60000))} นาที
                    </div>
                    <div className="mt-2 font-black text-amber-300">
                      เริ่ม {formatCoins(auction.startingPrice)} · บิดล่าสุด {auction.currentBid ? formatCoins(auction.currentBid) : 'ยังไม่มี'} Coins
                    </div>

                    {auction.sellerId === character.id ? (
                      <button
                        type="button"
                        onClick={() => void onCancelMarketplaceAuction?.(auction.id)}
                        className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white"
                      >
                        ยกเลิกประมูล / คืนของ
                      </button>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="number"
                          min={Math.max(Number(auction.startingPrice), Number(auction.currentBid) + 1)}
                          value={bidValues[auction.id] || ''}
                          onChange={e => setBidValues(value => ({ ...value, [auction.id]: e.target.value }))}
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                          placeholder="ราคาเสนอ"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await onPlaceMarketplaceBid?.(auction.id, Number(bidValues[auction.id]));
                              setBidValues(value => ({ ...value, [auction.id]: '' }));
                              alert('เสนอราคาแล้ว');
                            } catch (e) {
                              alert(e instanceof Error ? e.message : 'เสนอราคาไม่สำเร็จ');
                            }
                          }}
                          className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950"
                        >
                          เสนอ
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* INVENTORY VIEW */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 p-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  กระเป๋าสมบัติ (Inventory)
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                    {stackedInventory.reduce((total, item) => total + Math.max(1, Number(item.quantity) || 1), 0)} ชิ้น
                  </span>
                </h2>
                <p className="text-[10px] text-slate-500 mt-1">ของเยอะก็จัดเป็นการ์ดให้ดูง่าย • อุปกรณ์สวมใส่เริ่มต้น 20 ช่อง • เพิ่มช่องได้ตามค่าสเตต • ดาบ Arya สูงสุด 1 ชิ้น</p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 pointer-events-none" />
                    <input
                      type="search"
                      value={inventorySearch}
                      onChange={e => setInventorySearch(e.target.value)}
                      placeholder="ค้นหาไอเทมด้วยชื่อ..."
                      aria-label="ค้นหาไอเทมในกระเป๋า"
                      className="w-full rounded-xl border border-cyan-500/20 bg-slate-950/80 pl-9 pr-9 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
                    />
                    {inventorySearch && <button type="button" onClick={() => setInventorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 text-slate-500 hover:text-white cursor-pointer" aria-label="ล้างคำค้นหา">✕</button>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setSelectedInventoryKeys(filteredInventory.map((item,index) => getInventoryKey(item, (character.inventory || []).indexOf(item))))} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer">เลือกทั้งหมดที่ค้นพบ</button>
                  <button type="button" onClick={clearInventorySelection} disabled={!selectedInventoryKeys.length} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-[10px] font-bold cursor-pointer disabled:opacity-40">ยกเลิกเลือก</button>
                  <button type="button" onClick={() => void deleteSelectedInventory()} disabled={!selectedInventoryKeys.length} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black cursor-pointer disabled:opacity-40 flex items-center gap-1.5"><Trash2 className="w-3 h-3"/>ลบที่เลือก ({selectedInventoryKeys.length})</button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="px-2.5 py-1.5 rounded-xl bg-violet-950/50 border border-violet-500/30 text-violet-300">⚔️ อุปกรณ์ {stackedInventory.filter(i => i.category === 'equipment' && !isAryaEquipment(i)).reduce((sum, i) => sum + getEquippedQuantity(i), 0)}/{equipmentSlots}</span>
                <span className="px-2.5 py-1.5 rounded-xl bg-amber-950/50 border border-amber-500/30 text-amber-300">🗡️ Arya {stackedInventory.filter(i => isAryaEquipment(i)).reduce((sum, i) => sum + getEquippedQuantity(i), 0)}/1</span>
              </div>
            </div>
          </div>

          {stackedInventory.length === 0 ? (
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
            <div className="contents">
            {filteredInventory.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/60 rounded-3xl border border-slate-800">
                <Search className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-medium">ไม่พบไอเทมที่ชื่อ “{inventorySearch}”</p>
                <button type="button" onClick={() => setInventorySearch('')} className="mt-3 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer">ล้างการค้นหา</button>
              </div>
            ) : (
              <div className="contents">
            <div className="mb-3 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-3 min-w-0">
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="text-sm font-black text-cyan-200">🛡️ ช่องสวมใส่อุปกรณ์</div>
      <div className="text-xs text-slate-400">ใช้ไปแล้ว {stackedInventory.filter(item => item.category === 'equipment' && !isAryaEquipment(item)).reduce((sum, item) => sum + getEquippedQuantity(item), 0)}/<span className="font-bold text-cyan-300">{equipmentSlots}</span> ช่อง · ค่าสเตตรวม {equipmentStatTotal}</div>
      <div className="text-[10px] text-slate-500">อัพช่องถัดไปเมื่อค่าสเตตรวมมากกว่า {nextSlotRequirement} · เงื่อนไขเพิ่มขึ้น 10% ทุกครั้ง</div>
    </div>
    <button type="button" onClick={handleUpgradeEquipmentSlot} className="shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/20">+ เพิ่มช่อง ({equipmentSlots})</button>
  </div>
</div>
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[72vh] overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin">
              {filteredInventory.map((invItem, index) => {
                const inventoryKey = invItem.instanceId || `legacy-${invItem.id}-${index}`;
                const rarityInfo = getRarityBadge(invItem.rarity);
                const isMaxHpBooster = invItem.effectType === 'boost_max_hp' || invItem.name.includes('ทองคำ') || invItem.name.includes('Max HP') || invItem.name.includes('หยาดโลหิต');
                const isHealHp = invItem.effectType === 'heal_hp';

                return (
                  <div
                    key={inventoryKey}
                    className={`rounded-3xl p-4 sm:p-5 border transition-all flex flex-col justify-between space-y-4 shadow-xl min-w-0 overflow-hidden ${
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
                            {invItem.category === 'equipment' && getEquippedQuantity(invItem) > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                                สวมใส่อยู่ ×{getEquippedQuantity(invItem)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input type="checkbox" checked={selectedInventoryKeys.includes(inventoryKey)} onChange={() => toggleInventorySelection(inventoryKey)} onClick={e => e.stopPropagation()} className="accent-rose-500 cursor-pointer" aria-label={`เลือก ${invItem.name}`} />
                            <h3 className="text-sm font-bold text-white leading-snug truncate">{invItem.name}</h3>
                            {invItem.category === 'equipment' && getEquipmentLimitLabel(invItem) && (
                              <div className="mt-1 inline-flex max-w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                                🔒 {getEquipmentLimitLabel(invItem)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                        {invItem.description || 'ไม่มีคำอธิบายไอเทม'}
                      </p>
                      <button type="button" className="mt-3 w-full rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 text-left text-xs font-black text-cyan-200" onClick={() => setExpandedItemDetails(prev => ({ ...prev, [String(invItem.instanceId || invItem.id)]: !prev[String(invItem.instanceId || invItem.id)] }))}>
                        {expandedItemDetails[String(invItem.instanceId || invItem.id)] ? '▲ ซ่อนคุณสมบัติไอเทม' : '▼ ดูคุณสมบัติไอเทมทั้งหมด'}
                      </button>
                      {expandedItemDetails[String(invItem.instanceId || invItem.id)] && <div className="mt-2 rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-3">
                        <div className="text-[11px] font-black text-cyan-200 mb-1">📋 คุณสมบัติทั้งหมด</div>
                        {getItemDetailLines(invItem).length > 0 ? <ul className="space-y-1 text-[11px] text-slate-300">{getItemDetailLines(invItem).map((line, i) => <li key={i} className="break-words">• {line}</li>)}</ul> : <div className="text-[11px] text-slate-500">ยังไม่ได้ระบุคุณสมบัติเพิ่มเติม</div>}
                      </div>}

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
                        {invItem.category === 'consumable' && Number(invItem.gachaRateMultiplier) > 1 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-500/50 text-purple-300 text-[11px] font-bold">
                            🎰 เพิ่มเรทกาชา ×{Number(invItem.gachaRateMultiplier)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex flex-col gap-3 min-w-0">
                      <span className="text-[11px] text-slate-400 min-w-0 break-words">
                        {invItem.category === 'equipment'
                          ? (getEquippedQuantity(invItem) > 0 ? `สวมใส่ ${getEquippedQuantity(invItem)}/${Math.max(1, Number(invItem.quantity) || 1)} · กำลังมอบพลัง` : 'ยังไม่ได้ใส่')
                          : 'พร้อมใช้งาน'}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 min-w-0 w-full">
                        <button
                          type="button"
                          id={`btn-delete-inventory-${inventoryKey}`}
                          onClick={() => {
                            const total = Math.max(1, Number(invItem.quantity) || 1);
                            const answer = window.prompt(
                              total > 1
                                ? `ลบ "${invItem.name}" กี่ชิ้น? มีทั้งหมด x${total} (ใส่ 1-${total})`
                                : `ต้องการลบ "${invItem.name}" ออกจากกระเป๋าใช่หรือไม่? ใส่ 1 เพื่อยืนยัน`,
                              '1'
                            );
                            if (answer === null) return;
                            const quantity = Math.floor(Number(answer));
                            if (!Number.isFinite(quantity) || quantity < 1 || quantity > total) {
                              alert(`จำนวนไม่ถูกต้อง กรุณาใส่ 1-${total}`);
                              return;
                            }
                            if (!confirm(`ยืนยันลบ "${invItem.name}" จำนวน x${quantity} ใช่หรือไม่?`)) return;
                            const remaining = removeInventoryQuantity(invItem, quantity);
                            void onUpdateCharacter({ ...character, inventory: remaining, lastUpdated: Date.now() + 1 });
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-slate-500 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 cursor-pointer transition-all"
                          title="ลบออกจากกระเป๋า"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => { setTransferItem(invItem); setTransferTarget(''); setTransferQuantity('1'); }} className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 cursor-pointer">🎁 โอน</button>
                        <button type="button" onClick={() => { setAuctionItem(invItem); setAuctionPrice(''); setAuctionDuration('3600000'); setAuctionQuantity('1'); }} className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 cursor-pointer">🔨 ประมูล</button>
                        <button type="button" onClick={() => { setMarketSellItem(invItem); setMarketSellPrice(''); setMarketSellQuantity('1'); }} className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 cursor-pointer">🏪 ขาย</button>
                        {invItem.category === 'equipment' ? (
                          <button
                            id={`btn-equip-${inventoryKey}`}
                            onClick={() => handleToggleEquip(invItem)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                              invItem.isEquipped
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow shadow-cyan-900/40'
                            }`}
                          >
                            {getEquipmentLimitLabel(invItem) && <span className="mr-2 text-[10px] font-bold text-amber-300">{getEquipmentLimitLabel(invItem)}</span>}
                             {getEquippedQuantity(invItem) > 0 ? 'เลือกจำนวนที่สวมใส่' : 'สวมใส่'}
                          </button>
                        ) : (
                          <button
                            id={`btn-use-${inventoryKey}`}
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
             </div>
            )}
             </div>
          )}
        </div>
      )}

      {transferItem && (<div className="fixed inset-0 z-[85] bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-500/30 p-6"><h3 className="text-lg font-black text-white">🎁 โอนไอเทมให้ผู้เล่น</h3><p className="text-sm text-slate-300 mt-2">{transferItem.name}</p><div className="mt-4 rounded-2xl border-2 border-cyan-400/50 bg-cyan-950/20 p-4"><div className="text-xs font-black text-cyan-200">📦 จำนวนที่ต้องการโอน</div><div className="text-[11px] text-slate-400 mt-1">มีทั้งหมด {Math.max(1, Number(transferItem.quantity)||1)} ชิ้น</div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={()=>setTransferQuantity(String(Math.max(1,Math.floor(Number(transferQuantity)||1)-1)))} className="w-11 h-11 rounded-xl bg-slate-800 text-white text-xl font-black">−</button><input type="number" min="1" max={Math.max(1,Number(transferItem.quantity)||1)} value={transferQuantity} onChange={e=>setTransferQuantity(e.target.value)} className="flex-1 h-11 rounded-xl bg-slate-950 border border-cyan-500/40 text-center text-lg font-black text-white"/><button type="button" onClick={()=>setTransferQuantity(String(Math.min(Math.max(1,Number(transferItem.quantity)||1),Math.floor(Number(transferQuantity)||1)+1)))} className="w-11 h-11 rounded-xl bg-cyan-600 text-white text-xl font-black">+</button></div><div className="mt-2 grid grid-cols-3 gap-2"><button type="button" onClick={()=>setTransferQuantity('1')} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x1</button><button type="button" onClick={()=>setTransferQuantity(String(Math.min(5,Math.max(1,Number(transferItem.quantity)||1))))} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x5</button><button type="button" onClick={()=>setTransferQuantity(String(Math.max(1,Number(transferItem.quantity)||1)))} className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 py-2 text-xs font-black text-cyan-200">xทั้งหมด</button></div></div><select value={transferTarget} onChange={e=>setTransferTarget(e.target.value)} className="w-full mt-4 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white"><option value="">เลือกผู้รับ...</option>{allCharacters.filter(x=>x.id!==character.id).map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}</select><div className="flex justify-end gap-2 mt-5"><button type="button" onClick={()=>{setTransferItem(null);setTransferQuantity('1')}} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">ยกเลิก</button><button type="button" disabled={!transferTarget} onClick={async()=>{try{const qty=Math.max(1,Math.min(Math.floor(Number(transferQuantity)||1),Math.max(1,Number(transferItem.quantity)||1)));await onTransferItem?.(transferTarget,transferItem.instanceId,qty);setTransferItem(null);setTransferQuantity('1');alert('โอนไอเทมสำเร็จ')}catch(e){alert(e instanceof Error?e.message:'โอนไม่สำเร็จ')}}} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-black disabled:opacity-40">ยืนยันโอน ×{Math.max(1,Math.min(Math.floor(Number(transferQuantity)||1),Math.max(1,Number(transferItem.quantity)||1)))}</button></div></div></div>)}
{auctionItem && (<div className="fixed inset-0 z-[85] bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/30 p-6"><h3 className="text-lg font-black text-white">🔨 จัดประมูลไอเทม</h3><p className="text-sm text-slate-300 mt-2">{auctionItem.name}</p><div className="mt-4 rounded-2xl border-2 border-amber-400/50 bg-amber-950/20 p-4"><div className="text-xs font-black text-amber-200">📦 จำนวนที่ต้องการประมูล</div><div className="text-[11px] text-slate-400 mt-1">มีทั้งหมด {Math.max(1,Number(auctionItem.quantity)||1)} ชิ้น</div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={()=>setAuctionQuantity(String(Math.max(1,Math.floor(Number(auctionQuantity)||1)-1)))} className="w-11 h-11 rounded-xl bg-slate-800 text-white text-xl font-black">−</button><input type="number" min="1" max={Math.max(1,Number(auctionItem.quantity)||1)} value={auctionQuantity} onChange={e=>setAuctionQuantity(e.target.value)} className="flex-1 h-11 rounded-xl bg-slate-950 border border-amber-500/40 text-center text-lg font-black text-white"/><button type="button" onClick={()=>setAuctionQuantity(String(Math.min(Math.max(1,Number(auctionItem.quantity)||1),Math.floor(Number(auctionQuantity)||1)+1)))} className="w-11 h-11 rounded-xl bg-amber-600 text-white text-xl font-black">+</button></div><div className="mt-2 grid grid-cols-3 gap-2"><button type="button" onClick={()=>setAuctionQuantity('1')} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x1</button><button type="button" onClick={()=>setAuctionQuantity(String(Math.min(5,Math.max(1,Number(auctionItem.quantity)||1))))} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x5</button><button type="button" onClick={()=>setAuctionQuantity(String(Math.max(1,Number(auctionItem.quantity)||1)))} className="rounded-lg bg-amber-500/10 border border-amber-500/30 py-2 text-xs font-black text-amber-200">xทั้งหมด</button></div></div><input type="number" min="1" value={auctionPrice} onChange={e=>setAuctionPrice(e.target.value)} className="w-full mt-4 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-amber-300" placeholder="ราคาเริ่มต้น Coins"/><select value={auctionDuration} onChange={e=>setAuctionDuration(e.target.value)} className="w-full mt-3 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-white"><option value="1800000">30 นาที</option><option value="3600000">1 ชั่วโมง</option><option value="21600000">6 ชั่วโมง</option><option value="86400000">24 ชั่วโมง</option></select><div className="flex justify-end gap-2 mt-5"><button type="button" onClick={()=>setAuctionItem(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">ยกเลิก</button><button type="button" onClick={async()=>{if(marketActionLockRef.current)return;const p=Math.floor(Number(auctionPrice));if(!Number.isFinite(p)||p<=0){alert('ราคาเริ่มต้นต้องมากกว่า 0');return;}marketActionLockRef.current='auction';setMarketActionBusy('auction');try{await onCreateMarketplaceAuction?.(auctionItem,p,Number(auctionDuration),Math.max(1,Math.floor(Number(auctionQuantity)||1)));setAuctionItem(null);alert('เปิดประมูลสำเร็จ')}catch(e){alert(e instanceof Error?e.message:'เปิดประมูลไม่สำเร็จ')}finally{marketActionLockRef.current=null;setMarketActionBusy(null)}}} disabled={marketActionBusy!==null} className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{marketActionBusy==='auction'?'⏳ กำลังนำไอเทมเข้าประมูล...':'เริ่มประมูล'}</button></div></div></div>)}
{marketSellItem && (<div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-3xl bg-slate-900 border border-violet-500/30 p-6"><h3 className="text-lg font-black text-white">🏪 ตั้งราคาขาย</h3><p className="text-sm text-slate-300 mt-2">{marketSellItem.name}</p><div className="mt-4 rounded-2xl border-2 border-violet-400/50 bg-violet-950/20 p-4"><div className="text-xs font-black text-violet-200">📦 จำนวนที่ต้องการขาย</div><div className="text-[11px] text-slate-400 mt-1">มีทั้งหมด {Math.max(1,Number(marketSellItem.quantity)||1)} ชิ้น</div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={()=>setMarketSellQuantity(String(Math.max(1,Math.floor(Number(marketSellQuantity)||1)-1)))} className="w-11 h-11 rounded-xl bg-slate-800 text-white text-xl font-black">−</button><input type="number" min="1" max={Math.max(1,Number(marketSellItem.quantity)||1)} value={marketSellQuantity} onChange={e=>setMarketSellQuantity(e.target.value)} className="flex-1 h-11 rounded-xl bg-slate-950 border border-violet-500/40 text-center text-lg font-black text-white"/><button type="button" onClick={()=>setMarketSellQuantity(String(Math.min(Math.max(1,Number(marketSellItem.quantity)||1),Math.floor(Number(marketSellQuantity)||1)+1)))} className="w-11 h-11 rounded-xl bg-violet-600 text-white text-xl font-black">+</button></div><div className="mt-2 grid grid-cols-3 gap-2"><button type="button" onClick={()=>setMarketSellQuantity('1')} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x1</button><button type="button" onClick={()=>setMarketSellQuantity(String(Math.min(5,Math.max(1,Number(marketSellItem.quantity)||1))))} className="rounded-lg bg-slate-800 border border-slate-700 py-2 text-xs font-black text-white">x5</button><button type="button" onClick={()=>setMarketSellQuantity(String(Math.max(1,Number(marketSellItem.quantity)||1)))} className="rounded-lg bg-violet-500/10 border border-violet-500/30 py-2 text-xs font-black text-violet-200">xทั้งหมด</button></div></div><input type="number" min="1" value={marketSellPrice} onChange={e=>setMarketSellPrice(e.target.value)} className="w-full mt-4 rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-amber-300 font-black" placeholder="ราคา Coins ต่อชิ้น"/><div className="flex justify-end gap-2 mt-5"><button type="button" onClick={()=>setMarketSellItem(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">ยกเลิก</button><button type="button" onClick={async()=>{if(marketActionLockRef.current)return;const p=Math.floor(Number(marketSellPrice));if(!Number.isFinite(p)||p<=0){alert('ราคาต้องมากกว่า 0 Coins');return;}marketActionLockRef.current='listing';setMarketActionBusy('listing');try{await onCreateMarketplaceListing?.(marketSellItem,p,Math.max(1,Math.floor(Number(marketSellQuantity)||1)));setMarketSellItem(null);alert('ประกาศขายสำเร็จ')}catch(e){alert(e instanceof Error?e.message:'ประกาศขายไม่สำเร็จ')}finally{marketActionLockRef.current=null;setMarketActionBusy(null)}}} disabled={marketActionBusy!==null} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{marketActionBusy==='listing'?'⏳ กำลังวางขาย...':'ยืนยันขาย'}</button></div></div></div>)}
      {editingBattleItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border-2 border-emerald-500/40 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black tracking-widest text-emerald-400">BATTLE ITEM SETTINGS</div>
                <h3 className="text-lg font-black text-white mt-1">🍀 ตั้งค่าโชคระหว่างการต่อสู้</h3>
                <p className="text-xs text-slate-400 mt-1">{editingBattleItem.name}</p>
              </div>
              <button type="button" onClick={() => setEditingBattleItem(null)} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white">ปิด</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-4 space-y-3">
                <div className="text-sm font-black text-emerald-100">🍀 โชคหลัก</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-emerald-300">ตัวคูณโชค (เท่า)
                    <input type="number" min="1" max="20" step="0.1" value={editBattleLuckMultiplier} onChange={e=>setEditBattleLuckMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-slate-950 border border-emerald-700/60 px-3 py-2.5 text-white font-black" />
                  </label>
                  <label className="text-xs font-bold text-cyan-300">ระยะเวลาโชค (เทิร์น)
                    <input type="number" min="1" max="10" value={editBattleLuckDuration} onChange={e=>setEditBattleLuckDuration(Number(e.target.value))} disabled={editBattleLuckMultiplier<=1} className="mt-1 w-full rounded-xl bg-slate-950 border border-cyan-700/60 px-3 py-2.5 text-white font-black disabled:opacity-40" />
                  </label>
                </div>
                <p className="text-[10px] text-slate-400">เช่น ×2 เป็นการคูณโอกาส Passive/Effect/Crit/ตีซ้ำ 2 เท่า</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-bold text-fuchsia-300">💥 โบนัสโอกาสคริ (%)
                  <input type="number" min="0" max="100" step="0.1" value={editBattleCriticalChancePercent} onChange={e=>setEditBattleCriticalChancePercent(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-slate-950 border border-fuchsia-700/60 px-3 py-2.5 text-white font-black" />
                </label>
                <label className="text-xs font-bold text-violet-300">🔁 โบนัสโอกาสตีซ้ำ (%)
                  <input type="number" min="0" max="100" step="0.1" value={editBattleRepeatAttackChancePercent} onChange={e=>setEditBattleRepeatAttackChancePercent(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-slate-950 border border-violet-700/60 px-3 py-2.5 text-white font-black" />
                </label>
              </div>
              <label className="block text-xs font-bold text-amber-300">✨ ตัวคูณโอกาส Passive / Effect (เท่า)
                <input type="number" min="1" max="20" step="0.1" value={editBattlePassiveChanceMultiplier} onChange={e=>setEditBattlePassiveChanceMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-slate-950 border border-amber-700/60 px-3 py-2.5 text-white font-black" />
              </label>
              <label className="block text-xs font-bold text-purple-300">🎰 ตัวคูณเรทกาชา (เท่า)
                <input type="number" min="1" max="1000" step="0.1" value={editGachaRateMultiplier} onChange={e=>setEditGachaRateMultiplier(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-slate-950 border border-purple-700/60 px-3 py-2.5 text-white font-black" />
                <p className="text-[10px] text-slate-400 mt-1">ตั้งตัวคูณได้ถึง ×1000 และเลือกได้ว่าจะเพิ่มเรทตั้งแต่ Common / Rare / Epic / Legendary / Mythic ขึ้นไป ใช้ 1 ขวดต่อ 1 คำสั่งสุ่ม</p>
                 <select value={editGachaRateMinRarity} onChange={e=>setEditGachaRateMinRarity(e.target.value as GachaRarity)} className="mt-2 w-full rounded-xl bg-slate-950 border border-purple-700/60 px-3 py-2 text-white font-black">
                   <option value="common">เพิ่มเรทตั้งแต่ Common ขึ้นไป</option>
                   <option value="rare">เพิ่มเรทตั้งแต่ Rare ขึ้นไป</option>
                   <option value="epic">เพิ่มเรทตั้งแต่ Epic ขึ้นไป</option>
                   <option value="legendary">เพิ่มเรทตั้งแต่ Legendary ขึ้นไป</option>
                   <option value="mythic">เพิ่มเรทเฉพาะ Mythic</option>
                 </select>
              </label>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[10px] text-slate-400 leading-5">
                ค่าเหล่านี้จะถูกบันทึกลงไอเทมเดิมทันที ไม่ต้องลบหรือสร้างไอเทมใหม่
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingBattleItem(null)} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold">ยกเลิก</button>
                <button type="button" onClick={async () => {
                  if (!onAddShopItem || !editingBattleItem) return;
                  const updated = {
                    ...editingBattleItem,
                    battleLuckMultiplier: editBattleLuckMultiplier > 1 ? Math.max(1, Math.min(20, editBattleLuckMultiplier)) : undefined,
                    battleLuckDuration: editBattleLuckMultiplier > 1 ? Math.min(10, Math.max(1, Math.floor(editBattleLuckDuration))) : undefined,
                    battleCriticalChancePercent: editBattleCriticalChancePercent > 0 ? Math.max(0, Math.min(100, editBattleCriticalChancePercent)) : undefined,
                    battleRepeatAttackChancePercent: editBattleRepeatAttackChancePercent > 0 ? Math.max(0, Math.min(100, editBattleRepeatAttackChancePercent)) : undefined,
                    battlePassiveChanceMultiplier: editBattlePassiveChanceMultiplier > 1 ? Math.max(1, Math.min(20, editBattlePassiveChanceMultiplier)) : undefined,
                    gachaRateMultiplier: editGachaRateMultiplier > 1 ? Math.max(1, Math.min(1000, editGachaRateMultiplier)) : undefined,
                     gachaRateMinRarity: editGachaRateMultiplier > 1 ? editGachaRateMinRarity : undefined,
                  };
                  try {
                    await onAddShopItem(updated);
                    setEditingBattleItem(null);
                    alert('บันทึกตั้งค่าโชคของไอเทมเรียบร้อยแล้ว');
                  } catch (error) {
                    console.error('Failed to update battle item settings:', error);
                    alert('บันทึกตั้งค่าไม่สำเร็จ กรุณาลองใหม่');
                  }
                }} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black">💾 บันทึกการตั้งค่า</button>
              </div>
            </div>
          </div>
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
                    </div>                  </div>

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

                {newItemCategory === 'consumable' && (
                  <div className="rounded-2xl border border-rose-500/30 bg-slate-950/70 p-4 space-y-4">
                    <div className="text-sm font-black text-white">🧪 เอฟเฟกต์เมื่อกดใช้ไอเทม</div>
                    {newItemEffectType === 'heal_hp' && <div><label className="text-rose-300 font-bold block mb-1">💗 ฟื้นฟูเป็นเปอร์เซ็นต์ของ Max HP</label><div className="flex gap-2"><input type="number" min="0" max="100" value={newItemHealPercent} onChange={e=>setNewItemHealPercent(Number(e.target.value))} className="flex-1 rounded-xl bg-slate-900 border border-rose-700/60 px-3 py-2 text-white font-black"/><span className="px-3 py-2 rounded-xl bg-rose-950 text-rose-300 font-black">%</span></div><p className="text-[10px] text-slate-400 mt-1">เช่น 20% = ฟื้น 20% ของ Max HP</p></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="text-orange-300 font-bold block mb-1">⚔️ เพิ่มดาเมจระหว่างต่อสู้ (%)</label><input type="number" min="0" max="1000" value={newItemBattleDamagePercent} onChange={e=>setNewItemBattleDamagePercent(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-orange-700/60 px-3 py-2 text-white font-black"/><p className="text-[10px] text-slate-400 mt-1">เช่น 25 = ดาเมจโจมตี +25%</p></div>
                      <div><label className="text-amber-300 font-bold block mb-1">⏱️ ระยะเวลา (ต่อเทิร์น)</label><input type="number" min="1" max="100" value={newItemBattleDamageDuration} onChange={e=>setNewItemBattleDamageDuration(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-amber-700/60 px-3 py-2 text-white font-black" disabled={newItemBattleDamagePercent<=0}/><p className="text-[10px] text-slate-400 mt-1">เช่น 3 = บัฟอยู่ 3 เทิร์น</p></div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-3 space-y-3">
                      <div>
                        <div className="text-sm font-black text-emerald-100">🍀 โชคระหว่างการต่อสู้</div>
                        <p className="text-[10px] text-slate-400 mt-1">เพิ่มโอกาสให้ Passive และ Effect ทำงาน รวมถึงโอกาสคริติคอล/ตีซ้ำ</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-emerald-300 font-bold block mb-1">🍀 ตัวคูณโชค (เท่า)</label>
                          <input type="number" min="1" max="20" step="0.1" value={newItemBattleLuckMultiplier} onChange={e=>setNewItemBattleLuckMultiplier(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-emerald-700/60 px-3 py-2 text-white font-black"/>
                          <p className="text-[10px] text-slate-400 mt-1">เช่น 2 = โอกาส Passive/Effect/Crit/ตีซ้ำ ถูกคูณ 2 เท่า</p>
                        </div>
                        <div>
                          <label className="text-cyan-300 font-bold block mb-1">⏱️ ระยะเวลาโชค (เทิร์น)</label>
                          <input type="number" min="1" max="10" value={newItemBattleLuckDuration} onChange={e=>setNewItemBattleLuckDuration(Number(e.target.value))} disabled={newItemBattleLuckMultiplier<=1} className="w-full rounded-xl bg-slate-900 border border-cyan-700/60 px-3 py-2 text-white font-black"/>
                          <p className="text-[10px] text-slate-400 mt-1">โชคจะหมดเมื่อครบจำนวนเทิร์นที่ตั้งไว้</p>
                        </div>
                        <div>
                          <label className="text-fuchsia-300 font-bold block mb-1">💥 โบนัสโอกาสคริ (%)</label>
                          <input type="number" min="0" max="100" step="0.1" value={newItemBattleCriticalChancePercent} onChange={e=>setNewItemBattleCriticalChancePercent(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-fuchsia-700/60 px-3 py-2 text-white font-black"/>
                          <p className="text-[10px] text-slate-400 mt-1">บวกเพิ่มจากโอกาสคริเดิม</p>
                        </div>
                        <div>
                          <label className="text-violet-300 font-bold block mb-1">🔁 โบนัสโอกาสตีซ้ำ (%)</label>
                          <input type="number" min="0" max="100" step="0.1" value={newItemBattleRepeatAttackChancePercent} onChange={e=>setNewItemBattleRepeatAttackChancePercent(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-violet-700/60 px-3 py-2 text-white font-black"/>
                          <p className="text-[10px] text-slate-400 mt-1">บวกเพิ่มจากโอกาสตีซ้ำเดิม</p>
                        </div>
                      </div>
                      <div>
                        <label className="text-amber-300 font-bold block mb-1">✨ ตัวคูณโอกาส Passive / Effect (เท่า)</label>
                        <input type="number" min="1" max="20" step="0.1" value={newItemBattlePassiveChanceMultiplier} onChange={e=>setNewItemBattlePassiveChanceMultiplier(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-amber-700/60 px-3 py-2 text-white font-black"/>
                        <p className="text-[10px] text-slate-400 mt-1">เช่น 2 = Passive และ Effect ที่มีโอกาส 10% จะกลายเป็น 20% (ก่อนชนเพดาน 100%)</p>
                      </div>
                      <div className="mt-3 rounded-2xl border border-purple-500/30 bg-purple-950/10 p-3">
                        <label className="text-purple-300 font-bold block mb-1">🎰 ตัวคูณเรทกาชา (เท่า)</label>
                        <input type="number" min="1" max="1000" step="0.1" value={newItemGachaRateMultiplier} onChange={e=>setNewItemGachaRateMultiplier(Number(e.target.value))} className="w-full rounded-xl bg-slate-900 border border-purple-700/60 px-3 py-2 text-white font-black"/>
                         <select value={newItemGachaRateMinRarity} onChange={e=>setNewItemGachaRateMinRarity(e.target.value as GachaRarity)} className="mt-2 w-full rounded-xl bg-slate-900 border border-purple-700/60 px-3 py-2 text-white font-black">
                           <option value="common">เริ่มเพิ่มตั้งแต่ Common</option>
                           <option value="rare">เริ่มเพิ่มตั้งแต่ Rare</option>
                           <option value="epic">เริ่มเพิ่มตั้งแต่ Epic</option>
                           <option value="legendary">เริ่มเพิ่มตั้งแต่ Legendary</option>
                           <option value="mythic">เริ่มเพิ่มเฉพาะ Mythic</option>
                         </select>
                        <p className="text-[10px] text-slate-400 mt-1">เมื่อกดใช้ก่อนสุ่ม จะเพิ่มน้ำหนักรางวัลระดับ Rare ขึ้นไปตามตัวคูณ และใช้ 1 ขวดต่อการกดสุ่ม 1/10/หลายพันครั้ง</p>
                      </div>
                    </div>
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

                <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-950/10 p-3 space-y-3">
                  <div>
                    <div className="text-xs font-black text-fuchsia-200">✨ Passive ติดตัวของอุปกรณ์</div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">เลือกประเภทผลก่อน แล้วช่องค่าจะบอกชัดว่าตัวเลขนั้นหมายถึงอะไร</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveName} onChange={e => setNewPassiveName(e.target.value)} placeholder="ชื่อ Passive เช่น ดอกไม้สะสม" />
                    <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveTrigger} onChange={e => setNewPassiveTrigger(e.target.value as ItemPassiveEffect['trigger'])}><option value="attack">ทุกครั้งที่โจมตี</option><option value="turn_start">เริ่มเทิร์นของตัวละคร</option></select>
                    <select className="col-span-2 w-full rounded-xl border border-fuchsia-500/40 bg-slate-950 px-3 py-2 text-xs font-bold text-white" value={newPassiveKind} onChange={e => setNewPassiveKind(e.target.value as ItemPassiveEffect['kind'])}>
                      <option value="stack">🌸 สะสม Stack — เพิ่มจำนวนสะสม</option>
                      <option value="true_damage_per_stack">💠 True Damage ต่อ Stack — ค่า × Stack</option>
                      <option value="true_damage_at_max_stacks">💥 ครบ Max Stack แล้วทำ True Damage</option>
                      <option value="damage">⚔️ เพิ่มดาเมจคงที่</option><option value="damage_percent">⚔️ เพิ่มดาเมจ %</option>
                      <option value="heal">💚 ฟื้น HP คงที่</option><option value="heal_percent">💚 ฟื้น HP %</option>
                      <option value="buff_stat">📈 เพิ่มสเตตัส</option><option value="shield">🛡️ สร้างโล่</option>
                      <option value="reflect">🔄 สะท้อนดาเมจ %</option><option value="repeat_attack_chance">🔁 โอกาสตีซ้ำ %</option><option value="critical_chance">💥 โอกาสคริ %</option>
                    </select>
                    <label className="text-[10px] text-slate-400">
                      {newPassiveKind === 'stack' ? 'จำนวน Stack ที่เพิ่มต่อการทำงาน' : newPassiveKind === 'true_damage_per_stack' ? 'True Damage ต่อ 1 Stack' : newPassiveKind === 'true_damage_at_max_stacks' ? 'True Damage เมื่อครบ Max Stack' : newPassiveKind === 'repeat_attack_chance' ? 'โอกาสตีซ้ำ (%)' : newPassiveKind === 'critical_chance' ? 'โอกาสคริ (%)' : ['damage_percent','heal_percent','reflect'].includes(newPassiveKind) ? 'ค่า (%)' : newPassiveKind === 'buff_stat' ? 'จำนวนค่าสเตตัสที่เพิ่ม' : newPassiveKind === 'shield' ? 'ค่าโล่' : newPassiveKind === 'damage' ? 'ดาเมจเพิ่ม' : 'ค่าผลของ Passive'}
                      <input type="number" min="0" max={['repeat_attack_chance','critical_chance','damage_percent','heal_percent','reflect'].includes(newPassiveKind) ? 100 : undefined} step="0.001" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveValue} onChange={e => setNewPassiveValue(Number(e.target.value))} />
                    </label>
                    {(newPassiveKind === 'stack' || newPassiveKind === 'true_damage_per_stack' || newPassiveKind === 'true_damage_at_max_stacks') && <label className="text-[10px] text-slate-400">Max Stack / จำนวนที่ต้องสะสม<input type="number" min="1" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveMaxStacks} onChange={e => setNewPassiveMaxStacks(Number(e.target.value))} /></label>}
                    <label className="text-[10px] text-slate-400">โอกาสให้ Passive ทำงาน (%)<input type="number" min="0" max="100" step="0.001" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveChance} onChange={e => setNewPassiveChance(Number(e.target.value))} /></label>
                    {(newPassiveKind === 'stack' || newPassiveKind === 'true_damage_per_stack' || newPassiveKind === 'true_damage_at_max_stacks') && <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveStackKey} onChange={e => setNewPassiveStackKey(e.target.value)} placeholder="ชื่อกอง Stack เช่น flower" />}
                    {newPassiveKind === 'buff_stat' && <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveTargetStat} onChange={e => setNewPassiveTargetStat(e.target.value as any)}><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>}
                    {(newPassiveKind === 'shield' || newPassiveKind === 'reflect') && <input type="number" min="1" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" value={newPassiveDuration} onChange={e => setNewPassiveDuration(Number(e.target.value))} placeholder="ระยะเวลา (เทิร์น)" />}
                  </div>
                  <div className="rounded-xl border border-fuchsia-500/20 bg-slate-950/50 p-2 text-[10px] leading-4 text-slate-300">
                    {newPassiveKind === 'stack' && 'ตัวอย่าง: ทุกครั้งที่โจมตี +1 Stack, Max 6, Stack Key = flower'}
                    {newPassiveKind === 'true_damage_per_stack' && 'ตัวอย่าง: ค่า 5 + 6 Stack = 30 True Damage'}
                    {newPassiveKind === 'true_damage_at_max_stacks' && 'ตัวอย่าง: Max 6 + ค่า 30 = ครบ 6 Stack ทำ 30 True Damage แล้วรีเซ็ต Stack เป็น 0'}
                    {newPassiveKind === 'repeat_attack_chance' && 'ตัวอย่าง: ค่า 0.1 = โอกาสตีซ้ำ 0.1%'}
                    {newPassiveKind === 'critical_chance' && 'ตัวอย่าง: ค่า 5 = โอกาสคริ 5%'}
                    {newPassiveKind === 'damage' && 'ตัวอย่าง: ค่า 20 = เพิ่มดาเมจ 20 หน่วย'}
                    {newPassiveKind === 'damage_percent' && 'ตัวอย่าง: ค่า 10 = เพิ่มดาเมจ 10%'}
                    {newPassiveKind === 'heal' && 'ตัวอย่าง: ค่า 20 = ฟื้น HP 20 หน่วย'}
                    {newPassiveKind === 'heal_percent' && 'ตัวอย่าง: ค่า 10 = ฟื้น 10% ของ Max HP'}
                    {newPassiveKind === 'buff_stat' && 'ตัวอย่าง: ค่า 5 + STR = เพิ่ม STR 5'}
                    {newPassiveKind === 'shield' && 'ตัวอย่าง: ค่า 20 + ระยะเวลา 2 = โล่ 20 นาน 2 เทิร์น'}
                    {newPassiveKind === 'reflect' && 'ตัวอย่าง: ค่า 25 + ระยะเวลา 1 = สะท้อน 25% นาน 1 เทิร์น'}
                  </div>
                  <button type="button" className="w-full rounded-xl bg-fuchsia-500/20 px-3 py-2 text-xs font-black text-fuchsia-100" onClick={() => setNewItemPassives(prev => [...prev, { id: `item-passive-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name: newPassiveName.trim() || 'Passive ติดตัว', trigger: newPassiveTrigger, kind: newPassiveKind, value: Math.max(0, Number(newPassiveValue) || 0), chance: Math.max(0, Math.min(100, Number(newPassiveChance) || 0)), duration: Math.max(1, Math.round(Number(newPassiveDuration) || 1)), maxStacks: Math.max(1, Math.round(Number(newPassiveMaxStacks) || 1)), stackKey: newPassiveStackKey.trim() || 'default', targetStat: newPassiveKind === 'buff_stat' ? newPassiveTargetStat : undefined }])}>+ เพิ่ม Passive</button>
                  {newItemPassives.map(effect => <div key={effect.id} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-2 py-1 text-[10px] text-fuchsia-100"><span>{effect.name} · {effect.kind} · {effect.value}</span><button type="button" className="text-rose-300" onClick={() => setNewItemPassives(prev => prev.filter(item => item.id !== effect.id))}>ลบ</button></div>)}
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
                              {newItemCategory === 'consumable' && newItemGachaRateMultiplier > 1 && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-500/60 text-purple-300 text-[11px] font-black">
                                  🎰 เรทกาชา ×{newItemGachaRateMultiplier}
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
                              <span>{formatCoins(newItemPrice)}</span>
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