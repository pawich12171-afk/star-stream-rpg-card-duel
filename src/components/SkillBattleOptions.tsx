import React from 'react';
import type { BattleBotSkill, BattleSkillCategory, BattleSkillTarget, BattleSkillEffectKind, BattleSkillModifier, CharacterStats, Skill } from '../types';

type SummonUnit = NonNullable<Skill['summonUnits']>[number];

interface Props {
  config: Partial<Skill>;
  onChange: (patch: Partial<Skill>) => void;
  showTarget?: boolean;
}

const num = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const SkillBattleOptions: React.FC<Props> = ({ config, onChange, showTarget = true }) => {
  const target = config.targetMode || 'enemy';
  const category = config.skillCategory || 'attack';
  const modifiers = Array.isArray(config.skillModifiers) ? config.skillModifiers : [];
  const addModifier = (kind: BattleSkillEffectKind) => onChange({ skillModifiers: [...modifiers, { id: 'skill-mod-' + Date.now() + '-' + (modifiers.length + 1), kind, stat: 'strength', value: 10, duration: 3, chance: 100, label: kind === 'buff' ? 'บัฟใหม่' : 'ดีบัฟใหม่' }] });
  const updateModifier = (id: string, patch: Partial<BattleSkillModifier>) => onChange({ skillModifiers: modifiers.map(item => item.id === id ? { ...item, ...patch } : item) });
  const removeModifier = (id: string) => onChange({ skillModifiers: modifiers.filter(item => item.id !== id) });
  const units = Array.isArray(config.summonUnits) ? config.summonUnits : [];
  const addUnit = () => {
    const index = units.length + 1;
    const unit: SummonUnit = {
      id: `summon-unit-${Date.now()}-${index}`,
      name: `ลูกน้อง #${index}`,
      hp: Math.max(1, num(config.summonHp, 50)),
      strength: Math.max(0, num(config.summonStrength ?? config.summonDamage, 10)),
      durability: Math.max(0, num(config.summonDurability, 5)),
      agility: Math.max(0, num(config.summonAgility, 5)),
      magic: Math.max(0, num(config.summonMagic, 0)),
      skills: [],
    };
    onChange({ summonUnits: [...units, unit] });
  };
  const updateUnit = (id: string, patch: Partial<SummonUnit>) =>
    onChange({ summonUnits: units.map(u => u.id === id ? { ...u, ...patch } : u) });
  const removeUnit = (id: string) => onChange({ summonUnits: units.filter(u => u.id !== id) });
  const addUnitSkill = (unit: SummonUnit) => {
    const skill: BattleBotSkill = {
      id: `summon-unit-skill-${Date.now()}`,
      name: 'สกิลใหม่',
      level: 1,
      multiplier: 1,
      type: 'battle',
      description: 'สกิลของลูกน้อง',
      battleEffect: 'damage',
      battlePower: 10,
      cooldownTurns: 0,
      battleUseLimit: 'unlimited',
    };
    updateUnit(unit.id, { skills: [...(unit.skills || []), skill] });
  };
  const updateUnitSkill = (unit: SummonUnit, skillId: string, patch: Partial<BattleBotSkill>) =>
    updateUnit(unit.id, { skills: (unit.skills || []).map(s => s.id === skillId ? { ...s, ...patch } : s) });
  const removeUnitSkill = (unit: SummonUnit, skillId: string) =>
    updateUnit(unit.id, { skills: (unit.skills || []).filter(s => s.id !== skillId) });

  return <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-950/10 p-3">
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-3 space-y-2"><div className="text-[11px] font-black text-cyan-100">🧩 โครงสร้างประเภทสกิล</div><label className="block text-[10px] text-slate-400">ประเภทสกิล<select value={category} onChange={e=>onChange({skillCategory:e.target.value as BattleSkillCategory})} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white"><option value="attack">⚔️ โจมตี / ดาเมจ</option><option value="buff">✨ บัฟ</option><option value="debuff">⚠️ ดีบัฟ</option><option value="control">💫 ควบคุม</option><option value="heal">❤️ ฟื้นฟู</option><option value="defense">🛡️ ป้องกัน</option><option value="summon">🧿 เสกลูกน้อง</option><option value="utility">🧬 Utility</option></select></label><div className="text-[9px] text-slate-500">เลือกประเภทแล้วช่องตั้งค่าด้านล่างจะเปลี่ยนตามประเภท และเพิ่มบัฟ/ดีบัฟได้หลายรายการพร้อมกัน</div></div>
    {showTarget && <label className="block text-[10px] text-slate-400">
      🎯 เป้าหมายของสกิล
      <select value={target} onChange={e=>onChange({targetMode:e.target.value as BattleSkillTarget})} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white">
        <option value="self">ตัวผู้ใช้</option><option value="enemy">ศัตรู 1 ตัว</option><option value="selected_enemy">🎯 เลือกศัตรูเอง</option><option value="selected_ally">🤝 เลือกเพื่อนร่วมทีมเอง</option><option value="selected_bots">👾 เลือกมอน/ลูกน้องหลายตัว</option><option value="selected_bosses">👑 เลือกบอสหลายตัว</option>
        <option value="all_allies">💚 พวกเดียวกันทั้งหมด (หมู่)</option><option value="all_enemies">🔥 ศัตรูทั้งหมด (หมู่)</option><option value="all_combatants">🌐 ทุกคนในสนาม</option>
      </select>
    </label>}
    {showTarget && ['selected_enemy','selected_ally','selected_bots','selected_bosses'].includes(String(target)) && <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-400/20 bg-amber-950/10 p-2"><label className="text-[9px] text-slate-400">จำนวนเป้าหมายสูงสุด<input type="number" min="1" max="20" value={config.targetConfig?.maxTargets ?? 1} onChange={e=>onChange({targetConfig:{...(config.targetConfig || {mode: target as any}), mode: target as any, allowMultiple: Number(e.target.value) > 1, maxTargets: Math.max(1, Math.min(20, Number(e.target.value) || 1))}})} className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-white"/></label><label className="flex items-center gap-2 text-[9px] text-slate-300"><input type="checkbox" checked={Boolean(config.targetConfig?.allowMultiple)} onChange={e=>onChange({targetConfig:{...(config.targetConfig || {mode: target as any}), mode: target as any, allowMultiple:e.target.checked, maxTargets: config.targetConfig?.maxTargets ?? 1}})}/> เลือกหลายเป้าหมาย</label></div>}
    {(category === 'buff' || category === 'debuff' || category === 'attack') && <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-950/10 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><div><div className="text-[11px] font-black text-fuchsia-100">✨/⚠️ บัฟและดีบัฟหลายรายการ</div><div className="text-[9px] text-slate-500">กำหนด Stat/สถานะ ค่า ระยะเวลา และโอกาสแยกกันได้</div></div><div className="flex gap-1"><button type="button" onClick={()=>addModifier('buff')} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-100">+ บัฟ</button><button type="button" onClick={()=>addModifier('debuff')} className="rounded-lg bg-rose-500/20 px-2 py-1 text-[9px] text-rose-100">+ ดีบัฟ</button></div></div>{modifiers.map(item=><div key={item.id} className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 p-2"><select value={item.kind} onChange={e=>updateModifier(item.id,{kind:e.target.value as BattleSkillEffectKind})} className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="buff">✨ บัฟ</option><option value="debuff">⚠️ ดีบัฟ</option><option value="status">💫 สถานะ</option><option value="shield">🛡️ โล่</option><option value="cleanse">🧼 ล้างสถานะ</option></select><select value={item.stat || 'strength'} onChange={e=>updateModifier(item.id,{stat:e.target.value as keyof CharacterStats})} className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select><input value={item.status || ''} onChange={e=>updateModifier(item.id,{status:e.target.value})} placeholder="สถานะ เช่น stun/poison" className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><input type="number" value={item.value ?? 0} onChange={e=>updateModifier(item.id,{value:num(e.target.value)})} placeholder="ค่า" className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><input type="number" min="1" value={item.duration ?? 1} onChange={e=>updateModifier(item.id,{duration:Math.max(1,num(e.target.value,1))})} placeholder="เทิร์น" className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><button type="button" onClick={()=>removeModifier(item.id)} className="rounded bg-rose-950/40 text-rose-300 text-[9px]">ลบ</button></div>)}{!modifiers.length && <div className="text-[9px] text-slate-500">ยังไม่มีบัฟ/ดีบัฟที่เพิ่มเอง</div>}</div>}
    {config.battleEffect === 'buff_stat' && <div className="grid grid-cols-3 gap-2">
      <select value={config.buffStat || 'strength'} onChange={e=>onChange({buffStat:e.target.value as keyof CharacterStats})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs">
        <option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option>
      </select>
      <input type="number" value={config.buffAmount ?? 10} onChange={e=>onChange({buffAmount:num(e.target.value)})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs" placeholder="เพิ่ม"/>
      <input type="number" min="1" value={config.buffDuration ?? 3} onChange={e=>onChange({buffDuration:Math.max(1,num(e.target.value,3))})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs" placeholder="เทิร์น"/>
    </div>}
    {config.battleEffect === 'summon' && <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={config.summonName || ''} onChange={e=>onChange({summonName:e.target.value})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs" placeholder="ชื่อกลุ่มลูกน้อง"/>
        <input type="number" min="1" max="20" value={config.summonMaxCount ?? 1} onChange={e=>onChange({summonMaxCount:Math.max(1,Math.min(20,num(e.target.value,1)))})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs" placeholder="จำนวนสูงสุด"/>
        <input type="number" min="1" max="20" value={config.summonPerUse ?? 1} onChange={e=>onChange({summonPerUse:Math.max(1,Math.min(20,num(e.target.value,1)))})} className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white text-xs" placeholder="เสกต่อครั้ง"/>
        <label className="text-[10px] text-slate-400 flex items-center gap-2 rounded-lg bg-slate-950 border border-slate-700 px-2"><input type="checkbox" checked={Boolean(config.summonIsBoss)} onChange={e=>onChange({summonIsBoss:e.target.checked})}/> Boss</label>
      </div>
      <div className="text-[10px] text-violet-200 font-black">🧿 ตั้งค่าลูกน้องแต่ละตัวแยกกัน</div>
      {units.map((u,index)=><div key={u.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 space-y-2">
        <div className="flex items-center justify-between"><span className="text-xs font-bold text-white">ตัวที่ {index+1}</span><button type="button" onClick={()=>removeUnit(u.id)} className="text-rose-300 text-[10px]">ลบ</button></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input value={u.name} onChange={e=>updateUnit(u.id,{name:e.target.value})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="ชื่อ"/>
          <input type="number" value={u.hp} onChange={e=>updateUnit(u.id,{hp:Math.max(1,num(e.target.value,1))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="HP"/>
          <input type="number" value={u.strength} onChange={e=>updateUnit(u.id,{strength:Math.max(0,num(e.target.value))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="STR"/>
          <input type="number" value={u.durability} onChange={e=>updateUnit(u.id,{durability:Math.max(0,num(e.target.value))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="DUR"/>
          <input type="number" value={u.agility} onChange={e=>updateUnit(u.id,{agility:Math.max(0,num(e.target.value))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="AGI"/>
          <input type="number" value={u.magic} onChange={e=>updateUnit(u.id,{magic:Math.max(0,num(e.target.value))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white text-xs" placeholder="MAG"/>
        </div>
        <div className="space-y-1">
          {(u.skills || []).map(s=><div key={s.id} className="grid grid-cols-2 gap-1.5">
            <input value={s.name} onChange={e=>updateUnitSkill(u,s.id,{name:e.target.value})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="ชื่อสกิล"/>
            <select value={s.battleEffect || 'damage'} onChange={e=>updateUnitSkill(u,s.id,{battleEffect:e.target.value as any})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]"><option value="damage">โจมตี</option><option value="heal">ฮีล</option><option value="defense">ป้องกัน</option><option value="buff_stat">บัพสเตตัส</option><option value="stun">สตัน</option><option value="summon">เสก</option></select>
            <select value={s.targetMode || 'enemy'} onChange={e=>updateUnitSkill(u,s.id,{targetMode:e.target.value as any})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]"><option value="enemy">🎯 ศัตรู 1 ตัว</option><option value="self">ตัวเอง</option><option value="all_allies">💚 พวกเดียวกันทั้งหมด</option><option value="all_enemies">🔥 ศัตรูทั้งหมด</option></select>
            <input type="number" value={s.battlePower ?? 10} onChange={e=>updateUnitSkill(u,s.id,{battlePower:num(e.target.value,10)})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="พลัง"/>
            <input value={s.description || ''} onChange={e=>updateUnitSkill(u,s.id,{description:e.target.value})} className="col-span-2 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="คำอธิบายสกิล"/>
            {s.battleEffect === 'buff_stat' && <div className="col-span-2 grid grid-cols-3 gap-1">
              <select value={s.buffStat || 'strength'} onChange={e=>updateUnitSkill(u,s.id,{buffStat:e.target.value as any})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>
              <input type="number" value={s.buffAmount ?? s.battlePower ?? 10} onChange={e=>updateUnitSkill(u,s.id,{buffAmount:num(e.target.value,10)})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="บัพ"/>
              <input type="number" min="1" value={s.buffDuration ?? 3} onChange={e=>updateUnitSkill(u,s.id,{buffDuration:Math.max(1,num(e.target.value,3))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="เทิร์น"/>
            </div>}
            <input type="number" min="0" value={s.cooldownTurns ?? 0} onChange={e=>updateUnitSkill(u,s.id,{cooldownTurns:Math.max(0,num(e.target.value))})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="คูลดาวน์"/>
            <button type="button" onClick={()=>removeUnitSkill(u,s.id)} className="rounded bg-rose-950/40 text-rose-300 text-[10px]">ลบสกิล</button>
          </div>)}
          <button type="button" onClick={()=>addUnitSkill(u)} className="w-full rounded bg-violet-600/20 border border-violet-500/30 py-1.5 text-[10px] text-violet-100">+ เพิ่มสกิลให้ตัวนี้</button>
        </div>
      </div>)}
      <button type="button" onClick={addUnit} className="w-full rounded-lg bg-violet-600/25 border border-violet-500/40 py-2 text-xs font-bold text-violet-100">+ เพิ่มลูกน้องอีกตัว</button>
      <div className="text-[9px] text-slate-500">ถ้าไม่เพิ่มรายตัว ระบบจะใช้ค่ากลางด้านบนเป็นค่าเริ่มต้น</div>
    </div>}
  </div>;
};
