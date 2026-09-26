import React from 'react';
import type { BattleBotSkill, BattleSkillCategory, BattleSkillTarget, BattleSkillEffectKind, BattleSkillModifier, BattleSkillStatKind, CharacterStats, Skill } from '../types';

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
      ผลหลักของสกิล
      <select value={config.battleEffect || 'damage'} onChange={e=>onChange({battleEffect:e.target.value as Skill['battleEffect']})} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-2 text-white">
        <option value="damage">⚔️ โจมตี / ดาเมจ</option>
        <option value="heal">❤️ ฟื้นฟู HP</option>
        <option value="defense">🛡️ ป้องกัน</option>
        <option value="stun">💫 สตัน</option>
        <option value="buff_stat">✨ เพิ่มสเตตัส</option>
        <option value="summon">🧿 เสกลูกน้อง</option>
      </select>
    </label>}
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
          {(u.skills || []).map(s=>{
            const statValue = (kind: BattleSkillStatKind) => Number((s.battleStats || []).filter(item=>item.kind === kind).reduce((sum,item)=>sum + (Number(item.value)||0), 0));
            const setStat = (kind: BattleSkillStatKind, value: number) => updateUnitSkill(u,s.id,{battleStats:[...(s.battleStats || []).filter(item=>item.kind !== kind),{kind,value}]});
            const modifiers = Array.isArray(s.skillModifiers) ? s.skillModifiers : [];
            const addMod = (kind: BattleSkillEffectKind) => updateUnitSkill(u,s.id,{skillModifiers:[...modifiers,{id:`minion-mod-${Date.now()}-${modifiers.length+1}`,kind,stat:'strength',value:10,duration:3,chance:100}]});
            const updateMod = (id: string, patch: Partial<BattleSkillModifier>) => updateUnitSkill(u,s.id,{skillModifiers:modifiers.map(item=>item.id===id?{...item,...patch}:item)});
            const removeMod = (id: string) => updateUnitSkill(u,s.id,{skillModifiers:modifiers.filter(item=>item.id!==id)});
            const categoryGuide: Record<string,string> = {
              attack:'ทำดาเมจใส่เป้าหมาย เหมาะกับสกิลโจมตีหลัก',
              buff:'เพิ่มความสามารถให้ฝ่ายเดียวกัน เช่น STR, DUR, AGI, MAG',
              debuff:'ลดความสามารถหรือใส่สถานะเสียให้เป้าหมาย',
              control:'ควบคุมการต่อสู้ เช่น สตันหรือหยุดการกระทำ',
              heal:'ฟื้น HP ให้ตัวเองหรือพวกเดียวกัน กำหนดเป็น % Max HP ได้',
              defense:'เพิ่มการป้องกันหรือสร้างผลลดความเสียหายตามจำนวนเทิร์น',
              utility:'เอฟเฟกต์พิเศษที่ไม่ใช่ดาเมจ/ฮีลโดยตรง'
            };
            const effectGuide: Record<string,string> = {
              damage:'กำหนดดาเมจพื้นฐานที่สกิลทำได้',
              heal:'กำหนด % Max HP ที่ฟื้น และค่า HP แบบคงที่เพิ่มเติม',
              defense:'กำหนดค่าป้องกันและจำนวนเทิร์นที่คงอยู่',
              damage_reduction:'กำหนดเปอร์เซ็นต์ลดความเสียหายและจำนวนเทิร์น',
              buff_stat:'เลือกสเตตัสที่จะเพิ่ม พร้อมจำนวนและระยะเวลา',
              stun:'กำหนดค่าของเอฟเฟกต์และจำนวนเทิร์น',
              reflect:'กำหนดค่าการสะท้อนและจำนวนเทิร์น',
              summon:'สร้างลูกน้องตามจำนวนที่กำหนด'
            };
            return <div key={s.id} className="col-span-2 rounded-2xl border border-violet-400/20 bg-slate-950/50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div><div className="text-xs font-black text-violet-100">✨ สร้างและแก้ไขสกิลลูกน้อง</div><div className="text-[9px] text-slate-500">ตั้งค่าแยกเฉพาะลูกน้องตัวนี้ ไม่มีค่าร่วมกับลูกน้องตัวอื่น</div></div>
                <button type="button" onClick={()=>removeUnitSkill(u,s.id)} className="rounded-lg bg-rose-950/50 px-2 py-1 text-[10px] text-rose-300">ลบ</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">ชื่อสกิล<input value={s.name} onChange={e=>updateUnitSkill(u,s.id,{name:e.target.value})} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs" placeholder="เช่น ฟันเงา"/></label>
                <label className="text-[10px] text-slate-400">คำอธิบาย<textarea value={s.description || ''} onChange={e=>updateUnitSkill(u,s.id,{description:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs" placeholder="อธิบายผลของสกิลแบบละเอียด"/></label>
              </div>
              <div className="overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-950/60 via-slate-950/70 to-cyan-950/40 shadow-[0_0_30px_rgba(139,92,246,0.12)]">
                <div className="border-b border-white/10 bg-white/[0.03] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-lg">✨</div>
                    <div>
                      <div className="text-sm font-black text-white">สร้างและแก้ไขสกิลลูกน้อง</div>
                      <div className="text-[9px] text-violet-200/70">ตั้งค่าเฉพาะลูกน้องตัวนี้ • ทุกค่าจะถูกบันทึกไปกับสกิล</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-3">
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2"><div className="text-[11px] font-black text-cyan-100">🧩 โครงสร้างประเภทสกิล</div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[8px] text-cyan-100">ตั้งค่าแยก</span></div>
                <label className="block text-[10px] text-slate-400">ประเภทสกิล
                  <select value={s.skillCategory || (s.battleEffect==='heal'?'heal':s.battleEffect==='defense'?'defense':s.battleEffect==='stun'?'control':'attack')} onChange={e=>{
                    const next=e.target.value as any;
                    const defaults:any={attack:'damage',buff:'buff_stat',debuff:'damage_reduction',control:'stun',heal:'heal',defense:'defense',utility:'damage'};
                    const targets:any={heal:'selected_ally',defense:'self',buff:'self',debuff:'enemy',control:'enemy'};
                    updateUnitSkill(u,s.id,{skillCategory:next,battleEffect:defaults[next] || 'damage',targetMode:targets[next] || s.targetMode || 'enemy'});
                  }} className="mt-1 w-full rounded-xl bg-slate-900 border border-cyan-400/30 px-3 py-2 text-white text-xs shadow-[0_0_18px_rgba(34,211,238,0.08)]">
                    <option value="attack">⚔️ โจมตี / ดาเมจ</option><option value="buff">✨ บัฟ</option><option value="debuff">⚠️ ดีบัฟ</option><option value="control">💫 ควบคุม</option><option value="heal">❤️ ฟื้นฟู</option><option value="defense">🛡️ ป้องกัน</option><option value="utility">🧬 Utility</option>
                  </select>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-400">ผลหลัก
                    <select value={s.battleEffect || 'damage'} onChange={e=>updateUnitSkill(u,s.id,{battleEffect:e.target.value as any})} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs">
                      <option value="damage">⚔️ โจมตี / ดาเมจ</option><option value="heal">❤️ ฟื้นฟู HP</option><option value="defense">🛡️ ป้องกัน</option><option value="damage_reduction">🛡️ ลดดาเมจ (%)</option><option value="buff_stat">✨ เพิ่มสเตตัส</option><option value="stun">💫 สตัน</option><option value="reflect">🔄 สะท้อนดาเมจ</option><option value="summon">🧿 เสกลูกน้อง</option>
                    </select>
                  </label>
                  <label className="text-[10px] text-slate-400">เป้าหมาย
                    <select value={s.targetMode || 'enemy'} onChange={e=>updateUnitSkill(u,s.id,{targetMode:e.target.value as any})} className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs">
                      <option value="enemy">🎯 ศัตรู 1 ตัว</option><option value="self">🧍 ตัวเอง</option><option value="selected_enemy">🎯 เลือกศัตรู</option><option value="selected_ally">🤝 เลือกเพื่อน</option><option value="all_allies">💚 พวกเดียวกันทั้งหมด (หมู่)</option><option value="all_enemies">🔥 ศัตรูทั้งหมด (หมู่)</option><option value="all_combatants">🌐 ทุกคนในสนาม</option>
                    </select>
                  </label>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                  <div className="mb-1 flex items-center justify-between"><span className="text-[9px] uppercase tracking-wider text-slate-500">รายละเอียดประเภทที่เลือก</span><span className="text-[9px] text-cyan-200">{s.skillCategory || 'attack'}</span></div>
                  <div className="text-[10px] leading-relaxed text-slate-200">{categoryGuide[s.skillCategory || 'attack']}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2"><div className="text-[8px] text-slate-500">ผลหลัก</div><div className="mt-0.5 text-[9px] font-bold text-white">{effectGuide[s.battleEffect || 'damage'] || 'กำหนดเอฟเฟกต์ของสกิล'}</div></div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2"><div className="text-[8px] text-slate-500">เป้าหมาย</div><div className="mt-0.5 text-[9px] font-bold text-white">{s.targetMode || 'enemy'}</div></div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/5 bg-slate-950/50 p-2 text-[9px] leading-relaxed text-slate-400">
                  <div className="font-bold text-cyan-200">💡 ประเภทสกิลคือ “หน้าที่หลัก”</div>
                  <div>โจมตี = ทำดาเมจ • ฟื้นฟู = เติม HP • ป้องกัน = เพิ่มการป้องกัน • บัฟ = เพิ่มความสามารถ • ดีบัฟ = ลดความสามารถ/ใส่สถานะ • ควบคุม = สตันหรือหยุดการกระทำ</div>
                  <div className="mt-1 text-slate-500">เมื่อเปลี่ยนประเภท ระบบจะเลือก “ผลหลัก” และ “เป้าหมาย” ที่เหมาะสมให้อัตโนมัติ แต่คุณแก้เองได้</div>
                </div>
              </div>
              {s.battleEffect === 'damage' && <div className="rounded-xl border border-rose-400/20 bg-rose-950/10 p-3"><div className="mb-2 text-[10px] font-black text-rose-200">⚔️ ค่าการโจมตี</div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">พลัง/ดาเมจ<input type="number" value={s.battlePower ?? 10} onChange={e=>updateUnitSkill(u,s.id,{battlePower:num(e.target.value,10)})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label><label className="text-[9px] text-slate-400">คูลดาวน์ (เทิร์น)<input type="number" min="0" value={s.cooldownTurns ?? 0} onChange={e=>updateUnitSkill(u,s.id,{cooldownTurns:Math.max(0,num(e.target.value))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label></div></div>}
              {s.battleEffect === 'heal' && <div className="rounded-xl border border-emerald-400/20 bg-emerald-950/10 p-3"><div className="mb-1 text-[10px] font-black text-emerald-200">❤️ ค่าฟื้นฟู</div><div className="mb-2 rounded-lg border border-emerald-300/10 bg-emerald-300/5 p-2 text-[9px] leading-relaxed text-emerald-100/70">กำหนดได้ทั้ง “เปอร์เซ็นต์ของ Max HP ของผู้รับ” และ “HP คงที่” ตัวอย่าง: 20% + 50 = ฟื้น 20% Max HP แล้วบวกอีก 50 HP</div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">ฟื้นฟูจาก Max HP (%)<input type="number" min="0" max="100" value={statValue('heal_percent')} onChange={e=>setStat('heal_percent',Math.max(0,Math.min(100,num(e.target.value))))} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label><label className="text-[9px] text-slate-400">ฟื้นฟูเพิ่มแบบค่าคงที่<input type="number" min="0" value={s.battlePower ?? 0} onChange={e=>updateUnitSkill(u,s.id,{battlePower:Math.max(0,num(e.target.value))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label></div><div className="mt-2 text-[9px] text-emerald-100/70">ตัวอย่าง: 20% = ฟื้น 20% ของ Max HP ของผู้รับผล</div></div>}
              {s.battleEffect === 'defense' && <div className="rounded-xl border border-sky-400/20 bg-sky-950/10 p-3"><div className="mb-1 text-[10px] font-black text-sky-200">🛡️ ค่าป้องกัน</div><div className="mb-2 rounded-lg border border-sky-300/10 bg-sky-300/5 p-2 text-[9px] leading-relaxed text-sky-100/70">ค่าป้องกันคือจำนวนพลังป้องกันที่สกิลเพิ่มให้เป้าหมาย และจะคงอยู่ตามจำนวนเทิร์นที่ตั้งไว้</div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">ค่าป้องกัน<input type="number" min="0" value={statValue('defense_power') || s.battlePower || 0} onChange={e=>{const v=Math.max(0,num(e.target.value)); updateUnitSkill(u,s.id,{battlePower:v}); setStat('defense_power',v)}} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label><label className="text-[9px] text-slate-400">ระยะเวลา (เทิร์น)<input type="number" min="1" max="99" value={s.battleEffectDuration ?? 1} onChange={e=>updateUnitSkill(u,s.id,{battleEffectDuration:Math.max(1,Math.min(99,num(e.target.value,1)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label></div></div>}
              {s.battleEffect === 'damage_reduction' && <div className="rounded-xl border border-blue-400/20 bg-blue-950/10 p-3"><div className="mb-2 text-[10px] font-black text-blue-200">🛡️ ลดความเสียหาย</div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">ลดดาเมจ (%)<input type="number" min="0" max="100" value={s.battlePower ?? 0} onChange={e=>updateUnitSkill(u,s.id,{battlePower:Math.max(0,Math.min(100,num(e.target.value)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label><label className="text-[9px] text-slate-400">ระยะเวลา (เทิร์น)<input type="number" min="1" max="99" value={s.battleEffectDuration ?? 1} onChange={e=>updateUnitSkill(u,s.id,{battleEffectDuration:Math.max(1,Math.min(99,num(e.target.value,1)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label></div></div>}
              {(s.battleEffect === 'stun' || s.battleEffect === 'reflect') && <div className="rounded-xl border border-amber-400/20 bg-amber-950/10 p-3"><div className="mb-2 text-[10px] font-black text-amber-200">💫 ตั้งค่าเอฟเฟกต์</div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-400">ค่า/โอกาส (%)<input type="number" min="0" max={s.battleEffect === 'reflect' ? 100 : 100} value={s.battlePower ?? 5} onChange={e=>updateUnitSkill(u,s.id,{battlePower:Math.max(0,num(e.target.value))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label><label className="text-[9px] text-slate-400">ระยะเวลา (เทิร์น)<input type="number" min="1" max="99" value={s.battleEffectDuration ?? 1} onChange={e=>updateUnitSkill(u,s.id,{battleEffectDuration:Math.max(1,Math.min(99,num(e.target.value,1)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label></div></div>}
              {s.skillCategory === 'buff' || s.skillCategory === 'debuff' || modifiers.length ? <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-950/10 p-3 space-y-2"><div className="flex items-center justify-between"><div><div className="text-[10px] font-black text-fuchsia-100">✨/⚠️ บัฟและดีบัฟ</div><div className="text-[9px] text-slate-500">เพิ่มได้หลายรายการ แต่ละรายการกำหนดค่าและระยะเวลาแยกกัน</div></div><div className="flex gap-1"><button type="button" onClick={()=>addMod('buff')} className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-100">+ บัฟ</button><button type="button" onClick={()=>addMod('debuff')} className="rounded-lg bg-rose-500/20 px-2 py-1 text-[9px] text-rose-100">+ ดีบัฟ</button></div></div>{modifiers.map(item=><div key={item.id} className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 p-2"><select value={item.kind} onChange={e=>updateMod(item.id,{kind:e.target.value as any})} className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="buff">✨ บัฟ</option><option value="debuff">⚠️ ดีบัฟ</option><option value="status">💫 สถานะ</option><option value="shield">🛡️ โล่</option><option value="cleanse">🧼 ล้างสถานะ</option></select><select value={item.stat || 'strength'} onChange={e=>updateMod(item.id,{stat:e.target.value as any})} className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[9px] text-white"><option value="strength">STR</option><option value="durability">DUR</option><option value="agility">AGI</option><option value="magic">MAG</option></select><input value={item.status || ''} onChange={e=>updateMod(item.id,{status:e.target.value})} placeholder="สถานะ เช่น stun/poison" className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><input type="number" value={item.value ?? 0} onChange={e=>updateMod(item.id,{value:num(e.target.value)})} placeholder="ค่า" className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><input type="number" min="1" value={item.duration ?? 1} onChange={e=>updateMod(item.id,{duration:Math.max(1,num(e.target.value,1))})} placeholder="เทิร์น" className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[9px] text-white"/><button type="button" onClick={()=>removeMod(item.id)} className="rounded bg-rose-950/40 text-rose-300 text-[9px]">ลบ</button></div>)}</div> : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[9px] text-slate-400">คูลดาวน์ (เทิร์น)<input type="number" min="0" value={s.cooldownTurns ?? 0} onChange={e=>updateUnitSkill(u,s.id,{cooldownTurns:Math.max(0,num(e.target.value))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label>
                <label className="text-[9px] text-slate-400">โอกาสใช้สกิล (%)<input type="number" min="0" max="100" value={s.aiChancePercent ?? 100} onChange={e=>updateUnitSkill(u,s.id,{aiChancePercent:Math.max(0,Math.min(100,num(e.target.value,100)))})} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-white"/></label>
              </div>
            </div>
              </div>
            </div>
          })}
          </div>
          <button type="button" onClick={()=>addUnitSkill(u)} className="w-full rounded-xl border border-violet-300/30 bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 py-2.5 text-[11px] font-black text-violet-100 shadow-[0_0_20px_rgba(139,92,246,0.12)] transition hover:from-violet-600/40 hover:to-fuchsia-600/30">✨ + เพิ่มสกิลให้ลูกน้องตัวนี้</button>
      </div>))}
      <button type="button" onClick={addUnit} className="w-full rounded-lg bg-violet-600/25 border border-violet-500/40 py-2 text-xs font-bold text-violet-100">+ เพิ่มลูกน้องอีกตัว</button>
      <div className="text-[9px] text-slate-500">ถ้าไม่เพิ่มรายตัว ระบบจะใช้ค่ากลางด้านบนเป็นค่าเริ่มต้น</div>
    </div>}
  </div>;
};
