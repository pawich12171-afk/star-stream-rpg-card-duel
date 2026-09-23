import React, { useEffect, useState } from 'react';
import { Item, GachaRarity, ItemPassiveEffect } from '../types';
import { Package, Search, Store, Gift, Layers, Edit3, Trash2, Save, X, UploadCloud } from 'lucide-react';

interface ItemManagementPanelProps {
  shopItems: Item[];
  onAddItem: (item: Item) => void | Promise<void>;
  onUpdateItem: (item: Item) => void | Promise<void>;
  onDeleteItem: (itemId: string) => void | Promise<void>;
}

const icons = ['HeartPulse','Heart','Flame','Flower2','Droplets','Shield','Sword','Sparkles','Gem','Zap','Scroll','Crown','Package'];

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
    setInShop(false); setRewardEligible(true); setStackable(true);
  };

  const edit = (item: Item) => {
    setEditingId(item.id); setName(item.name); setDescription(item.description || '');
    setPrice(item.price || 0); setCategory(item.category); setRarity(item.rarity as GachaRarity);
    setEffectType(item.effectType || 'custom'); setEffectValue(item.effectValue || 0);
    setIcon(item.icon || 'Package'); setIconPreview(item.icon && (item.icon.startsWith('data:') || item.icon.startsWith('http')) ? item.icon : null); setTargetStat(item.targetStat || 'strength');
    setInShop(item.inShop === true && !item.adminOnly);
    setRewardEligible(item.rewardEligible !== false); setStackable(item.stackable !== false);
    setItemClass(item.itemClass || 'normal'); setLimitedStock(item.limitedStock || 0); setHealPercent(item.healPercent || 0); setHpBonus(item.hpBonus || 0);
    setSkillTarget(item.skillEnhanceTarget || ''); setSkillDesc(item.skillEnhanceDesc || ''); setBattleDamagePercent(item.battleDamagePercent || 0); setBattleDamageDuration(item.battleDamageDuration || 0);
    setBattleCriticalChancePercent(item.battleCriticalChancePercent || 0); setBattleRepeatAttackChancePercent(item.battleRepeatAttackChancePercent || 0); setBattleLuckMultiplier(item.battleLuckMultiplier || 0); setBattleLuckDuration(item.battleLuckDuration || 0); setGachaRateMultiplier(item.gachaRateMultiplier || 0); setGachaRateMinRarity(item.gachaRateMinRarity || 'rare'); setBattlePassiveChanceMultiplier(item.battlePassiveChanceMultiplier || 0);
    setRevivePercent(item.revivePercent || 0); setReviveAlly(item.reviveAlly === true); setCleanseNegative(item.cleanseNegative === true); setShieldPercent(item.shieldPercent || 0); setShieldDuration(item.shieldDuration || 0); setDamageReductionPercent(item.damageReductionPercent || 0); setDamageReductionDuration(item.damageReductionDuration || 0); setDodgeChancePercent(item.dodgeChancePercent || 0); setLifestealPercent(item.lifestealPercent || 0); setCooldownReductionPercent(item.cooldownReductionPercent || 0); setStunDuration(item.stunDuration || 0); setStatusImmunityDuration(item.statusImmunityDuration || 0); setPassiveEffects(item.passiveEffects || []);
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

  const filtered = shopItems.filter(i => !search.trim() || i.name.toLowerCase().includes(search.toLowerCase()) || i.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-slate-900/90 border border-fuchsia-500/30 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center"><Package className="w-6 h-6 text-fuchsia-300"/></div>
            <div><h2 className="text-xl font-black text-white">จัดการไอเทมของเว็บ</h2><p className="text-xs text-slate-400">คลังกลางของไอเทมทั้งหมดในระบบ</p></div>
          </div>
          <div className="flex gap-2 text-xs"><span className="px-3 py-1.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300">ทั้งหมด {shopItems.length}</span><span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300">ในร้านค้า {shopItems.filter(i=>i.inShop===true&&!i.adminOnly).length}</span></div>
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
                  {iconPreview ? <img src={iconPreview} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-slate-500" />}
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
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ฟื้นคืนชีพ %" value={revivePercent} onChange={e=>setRevivePercent(Number(e.target.value))}/>
                <label className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-xs text-white"><input type="checkbox" checked={reviveAlly} onChange={e=>setReviveAlly(e.target.checked)}/> ใช้ชุบเพื่อนได้</label>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="โล่ป้องกัน %" value={shieldPercent} onChange={e=>setShieldPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โล่กี่เทิร์น" value={shieldDuration} onChange={e=>setShieldDuration(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ลดความเสียหาย %" value={damageReductionPercent} onChange={e=>setDamageReductionPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="หลบหลีก %" value={dodgeChancePercent} onChange={e=>setDodgeChancePercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ดูดเลือด %" value={lifestealPercent} onChange={e=>setLifestealPercent(Number(e.target.value))}/>
                
                
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" max="100" placeholder="ลด Cooldown %" value={cooldownReductionPercent} onChange={e=>setCooldownReductionPercent(Number(e.target.value))}/>
                <input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="ต้านสถานะ (เทิร์น)" value={statusImmunityDuration} onChange={e=>setStatusImmunityDuration(Number(e.target.value))}/>
                <label className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-xs text-white"><input type="checkbox" checked={cleanseNegative} onChange={e=>setCleanseNegative(e.target.checked)}/> ล้างสถานะผิดปกติเมื่อใช้</label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2"><div className="text-xs font-bold text-white">ความสามารถเพิ่มเติมในการต่อสู้ / กาชา</div><div className="grid grid-cols-2 gap-2"><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="โบนัส Damage %" value={battleDamagePercent} onChange={e=>setBattleDamagePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="จำนวนเทิร์น Damage" value={battleDamageDuration} onChange={e=>setBattleDamageDuration(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="Critical Chance %" value={battleCriticalChancePercent} onChange={e=>setBattleCriticalChancePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="Repeat Attack %" value={battleRepeatAttackChancePercent} onChange={e=>setBattleRepeatAttackChancePercent(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="Luck Multiplier" value={battleLuckMultiplier} onChange={e=>setBattleLuckMultiplier(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="Luck Duration" value={battleLuckDuration} onChange={e=>setBattleLuckDuration(Number(e.target.value))}/><input className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" type="number" min="0" placeholder="Gacha Rate Multiplier" value={gachaRateMultiplier} onChange={e=>setGachaRateMultiplier(Number(e.target.value))}/><select className="rounded-xl bg-slate-950 border border-slate-700 p-2.5 text-white text-xs" value={gachaRateMinRarity} onChange={e=>setGachaRateMinRarity(e.target.value as GachaRarity)}><option value="rare">ขั้นต่ำ Rare</option><option value="epic">ขั้นต่ำ Epic</option><option value="legendary">ขั้นต่ำ Legendary</option><option value="mythic">ขั้นต่ำ Mythic</option></select></div></div>
            <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 space-y-2"><div className="text-xs font-bold text-fuchsia-200">Passive ติดตัว (เพิ่มได้หลายอัน)</div><div className="grid grid-cols-2 gap-2"><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" placeholder="ชื่อ Passive" value={passiveName} onChange={e=>setPassiveName(e.target.value)}/><select className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" value={passiveTrigger} onChange={e=>setPassiveTrigger(e.target.value as any)}><option value="attack">ตอนโจมตี</option><option value="turn_start">เริ่มเทิร์น</option></select><select className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" value={passiveKind} onChange={e=>setPassiveKind(e.target.value as any)}><option value="stack">Stack</option><option value="damage">Damage</option><option value="damage_percent">Damage %</option><option value="heal">ฟื้น HP</option><option value="heal_percent">ฟื้น HP %</option><option value="shield">Shield</option><option value="reflect">Reflect</option><option value="repeat_attack_chance">Repeat Attack</option><option value="critical_chance">Critical Chance</option><option value="buff_stat">เพิ่ม Stat</option></select><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" placeholder="ค่า" value={passiveValue} onChange={e=>setPassiveValue(Number(e.target.value))}/><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" min="0" max="100" placeholder="โอกาส %" value={passiveChance} onChange={e=>setPassiveChance(Number(e.target.value))}/><input className="rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white" type="number" min="1" placeholder="ระยะเวลา" value={passiveDuration} onChange={e=>setPassiveDuration(Number(e.target.value))}/></div><button type="button" className="w-full rounded-lg bg-fuchsia-600/20 border border-fuchsia-500/30 py-2 text-xs font-bold text-fuchsia-200" onClick={()=>{setPassiveEffects(p=>[...p,{id:`passive-${Date.now()}`,name:passiveName.trim()||'Passive',trigger:passiveTrigger,kind:passiveKind,value:Math.max(0,passiveValue),chance:Math.max(0,Math.min(100,passiveChance)),duration:Math.max(1,passiveDuration),maxStacks:Math.max(1,passiveMaxStacks),targetStat:passiveKind==='buff_stat'?passiveTargetStat:undefined}]);}}>+ เพิ่ม Passive</button>{passiveEffects.map(p=><div key={p.id} className="flex justify-between text-[10px] text-fuchsia-100 bg-slate-950/50 p-2 rounded-lg"><span>{p.name} · {p.kind} · {p.value} · {p.chance}%</span><button type="button" className="text-rose-300" onClick={()=>setPassiveEffects(prev=>prev.filter(v=>v.id!==p.id))}>ลบ</button></div>)}</div>
            <div className="space-y-2">
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Store className="w-4 h-4"/>เพิ่มเข้าร้านค้า</span><input type="checkbox" checked={inShop} onChange={e=>setInShop(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Gift className="w-4 h-4"/>ใช้เป็นรางวัล</span><input type="checkbox" checked={rewardEligible} onChange={e=>setRewardEligible(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Layers className="w-4 h-4"/>Stack ได้</span><input type="checkbox" checked={stackable} onChange={e=>setStackable(e.target.checked)}/></label>
            </div>
            <button className="w-full rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-black py-3 flex justify-center gap-2 items-center"><Save className="w-4 h-4"/>{editingId ? 'บันทึกการแก้ไข' : 'สร้างไอเทม'}</button>
          </form>
          <div className="lg:col-span-2 bg-gradient-to-b from-slate-900/90 to-slate-950/80 border border-slate-700/70 rounded-3xl p-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
              <div><div className="text-lg font-black text-white">คลังไอเทมทั้งหมด</div><div className="text-[11px] text-slate-500">จัดการไอเทมกลางของเว็บไซต์</div></div>
              <div className="flex-1 flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-700 px-3"><Search className="w-4 h-4 text-slate-500"/><input className="flex-1 bg-transparent outline-none p-2.5 text-sm text-white" placeholder="ค้นหาชื่อหรือ ID..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
            </div>
            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {filtered.length === 0 ? <div className="py-16 text-center text-slate-500">ไม่พบไอเทม</div> : filtered.map((item) => (
                <div key={item.id} className="group rounded-2xl border border-slate-800 bg-slate-900/90 p-4 hover:border-fuchsia-500/30 hover:bg-slate-800/80 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center">{item.icon?.startsWith("data:") || item.icon?.startsWith("http") ? <img src={item.icon} alt="" className="w-full h-full object-cover"/> : <Package className="w-5 h-5 text-slate-500"/>}</div>
                      <div className="min-w-0"><div className="font-black text-white truncate">{item.name}</div><div className="text-[10px] text-slate-500">ID: {item.id}</div>
                        <div className="flex flex-wrap gap-1.5 mt-2"><span className="text-[9px] px-2 py-1 rounded-full border border-slate-700 text-slate-300">{item.rarity}</span><span className="text-[9px] px-2 py-1 rounded-full border border-emerald-500/30 text-emerald-300">{item.inShop&&!item.adminOnly?'SHOP':'ไม่ลง SHOP'}</span><span className="text-[9px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-300">{item.rewardEligible===false?'ไม่ใช้เป็นรางวัล':'ใช้เป็นรางวัล'}</span><span className="text-[9px] px-2 py-1 rounded-full border border-fuchsia-500/30 text-fuchsia-300">{item.stackable===false?'ไม่ Stack':'Stack'}</span><span className="text-[9px] px-2 py-1 rounded-full border border-cyan-500/30 text-cyan-300">{item.itemClass==='limited'?'LIMITED':item.itemClass==='special'?'SPECIAL':'NORMAL'}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0"><button type="button" onClick={()=>edit(item)} className="px-3 py-2 rounded-lg bg-cyan-950/60 text-cyan-300 text-xs font-black flex gap-1 items-center"><Edit3 className="w-3 h-3"/>แก้ไข</button><button type="button" onClick={async()=>{if(confirm(`ลบ "${item.name}" ออกจากคลังไอเทมหรือไม่?`)) await onDeleteItem(item.id)}} className="px-3 py-2 rounded-lg bg-rose-950/60 text-rose-300 text-xs font-black flex gap-1 items-center"><Trash2 className="w-3 h-3"/>ลบ</button></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
