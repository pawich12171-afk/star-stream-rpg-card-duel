import React, { useState } from 'react';
import type { BattleBotSkill, BattleSkillTarget, BattleSkillEffect, BattleSkillEffectKind, BattleSkillModifier, BattleSkillStatKind, CharacterStats, Skill } from '../types';

type SummonUnit = NonNullable<Skill['summonUnits']>[number];

interface Props {
  config: Partial<Skill>;
  onChange: (patch: Partial<Skill>) => void;
  showTarget?: boolean;
  /** Persist summon-unit skill edits immediately when the parent editor supports it. */
  onSaveSummonUnits?: (units: SummonUnit[]) => void | Promise<void>;
}

const num = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const SkillBattleOptions: React.FC<Props> = ({ config, onChange, showTarget = true, onSaveSummonUnits }) => {
  const target = config.targetMode || 'enemy';
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
  const persistUnits = async (nextUnits: SummonUnit[]) => {
    // Persist the exact post-edit array, including an intentionally empty skills[].
    // This prevents deleted minion skills from being restored by a later stale save.
    onChange({ summonUnits: nextUnits });
    if (onSaveSummonUnits) await onSaveSummonUnits(nextUnits);
  };
  const removeUnit = (id: string) => {
    void persistUnits(units.filter(u => u.id !== id));
  };
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
      battleEffectDuration: 1,
    };
    updateUnit(unit.id, { skills: [...(unit.skills || []), skill] });
  };
  const updateUnitSkill = (unit: SummonUnit, skillId: string, patch: Partial<BattleBotSkill>) =>
    updateUnit(unit.id, { skills: (unit.skills || []).map(s => s.id === skillId ? { ...s, ...patch } : s) });
  const removeUnitSkill = (unit: SummonUnit, skillId: string) => {
    const nextUnits = units.map(u => u.id === unit.id
      ? { ...u, skills: (u.skills || []).filter(s => s.id !== skillId) }
      : u
    );
    void persistUnits(nextUnits);
  };
  const saveSummonUnits = async () => {
    const nextUnits = units.map(unit => ({
      ...unit,
      // Always persist [] when the user removed every skill.
      skills: Array.isArray(unit.skills) ? unit.skills.map(skill => ({ ...skill })) : [],
    }));
    await persistUnits(nextUnits);
  };
  const [editingUnitSkillKey, setEditingUnitSkillKey] = useState<string | null>(null);

  return <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-950/10 p-3">
    {showTarget && <label className="block text-[10px] text-slate-400">
      ผลหลักของสกิล
      <select value={config.battleEffect || 'damage'} onChange={e=>{
        const next=e.target.value as any;
        onChange({
          battleEffect: next
        });
      }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white">
        <option value="damage">⚔️ โจมตี / ดาเมจ</option>
        <option value="heal">❤️ ฟื้นฟู HP</option>
        <option value="defense">🛡️ ป้องกัน</option>
        <option value="damage_reduction">🛡️ ลดดาเมจ (%)</option>
        <option value="stun">💫 สตัน</option>
        <option value="buff_stat">✨ เพิ่มสเตตัส</option>
        <option value="reflect">🔄 สะท้อนดาเมจ (%)</option>
        <option value="reflect_no_damage">🛡️ สะท้อนดาเมจ + ไม่รับดาเมจ</option>
        <option value="summon">🧿 เสกลูกน้อง</option>
      </select>
    </label>}
    {showTarget && <label className="block text-[10px] text-slate-400">
      🎯 เป้าหมายของสกิล (บัฟ/ดีบัฟเลือกใส่ตัวเองหรือฝ่ายตรงข้ามได้)
      <select value={target} onChange={e=>onChange({targetMode:e.target.value as BattleSkillTarget})} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white">
        <option value="self">ตัวผู้ใช้</option><option value="enemy">ศัตรู 1 ตัว</option><option value="selected_enemy">🎯 เลือกศัตรูเอง</option><option value="selected_ally">🤝 เลือกเพื่อนร่วมทีมเอง</option><option value="selected_bots">👾 เลือกมอน/ลูกน้องหลายตัว</option><option value="selected_bosses">👑 เลือกบอสหลายตัว</option>
        <option value="all_allies">💚 พวกเดียวกันทั้งหมด (หมู่)</option><option value="all_enemies">🔥 ศัตรูทั้งหมด (หมู่)</option><option value="all_combatants">🌐 ทุกคนในสนาม</option>
      </select>
    </label>}
    {/* ค่าผลและระยะเวลาหลักใช้จากช่อง พลังสกิล/ระยะเวลาเอฟเฟกต์ ด้านบนเพียงชุดเดียว ไม่สร้างช่องซ้ำที่นี่ */}
    {showTarget && ['selected_enemy','selected_ally','selected_bots','selected_bosses'].includes(String(target)) && <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-400/20 bg-amber-950/10 p-2"><label className="text-[9px] text-slate-400">จำนวนเป้าหมายสูงสุด<input type="number" min="1" max="20" value={config.targetConfig?.maxTargets ?? 1} onChange={e=>onChange({targetConfig:{...(config.targetConfig || {mode: target as any}), mode: target as any, allowMultiple: Number(e.target.value) > 1, maxTargets: Math.max(1, Math.min(20, Number(e.target.value) || 1))}})} className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-white"/></label><label className="flex items-center gap-2 text-[9px] text-slate-300"><input type="checkbox" checked={Boolean(config.targetConfig?.allowMultiple)} onChange={e=>onChange({targetConfig:{...(config.targetConfig || {mode: target as any}), mode: target as any, allowMultiple:e.target.checked, maxTargets: config.targetConfig?.maxTargets ?? 1}})}/> เลือกหลายเป้าหมาย</label></div>}
    <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-950/10 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><div><div className="text-[11px] font-black text-fuchsia-100">✨/⚠️ บัฟและดีบัฟหลายรายการ</div><div className="text-[9px] text-slate-500">กำหนด Stat/สถานะ ค่า ระยะเวลา และโอกาสแยกกันได้</div></div><div className="flex flex-wrap gap-1.5 w-full sm:w-auto"><button type="button" onClick={()=>addModifier('buff')} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-100">+ บัฟ</button><button type="button" onClick={()=>addModifier('debuff')} className="rounded-lg bg-rose-500/20 px-2 py-1 text-[9px] text-rose-100">+ ดีบัฟ</button></div></div>{modifiers.map(item=><div key={item.id} className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 p-2">
        <label className="text-[8px] text-slate-500">ชนิด
          <select value={item.kind} onChange={e=>updateModifier(item.id,{kind:e.target.value as BattleSkillEffectKind})} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="buff">✨ บัฟ</option><option value="debuff">⚠️ ดีบัฟ</option><option value="status">💫 สถานะ</option><option value="shield">🛡️ โล่</option><option value="cleanse">🧼 ล้างสถานะ</option></select>
        </label>
        {(item.kind === 'buff' || item.kind === 'debuff') && <label className="text-[8px] text-slate-500">📊 Stat
          <select value={item.stat || 'strength'} onChange={e=>updateModifier(item.id,{stat:e.target.value as keyof CharacterStats})} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select>
        </label>}
        {item.kind === 'status' && <label className="text-[8px] text-slate-500">💫 สถานะ
          <select value={item.status || ''} onChange={e=>updateModifier(item.id,{status:e.target.value})} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="">เลือกสถานะ</option><option value="stun">💫 Stun — ข้ามเทิร์น</option><option value="freeze">❄️ Freeze — หยุดการกระทำ</option><option value="poison">☠️ Poison — ดาเมจต่อเทิร์น</option><option value="burn">🔥 Burn — ดาเมจต่อเทิร์น</option><option value="bleeding">🩸 Bleeding — ดาเมจต่อเทิร์น</option><option value="slow">🐌 Slow — ลดประสิทธิภาพโจมตี</option><option value="weakness">📉 Weakness — ลดดาเมจ</option><option value="curse">🌀 Curse — ลดดาเมจ</option><option value="regen">💚 Regen — ฟื้น HP ต่อเทิร์น</option><option value="reduce_max_hp_percent">❤️‍🩹 ลด Max HP (%)</option><option value="reduce_defense_percent">🛡️ ลดป้องกัน (%)</option><option value="damage_percent">⚔️ เพิ่ม/ลดดาเมจ (%)</option><option value="heal_percent">💚 ฟื้น HP (%)</option><option value="shield">🛡️ โล่ HP</option><option value="reflect">🔄 สะท้อนดาเมจ (%)</option><option value="damage_reduction">🛡️ ลดความเสียหาย (%)</option></select>
        </label>}
        {item.kind === 'shield' && <div className="flex items-center rounded bg-cyan-950/40 border border-cyan-400/20 px-1.5 py-1 text-[8px] text-cyan-100">🛡️ โล่ HP<br/>ค่า = ปริมาณ HP</div>}
        {item.kind === 'cleanse' && <div className="flex items-center rounded bg-cyan-950/40 border border-cyan-400/20 px-1.5 py-1 text-[8px] text-cyan-100">🧼 ล้างสถานะ<br/>ไม่ใช้ Stat</div>}
        <label className="text-[8px] text-slate-500"><span>{item.kind === 'shield' ? '🛡️ ปริมาณโล่ (HP)' : item.kind === 'buff' || item.kind === 'debuff' ? '📊 ค่าเพิ่ม/ลด Stat' : item.kind === 'cleanse' ? '🧼 จำนวนสถานะที่ล้าง' : ['reduce_max_hp_percent','reduce_defense_percent','damage_percent','heal_percent','reflect','damage_reduction'].includes(String(item.status)) ? '🎯 เปอร์เซ็นต์ผล (%)' : '💫 ค่าผลสถานะ'}</span><input type="number" min="0" max={['reduce_max_hp_percent','reduce_defense_percent','damage_percent','heal_percent','reflect','damage_reduction'].includes(String(item.status)) ? 100 : undefined} value={item.value ?? 0} onChange={e=>{const raw=num(e.target.value); const percent=['reduce_max_hp_percent','reduce_defense_percent','damage_percent','heal_percent','reflect','damage_reduction'].includes(String(item.status)); updateModifier(item.id,{value:percent ? Math.max(0,Math.min(100,raw)) : Math.max(0,raw)})}} placeholder={item.kind === 'shield' ? 'เช่น 100 HP' : ['reduce_max_hp_percent','reduce_defense_percent','damage_percent','heal_percent','reflect','damage_reduction'].includes(String(item.status)) ? 'เช่น 20%' : 'เช่น 10'} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/></label>
        <label className="text-[8px] text-slate-500"><span>🎲 โอกาสทำงาน (%)</span><input type="number" min="0" max="100" value={item.chance ?? 100} onChange={e=>updateModifier(item.id,{chance:Math.max(0,Math.min(100,num(e.target.value,100)))})} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/></label>
        <label className="text-[8px] text-slate-500"><span>⏱️ ระยะเวลา (เทิร์น)</span><input type="number" min="1" value={item.duration ?? 1} onChange={e=>updateModifier(item.id,{duration:Math.max(1,num(e.target.value,1))})} className="mt-0.5 w-full rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/></label>
        <button type="button" onClick={()=>removeModifier(item.id)} className="rounded bg-rose-950/40 text-rose-300 text-[9px]">ลบ</button>
      </div>)}{!modifiers.length && <div className="text-[9px] text-slate-500">ยังไม่มีบัฟ/ดีบัฟที่เพิ่มเอง</div>}</div>
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
      {units.map((u,index)=>(<div key={u.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 space-y-2">
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
          {(u.skills || []).map(s => (
            <div key={s.id} className="col-span-2 rounded-xl border border-violet-400/20 bg-slate-950/60 p-3 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-black text-violet-100">✨ {s.name || 'สกิลลูกน้อง'}</div>
                  <div className="mt-1 text-[9px] text-slate-500">ตั้งค่าแยกจากสกิลหลักของตัวแม่</div>
                  {['reflect','reflect_no_damage','damage_reduction','defense','heal'].includes(String(s.battleEffect)) && <div className="mt-1 inline-flex rounded-md border border-amber-400/40 bg-amber-950/30 px-2 py-1 text-[10px] font-black text-amber-200">⏱️ ระยะเวลาสกิล: {Math.max(1, Number(s.battleEffectDuration) || 1)} เทิร์น</div>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setEditingUnitSkillKey(editingUnitSkillKey === `${u.id}:${s.id}` ? null : `${u.id}:${s.id}`)} className="rounded-lg bg-violet-600 px-4 py-2 text-[11px] font-black text-white border-2 border-violet-300/60 shadow-lg whitespace-nowrap min-h-10">✏️ {editingUnitSkillKey === `${u.id}:${s.id}` ? 'ปิดการแก้ไข' : 'แก้ไขสกิล'}</button>
                  <button type="button" onClick={() => { removeUnitSkill(u, s.id); if (editingUnitSkillKey === `${u.id}:${s.id}`) setEditingUnitSkillKey(null); }} className="rounded-lg bg-rose-950/50 px-2 py-1 text-[10px] text-rose-300">ลบ</button>
                </div>
              </div>
              {editingUnitSkillKey === `${u.id}:${s.id}` && <><div className="rounded-lg border border-violet-400/30 bg-violet-950/20 px-3 py-2 text-[10px] font-black text-violet-100">✏️ กำลังแก้ไขสกิลลูกน้อง: {s.name || 'สกิลลูกน้อง'} — กดปุ่ม “บันทึกการแก้ไขสกิลลูกน้อง” ด้านล่างเพื่อบันทึกถาวร</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[9px] text-slate-400">ชื่อสกิล
                  <input value={s.name || ''} onChange={e => updateUnitSkill(u, s.id, {name: e.target.value})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white" />
                </label>
                <label className="text-[9px] text-slate-400">คำอธิบาย
                  <input value={s.description || ''} onChange={e => updateUnitSkill(u, s.id, {description: e.target.value})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white" />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="text-[9px] text-slate-400">ผลหลัก
                  <select value={s.battleEffect || 'damage'} onChange={e => updateUnitSkill(u, s.id, {battleEffect: e.target.value as BattleSkillEffect})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white">
                    <option value="damage">⚔️ ดาเมจ</option>
                    <option value="heal">❤️ ฟื้นฟู</option>
                    <option value="defense">🛡️ ป้องกัน</option>
                    <option value="damage_reduction">📉 ลดดาเมจ</option>
                    <option value="buff_stat">✨ เพิ่มสเตตัส</option>
                    <option value="stun">💫 สตัน</option>
                    <option value="reflect">🔄 สะท้อนดาเมจ (%)</option>
                    <option value="reflect_no_damage">🛡️ สะท้อนดาเมจ + ไม่รับดาเมจ</option>
                    <option value="summon">🧿 เสก</option>
                  </select>
                </label>
                <label className="text-[9px] text-slate-400">เป้าหมาย
                  <select value={s.targetMode || 'enemy'} onChange={e => updateUnitSkill(u, s.id, {targetMode: e.target.value as BattleSkillTarget})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white">
                    <option value="enemy">🎯 ศัตรู</option>
                    <option value="self">🧍 ตัวเอง</option>
                    <option value="selected_enemy">🎯 เลือกศัตรู</option>
                    <option value="selected_ally">🤝 เลือกเพื่อน</option>
                    <option value="all_allies">💚 พวกเดียวกันทั้งหมด</option>
                    <option value="all_enemies">🔥 ศัตรูทั้งหมด</option>
                    <option value="all_combatants">🌐 ทุกคน</option>
                  </select>
                </label>
              </div></>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="text-[9px] text-slate-400">
                  {s.battleEffect === 'reflect' ? '🔄 สะท้อนดาเมจ (%)' :
                   s.battleEffect === 'reflect_no_damage' ? '🛡️ สะท้อนดาเมจ (%)' :
                   s.battleEffect === 'damage_reduction' ? '📉 ลดดาเมจ (%)' :
                   s.battleEffect === 'defense' ? '🛡️ ป้องกัน (% Max HP)' :
                   s.battleEffect === 'heal' ? '❤️ ฟื้นฟู (% Max HP)' :
                   s.battleEffect === 'damage' ? '⚔️ ดาเมจ' : 'ค่าผล'}
                  <input type="number" min="0" max={['reflect','reflect_no_damage','damage_reduction','defense','heal'].includes(String(s.battleEffect)) ? 100 : undefined}
                    value={s.battlePower ?? 10} onChange={e => updateUnitSkill(u, s.id, {battlePower: Math.max(0, Math.min(['reflect','reflect_no_damage','damage_reduction','defense','heal'].includes(String(s.battleEffect)) ? 100 : 999999, num(e.target.value, 10)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white" />
                </label>
                <label className="text-[9px] text-slate-400">⏱️ ระยะเวลาคงอยู่ (เทิร์น)
                  <input type="number" min="1" step="1" value={s.battleEffectDuration ?? 1} onChange={e => updateUnitSkill(u, s.id, {battleEffectDuration: Math.max(1, Math.floor(num(e.target.value, 1)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-amber-400/40 px-2 py-2 text-white" />
                </label>
                <label className="text-[9px] text-slate-400">โอกาสใช้สกิล (%)
                  <input type="number" min="0" max="100" value={s.aiChancePercent ?? 100} onChange={e => updateUnitSkill(u, s.id, {aiChancePercent: Math.max(0, Math.min(100, num(e.target.value, 100)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white" />
                </label>
                <label className="text-[9px] text-slate-400">คูลดาวน์ (เทิร์น)
                  <input type="number" min="0" value={s.cooldownTurns ?? 0} onChange={e => updateUnitSkill(u, s.id, {cooldownTurns: Math.max(0, num(e.target.value))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white" />
                </label>
              </div>
            </div>
          ))}
          {onSaveSummonUnits && <button type="button" onClick={()=>void saveSummonUnits()} className="w-full rounded-xl border-2 border-cyan-300/60 bg-cyan-500/20 py-3 text-[11px] font-black text-cyan-50 shadow-lg">💾 บันทึกการแก้ไขสกิลลูกน้องถาวร</button>}
          <button type="button" onClick={()=>addUnitSkill(u)} className="w-full rounded-xl border border-violet-300/30 bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 py-2.5 text-[11px] font-black text-violet-100 shadow-[0_0_20px_rgba(139,92,246,0.12)] transition hover:from-violet-600/40 hover:to-fuchsia-600/30">✨ + เพิ่มสกิลให้ลูกน้องตัวนี้</button>
        </div>
      </div>))}
      <button type="button" onClick={addUnit} className="w-full rounded-lg bg-violet-600/25 border border-violet-500/40 py-2 text-xs font-bold text-violet-100">+ เพิ่มลูกน้องอีกตัว</button>
      <div className="text-[9px] text-slate-500">ถ้าไม่เพิ่มรายตัว ระบบจะใช้ค่ากลางด้านบนเป็นค่าเริ่มต้น</div>
    </div>}
  </div>;
};
