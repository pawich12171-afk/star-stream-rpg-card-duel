import React, { useMemo, useState } from 'react';
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
  const modifiers = target?.adminBalanceModifiers || [];
  const statusEffects = target?.adminStatusEffects || [];
  const skills = useMemo(() => target?.skills || [], [target]);
  const selectedEffect = effects.find(e => e.id === effect)!;

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
    const hpDelta = all.filter(m => m.kind === 'hp' && !isMaxHp(m)).reduce((sum, m) => sum + signed(m), 0);
    const maxDelta = all.filter(isMaxHp).reduce((sum, m) => sum + signed(m), 0);
    const nextMaxHp = Math.max(1, snapshot.maxHp + maxDelta);
    const nextHp = Math.max(0, Math.min(nextMaxHp, snapshot.hp + hpDelta));
    void save({ ...target, hp: nextHp, maxHp: nextMaxHp, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, delta >= 0 ? `เพิ่ม HP ปัจจุบัน ${Math.abs(delta)} แล้ว` : `ลด HP ปัจจุบัน ${Math.abs(delta)} แล้ว`);
  };

  const applyMaxHp = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-maxhp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: 'hp', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const maxDelta = all.filter(isMaxHp).reduce((sum, m) => sum + signed(m), 0);
    const hpDelta = all.filter(m => m.kind === 'hp' && !isMaxHp(m)).reduce((sum, m) => sum + signed(m), 0);
    const nextMaxHp = Math.max(1, snapshot.maxHp + maxDelta);
    const nextHp = Math.max(0, Math.min(nextMaxHp, snapshot.hp + hpDelta));
    void save({ ...target, hp: nextHp, maxHp: nextMaxHp, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, delta >= 0 ? `เพิ่ม MAX HP ${Math.abs(delta)} แล้ว` : `ลด MAX HP ${Math.abs(delta)} แล้ว`);
  };

  const applyStat = (delta: number) => {
    if (!target) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-stat-${stat}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: 'stat', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), stat, createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const d = all.filter(m => m.kind === 'stat' && m.stat === stat).reduce((sum, m) => sum + signed(m), 0);
    const stats = { ...snapshot.stats, [stat]: Math.max(0, snapshot.stats[stat] + d) };
    void save({ ...target, stats, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, `${mode === 'buff' ? 'เพิ่ม' : 'ลด'} ${statLabels[stat]} ${Math.abs(delta)} แล้ว`);
  };

  const applySkill = (delta: number) => {
    if (!target || !skillId) return;
    const snapshot = snapshotFor(target);
    const modifier: AdminBalanceModifier = { id: `admin-skill-${skillId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: 'skill', mode: delta >= 0 ? 'buff' : 'nerf', amount: Math.abs(delta), skillId, createdAt: Date.now() };
    const all = [...modifiers, modifier];
    const nextSkills = snapshot.skills.map(base => { const d = all.filter(m => m.kind === 'skill' && m.skillId === base.id).reduce((sum, m) => sum + signed(m), 0); const max = Math.max(base.maxLevel || 10, 1); return { ...base, level: Math.max(1, Math.min(max, base.level + d)) }; });
    void save({ ...target, skills: nextSkills, adminBalanceSnapshot: snapshot, adminBalanceModifiers: all }, `${mode === 'buff' ? 'เพิ่ม' : 'ลด'}ระดับสกิลแล้ว`);
  };

  const applyEffect = () => {
    if (!target) return;
    const now = Date.now(); const snapshot = snapshotFor(target);
    const effectId = `admin-effect-${effect}-${now}-${Math.random().toString(36).slice(2,7)}`;
    const item = { id: effectId, kind: effect, name: selectedEffect.name, power: Math.max(0,effectPower), duration: Math.max(1,duration), remaining: Math.max(1,duration), appliedAt: now, source: 'admin' as const, mode, description: selectedEffect.desc };
    const modifier: AdminBalanceModifier = { id: `admin-status-${now}-${Math.random().toString(36).slice(2,7)}`, kind: 'status', mode, effectId, createdAt: now };
    const notification = { id: `notif-admin-${now}`, title: mode === 'buff' ? `✨ ได้รับบัฟ ${selectedEffect.name}` : `⚠️ ได้รับเนิร์ฟ ${selectedEffect.name}`, message: `${selectedEffect.name} พลัง ${effectPower} เป็นเวลา ${duration} รอบ โดยผู้ดูแลระบบ`, timestamp: now, read: false, type: 'admin' as const };
    const nextEffects = [...statusEffects, item];
    const summary = nextEffects.map(e => `${e.mode === 'buff' ? '✨' : '⚠️'} ${e.name} (${e.remaining}/${e.duration})`).join(' · ');
    void save({ ...target, statusBuffs: summary, notifications: [notification, ...(target.notifications || [])], adminStatusEffects: nextEffects, adminBalanceSnapshot: snapshot, adminBalanceModifiers: [...modifiers, modifier] }, `${mode === 'buff' ? 'เพิ่มบัฟ' : 'เพิ่มเนิร์ฟ'} ${selectedEffect.name} แล้ว`);
  };

  const removeModifier = (id: string) => {
    if (!target) return;
    const removed = modifiers.find(m => m.id === id);
    const remaining = modifiers.filter(m => m.id !== id);
    if (!remaining.length) return clearAll();
    const snapshot = target.adminBalanceSnapshot || cloneSnapshot(target);
    const maxDelta = remaining.filter(isMaxHp).reduce((sum,m) => sum + signed(m),0);
    const hpDelta = remaining.filter(m => m.kind === 'hp' && !isMaxHp(m)).reduce((sum,m) => sum + signed(m),0);
    const maxHp = Math.max(1, snapshot.maxHp + maxDelta);
    const hp = Math.max(0, Math.min(maxHp, snapshot.hp + hpDelta));
    const stats = { ...snapshot.stats };
    (['strength','durability','agility','magic'] as StatKey[]).forEach(k => { const d = remaining.filter(m => m.kind === 'stat' && m.stat === k).reduce((sum,m) => sum + signed(m),0); stats[k] = Math.max(0, snapshot.stats[k] + d); });
    const nextSkills = snapshot.skills.map(base => { const d = remaining.filter(m => m.kind === 'skill' && m.skillId === base.id).reduce((sum,m) => sum + signed(m),0); const max = Math.max(base.maxLevel || 10,1); return { ...base, level: Math.max(1, Math.min(max, base.level + d)) }; });
    const nextEffects = removed?.effectId ? statusEffects.filter(e => e.id !== removed.effectId) : statusEffects;
    const summary = nextEffects.map(e => `${e.mode === 'buff' ? '✨' : '⚠️'} ${e.name} (${e.remaining}/${e.duration})`).join(' · ');
    void save({ ...target, hp, maxHp, stats, skills: nextSkills, statusBuffs: summary, adminStatusEffects: nextEffects, adminBalanceSnapshot: snapshot, adminBalanceModifiers: remaining }, 'ปลดคำสั่งเรียบร้อยแล้ว');
  };

  const clearAll = () => {
    if (!target) return;
    const snapshot = target.adminBalanceSnapshot;
    if (!snapshot) return void save({ ...target, adminBalanceModifiers: [], adminStatusEffects: [], statusBuffs: '' }, 'ไม่มีคำสั่งที่ต้องปลด');
    void save({ ...target, hp: snapshot.hp, maxHp: snapshot.maxHp, stats: { ...snapshot.stats }, skills: snapshot.skills.map(s => ({ ...s })), adminBalanceSnapshot: undefined, adminBalanceModifiers: [], adminStatusEffects: [], statusBuffs: '' }, 'ปลด BUFF / NERF ทั้งหมด คืนค่าพื้นฐานแล้ว');
  };

  if (!target) return null;

  const activeRows = modifiers.map(m => {
    const e = m.effectId ? statusEffects.find(x => x.id === m.effectId) : undefined;
    let label = '';
    if (m.kind === 'hp') label = `${isMaxHp(m) ? 'MAX HP' : 'HP'} ${m.mode === 'buff' ? '+' : '-'}${m.amount || 0}`;
    else if (m.kind === 'stat') label = `${statLabels[m.stat as StatKey]} ${m.mode === 'buff' ? '+' : '-'}${m.amount || 0}`;
    else if (m.kind === 'skill') label = `สกิล ${skills.find(s => s.id === m.skillId)?.name || '-'} ${m.mode === 'buff' ? '+' : '-'}${m.amount || 0} Lv`;
    else label = `${m.mode === 'buff' ? '✨' : '⚠️'} ${e?.name || 'สถานะ'}`;
    return { m, e, label };
  });

  const buttonClass = mode === 'buff' ? 'border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200' : 'border-rose-400/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200';
  const sign = mode === 'buff' ? '+' : '-';

  return <section className="mt-6 overflow-hidden rounded-[30px] border border-amber-500/30 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.14),transparent_34%),linear-gradient(145deg,rgba(10,18,35,.98),rgba(30,27,75,.96))] shadow-[0_0_55px_rgba(245,158,11,.08)]">
    <div className="border-b border-amber-500/20 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono tracking-[.25em] text-amber-300"><Sparkles className="h-4 w-4"/> STAR STREAM BALANCE CONTROL</div><h2 className="text-xl font-black text-white md:text-2xl">ศูนย์ควบคุม BUFF / NERF</h2><p className="mt-1 text-sm text-slate-400">ทุกคำสั่งเป็น <b className="text-amber-300">ชั่วคราว · กดซ้ำได้ · ย้อนกลับได้</b> และส่งผลแบบ Real-time</p></div>
        <button onClick={clearAll} disabled={saving || !modifiers.length} className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40"><RotateCcw className="h-4 w-4"/>ปลดทั้งหมด</button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-xs text-slate-400">ตัวละคร<select value={target.id} onChange={e=>setTargetId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{characters.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>
        <label className="text-xs text-slate-400">โหมด<select value={mode} onChange={e=>setMode(e.target.value as 'buff'|'nerf')} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-white"><option value="buff">✨ BUFF เพิ่มพลัง</option><option value="nerf">⚠️ NERF ลดพลัง</option></select></label>
        <label className="text-xs text-slate-400">จำนวน<select value={amount} onChange={e=>setAmount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="500">500</option><option value="1000">1,000</option></select></label>
      </div>
    </div>

    <div className="grid gap-4 p-5 md:grid-cols-2 md:p-7">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4"><h3 className="mb-3 font-black text-white">❤️ HP</h3><div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={()=>applyHp(mode==='buff'?amount:-amount)} className={`rounded-xl border px-3 py-3 text-sm font-black ${buttonClass}`}>{sign} HP ปัจจุบัน</button><button disabled={saving} onClick={()=>applyMaxHp(mode==='buff'?amount:-amount)} className={`rounded-xl border px-3 py-3 text-sm font-black ${buttonClass}`}>{sign} MAX HP</button></div><p className="mt-3 text-xs text-slate-500">HP ปัจจุบันกับ MAX HP แยกกันชัดเจน • ลด MAX HP จะลดเพดานเลือดและบีบ HP ให้ไม่เกินเพดานใหม่</p></div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4"><h3 className="mb-3 font-black text-white">⚔️ Stats</h3><div className="grid grid-cols-[1fr_auto] gap-2"><select value={stat} onChange={e=>setStat(e.target.value as StatKey)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{Object.entries(statLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button disabled={saving} onClick={()=>applyStat(mode==='buff'?amount:-amount)} className={`rounded-xl border px-4 py-2 font-black ${buttonClass}`}>{sign}{amount}</button></div></div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4"><h3 className="mb-3 font-black text-white">✨ ระดับสกิล</h3><div className="grid grid-cols-[1fr_auto] gap-2"><select value={skillId} onChange={e=>setSkillId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">เลือกสกิล...</option>{skills.map(s=><option key={s.id} value={s.id}>{s.name} · Lv.{s.level}</option>)}</select><button disabled={saving || !skillId} onClick={()=>applySkill(mode==='buff'?1:-1)} className={`rounded-xl border px-4 py-2 font-black ${buttonClass}`}>{sign}1 Lv</button></div></div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4"><h3 className="mb-3 font-black text-white">☠️ สถานะ</h3><div className="grid gap-2 sm:grid-cols-2"><select value={effect} onChange={e=>setEffect(e.target.value as EffectKind)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{effects.map(e=><option key={e.id} value={e.id}>{e.name} · {e.desc}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="1" value={effectPower} onChange={e=>setEffectPower(Number(e.target.value)||1)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="พลัง"/><input type="number" min="1" value={duration} onChange={e=>setDuration(Number(e.target.value)||1)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="รอบ"/></div></div><button disabled={saving} onClick={applyEffect} className={`mt-2 w-full rounded-xl border px-4 py-2 font-black ${buttonClass}`}>{sign} ใช้สถานะกับตัวละคร</button></div>
    </div>

    <div className="border-t border-slate-800/80 p-5 md:p-7"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-white">📡 สถานะที่ตัวละครโดนอยู่</h3><span className="text-xs text-slate-500">{modifiers.length} คำสั่ง</span></div><div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4"><div className="flex flex-wrap gap-2"><span className="font-mono text-xs text-cyan-300">HP {target.hp.toLocaleString()} / {target.maxHp.toLocaleString()}</span>{statusEffects.map(e=><span key={e.id} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200">{e.mode==='buff'?'✨':'⚠️'} {e.name} · {e.remaining}/{e.duration} รอบ</span>)}</div></div>{activeRows.length===0?<p className="text-sm text-slate-500">ยังไม่มี BUFF / NERF จากผู้ดูแล</p>:<div className="space-y-2">{activeRows.map(({m,e,label})=><div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2"><div className="min-w-0"><div className={`text-sm font-bold ${m.mode==='buff'?'text-emerald-300':'text-rose-300'}`}>{m.mode==='buff'?'✨ BUFF':'⚠️ NERF'} · {label}</div>{e&&<div className="text-xs text-slate-500">{e.remaining}/{e.duration} รอบ · พลัง {e.power}</div>}</div><button disabled={saving} onClick={()=>removeModifier(m.id)} className="shrink-0 rounded-lg border border-rose-500/30 p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4"/></button></div>)}</div>}</div>

    {message && <div className="border-t border-amber-500/20 px-5 py-3 text-center text-sm font-bold text-amber-300">{saving?'⏳ ': '✓ '}{message}</div>}
  </section>;
};
