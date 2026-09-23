import React, { useEffect, useState } from 'react';
import { Item, GachaRarity } from '../types';
import { Package, Search, Store, Gift, Layers, Edit3, Trash2, Save, X } from 'lucide-react';

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
  const [targetStat, setTargetStat] = useState<'strength'|'durability'|'agility'|'magic'>('strength');
  const [inShop, setInShop] = useState(false);
  const [rewardEligible, setRewardEligible] = useState(true);
  const [stackable, setStackable] = useState(true);

  const reset = () => {
    setEditingId(null); setName(''); setDescription(''); setPrice(0);
    setCategory('consumable'); setRarity('common'); setEffectType('heal_hp');
    setEffectValue(10); setIcon('HeartPulse'); setTargetStat('strength');
    setInShop(false); setRewardEligible(true); setStackable(true);
  };

  const edit = (item: Item) => {
    setEditingId(item.id); setName(item.name); setDescription(item.description || '');
    setPrice(item.price || 0); setCategory(item.category); setRarity(item.rarity as GachaRarity);
    setEffectType(item.effectType || 'custom'); setEffectValue(item.effectValue || 0);
    setIcon(item.icon || 'Package'); setTargetStat(item.targetStat || 'strength');
    setInShop(item.inShop === true && !item.adminOnly);
    setRewardEligible(item.rewardEligible !== false); setStackable(item.stackable !== false);
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
      icon, targetStat: effectType === 'buff_stat' ? targetStat : undefined,
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
            {effectType === 'buff_stat' && <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={targetStat} onChange={e=>setTargetStat(e.target.value as any)}><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>}
            <select className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white text-sm" value={icon} onChange={e=>setIcon(e.target.value)}>{icons.map(x=><option key={x} value={x}>{x}</option>)}</select>
            <div className="space-y-2">
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Store className="w-4 h-4"/>เพิ่มเข้าร้านค้า</span><input type="checkbox" checked={inShop} onChange={e=>setInShop(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Gift className="w-4 h-4"/>ใช้เป็นรางวัล</span><input type="checkbox" checked={rewardEligible} onChange={e=>setRewardEligible(e.target.checked)}/></label>
              <label className="flex justify-between items-center rounded-xl border border-slate-700 p-3 text-xs text-white"><span className="flex gap-2"><Layers className="w-4 h-4"/>Stack ได้</span><input type="checkbox" checked={stackable} onChange={e=>setStackable(e.target.checked)}/></label>
            </div>
            <button className="w-full rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-black py-3 flex justify-center gap-2 items-center"><Save className="w-4 h-4"/>{editingId ? 'บันทึกการแก้ไข' : 'สร้างไอเทม'}</button>
          </form>
          <div className="lg:col-span-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Search className="w-4 h-4 text-slate-500"/><input className="flex-1 rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" placeholder="ค้นหาชื่อหรือ ID..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <div className="space-y-2 max-h-[650px] overflow-y-auto">
              {filtered.map(item => <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0"><div className="font-black text-white truncate">{item.name}</div><div className="text-[10px] text-slate-500">ID: {item.id}</div><div className="flex flex-wrap gap-1.5 mt-2"><span className="text-[9px] px-2 py-1 rounded-full border border-slate-700 text-slate-300">{item.rarity}</span><span className="text-[9px] px-2 py-1 rounded-full border border-emerald-500/30 text-emerald-300">{item.inShop&&!item.adminOnly?'SHOP':'ไม่ลง SHOP'}</span><span className="text-[9px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-300">{item.rewardEligible===false?'ไม่ใช้เป็นรางวัล':'ใช้เป็นรางวัล'}</span><span className="text-[9px] px-2 py-1 rounded-full border border-fuchsia-500/30 text-fuchsia-300">{item.stackable===false?'ไม่ Stack':'Stack'}</span></div></div>
                  <div className="flex gap-2 shrink-0"><button type="button" onClick={()=>edit(item)} className="px-3 py-2 rounded-lg bg-cyan-950/60 text-cyan-300 text-xs font-black flex gap-1 items-center"><Edit3 className="w-3 h-3"/>แก้ไข</button><button type="button" onClick={async()=>{if(confirm(`ลบ "${item.name}" ออกจากคลังไอเทมหรือไม่?`)) await onDeleteItem(item.id)}} className="px-3 py-2 rounded-lg bg-rose-950/60 text-rose-300 text-xs font-black flex gap-1 items-center"><Trash2 className="w-3 h-3"/>ลบ</button></div>
                </div>
              </div>)}
              {filtered.length===0 && <div className="py-16 text-center text-slate-500">ไม่พบไอเทม</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
