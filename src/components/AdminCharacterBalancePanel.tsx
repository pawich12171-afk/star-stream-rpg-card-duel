import React, { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Flame, Heart, Minus, Plus, RotateCcw, Shield, Skull, Sparkles, Swords, Trash2, Zap } from 'lucide-react';
import { CharacterProfile, AdminBalanceModifier, AdminBalanceSnapshot, AdminStatusEffectKind } from '../types';

interface Props { characters: CharacterProfile[]; onUpdateCharacter: (character: CharacterProfile) => Promise<boolean>; }
type StatKey = 'strength' | 'durability' | 'agility' | 'magic';
type EffectKind = AdminStatusEffectKind;

const EFFECTS: Array<{ id: EffectKind; name: string; icon: React.ElementType; tone: string; desc: string }> = [
  { id: 'bleeding', name: 'เลือดไหล', icon: BloodDrop, tone: 'rose', desc: 'เสีย HP ต่อรอบ' },
  { id: 'burn', name: 'เผาไหม้', icon: Flame, tone: 'orange', desc: 'ได้รับความเสียหายต่อเนื่อง' },
  { id: 'poison', name: 'พิษ', icon: Skull, tone: 'lime', desc: 'ลด HP ต่อเนื่อง' },
  { id: 'reflect', name: 'สะท้อน', icon: Shield, tone: 'cyan', desc: 'สะท้อนความเสียหายกลับ' },
  { id: 'curse', name: 'คำสาป', icon: Ban, tone: 'purple', desc: 'ลดประสิทธิภาพการต่อสู้' },
  { id: 'regen', name: 'ฟื้นฟู', icon: Heart, tone: 'emerald', desc: 'ฟื้น HP ต่อเนื่อง' },
  { id: 'shield', name: 'โล่คุ้มกัน', icon: Shield, tone: 'blue', desc: 'ลดความเสียหายที่ได้รับ' },
  { id: 'stun', name: 'มึนงง', icon: Zap, tone: 'amber', desc: 'ข้ามเทิร์น' },
  { id: 'weakness', name: 'อ่อนแอ', icon: Minus, tone: 'red', desc: 'ลดพลังโจมตี' },
  { id: 'slow', name: 'เชื่องช้า', icon: Swords, tone: 'indigo', desc: 'ลดความว่องไว' },
];
function BloodDrop({ className = '' }: { className?: string }) { return <span className={`inline-flex items-center justify-center font-black ${className}`}>◆</span>; }
const statLabels: Record<StatKey, string> = { strength: 'STR พละกำลัง', durability: 'DUR ความทนทาน', agility: 'AGI ความว่องไว', magic: 'MAG พลังเวท' };
const toneClasses: Record<string, string> = {
  rose: 'border-rose-500/40 bg-rose-950/30 text-rose-200', orange: 'border-orange-500/40 bg-orange-950/30 text-orange-200',
  lime: 'border-lime-500/40 bg-lime-950/30 text-lime-200', cyan: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200',
  purple: 'border-purple-500/40 bg-purple-950/30 text-purple-200', emerald: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200',
  blue: 'border-blue-500/40 bg-blue-950/30 text-blue-200', amber: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  red: 'border-red-500/40 bg-red-950/30 text-red-200', indigo: 'border-indigo-500/40 bg-indigo-950/30 text-indigo-200',
};
const cloneSnapshot = (c: CharacterProfile): AdminBalanceSnapshot => ({ hp: c.hp, maxHp: c.maxHp, stats: { ...c.stats }, skills: (c.skills || []).map(s => ({ ...s })), capturedAt: Date.now() });

export const AdminCharacterBalancePanel: React.FC<Props> = ({ characters, onUpdateCharacter }) => {
  const [targetId, setTargetId] = useState(characters[0]?.id || '');
  const [mode, setMode] = useState<'buff' | 'nerf'>('buff');
  const [amount, setAmount] = useState(10);
  const [stat, setStat] = useState<StatKey>('strength');
  const [skillId, setSkillId] = useState('');
  const [effect, setEffect] = useState<EffectKind>('bleeding');
  const [duration, setDuration] = useState(3);
  const [effectPower, setEffectPower] = useState(5);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const target = characters.find(c => c.id === targetId) || characters[0];
  const selectedEffect = EFFECTS.find(e => e.id === effect)!;
  const skills = useMemo(() => target?.skills || [], [target]);
  const modifiers = target?.adminBalanceModifiers || [];
  const statusEffects = target?.adminStatusEffects || [];

  const save = async (next: CharacterProfile, success: string) => {
    setSaving(true); setMessage('กำลังส่งคำสั่งเข้าสู่ Star Stream...');
    const ok = await onUpdateCharacter({ ...next, lastUpdated: Date.now() });
    setSaving(false); setMessage(ok ? success : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    if (ok) window.setTimeout(() => setMessage(''), 2800);
  };
  const snapshotFor = (c: CharacterProfile) => c.adminBalanceSnapshot && (c.adminBalanceModifiers?.length || 0) > 0 ? c.adminBalanceSnapshot : cloneSnapshot(c);
  const signed = (m: AdminBalanceModifier) => m.mode === 'buff' ? (m.amount || 0) : -(m.amount || 0);

  const applyHp = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-hp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'hp', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const hpDelta = all.filter(m => m.kind === 'hp').reduce((sum, m) => sum + signed(m), 0);
    void save({ ...target, hp: Math.max(0, Math.min(snapshot.maxHp, snapshot.hp + hpDelta)), adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, delta >= 0 ? `เพิ่ม HP ${Math.abs(delta)} แล้ว` : `ลด HP ${Math.abs(delta)} แล้ว (Max HP ไม่เปลี่ยน)`);
  };

  const applyStat = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-stat-${stat}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'stat', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), stat, createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const d = all.filter(m => m.kind === 'stat' && m.stat === stat).reduce((sum, m) => sum + signed(m), 0);
    void save({ ...target, stats: { ...snapshot.stats, [stat]: Math.max(0, snapshot.stats[stat] + d) }, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, `${mode === 'buff' ? 'เพิ่ม' : 'ลด'} ${statLabels[stat]} ${Math.abs(delta)} แล้ว`);
  };

  const applySkillLevel = (delta: number) => {
    if (!target || !skillId) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-skill-${skillId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'skill', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), skillId, createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const nextSkills = snapshot.skills.map(base => { const d = all.filter(m => m.kind === 'skill' && m.skillId === base.id).reduce((sum, m) => sum + signed(m), 0); const max = Math.max(base.maxLevel || 10, 1); return { ...base, level: Math.max(1, Math.min(max, base.level + d)) }; });
    void save({ ...target, skills: nextSkills, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, `${mode === 'buff' ? 'เพิ่ม' : 'ลด'}ระดับสกิลแล้ว`);
  };

  const applyEffect = () => {
    if (!target) return;
    const now = Date.now(); const snapshot = snapshotFor(target); const effectId = `admin-effect-${effect}-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const item = { id: effectId, kind: effect, name: selectedEffect.name, power: Math.max(0, effectPower), duration: Math.max(1, duration), remaining: Math.max(1, duration), appliedAt: now, source: 'admin' as const, mode, description: selectedEffect.desc };
    const modifier: AdminBalanceModifier = { id: `admin-status-${now}-${Math.random().toString(36).slice(2, 7)}`, kind: 'status', mode, effectId, createdAt: now };
    const notification = { id: `notif-admin-balance-${now}`, title: mode === 'buff' ? `✨ ได้รับบัฟ: ${selectedEffect.name}` : `⚠️ ได้รับเนิร์ฟ: ${selectedEffect.name}`, message: `${target.displayName} ได้รับ${mode === 'buff' ? 'บัฟ' : 'เนิร์ฟ'} ${selectedEffect.name} ระดับ ${effectPower} เป็นเวลา ${duration} รอบ โดยผู้ดูแลระบบ`, timestamp: now, read: false, type: 'admin' as const };
    void save({ ...target, statusBuffs: `${mode === 'buff' ? '✨ บัฟ' : '⚠️ เนิร์ฟ'}: ${selectedEffect.name} (${effectPower}) · ${duration} รอบ`, notifications: [notification, ...(target.notifications || [])], adminStatusEffects: [...statusEffects, item], adminBalanceSnapshot: snapshot, adminBalanceModifiers: [...modifiers, modifier] }, `${mode === 'buff' ? 'เพิ่มบัฟ' : 'เพิ่มเนิร์ฟ'} ${selectedEffect.name} แล้ว`);
  };

  const removeModifier = (id: string) => {
    if (!target) return;
    const removed = modifiers.find(m => m.id === id); const remaining = modifiers.filter(m => m.id !== id);
    if (!remaining.length) return clearAll();
    const snapshot = target.adminBalanceSnapshot || cloneSnapshot(target);
    const hpDelta = remaining.filter(m => m.kind === 'hp').reduce((sum, m) => sum + signed(m), 0);
    const stats = { ...snapshot.stats };
    (['strength','durability','agility','magic'] as StatKey[]).forEach(k => { const d = remaining.filter(m => m.kind === 'stat' && m.stat === k).reduce((sum, m) => sum + signed(m), 0); stats[k] = Math.max(0, snapshot.stats[k] + d); });
    const nextSkills = snapshot.skills.map(base => { const d = remaining.filter(m => m.kind === 'skill' && m.skillId === base.id).reduce((sum, m) => sum + signed(m), 0); const max = Math.max(base.maxLevel || 10, 1); return { ...base, level: Math.max(1, Math.min(max, base.level + d)) }; });
    const effects = removed?.effectId ? statusEffects.filter(e => e.id !== removed.effectId) : statusEffects;
    const summary = effects.map(e => `${e.mode === 'buff' ? '✨' : '⚠️'} ${e.name} (${e.remaining}/${e.duration})`).join(' · ');
    void save({ ...target, hp: Math.max(0, Math.min(snapshot.maxHp, snapshot.hp + hpDelta)), stats, skills: nextSkills, statusBuffs: summary, adminStatusEffects: effects, adminBalanceSnapshot: snapshot, adminBalanceModifiers: remaining }, 'ปลดสถานะเรียบร้อยแล้ว');
  };

  const clearAll = () => {
    if (!target) return;
    const snapshot = target.adminBalanceSnapshot;
    if (!snapshot) return void save({ ...target, adminBalanceModifiers: [], adminStatusEffects: [], statusBuffs: '' }, 'ล้างสถานะผู้ดูแลแล้ว');
    void save({ ...target, hp: Math.max(0, Math.min(snapshot.maxHp, snapshot.hp)), maxHp: snapshot.maxHp, stats: { ...snapshot.stats }, skills: snapshot.skills.map(s => ({ ...s })), adminBalanceSnapshot: undefined, adminBalanceModifiers: [], adminStatusEffects: [], statusBuffs: '' }, 'ปลดบัฟ/เนิร์ฟทั้งหมดแล้ว คืนค่าตัวละครเดิมแล้ว');
  };
  if (!target) return null;

  const activeRows = modifiers.map(mod => {
    const e = mod.effectId ? statusEffects.find(x => x.id === mod.effectId) : undefined;
    const label = mod.kind === 'hp' ? `HP ${mod.mode === 'buff' ? '+' : '-'}${mod.amount}` : mod.kind === 'stat' ? `${statLabels[mod.stat!]} ${mod.mode === 'buff' ? '+' : '-'}${mod.amount}` : mod.kind === 'skill' ? `สกิล ${skills.find(s => s.id === mod.skillId)?.name || '-'} ${mod.mode === 'buff' ? '+' : '-'}${mod.amount} Lv` : `${e?.name || 'สถานะ'}`;
    return { mod, e, label };
  });

  return <section className="mt-6 overflow-hidden rounded-[28px] border border-amber-500/30 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.13),transparent_35%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(30,27,75,.94))] shadow-[0_0_45px_rgba(245,158,11,.08)]">
    <div className="border-b border-amber-500/20 px-5 py-5 md:px-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.24em] text-amber-300"><Sparkles className="h-4 w-4"/> STAR STREAM BALANCE CONTROL</div><h2 className="text-xl font-black text-white md:text-2xl">ศูนย์ควบคุมบัฟ / เนิร์ฟตัวละคร</h2><p className="mt-1 text-sm text-slate-400">คำสั่งเป็น <b className="text-amber-300">ชั่วคราวและย้อนกลับได้</b> ไม่ทำลายค่าพื้นฐานของตัวละคร</p></div><button onClick={clearAll} disabled={saving || !modifiers.length} className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-900/40 disabled:opacity-40"><RotateCcw className="mr-1 inline h-3.5 w-3.5"/> ปลดบัฟ/เนิร์ฟทั้งหมด</button></div></div>
    <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_.9fr] md:p-7"><div className="space-y-5">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4"><label className="mb-2 block text-xs font-bold text-slate-400">ตัวละครเป้าหมาย</label><select value={target.id} onChange={e=>setTargetId(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-bold text-white">{characters.map(c=><option key={c.id} value={c.id}>{c.displayName} · {c.nickname || c.username}</option>)}</select><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">HP</div><b className="text-rose-300">{target.hp}/{target.maxHp}</b></div><div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">POWER</div><b className="text-amber-300">{target.powerScore}</b></div><div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">สถานะ</div><b className="text-cyan-300">{statusEffects.length}</b></div></div></div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-2"><button onClick={()=>setMode('buff')} className={`rounded-xl px-3 py-3 text-sm font-black ${mode==='buff'?'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40':'text-slate-500 hover:bg-slate-800'}`}><Plus className="mr-1 inline h-4 w-4"/> BUFF</button><button onClick={()=>setMode('nerf')} className={`rounded-xl px-3 py-3 text-sm font-black ${mode==='nerf'?'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40':'text-slate-500 hover:bg-slate-800'}`}><Minus className="mr-1 inline h-4 w-4"/> NERF</button></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4"><div className="mb-2 text-xs font-black text-white">❤️ HP ปัจจุบัน</div><div className="flex gap-2"><input type="number" min={1} value={amount} onChange={e=>setAmount(Math.max(1,Number(e.target.value)||1))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/><button onClick={()=>applyHp(mode==='buff'?amount:-amount)} disabled={saving} className="rounded-xl bg-amber-500 px-3 font-black text-slate-950 disabled:opacity-50">ใช้</button></div><p className="mt-2 text-[11px] text-slate-500">เพิ่ม/ลดเฉพาะเลือดปัจจุบัน • <b>ไม่ลด Max HP</b> • กดซ้ำได้</p></div><div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4"><div className="mb-2 text-xs font-black text-white">⚔️ สเตตัสชั่วคราว</div><select value={stat} onChange={e=>setStat(e.target.value as StatKey)} className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white">{Object.entries(statLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button onClick={()=>applyStat(mode==='buff'?amount:-amount)} disabled={saving} className="w-full rounded-xl bg-cyan-500/20 py-2 text-xs font-black text-cyan-200 disabled:opacity-50">{mode==='buff'?'เพิ่ม':'ลด'} {amount} แต้ม</button></div></div>
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4"><div className="mb-2 text-xs font-black text-white">✨ ระดับสกิลชั่วคราว</div><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={skillId} onChange={e=>setSkillId(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="">เลือกสกิล</option>{skills.map(s=><option key={s.id} value={s.id}>{s.name} · Lv.{s.level}</option>)}</select><button onClick={()=>applySkillLevel(mode==='buff'?amount:-amount)} disabled={saving||!skillId} className="rounded-xl bg-purple-500/20 px-4 py-2 text-xs font-black text-purple-200 disabled:opacity-40">{mode==='buff'?'เพิ่ม':'ลด'} Lv</button></div></div>
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-black text-white">☄️ สถานะพิเศษ</div><span className="text-[10px] text-slate-500">กดซ้ำได้ • สร้างสถานะใหม่ทุกครั้ง</span></div><div className="grid gap-2 sm:grid-cols-2">{EFFECTS.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setEffect(item.id)} className={`rounded-xl border px-3 py-2 text-left ${effect===item.id?`${toneClasses[item.tone]} ring-1 ring-current/30`:'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500'}`}><Icon className="mr-2 inline h-4 w-4"/><b className="text-xs">{item.name}</b><div className="mt-0.5 text-[10px] opacity-70">{item.desc}</div></button>})}</div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">พลัง<input type="number" min={0} value={effectPower} onChange={e=>setEffectPower(Math.max(0,Number(e.target.value)||0))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"/></label><label className="text-[10px] text-slate-500">ระยะเวลา (รอบ)<input type="number" min={1} value={duration} onChange={e=>setDuration(Math.max(1,Number(e.target.value)||1))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"/></label></div><button onClick={applyEffect} disabled={saving} className={`mt-3 w-full rounded-xl py-3 text-sm font-black disabled:opacity-50 ${mode==='buff'?'bg-emerald-500 text-slate-950':'bg-rose-500 text-white'}`}>{mode==='buff'?'✨ ใช้บัฟกับตัวละคร':'⚠️ ใช้เนิร์ฟกับตัวละคร'}</button></div>
      {message&&<div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-3 text-xs font-bold text-cyan-200"><CheckCircle2 className="mr-2 inline h-4 w-4"/>{message}</div>}
    </div><aside className="space-y-4"><div className="rounded-2xl border border-cyan-500/20 bg-slate-950/55 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-white">📡 สถานะที่ตัวละครโดนอยู่</h3><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300">REAL-TIME</span></div>{activeRows.length===0?<div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">ไม่มีบัฟ / เนิร์ฟที่กำลังทำงาน</div>:<div className="space-y-2">{activeRows.map(row=><div key={row.mod.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${row.mod.mode==='buff'?'border-emerald-500/30 bg-emerald-950/20':'border-rose-500/30 bg-rose-950/20'}`}><div className="min-w-0"><div className={`text-xs font-black ${row.mod.mode==='buff'?'text-emerald-200':'text-rose-200'}`}>{row.mod.mode==='buff'?'✨ BUFF':'⚠️ NERF'} · {row.label}</div>{row.e&&<div className="mt-1 text-[10px] text-slate-400">พลัง {row.e.power} · เหลือ {row.e.remaining}/{row.e.duration} รอบ</div>}</div><button onClick={()=>removeModifier(row.mod.id)} disabled={saving} title="ปลดสถานะนี้" className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div>}</div><div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4"><div className="text-xs font-black text-amber-200">🔐 ระบบย้อนกลับ</div><p className="mt-2 text-[11px] leading-5 text-slate-400">ค่าพื้นฐานถูกเก็บก่อนคำสั่งแรก เมื่อปลดบัฟ/เนิร์ฟทั้งหมด ระบบคืน HP, สเตตัส และระดับสกิลกลับเป็นค่าก่อนถูกปรับทันที</p></div></aside></div>
  </section>;
};
