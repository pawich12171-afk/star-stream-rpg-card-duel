import React, { useEffect, useState } from 'react';
import type { Item, GachaRarity, ItemPassiveEffect } from '../types';
import { Package, Search, Store, Gift, Layers, Edit3, Trash2, Save, X, UploadCloud, Eye } from 'lucide-react';

interface ItemManagementPanelProps {
  shopItems: Item[];
  onAddItem: (item: Item) => void | Promise<void>;
  onUpdateItem: (item: Item) => void | Promise<void>;
  onDeleteItem: (itemId: string) => void | Promise<void>;
}

const icons = ['HeartPulse','Heart','Flame','Flower2','Droplets','Shield','Sword','Sparkles','Gem','Zap','Scroll','Crown','Package'];
const isImageIcon = (value: unknown): value is string => typeof value === 'string' && (value.startsWith('data:image/') || /^https?:\/\//i.test(value));
const safeText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const getItemEffectSummary = (item: Partial<Item>) => {
  switch (item.effectType) {
    case 'heal_hp': return item.healPercent ? 'ฟื้น HP ' + item.healPercent + '% + ' + (item.effectValue || 0) + ' HP' : 'ฟื้น HP +' + (item.effectValue || 0);
    case 'boost_max_hp': return 'เพิ่ม Max HP +' + (item.hpBonus || item.effectValue || 0);
    case 'buff_stat': return 'เพิ่ม ' + String(item.targetStat || 'STR').toUpperCase() + ' +' + (item.effectValue || 0);
    case 'enhance_skill': return 'เสริมสกิล ' + (item.skillEnhanceTarget || 'ที่กำหนด');
    default: return 'เอฟเฟกต์กำหนดเอง';
  }
};
const getItemExtraDetails = (item: Partial<Item>) => {
  const d: string[] = [];
  if (item.battleDamagePercent) d.push('ดาเมจ +' + item.battleDamagePercent + '%');
  if (item.battleCriticalChancePercent) d.push('คริติคอล +' + item.battleCriticalChancePercent + '%');
  if (item.battleRepeatAttackChancePercent) d.push('ตีซ้ำ +' + item.battleRepeatAttackChancePercent + '%');
  if (item.battleLuckMultiplier) d.push('โชค x' + item.battleLuckMultiplier);
  if (item.gachaRateMultiplier) d.push('กาชา x' + item.gachaRateMultiplier);
  if (item.revivePercent) d.push('ชุบชีวิต ' + item.revivePercent + '%');
  if (item.reviveAlly) d.push('ชุบเพื่อนได้');
  if (item.cleanseNegative) d.push('ล้างสถานะผิดปกติ');
  if (item.shieldPercent) d.push('โล่ ' + item.shieldPercent + '%');
  if (item.damageReductionPercent) d.push('ลดความเสียหาย ' + item.damageReductionPercent + '%');
  if (item.dodgeChancePercent) d.push('หลบหลีก ' + item.dodgeChancePercent + '%');
  if (item.lifestealPercent) d.push('ดูดเลือด ' + item.lifestealPercent + '%');
  if (item.cooldownReductionPercent) d.push('ลดคูลดาวน์ ' + item.cooldownReductionPercent + '%');
  if (item.statusImmunityDuration) d.push('ต้านสถานะ ' + item.statusImmunityDuration + ' เทิร์น');
  if (item.stunDuration) d.push('ชะงัก ' + item.stunDuration + ' เทิร์น');
  if (item.passiveEffects?.length) d.push('Passive ' + item.passiveEffects.length + ' อัน');
  return d;
};


export const ItemManagementPanel: React.FC<ItemManagementPanelProps> = ({
  shopItems, onAddItem, onUpdateItem, onDeleteItem
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState<'consumable'|'equipment'>('consumable');
  const [rarity, setRarity] = useState<GachaRarity>('common');
  const [effectType, setEffectType] = useState<'heal_hp'|'boost_max_hp'|'buff_stat'|'enhance_skill'|'custom'>('heal_hp');
  const [effectValue, setEffectValue] = useState(10);
  const [icon, setIcon] = useState('HeartPulse');
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [targetStat, setTargetStat] = useState<'strength'|'durability'|'agility'|'magic'>('strength');
  const [inShop, setInShop] = useState(false);
  const [rewardEligible, setRewardEligible] = useState(true);
  const [stackable, setStackable] = useState(true);
  const [itemClass, setItemClass] = useState<'normal'|'special'|'limited'>('normal');
  const [limitedStock, setLimitedStock] = useState(0);
  const [healPercent, setHealPercent] = useState(0);
  const [hpBonus, setHpBonus] = useState(0);
  const [skillTarget, setSkillTarget] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [battleDamagePercent, setBattleDamagePercent] = useState(0);
  const [battleDamageDuration, setBattleDamageDuration] = useState(0);
  const [battleCriticalChancePercent, setBattleCriticalChancePercent] = useState(0);
  const [battleRepeatAttackChancePercent, setBattleRepeatAttackChancePercent] = useState(0);
  const [battleLuckMultiplier, setBattleLuckMultiplier] = useState(0);
  const [battleLuckDuration, setBattleLuckDuration] = useState(0);
  const [gachaRateMultiplier, setGachaRateMultiplier] = useState(0);
  const [gachaRateMinRarity, setGachaRateMinRarity] = useState<GachaRarity>('rare');
  const [battlePassiveChanceMultiplier, setBattlePassiveChanceMultiplier] = useState(0);
  const [revivePercent, setRevivePercent] = useState(0);
  const [reviveAlly, setReviveAlly] = useState(false);
  const [cleanseNegative, setCleanseNegative] = useState(false);
  const [shieldPercent, setShieldPercent] = useState(0);
  const [shieldDuration, setShieldDuration] = useState(0);
  const [damageReductionPercent, setDamageReductionPercent] = useState(0);
  const [damageReductionDuration, setDamageReductionDuration] = useState(0);
  const [dodgeChancePercent, setDodgeChancePercent] = useState(0);
  const [lifestealPercent, setLifestealPercent] = useState(0);
  const [cooldownReductionPercent, setCooldownReductionPercent] = useState(0);
  const [stunDuration, setStunDuration] = useState(0);
  const [statusImmunityDuration, setStatusImmunityDuration] = useState(0);
  const [equipmentStrengthBonus, setEquipmentStrengthBonus] = useState(0);
  const [equipmentDurabilityBonus, setEquipmentDurabilityBonus] = useState(0);
  const [equipmentAgilityBonus, setEquipmentAgilityBonus] = useState(0);
  const [equipmentMagicBonus, setEquipmentMagicBonus] = useState(0);
  const [equipmentMaxHpBonus, setEquipmentMaxHpBonus] = useState(0);
  const [equipmentAttackPercent, setEquipmentAttackPercent] = useState(0);
  const [equipmentDefensePercent, setEquipmentDefensePercent] = useState(0);
  const [equipmentMagicPercent, setEquipmentMagicPercent] = useState(0);
  const [equipmentAttackDuration, setEquipmentAttackDuration] = useState(0);
  const [equipmentDefenseDuration, setEquipmentDefenseDuration] = useState(0);
  const [equipmentMagicDuration, setEquipmentMagicDuration] = useState(0);
  const [passiveEffects, setPassiveEffects] = useState<ItemPassiveEffect[]>([]);
  const [passiveName, setPassiveName] = useState('Passive');
  const [passiveTrigger, setPassiveTrigger] = useState<ItemPassiveEffect['trigger']>('attack');
  const [passiveKind, setPassiveKind] = useState<ItemPassiveEffect['kind']>('stack');
  const [passiveValue, setPassiveValue] = useState(1);
  const [passiveChance, setPassiveChance] = useState(100);
  const [passiveDuration, setPassiveDuration] = useState(1);
  const [passiveMaxStacks, setPassiveMaxStacks] = useState(1);
  const [passiveTargetStat, setPassiveTargetStat] = useState<'strength'|'durability'|'agility'|'magic'>('strength');

  const reset = () => {
    setEditingId(null); setName(''); setDescription(''); setPrice(0);
    setCategory('consumable'); setRarity('common'); setEffectType('heal_hp');
    setEffectValue(10); setIcon('HeartPulse'); setIconPreview(null); setTargetStat('strength');
    setItemClass('normal'); setLimitedStock(0); setHealPercent(0); setHpBonus(0); setSkillTarget(''); setSkillDesc('');
    setBattleDamagePercent(0); setBattleDamageDuration(0); setBattleCriticalChancePercent(0); setBattleRepeatAttackChancePercent(0); setBattleLuckMultiplier(0); setBattleLuckDuration(0); setGachaRateMultiplier(0); setBattlePassiveChanceMultiplier(0);
    setRevivePercent(0); setReviveAlly(false); setCleanseNegative(false); setShieldPercent(0); setShieldDuration(0); setDamageReductionPercent(0); setDamageReductionDuration(0); setDodgeChancePercent(0); setLifestealPercent(0); setCooldownReductionPercent(0); setStunDuration(0); setStatusImmunityDuration(0); setPassiveEffects([]);
    setEquipmentStrengthBonus(0); setEquipmentDurabilityBonus(0); setEquipmentAgilityBonus(0); setEquipmentMagicBonus(0); setEquipmentMaxHpBonus(0);
    setEquipmentAttackPercent(0); setEquipmentDefensePercent(0); setEquipmentMagicPercent(0); setEquipmentAttackDuration(0); setEquipmentDefenseDuration(0); setEquipmentMagicDuration(0);
    setInShop(false); setRewardEligible(true); setStackable(true);
  };

  const edit = (item: Item) => {
    if (!item || !item.id) return;
    setEditingId(item.id); setName(item.name); setDescription(item.description || '');
    setPrice(item.price || 0); setCategory(item.category); setRarity(item.rarity as GachaRarity);
    setEffectType(item.effectType || 'custom'); setEffectValue(item.effectValue || 0);
    setIcon(typeof item.icon === 'string' ? item.icon : 'Package'); setIconPreview(isImageIcon(item.icon) ? item.icon : null); setTargetStat(item.targetStat || 'strength');
    setInShop(item.inShop === true && !item.adminOnly);
    setRewardEligible(item.rewardEligible !== false); setStackable(item.stackable !== false);
    setItemClass(item.itemClass || 'normal'); setLimitedStock(item.limitedStock || 0); setHealPercent(item.healPercent || 0); setHpBonus(item.hpBonus || 0);
    setSkillTarget(item.skillEnhanceTarget || ''); setSkillDesc(item.skillEnhanceDesc || ''); setBattleDamagePercent(item.battleDamagePercent || 0); setBattleDamageDuration(item.battleDamageDuration || 0);
    setBattleCriticalChancePercent(item.battleCriticalChancePercent || 0); setBattleRepeatAttackChancePercent(item.battleRepeatAttackChancePercent || 0); setBattleLuckMultiplier(item.battleLuckMultiplier || 0); setBattleLuckDuration(item.battleLuckDuration || 0); setGachaRateMultiplier(item.gachaRateMultiplier || 0); setGachaRateMinRarity(item.gachaRateMinRarity || 'rare'); setBattlePassiveChanceMultiplier(item.battlePassiveChanceMultiplier || 0);
    setRevivePercent(item.revivePercent || 0); setReviveAlly(item.reviveAlly === true); setCleanseNegative(item.cleanseNegative === true); setShieldPercent(item.shieldPercent || 0); setShieldDuration(item.shieldDuration || 0); setDamageReductionPercent(item.damageReductionPercent || 0); setDamageReductionDuration(item.damageReductionDuration || 0); setDodgeChancePercent(item.dodgeChancePercent || 0); setLifestealPercent(item.lifestealPercent || 0); setCooldownReductionPercent(item.cooldownReductionPercent || 0); setStunDuration(item.stunDuration || 0); setStatusImmunityDuration(item.statusImmunityDuration || 0); setPassiveEffects(item.passiveEffects || []);
    setEquipmentStrengthBonus(item.equipmentStrengthBonus || 0); setEquipmentDurabilityBonus(item.equipmentDurabilityBonus || 0); setEquipmentAgilityBonus(item.equipmentAgilityBonus || 0); setEquipmentMagicBonus(item.equipmentMagicBonus || 0); setEquipmentMaxHpBonus(item.equipmentMaxHpBonus || 0);
    setEquipmentAttackPercent(item.equipmentAttackPercent || 0); setEquipmentDefensePercent(item.equipmentDefensePercent || 0); setEquipmentMagicPercent(item.equipmentMagicPercent || 0);
    setEquipmentAttackDuration(item.equipmentAttackDuration || 0); setEquipmentDefenseDuration(item.equipmentDefenseDuration || 0); setEquipmentMagicDuration(item.equipmentMagicDuration || 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (editingId && !shopItems.some(i => i.id === editingId)) reset();
  }, [shopItems, editingId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('กรุณากรอกชื่อไอเทม'); return; }
    const old = editingId ? shopItems.find(i => i.id === editingId) : undefined;
    const item: Item = {
      ...(old || {}),
      id: editingId || `item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      name: name.trim(), description: description.trim() || 'ไอเทม Star Stream',
      price: Math.max(0, price), category, rarity, effectType, effectValue: Math.max(0, effectValue),
      icon: iconPreview || icon, itemClass, limitedStock: itemClass === 'limited' ? Math.max(0, limitedStock) : undefined,
      targetStat: effectType === 'buff_stat' ? targetStat : undefined,
      hpBonus: (hpBonus || (category === 'equipment' ? effectValue : 0)) || undefined,
      healPercent: effectType === 'heal_hp' && healPercent > 0 ? healPercent : undefined,
      skillEnhanceTarget: effectType === 'enhance_skill' ? skillTarget : undefined,
      skillEnhanceDesc: effectType === 'enhance_skill' ? skillDesc : undefined,
      battleDamagePercent: battleDamagePercent || undefined, battleDamageDuration: battleDamageDuration || undefined,
      battleCriticalChancePercent: battleCriticalChancePercent || undefined, battleRepeatAttackChancePercent: battleRepeatAttackChancePercent || undefined,
      battleLuckMultiplier: battleLuckMultiplier || undefined, battleLuckDuration: battleLuckDuration || undefined, battlePassiveChanceMultiplier: battlePassiveChanceMultiplier || undefined,
      revivePercent: revivePercent || undefined, reviveAlly: reviveAlly || undefined, cleanseNegative: cleanseNegative || undefined, shieldPercent: shieldPercent || undefined, shieldDuration: shieldDuration || undefined,
      damageReductionPercent: damageReductionPercent || undefined, damageReductionDuration: damageReductionDuration || undefined, dodgeChancePercent: dodgeChancePercent || undefined, lifestealPercent: lifestealPercent || undefined,
cooldownReductionPercent: cooldownReductionPercent || undefined, stunDuration: stunDuration || undefined, statusImmunityDuration: statusImmunityDuration || undefined,
      passiveEffects: passiveEffects.length ? passiveEffects : undefined,
      equipmentStrengthBonus: category === 'equipment' ? Math.max(0, equipmentStrengthBonus) : undefined,
      equipmentDurabilityBonus: category === 'equipment' ? Math.max(0, equipmentDurabilityBonus) : undefined,
      equipmentAgilityBonus: category === 'equipment' ? Math.max(0, equipmentAgilityBonus) : undefined,
      equipmentMagicBonus: category === 'equipment' ? Math.max(0, equipmentMagicBonus) : undefined,
      equipmentMaxHpBonus: category === 'equipment' ? Math.max(0, equipmentMaxHpBonus) : undefined,
      equipmentAttackPercent: category === 'equipment' ? Math.max(0, equipmentAttackPercent) : undefined,
      equipmentDefensePercent: category === 'equipment' ? Math.max(0, equipmentDefensePercent) : undefined,
      equipmentMagicPercent: category === 'equipment' ? Math.max(0, equipmentMagicPercent) : undefined,
      equipmentAttackDuration: category === 'equipment' && equipmentAttackPercent > 0 ? Math.max(1, Math.floor(equipmentAttackDuration || 1)) : undefined,
      equipmentDefenseDuration: category === 'equipment' && equipmentDefensePercent > 0 ? Math.max(1, Math.floor(equipmentDefenseDuration || 1)) : undefined,
      equipmentMagicDuration: category === 'equipment' && equipmentMagicPercent > 0 ? Math.max(1, Math.floor(equipmentMagicDuration || 1)) : undefined,
      gachaRateMultiplier: gachaRateMultiplier || undefined, gachaRateMinRarity: gachaRateMultiplier > 0 ? gachaRateMinRarity : undefined,
      usableByPlayers: true, adminOnly: !inShop, inShop, rewardEligible, stackable,
      equipped: old?.equipped || false,
    };
    try {
      const wasEditing = Boolean(editingId);
      if (wasEditing) await onUpdateItem(item); else await onAddItem(item);
      reset();
      alert(wasEditing ? 'บันทึกไอเทมแล้ว' : 'สร้างไอเทมแล้ว');
    } catch (error) {
      console.error(error); alert('บันทึกไอเทมไม่สำเร็จ');
    }
  };

  const safeItems = Array.isArray(shopItems) ? shopItems.filter(Boolean) : [];
  const query = search.trim().toLowerCase();
  const filtered = safeItems.filter(i => !query || String(i.name ?? '').toLowerCase().includes(query) || String(i.id ?? '').toLowerCase().includes(query));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-slate-900/90 border border-fuchsia-500/30 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center"><Package className="w-6 h-6 text-fuchsia-300"/></div>
            <div><h2 className="text-xl font-black text-white">จัดการไอเทมของเว็บ</h2><p className="text-xs text-slate-400">คลังกลางของไอเทมทั้งหมดในระบบ</p></div>
          </div>
          <div className="flex gap-2 text-xs"><span className="px-3 py-1.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300">ทั้งหมด {safeItems.length}</span><span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300">ในร้านค้า {safeItems.filter(i=>i.inShop===true&&!i.adminOnly).length}</span></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          <form onSubmit={submit} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-black text-white">{editingId ? 'แก้ไขไอเทม' : 'สร้างไอเทมใหม่'}</h3>{editingId && <button type="button" onClick={reset} className="text-xs text-slate-400 flex gap-1 items-center"><X className="w-3 h-3"/>ยกเลิก</button>}</div>
            <input className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white" placeholder="ชื่อไอเทม" value={name} onChange={e=>setName(e.target.value)}/>
            <textarea className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white min-h-20" placeholder="คำอธิบาย" value={description} onChange={e=>setDescription(e.target.value)}/>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-400">ราคา<input className="w-full mt-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white" type="number" min="0" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>
              <label className="text-[11px] text-slate-400">ผล/จำนวน<input className="w-full mt-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white" type="number" min="0" value={effectValue} onChange={e=>setEffectValue(Number(e.target.value))}/></label>
            </div>
            <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={category} onChange={e=>setCategory(e.target.value as any)}><option value="consumable">ของใช้</option><option value="equipment">อุปกรณ์</option></select>
            {category === 'equipment' && <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-3">
              <div><div className="text-xs font-black text-cyan-200">🛡️ ค่าพลังเมื่อสวมใส่</div><p className="mt-1 text-[10px] leading-4 text-slate-400">ได้รับทันทีเมื่อสวมอุปกรณ์ และถูกหักกลับเมื่อถอดออก</p></div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">ความแข็งแกร่ง STR<input type="number" min="0" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentStrengthBonus} onChange={e=>setEquipmentStrengthBonus(Number(e.target.value))}/></label>
                <label className="text-[10px] text-slate-400">ความทนทาน DUR<input type="number" min="0" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentDurabilityBonus} onChange={e=>setEquipmentDurabilityBonus(Number(e.target.value))}/></label>
                <label className="text-[10px] text-slate-400">ความคล่องตัว AGI<input type="number" min="0" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentAgilityBonus} onChange={e=>setEquipmentAgilityBonus(Number(e.target.value))}/></label>
                <label className="text-[10px] text-slate-400">พลังเวท MAG<input type="number" min="0" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentMagicBonus} onChange={e=>setEquipmentMagicBonus(Number(e.target.value))}/></label>
                <label className="text-[10px] text-slate-400">Max HP เมื่อสวมใส่<input type="number" min="0" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentMaxHpBonus} onChange={e=>setEquipmentMaxHpBonus(Number(e.target.value))}/></label>
              </div>
              <div className="border-t border-cyan-500/20 pt-3"><div className="text-[11px] font-bold text-orange-300 mb-2">⚔️ โบนัสพลังต่อสู้เมื่อสวมใส่</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-400">พลังโจมตี + (%)<input type="number" min="0" max="1000" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentAttackPercent} onChange={e=>setEquipmentAttackPercent(Number(e.target.value))}/></label>
                  <label className="text-[10px] text-slate-400">ระยะเวลาโจมตี (เทิร์น)<input type="number" min="1" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentAttackDuration} onChange={e=>setEquipmentAttackDuration(Number(e.target.value))}/></label>
                  <label className="text-[10px] text-slate-400">ความทนทาน/ลดความเสียหาย + (%)<input type="number" min="0" max="100" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentDefensePercent} onChange={e=>setEquipmentDefensePercent(Number(e.target.value))}/></label>
                  <label className="text-[10px] text-slate-400">ระยะเวลาป้องกัน (เทิร์น)<input type="number" min="1" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentDefenseDuration} onChange={e=>setEquipmentDefenseDuration(Number(e.target.value))}/></label>
                  <label className="text-[10px] text-slate-400">พลังเวท + (%)<input type="number" min="0" max="1000" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentMagicPercent} onChange={e=>setEquipmentMagicPercent(Number(e.target.value))}/></label>
                  <label className="text-[10px] text-slate-400">ระยะเวลาพลังเวท (เทิร์น)<input type="number" min="1" className="w-full mt-1 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white" value={equipmentMagicDuration} onChange={e=>setEquipmentMagicDuration(Number(e.target.value))}/></label>
                </div>
              </div>
            </div>}
            <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={rarity} onChange={e=>setRarity(e.target.value as GachaRarity)}><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option><option value="mythic">Mythic</option></select>
            <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={effectType} onChange={e=>setEffectType(e.target.value as any)}><option value="heal_hp">ฟื้น HP</option><option value="boost_max_hp">เพิ่ม Max HP</option><option value="buff_stat">เพิ่มสเตตัส</option><option value="enhance_skill">เสริมสกิล</option><option value="custom">กำหนดเอง</option></select>
            {effectType === 'heal_hp' && <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-400">ฟื้น HP (หน่วย)<input className="w-full mt-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white" type="number" min="0" value={effectValue} onChange={e=>setEffectValue(Number(e.target.value))}/></label><label className="text-[11px] text-slate-400">ฟื้น HP (%)<input className="w-full mt-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white" type="number" min="0" max="100" value={healPercent} onChange={e=>setHealPercent(Number(e.target.value))}/></label></div>}
            {effectType === 'boost_max_hp' && <label className="text-[11px] text-slate-400 block">เพิ่ม Max HP<input className="w-full mt-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white" type="number" min="0" value={hpBonus || effectValue} onChange={e=>{setHpBonus(Number(e.target.value));setEffectValue(Number(e.target.value))}}/></label>}
            {effectType === 'buff_stat' && <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={targetStat} onChange={e=>setTargetStat(e.target.value as any)}><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>}
            {effectType === 'enhance_skill' && <div className="space-y-2"><input className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" placeholder="ชื่อ/ID สกิลที่เสริม" value={skillTarget} onChange={e=>setSkillTarget(e.target.value)}/><textarea className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" placeholder="ความสามารถที่เพิ่มให้สกิล" value={skillDesc} onChange={e=>setSkillDesc(e.target.value)}/></div>}
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-white">ไอคอนไอเทม</span>{iconPreview && <button type="button" onClick={()=>setIconPreview(null)} className="text-[10px] text-rose-300">ใช้ไอคอนเดิม</button>}</div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center overflow-hidden">
                  {isImageIcon(iconPreview) ? <img src={iconPreview} alt="รูปไอเทม" className="w-full h-full object-cover" onError={()=>setIconPreview(null)} /> : <Package className="w-6 h-6 text-slate-500" />}
                </div>
                <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-fuchsia-500/40 bg-fuchsia-500/5 p-3 text-center text-xs text-fuchsia-200 hover:bg-fuchsia-500/10">
                  <UploadCloud className="w-4 h-4 mx-auto mb-1" />เลือกรูปจากเครื่อง
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e=>{
                    const file=e.target.files?.[0]; if(!file) return;
                    if(file.size>1024*1024){alert('รูปไอคอนต้องไม่เกิน 1MB'); e.currentTarget.value=''; return;}
                    const reader=new FileReader();
                    reader.onload=()=>setIconPreview(String(reader.result));
                    reader.readAsDataURL(file);
                  }}/>
                </label>
              </div>
              <select className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-sm" value={iconPreview ? '__uploaded__' : icon} onChange={e=>{if(e.target.value!=='__uploaded__') {setIcon(e.target.value); setIconPreview(null);}}}>{icons.map(x=><option key={x} value={x}>{x}</option>)}{iconPreview && <option value="__uploaded__">รูปที่อัปโหลด</option>}</select>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2"><div className="text-xs font-bold text-white">ประเภทไอเทม</div><select className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-sm" value={itemClass} onChange={e=>setItemClass(e.target.value as any)}><option value="normal">ไอเทมธรรมดา</option><option value="special">ไอเทมพิเศษ</option><option value="limited">ไอเทม Limited</option></select>{itemClass==='limited' && <input className="w-full rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-sm" type="number" min="0" placeholder="จำนวน Stock Limited" value={limitedStock} onChange={e=>setLimitedStock(Number(e.target.value))}/>}</div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-3"><div className="text-xs font-bold text-white">ลูกเล่นพิเศษของไอเทม <span className="text-slate-500 font-normal">(เว้นไว้ = ไม่เกิดผล)</span></div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ชุบชีวิตได้กี่ % ของ Max HP" value={revivePercent} onChange={e=>setRevivePercent(Number(e.target.value))}/>
                <label className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-xs text-white"><input type="checkbox" checked={reviveAlly} onChange={e=>setReviveAlly(e.target.checked)}/> ใช้ชุบเพื่อนได้</label>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="โล่ป้องกันกี่ % ของ Max HP" value={shieldPercent} onChange={e=>setShieldPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โล่อยู่กี่เทิร์น" value={shieldDuration} onChange={e=>setShieldDuration(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ลดความเสียหายกี่ %" value={damageReductionPercent} onChange={e=>setDamageReductionPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="โอกาสหลบหลีกกี่ %" value={dodgeChancePercent} onChange={e=>setDodgeChancePercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ดูดเลือดกี่ %" value={lifestealPercent} onChange={e=>setLifestealPercent(Number(e.target.value))}/>
                
                
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ลดคูลดาวน์กี่ %" value={cooldownReductionPercent} onChange={e=>setCooldownReductionPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="ต้านสถานะกี่เทิร์น" value={statusImmunityDuration} onChange={e=>setStatusImmunityDuration(Number(e.target.value))}/>
                <label className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-xs text-white"><input type="checkbox" checked={cleanseNegative} onChange={e=>setCleanseNegative(e.target.checked)}/> ล้างสถานะผิดปกติเมื่อใช้</label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2"><div className="text-xs font-bold text-white">ความสามารถเพิ่มเติมในการต่อสู้ / กาชา</div><div className="grid grid-cols-2 gap-2"><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โบนัสพลังโจมตี Damage %" value={battleDamagePercent} onChange={e=>setBattleDamagePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="บัฟ Damage อยู่กี่เทิร์น" value={battleDamageDuration} onChange={e=>setBattleDamageDuration(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โอกาส Critical กี่ %" value={battleCriticalChancePercent} onChange={e=>setBattleCriticalChancePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โอกาสตีซ้ำกี่ %" value={battleRepeatAttackChancePercent} onChange={e=>setBattleRepeatAttackChancePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="ตัวคูณโชค เช่น 2 = x2" value={battleLuckMultiplier} onChange={e=>setBattleLuckMultiplier(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โชคอยู่กี่เทิร์น" value={battleLuckDuration} onChange={e=>setBattleLuckDuration(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="ตัวคูณเรทกาชา เช่น 2 = x2" value={gachaRateMultiplier} onChange={e=>setGachaRateMultiplier(Number(e.target.value))}/><select className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" value={gachaRateMinRarity} onChange={e=>setGachaRateMinRarity(e.target.value as GachaRarity)}><option value="rare">ขั้นต่ำ Rare</option><option value="epic">ขั้นต่ำ Epic</option><option value="legendary">ขั้นต่ำ Legendary</option><option value="mythic">ขั้นต่ำ Mythic</option></select></div></div>
            <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 space-y-2"><div className="text-xs font-bold text-fuchsia-200">Passive ติดตัว (เพิ่มได้หลายอัน)</div><div className="grid grid-cols-2 gap-2"><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" placeholder="ชื่อ Passive" value={passiveName} onChange={e=>setPassiveName(e.target.value)}/><select className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" value={passiveTrigger} onChange={e=>setPassiveTrigger(e.target.value as any)}><option value="attack">ตอนโจมตี</option><option value="turn_start">เริ่มเทิร์น</option></select><select className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" value={passiveKind} onChange={e=>setPassiveKind(e.target.value as any)}><option value="stack">Stack</option><option value="damage">Damage</option><option value="damage_percent">Damage %</option><option value="heal">ฟื้น HP</option><option value="heal_percent">ฟื้น HP %</option><option value="shield">Shield</option><option value="reflect">Reflect</option><option value="repeat_attack_chance">Repeat Attack</option><option value="critical_chance">Critical Chance</option><option value="buff_stat">เพิ่ม Stat</option></select><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" placeholder="ค่า" value={passiveValue} onChange={e=>setPassiveValue(Number(e.target.value))}/><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" min="0" max="100" placeholder="โอกาส %" value={passiveChance} onChange={e=>setPassiveChance(Number(e.target.value))}/><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" min="1" placeholder="ระยะเวลา" value={passiveDuration} onChange={e=>setPassiveDuration(Number(e.target.value))}/></div><button type="button" className="w-full rounded-lg bg-fuchsia-600/20 border border-fuchsia-500/30 py-2 text-xs font-bold text-fuchsia-200" onClick={()=>{setPassiveEffects(p=>[...p,{id:`passive-${Date.now()}`,name:passiveName.trim()||'Passive',trigger:passiveTrigger,kind:passiveKind,value:Math.max(0,passiveValue),chance:Math.max(0,Math.min(100,passiveChance)),duration:Math.max(1,passiveDuration),maxStacks:Math.max(1,passiveMaxStacks),targetStat:passiveKind==='buff_stat'?passiveTargetStat:undefined}]);}}>+ เพิ่ม Passive</button>{passiveEffects.map(p=><div key={p.id} className="flex justify-between text-[10px] text-fuchsia-100 bg-slate-950/50 p-2 rounded-lg"><span>{p.name} · {p.kind} · {p.value} · {p.chance}%</span><button type="button" className="text-rose-300" onClick={()=>setPassiveEffects(prev=>prev.filter(v=>v.id!==p.id))}>ลบ</button></div>)}</div>
            <div className="space-y-2">
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Store className="w-4 h-4"/>เพิ่มเข้าร้านค้า</span><input type="checkbox" checked={inShop} onChange={e=>setInShop(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Gift className="w-4 h-4"/>ใช้เป็นรางวัล</span><input type="checkbox" checked={rewardEligible} onChange={e=>setRewardEligible(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Layers className="w-4 h-4"/>Stack ได้</span><input type="checkbox" checked={stackable} onChange={e=>setStackable(e.target.checked)}/></label>
            </div>
            <button className="w-full rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-black py-3 flex justify-center gap-2 items-center"><Save className="w-4 h-4"/>{editingId ? 'บันทึกการแก้ไข' : 'สร้างไอเทม'}</button>
          </form>
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-slate-900/95 to-slate-950/90 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-black text-white"><Eye className="w-4 h-4 text-cyan-300"/> พรีวิวหน้าตาสินค้า</div>
                <span className="text-[10px] font-bold text-emerald-300">LIVE PREVIEW</span>
              </div>
              <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-4">
                <div className="flex gap-3 items-start">
                  <div className="w-20 h-20 rounded-2xl bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {iconPreview ? <img src={iconPreview} alt="ตัวอย่างรูปไอเทม" className="w-full h-full object-cover"/> : <Package className="w-8 h-8 text-slate-500"/>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      <span className="px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[9px] text-cyan-300">{rarity}</span>
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[9px] text-emerald-300">{category === 'equipment' ? 'อุปกรณ์' : 'ไอเทมใช้งาน'}</span>
                    </div>
                    <h3 className="text-lg font-black text-white break-words">{name || 'ชื่อไอเทมตัวอย่าง'}</h3>
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-300 leading-relaxed">{description || 'คำอธิบายไอเทมจะแสดงตรงนี้...'}</p>
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="text-sm font-black text-emerald-300">{getItemEffectSummary({effectType,effectValue,healPercent,hpBonus,targetStat,skillEnhanceTarget:skillTarget})}</div>
                  {getItemExtraDetails({battleDamagePercent,battleCriticalChancePercent,battleRepeatAttackChancePercent,battleLuckMultiplier,gachaRateMultiplier,revivePercent,reviveAlly,cleanseNegative,shieldPercent,damageReductionPercent,dodgeChancePercent,lifestealPercent,cooldownReductionPercent,statusImmunityDuration,stunDuration,passiveEffects}).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{getItemExtraDetails({battleDamagePercent,battleCriticalChancePercent,battleRepeatAttackChancePercent,battleLuckMultiplier,gachaRateMultiplier,revivePercent,reviveAlly,cleanseNegative,shieldPercent,damageReductionPercent,dodgeChancePercent,lifestealPercent,cooldownReductionPercent,statusImmunityDuration,stunDuration,passiveEffects}).map((d,i)=><span key={i} className="text-[10px] px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-slate-300">{d}</span>)}</div>}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4">
                  <div className="text-xl font-black text-amber-300">{Number(price || 0).toLocaleString()} <span className="text-xs text-slate-400">Coins</span></div>
                  <div className="rounded-xl bg-cyan-500/80 px-4 py-2 text-sm font-black text-slate-950">ซื้อไอเทม</div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-b from-slate-900/90 to-slate-950/80 border border-slate-700/70 rounded-3xl p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
              <div><div className="text-lg font-black text-white">คลังไอเทมทั้งหมด</div><div className="text-[11px] text-slate-500">จัดการไอเทมกลางของเว็บไซต์</div></div>
              <div className="flex-1 flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-700 px-3"><Search className="w-4 h-4 text-slate-500"/><input className="flex-1 bg-transparent outline-none p-2.5 text-sm text-white" placeholder="ค้นหาชื่อหรือ ID..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
            </div>
            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {filtered.length === 0 ? <div className="py-16 text-center text-slate-500">ไม่พบไอเทม</div> : filtered.map((item) => { return (
                <div key={item.id} className="group rounded-2xl border border-slate-800 bg-slate-900/90 p-4 hover:border-fuchsia-500/30 hover:bg-slate-800/80 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3 flex-1">
                      <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center">
                        {isImageIcon(item.icon) ? <img src={item.icon} alt={safeText(item.name,'ไอเทม')} className="w-full h-full object-cover" onError={(e)=>{e.currentTarget.style.display='none';}}/> : <Package className="w-5 h-5 text-slate-500"/>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-white truncate">{safeText(item.name,'ไม่มีชื่อ')}</div>
                        <div className="text-[10px] text-slate-500 truncate">ID: {safeText(item.id)}</div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-[9px] px-2 py-1 rounded-full border border-slate-700 text-slate-300">{safeText(item.rarity,'common')}</span>
                          <span className="text-[9px] px-2 py-1 rounded-full border border-emerald-500/30 text-emerald-300">{item.inShop&&!item.adminOnly?'SHOP':'ไม่ลง SHOP'}</span>
                          <span className="text-[9px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-300">{item.rewardEligible===false?'ไม่ใช้เป็นรางวัล':'ใช้เป็นรางวัล'}</span>
                          <span className="text-[9px] px-2 py-1 rounded-full border border-fuchsia-500/30 text-fuchsia-300">{item.stackable===false?'ไม่ Stack':'Stack'}</span>
                          <span className="text-[9px] px-2 py-1 rounded-full border border-cyan-500/30 text-cyan-300">{item.itemClass==='limited'?'LIMITED':item.itemClass==='special'?'SPECIAL':'NORMAL'}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-300 leading-relaxed break-words">{safeText(item.description,'ไม่มีคำอธิบาย')}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-300">{getItemEffectSummary(item)}</span>
                          {getItemExtraDetails(item).map((d,i)=><span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300">{d}</span>)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0"><button type="button" onClick={()=>edit(item)} className="px-3 py-2 rounded-lg bg-cyan-950/60 text-cyan-300 text-xs font-black flex gap-1 items-center"><Edit3 className="w-3 h-3"/>แก้ไข</button><button type="button" onClick={async()=>{if(confirm(`ลบ "${item.name}" ออกจากคลังไอเทมหรือไม่?`)) await onDeleteItem(item.id)}} className="px-3 py-2 rounded-lg bg-rose-950/60 text-rose-300 text-xs font-black flex gap-1 items-center"><Trash2 className="w-3 h-3"/>ลบ</button></div>
                  </div>
                </div>
              ); })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
