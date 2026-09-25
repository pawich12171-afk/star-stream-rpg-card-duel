import React from 'react';
import type { BattleBotSkill, BattleSkillTarget, CharacterStats, Skill } from '../types';

type SummonUnit = NonNullable<Skill['summonUnits']>[number];

interface Props {
  config: Partial<Skill>;
  onChange: (patch: Partial<Skill>) => void;
  showTarget?: boolean;
}

const num = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const SkillBattleOptions: React.FC<Props> = ({ config, onChange, showTarget = true }) => {
  const target = config.targetMode || 'enemy';
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
    {showTarget && <label className="block text-[10px] text-slate-400">
      🎯 เป้าหมายของสกิล
      <select value={target} onChange={e=>onChange({targetMode:e.target.value as BattleSkillTarget})} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white">
        <option value="self">ตัวผู้ใช้</option><option value="enemy">ศัตรู 1 ตัว</option>
        <option value="all_allies">💚 พวกเดียวกันทั้งหมด (หมู่)</option><option value="all_enemies">🔥 ศัตรูทั้งหมด (หมู่)</option><option value="all_combatants">🌐 ทุกคนในสนาม</option>
      </select>
    </label>}
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
            <input type="number" value={s.battlePower ?? 10} onChange={e=>updateUnitSkill(u,s.id,{battlePower:num(e.target.value,10)})} className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white text-[10px]" placeholder="พลัง"/>
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
