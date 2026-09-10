import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Flame, Heart, Minus, Plus, RotateCcw, Shield, Skull, Sparkles, Swords, Trash2, Zap } from 'lucide-react';
import { CharacterProfile, AdminBalanceModifier, AdminBalanceSnapshot, AdminStatusEffectKind } from '../types';

interface Props { characters: CharacterProfile[]; onUpdateCharacter: (character: CharacterProfile) => Promise<boolean>; }
type StatKey = 'strength' | 'durability' | 'agility' | 'magic';
type EffectKind = AdminStatusEffectKind;

const effects: { id: EffectKind; name: string; icon: React.ElementType; desc: string }[] = [
  { id: 'bleeding', name: 'เลือดไหล', icon: Heart, desc: 'เสีย HP ต่อรอบ' },
  { id: 'burn', name: 'เผาไหม้', icon: Flame, desc: 'ได้รับความเสียหายต่อเนื่อง' },
  { id: 'poison', name: 'พิษ', icon: Skull, desc: 'ลด HP ต่อเนื่อง' },
  { id: 'reflect', name: 'สะท้อน', icon: Shield, desc: 'สะท้อนความเสียหาย' },
  { id: 'curse', name: 'คำสาป', icon: Ban, desc: 'ลดประสิทธิภาพการต่อสู้' },
  { id: 'regen', name: 'ฟื้นฟู', icon: Heart, desc: 'ฟื้น HP ต่อรอบ' },
  { id: 'shield', name: 'โล่คุ้มกัน', icon: Shield, desc: 'ลดความเสียหาย' },
  { id: 'stun', name: 'มึนงง', icon: Zap, desc: 'ข้ามเทิร์น' },
  { id: 'weakness', name: 'อ่อนแอ', icon: Minus, desc: 'ลดพลังโจมตี' },
  { id: 'slow', name: 'เชื่องช้า', icon: Swords, desc: 'ลดความว่องไว' },
];
const statLabels: Record<StatKey, string> = { strength: 'STR', durability: 'DUR', agility: 'AGI', magic: 'MAG' };
const isMaxHp = (m: AdminBalanceModifier) => m.kind === 'hp' && m.id.startsWith('admin-maxhp-');
const cloneSnapshot = (c: CharacterProfile): AdminBalanceSnapshot => ({ hp: c.hp, maxHp: c.maxHp, stats: { ...c.stats }, skills: (c.skills || []).map(s => ({ ...s })), capturedAt: Date.now() });
const signed = (m: AdminBalanceModifier) => m.mode === 'buff' ? (m.amount || 0) : -(m.amount || 0);

export const AdminCharacterBalancePanel: React.FC<Props> = ({ characters, onUpdateCharacter }) => {
  const [targetId, setTargetId] = useState(characters[0]?.id || '');
  const [mode, setMode] = useState<'buff' | 'nerf'>('buff');
  const [amount, setAmount] = useState(100);
  const [stat, setStat] = useState<StatKey>('strength');
  const [skillId, setSkillId] = useState('');
  const [effect, setEffect] = useState<EffectKind>('bleeding');
  const [duration, setDuration] = useState(3);
  const [effectPower, setEffectPower] = useState(5);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const target = characters.find(c => c.id === targetId) || characters[0];
  useEffect(() => { if (!characters.some(c => c.id === targetId)) setTargetId(characters[0]?.id || ''); }, [characters, targetId]);

  const modifiers = target?.adminBalanceModifiers || [];
  const statusEffects = target?.adminStatusEffects || [];
  const skills = useMemo(() => target?.skills || [], [target]);
  const selectedEffect = effects.find(e => e.id === effect)!;

  useEffect(() => {
    if (skills.length && !skills.some(s => s.id === skillId)) setSkillId(skills[0].id);
  }, [skills, skillId]);

  const save = async (next: CharacterProfile, success: string) => {
    setSaving(true); setMessage('กำลังบันทึกคำสั่งแบบ Real-time...');
    const ok = await onUpdateCharacter({ ...next, lastUpdated: Date.now() });
    setSaving(false); setMessage(ok ? success : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    if (ok) window.setTimeout(() => setMessage(''), 2500);
  };

  const snapshotFor = (c: CharacterProfile) => c.adminBalanceSnapshot && (c.adminBalanceModifiers?.length || 0) > 0 ? c.adminBalanceSnapshot : cloneSnapshot(c);

  const applyHp = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-hp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: 'hp', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const maxDelta = all.filter(isMaxHp).reduce((s,m) => s + signed(m),0);
    const nextMaxHp = Math.max(1,snapshot.maxHp + maxDelta);
    const nextHp = Math.max(0,Math.min(nextMaxHp,target.hp + delta));
    void save({ ...target,hp:nextHp,maxHp:nextMaxHp,adminBalanceSnapshot:snapshot,adminBalanceModifiers:all },delta>=0?`เพิ่ม HP ปัจจุบัน ${Math.abs(delta)} แล้ว`:`ลด HP ปัจจุบัน ${Math.abs(delta)} แล้ว`);
  };

  const applyMaxHp = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id:`admin-maxhp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,kind:'hp',mode:delta>=0?'buff':'nerf',amount:Math.abs(delta),createdAt:Date.now() };
    const all=[...modifiers,modifier];
    const maxDelta=all.filter(isMaxHp).reduce((s,m)=>s+signed(m),0);
    const nextMaxHp=Math.max(1,snapshot.maxHp+maxDelta);
    void save({...target,hp:target.hp,maxHp:nextMaxHp,adminBalanceSnapshot:snapshot,adminBalanceModifiers:all},delta>=0?`เพิ่ม MAX HP ${Math.abs(delta)} แล้ว`:`ลด MAX HP ${Math.abs(delta)} แล้ว`);
  };

  const applyStat = (delta:number) => {
    if(!target)return;
    const snapshot=snapshotFor(target);
    const modifier:AdminBalanceModifier={id:`admin-stat-${stat}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,kind:'stat',mode:delta>=0?'buff':'nerf',amount:Math.abs(delta),stat,createdAt:Date.now()};
    const all=[...modifiers,modifier];
    const d=all.filter(m=>m.kind==='stat'&&m.stat===stat).reduce((s,m)=>s+signed(m),0);
    void save({...target,stats:{...snapshot.stats,[stat]:Math.max(0,snapshot.stats[stat]+d)},adminBalanceSnapshot:snapshot,adminBalanceModifiers:all},`${mode==='buff'?'เพิ่ม':'ลด'} ${statLabels[stat]} ${Math.abs(delta)} แล้ว`);
  };

  const applySkill = (delta:number) => {
    if(!target || !skillId)return;
    const snapshot=snapshotFor(target);
    const modifier:AdminBalanceModifier={id:`admin-skill-${skillId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,kind:'skill',mode:delta>=0?'buff':'nerf',amount:Math.abs(delta),skillId,createdAt:Date.now()};
    const all=[...modifiers,modifier];
    const nextSkills=snapshot.skills.map(base=>{const d=all.filter(m=>m.kind==='skill'&&m.skillId===base.id).reduce((s,m)=>s+signed(m),0);const max=Math.max(base.maxLevel||10,1);return {...base,level:Math.max(1,Math.min(max,base.level+d))};});
    void save({...target,skills:nextSkills,adminBalanceSnapshot:snapshot,adminBalanceModifiers:all},`${mode==='buff'?'เพิ่ม':'ลด'}ระดับสกิลแล้ว`);
  };

  const applyEffect = () => {
    if(!target)return;
    const now=Date.now(); const snapshot=snapshotFor(target);
    const effectId=`admin-effect-${effect}-${now}-${Math.random().toString(36).slice(2,7)}`;
    const item={id:effectId,kind:effect,name:selectedEffect.name,power:Math.max(0,effectPower),duration:Math.max(1,duration),remaining:Math.max(1,duration),appliedAt:now,source:'admin' as const,mode,description:selectedEffect.desc};
    const modifier:AdminBalanceModifier={id:`admin-status-${now}-${Math.random().toString(36).slice(2,7)}`,kind:'status',mode,effectId,createdAt:now};
    const notification={id:`notif-admin-${now}`,title:mode==='buff'?`✨ ได้รับบัฟ ${selectedEffect.name}`:`⚠️ ได้รับเนิร์ฟ ${selectedEffect.name}`,message:`${selectedEffect.name} พลัง ${effectPower} เป็นเวลา ${duration} รอบ โดยผู้ดูแลระบบ`,timestamp:now,read:false,type:'admin' as const};
    const nextEffects=[...statusEffects,item];
    const summary=nextEffects.map(e=>`${e.mode==='buff'?'✨':'⚠️'} ${e.name} (${e.remaining}/${e.duration})`).join(' · ');
    void save({...target,statusBuffs:summary,notifications:[notification,...(target.notifications||[])],adminStatusEffects:nextEffects,adminBalanceSnapshot:snapshot,adminBalanceModifiers:[...modifiers,modifier]},`${mode==='buff'?'เพิ่มบัฟ':'เพิ่มเนิร์ฟ'} ${selectedEffect.name} แล้ว`);
  };

  const removeModifier = (id:string) => {
    if(!target)return;
    const removed=modifiers.find(m=>m.id===id); const remaining=modifiers.filter(m=>m.id!==id);
    if(!remaining.length)return clearAll();
    // IMPORTANT: bump the snapshot revision when deleting a modifier.
    // Previously the snapshot kept the old capturedAt timestamp, so the local
    // recovery overlay considered the deleted modifier newer and resurrected it
    // on the next realtime sync.
    const baseSnapshot=target.adminBalanceSnapshot||cloneSnapshot(target);
    const snapshot: AdminBalanceSnapshot={...baseSnapshot,capturedAt:Date.now()};
    const maxDelta=remaining.filter(isMaxHp).reduce((s,m)=>s+signed(m),0);
    const hpDelta=remaining.filter(m=>m.kind==='hp'&&!isMaxHp(m)).reduce((s,m)=>s+signed(m),0);
    const maxHp=Math.max(1,snapshot.maxHp+maxDelta); const hp=Math.max(0,Math.min(maxHp,snapshot.hp+hpDelta));
    const stats={...snapshot.stats};
    (['strength','durability','agility','magic'] as StatKey[]).forEach(k=>{const d=remaining.filter(m=>m.kind==='stat'&&m.stat===k).reduce((s,m)=>s+signed(m),0);stats[k]=Math.max(0,snapshot.stats[k]+d);});
    const nextSkills=snapshot.skills.map(base=>{const d=remaining.filter(m=>m.kind==='skill'&&m.skillId===base.id).reduce((s,m)=>s+signed(m),0);const max=Math.max(base.maxLevel||10,1);return {...base,level:Math.max(1,Math.min(max,base.level+d))};});
    const nextEffects=removed?.effectId?statusEffects.filter(e=>e.id!==removed.effectId):statusEffects;
    const summary=nextEffects.map(e=>`${e.mode==='buff'?'✨':'⚠️'} ${e.name} (${e.remaining}/${e.duration})`).join(' · ');
    void save({...target,hp,maxHp,stats,skills:nextSkills,statusBuffs:summary,adminStatusEffects:nextEffects,adminBalanceSnapshot:snapshot,adminBalanceModifiers:remaining},'ปลดคำสั่งเรียบร้อยแล้ว');
  };

  const clearAll = () => {
    if(!target)return;
    const snapshot=target.adminBalanceSnapshot;
    if(!snapshot)return void save({...target,adminBalanceModifiers:[],adminStatusEffects:[],statusBuffs:''},'ไม่มีคำสั่งที่ต้องปลด');
    void save({...target,hp:snapshot.hp,maxHp:snapshot.maxHp,stats:{...snapshot.stats},skills:snapshot.skills.map(s=>({...s})),adminBalanceSnapshot:undefined,adminBalanceModifiers:[],adminStatusEffects:[],statusBuffs:''},'ปลด BUFF / NERF ทั้งหมด คืนค่าพื้นฐานแล้ว');
  };

  if(!target)return null;

  const activeRows=modifiers.map(m=>{
    const e=m.effectId?statusEffects.find(x=>x.id===m.effectId):undefined;
    let label='';
    if(m.kind==='hp')label=`${isMaxHp(m)?'MAX HP':'HP'} ${m.mode==='buff'?'+':'-'}${m.amount||0}`;
    else if(m.kind==='stat')label=`${statLabels[m.stat as StatKey]} ${m.mode==='buff'?'+':'-'}${m.amount||0}`;
    else if(m.kind==='skill')label=`สกิล ${skills.find(s=>s.id===m.skillId)?.name||'-'} ${m.mode==='buff'?'+':'-'}${m.amount||0} Lv`;
    else label=`${m.mode==='buff'?'✨':'⚠️'} ${e?.name||'สถานะ'}`;
    return {m,e,label};
  });

  const buffRows=activeRows.filter(r=>r.m.mode==='buff');
  const nerfRows=activeRows.filter(r=>r.m.mode==='nerf');
  const buttonClass=mode==='buff'?'border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200':'border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200';
  const sign=mode==='buff'?'+':'-';
  const selectedSkill=skills.find(s=>s.id===skillId);

  return <section className="mx-auto mt-6 max-w-6xl overflow-hidden rounded-[30px] border border-amber-500/30 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.14),transparent_34%),linear-gradient(145deg,rgba(10,18,35,.98),rgba(30,27,75,.96))] shadow-[0_0_55px_rgba(245,158,11,.08)]">
    <div className="border-b border-amber-500/20 p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono tracking-[.25em] text-amber-300"><Sparkles className="h-4 w-4"/> STAR STREAM BALANCE</div><h2 className="text-2xl font-black text-white md:text-3xl">ศูนย์ควบคุม BUFF / NERF</h2><p className="mt-1 text-sm text-slate-400">ปรับสมดุลตัวละครแบบ Real-time • ทุกคำสั่งบันทึกลง Firestore</p></div><button onClick={()=>void clearAll()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"><RotateCcw className="h-4 w-4"/>ปลด BUFF / NERF ทั้งหมด</button></div></div>

    <div className="grid gap-5 p-4 sm:p-6 md:gap-6 md:p-7 lg:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-300">ตัวละครเป้าหมาย</span><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-300">{characters.length} ตัวละคร</span></div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {characters.map(c=>{const selected=c.id===targetId;const name=c.displayName||c.nickname||c.username||c.id;return <button key={c.id} type="button" onClick={()=>setTargetId(c.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected?'border-cyan-300/80 bg-cyan-400/15 shadow-[0_0_22px_rgba(34,211,238,.12)]':'border-white/10 bg-white/[.035] hover:border-cyan-400/40 hover:bg-white/[.06]'}`}><div className="flex items-center gap-3"><img src={c.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-white">{name}</div><div className="truncate text-[10px] text-slate-400">@{c.username}</div><div className="mt-1 text-[10px] font-semibold text-slate-400">HP <span className="text-slate-200">{c.hp}/{c.maxHp}</span> · STR {c.stats?.strength ?? 0} · DUR {c.stats?.durability ?? 0} · AGI {c.stats?.agility ?? 0} · MAG {c.stats?.magic ?? 0}</div></div>{selected&&<span className="shrink-0 rounded-lg bg-cyan-400 px-2 py-1 text-[9px] font-black text-slate-950">เลือกอยู่</span>}</div></button>})}
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3"><img src={target.avatarUrl} alt="" className="h-11 w-11 rounded-xl border border-cyan-400/30 object-cover"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-white">{target.displayName||target.nickname||target.username}</div><div className="mt-0.5 truncate text-[11px] text-slate-300">@{target.username} • HP {target.hp}/{target.maxHp}</div></div><div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black text-cyan-200">เป้าหมายปัจจุบัน</div></div>
        </div>

        <div className="grid grid-cols-2 gap-2"><button onClick={()=>setMode('buff')} className={`rounded-xl border px-4 py-3 font-black transition ${mode==='buff'?'border-emerald-300/60 bg-emerald-400/20 text-emerald-100':'border-white/10 bg-white/5 text-slate-400'}`}><Plus className="mx-auto mb-1 h-5 w-5"/>BUFF</button><button onClick={()=>setMode('nerf')} className={`rounded-xl border px-4 py-3 font-black transition ${mode==='nerf'?'border-rose-300/60 bg-rose-400/20 text-rose-100':'border-white/10 bg-white/5 text-slate-400'}`}><Minus className="mx-auto mb-1 h-5 w-5"/>NERF</button></div>

        <div className="grid grid-cols-2 gap-3"><div><label className="mb-2 block text-xs font-bold text-slate-300">จำนวน</label><input type="number" min="1" value={amount} onChange={e=>setAmount(Math.max(1,Number(e.target.value)||1))} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white"/></div><div><label className="mb-2 block text-xs font-bold text-slate-300">Stat</label><select value={stat} onChange={e=>setStat(e.target.value as StatKey)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white">{Object.entries(statLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div></div>

        <div className="grid gap-3 sm:grid-cols-2"><button disabled={saving} onClick={()=>applyHp(mode==='buff'?amount:-amount)} className={`rounded-2xl border px-4 py-4 text-left transition ${buttonClass}`}><div className="flex items-center gap-2 font-black"><Heart className="h-5 w-5"/> {sign} HP ปัจจุบัน</div><div className="mt-1 text-xs opacity-70">เปลี่ยนเลือดปัจจุบันเท่านั้น • MAX HP ไม่เปลี่ยน</div></button><button disabled={saving} onClick={()=>applyMaxHp(mode==='buff'?amount:-amount)} className={`rounded-2xl border px-4 py-4 text-left transition ${buttonClass}`}><div className="flex items-center gap-2 font-black"><Shield className="h-5 w-5"/> {sign} MAX HP</div><div className="mt-1 text-xs opacity-70">เปลี่ยนเพดาน HP เท่านั้น • ไม่ทำ Damage/Heal</div></button><button disabled={saving} onClick={()=>applyStat(mode==='buff'?amount:-amount)} className={`rounded-2xl border px-4 py-4 text-left transition ${buttonClass}`}><div className="flex items-center gap-2 font-black"><Swords className="h-5 w-5"/> {sign} {statLabels[stat]}</div><div className="mt-1 text-xs opacity-70">ปรับค่าสเตตัสสะสม กดซ้ำได้</div></button></div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-black text-white">ระดับสกิล</h3><p className="text-xs text-slate-500">เลือกสกิลแล้วเพิ่ม/ลดระดับได้ • บันทึก Real-time</p></div></div>{skills.length===0?<div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">ตัวละครนี้ยังไม่มีสกิล</div>:<div className="grid gap-3 sm:grid-cols-[1fr_auto]"><select value={skillId} onChange={e=>setSkillId(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white">{skills.map(s=><option key={s.id} value={s.id}>{s.name} • Lv {s.level}/{s.maxLevel||10}</option>)}</select><button disabled={saving||!skillId} onClick={()=>applySkill(mode==='buff'?amount:-amount)} className={`rounded-xl border px-4 py-3 font-black ${buttonClass}`}>{sign} ระดับสกิล</button></div>}{selectedSkill&&<div className="mt-3 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-slate-300">สกิลที่เลือก: <span className="font-black text-white">{selectedSkill.name}</span> • ระดับปัจจุบัน Lv {selectedSkill.level}/{selectedSkill.maxLevel||10}</div>}</div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-white">สถานะพิเศษ</h3><span className="text-[10px] text-slate-500">กดซ้ำได้ • มีระยะเวลา</span></div><div className="grid gap-3 sm:grid-cols-2"><select value={effect} onChange={e=>setEffect(e.target.value as EffectKind)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white">{effects.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input type="number" min="1" value={effectPower} onChange={e=>setEffectPower(Math.max(1,Number(e.target.value)||1))} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white" placeholder="พลัง"/><input type="number" min="1" value={duration} onChange={e=>setDuration(Math.max(1,Number(e.target.value)||1))} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white" placeholder="รอบ"/><button disabled={saving} onClick={applyEffect} className={`rounded-xl border px-3 py-3 font-black ${buttonClass}`}>{mode==='buff'?'✨ เพิ่มบัฟ':'⚠️ เพิ่มเนิร์ฟ'} {selectedEffect.name}</button></div></div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black text-white">สถานะที่ตัวละครโดนอยู่</h3><p className="text-xs text-slate-500">ดูได้ทันทีว่าตัวละครนี้โดน BUFF / NERF อะไรอยู่</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">REAL-TIME</span></div>
        <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/60 p-4"><div className="flex items-end justify-between"><div><div className="text-xs text-slate-500">พลังชีวิต</div><div className="mt-1 text-2xl font-black text-white">{target.hp} <span className="text-slate-500">/ {target.maxHp}</span></div></div><div className="text-right text-[10px] text-slate-500">{activeRows.length} คำสั่งที่ใช้งาน</div></div></div>

        {activeRows.length===0?<div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">ยังไม่มี BUFF / NERF ที่ตัวละครนี้โดนอยู่</div>:<div className="space-y-4">
          {nerfRows.length>0&&<div><div className="mb-2 flex items-center gap-2 text-xs font-black text-rose-200"><span className="rounded-full bg-rose-500/15 px-2 py-1">⚠️ NERF</span><span className="text-slate-500">สิ่งที่ตัวละครโดนลด/โดนผลกระทบ</span></div><div className="space-y-2">{nerfRows.map(({m,e,label})=><div key={m.id} className="rounded-xl border border-rose-400/20 bg-rose-500/[.06] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold text-rose-100">{label}</div>{m.kind==='skill'&&<div className="mt-1 text-[11px] text-rose-200/70">ระดับสกิลถูกลด และจะคงอยู่จนกว่าจะปลด NERF</div>}{m.kind==='hp'&&isMaxHp(m)&&<div className="mt-1 text-[11px] text-rose-200/70">เพดาน MAX HP ถูกลดลง</div>}{m.kind==='status'&&e&&<div className="mt-1 text-[11px] text-rose-200/70">{e.name} • พลัง {e.power} • เหลือ {e.remaining}/{e.duration} รอบ</div>}<div className="mt-1 text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString('th-TH')}</div></div><button disabled={saving} onClick={()=>removeModifier(m.id)} className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"><Trash2 className="h-4 w-4"/></button></div></div>)}</div></div>}
          {buffRows.length>0&&<div><div className="mb-2 flex items-center gap-2 text-xs font-black text-emerald-200"><span className="rounded-full bg-emerald-500/15 px-2 py-1">✨ BUFF</span><span className="text-slate-500">สิ่งที่ตัวละครได้รับเพิ่ม</span></div><div className="space-y-2">{buffRows.map(({m,e,label})=><div key={m.id} className="rounded-xl border border-emerald-400/20 bg-emerald-500/[.06] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold text-emerald-100">{label}</div>{m.kind==='skill'&&<div className="mt-1 text-[11px] text-emerald-200/70">ระดับสกิลเพิ่มขึ้น</div>}{m.kind==='hp'&&isMaxHp(m)&&<div className="mt-1 text-[11px] text-emerald-200/70">เพดาน MAX HP เพิ่มขึ้น</div>}{m.kind==='status'&&e&&<div className="mt-1 text-[11px] text-emerald-200/70">{e.name} • พลัง {e.power} • เหลือ {e.remaining}/{e.duration} รอบ</div>}<div className="mt-1 text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString('th-TH')}</div></div><button disabled={saving} onClick={()=>removeModifier(m.id)} className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"><Trash2 className="h-4 w-4"/></button></div></div>)}</div></div>}
        </div>}
      </div>
    </div>
    {message&&<div className="border-t border-white/10 bg-black/20 px-5 py-3 text-center text-xs font-bold text-amber-200">{message}</div>}
  </section>;
};
