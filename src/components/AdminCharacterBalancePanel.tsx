import React, { useMemo, useState } from 'react';
import { CharacterProfile } from '../types';
import { AlertTriangle, Ban, CheckCircle2, Flame, Heart, Minus, Plus, RotateCcw, Shield, Skull, Sparkles, Swords, Zap } from 'lucide-react';

interface Props {
  characters: CharacterProfile[];
  onUpdateCharacter: (character: CharacterProfile) => Promise<boolean>;
}

type StatKey = 'strength' | 'durability' | 'agility' | 'magic';
type EffectKind = 'bleeding' | 'burn' | 'poison' | 'reflect' | 'curse' | 'regen' | 'shield' | 'stun' | 'weakness' | 'slow';

const EFFECTS: Array<{ id: EffectKind; name: string; icon: React.ElementType; tone: string; desc: string }> = [
  { id: 'bleeding', name: 'เลือดไหล', icon: DropletIcon, tone: 'rose', desc: 'เสีย HP ตามรอบ' },
  { id: 'burn', name: 'เผาไหม้', icon: Flame, tone: 'orange', desc: 'ได้รับความเสียหายต่อเนื่อง' },
  { id: 'poison', name: 'พิษ', icon: Skull, tone: 'lime', desc: 'พิษสะสมและลด HP' },
  { id: 'reflect', name: 'สะท้อน', icon: Shield, tone: 'cyan', desc: 'สะท้อนความเสียหายกลับ' },
  { id: 'curse', name: 'คำสาป', icon: Ban, tone: 'purple', desc: 'ลดประสิทธิภาพการต่อสู้' },
  { id: 'regen', name: 'ฟื้นฟู', icon: Heart, tone: 'emerald', desc: 'ฟื้น HP ต่อเนื่อง' },
  { id: 'shield', name: 'โล่คุ้มกัน', icon: Shield, tone: 'blue', desc: 'ลดความเสียหายที่ได้รับ' },
  { id: 'stun', name: 'มึนงง', icon: Zap, tone: 'amber', desc: 'ข้ามเทิร์น' },
  { id: 'weakness', name: 'อ่อนแอ', icon: Minus, tone: 'red', desc: 'ลดพลังโจมตี' },
  { id: 'slow', name: 'เชื่องช้า', icon: Swords, tone: 'indigo', desc: 'ลดความว่องไว' },
];

function DropletIcon({ className = '' }: { className?: string }) {
  return <span className={`inline-flex items-center justify-center font-black ${className}`}>◈</span>;
}

const statLabels: Record<StatKey, string> = {
  strength: 'STR พละกำลัง',
  durability: 'DUR ความทนทาน',
  agility: 'AGI ความว่องไว',
  magic: 'MAG พลังเวท',
};

const effectClasses: Record<string, string> = {
  rose: 'border-rose-500/40 bg-rose-950/30 text-rose-200',
  orange: 'border-orange-500/40 bg-orange-950/30 text-orange-200',
  lime: 'border-lime-500/40 bg-lime-950/30 text-lime-200',
  cyan: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200',
  purple: 'border-purple-500/40 bg-purple-950/30 text-purple-200',
  emerald: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200',
  blue: 'border-blue-500/40 bg-blue-950/30 text-blue-200',
  amber: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  red: 'border-red-500/40 bg-red-950/30 text-red-200',
  indigo: 'border-indigo-500/40 bg-indigo-950/30 text-indigo-200',
};

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
  const adminEffects = ((target as any)?.adminStatusEffects || []) as Array<any>;

  const save = async (next: CharacterProfile, success = 'บันทึกคำสั่งผู้ดูแลแล้ว') => {
    setSaving(true);
    setMessage('กำลังส่งคำสั่งเข้าสู่ Star Stream...');
    const ok = await onUpdateCharacter({ ...next, lastUpdated: Date.now() });
    setSaving(false);
    setMessage(ok ? success : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    if (ok) window.setTimeout(() => setMessage(''), 2600);
  };

  const applyHp = (delta: number) => {
    if (!target) return;
    const nextMax = Math.max(1, target.maxHp + delta);
    const nextHp = Math.max(0, Math.min(nextMax, target.hp + delta));
    void save({ ...target, maxHp: nextMax, hp: nextHp });
  };

  const applyStat = (delta: number) => {
    if (!target) return;
    void save({ ...target, stats: { ...target.stats, [stat]: Math.max(0, target.stats[stat] + delta) } });
  };

  const applySkillLevel = (delta: number) => {
    if (!target || !skillId) return;
    const nextSkills = target.skills.map(skill => {
      if (skill.id !== skillId) return skill;
      const max = Math.max(skill.maxLevel || 10, 1);
      return { ...skill, level: Math.max(1, Math.min(max, skill.level + delta)) };
    });
    void save({ ...target, skills: nextSkills });
  };

  const applyEffect = () => {
    if (!target) return;
    const now = Date.now();
    const existing = adminEffects.filter(e => e?.kind !== effect);
    const item = {
      id: `admin-effect-${effect}-${now}`,
      kind: effect,
      name: selectedEffect.name,
      power: Math.max(0, effectPower),
      duration: Math.max(1, duration),
      remaining: Math.max(1, duration),
      appliedAt: now,
      source: 'admin',
      mode,
      description: selectedEffect.desc,
    };
    const prefix = mode === 'buff' ? '✨ ได้รับบัฟ' : '⚠️ ได้รับเนิร์ฟ';
    const notification = {
      id: `notif-admin-balance-${now}`,
      title: `${prefix}: ${selectedEffect.name}`,
      message: `${selectedEffect.name} ระดับ ${effectPower} เป็นเวลา ${duration} รอบ โดยผู้ดูแลระบบ`,
      timestamp: now,
      read: false,
      type: 'admin' as const,
    };
    void save({
      ...target,
      statusBuffs: `${mode === 'buff' ? 'บัฟ' : 'เนิร์ฟ'}: ${selectedEffect.name} (${effectPower}) · ${duration} รอบ`,
      notifications: [notification, ...(target.notifications || [])],
      ...( { adminStatusEffects: [...existing, item] } as any ),
    });
  };

  const removeEffect = (id: string) => {
    if (!target) return;
    void save({ ...target, ...( { adminStatusEffects: adminEffects.filter(e => e.id !== id) } as any ) });
  };

  const resetModifiers = () => {
    if (!target) return;
    void save({ ...target, ...( { adminStatusEffects: [] } as any ), statusBuffs: '' }, 'ล้างบัฟ/เนิร์ฟของตัวละครแล้ว');
  };

  if (!target) return null;

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-amber-500/30 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.13),transparent_35%),linear-gradient(145deg,rgba(15,23,42,.98),rgba(30,27,75,.94))] shadow-[0_0_45px_rgba(245,158,11,.08)]">
      <div className="border-b border-amber-500/20 px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.24em] text-amber-300">
              <Sparkles className="h-4 w-4" /> STAR STREAM BALANCE CONTROL
            </div>
            <h2 className="text-xl font-black text-white md:text-2xl">ศูนย์ควบคุมบัฟ / เนิร์ฟตัวละคร</h2>
            <p className="mt-1 text-sm text-slate-400">ปรับสมดุลตัวละครและส่งสถานะเข้าสู่ฐานข้อมูลแบบ Real-time</p>
          </div>
          <button onClick={resetModifiers} disabled={saving} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-bold text-slate-300 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50">
            <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> ล้างบัฟ/เนิร์ฟ
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_.9fr] md:p-7">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
            <label className="mb-2 block text-xs font-bold text-slate-400">ตัวละครเป้าหมาย</label>
            <select value={target.id} onChange={e => setTargetId(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-bold text-white outline-none focus:border-amber-400">
              {characters.map(c => <option key={c.id} value={c.id}>{c.displayName} · {c.nickname || c.username}</option>)}
            </select>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">HP</div><b className="text-rose-300">{target.hp}/{target.maxHp}</b></div>
              <div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">POWER</div><b className="text-amber-300">{target.powerScore}</b></div>
              <div className="rounded-xl bg-slate-900/80 p-2"><div className="text-slate-500">SKILLS</div><b className="text-cyan-300">{target.skills?.length || 0}</b></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-2">
            <button onClick={() => setMode('buff')} className={`rounded-xl px-3 py-3 text-sm font-black transition ${mode === 'buff' ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40' : 'text-slate-500 hover:bg-slate-800'}`}><Plus className="mr-1 inline h-4 w-4" /> BUFF</button>
            <button onClick={() => setMode('nerf')} className={`rounded-xl px-3 py-3 text-sm font-black transition ${mode === 'nerf' ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40' : 'text-slate-500 hover:bg-slate-800'}`}><Minus className="mr-1 inline h-4 w-4" /> NERF</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="mb-2 text-xs font-black text-white">❤️ HP โดยตรง</div>
              <div className="flex gap-2"><input type="number" min={1} value={amount} onChange={e => setAmount(Number(e.target.value) || 1)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /><button onClick={() => applyHp(mode === 'buff' ? amount : -amount)} className="rounded-xl bg-amber-500 px-3 font-black text-slate-950">ใช้</button></div>
              <p className="mt-2 text-[11px] text-slate-500">{mode === 'buff' ? 'เพิ่ม Max HP และ HP ปัจจุบัน' : 'ลด Max HP และ HP ปัจจุบัน'}</p>
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
              <div className="mb-2 text-xs font-black text-white">⚔️ ลด/เพิ่มสเตตัส</div>
              <select value={stat} onChange={e => setStat(e.target.value as StatKey)} className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white">{Object.entries(statLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button onClick={() => applyStat(mode === 'buff' ? amount : -amount)} className="w-full rounded-xl bg-cyan-500/20 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/30">{mode === 'buff' ? 'เพิ่ม' : 'ลด'} {amount} แต้ม</button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4">
            <div className="mb-2 text-xs font-black text-white">✨ ระดับสกิล</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <select value={skillId} onChange={e => setSkillId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"><option value="">เลือกสกิล...</option>{skills.map(s => <option key={s.id} value={s.id}>{s.name} · Lv.{s.level}</option>)}</select>
              <button disabled={!skillId || saving} onClick={() => applySkillLevel(mode === 'buff' ? 1 : -1)} className="rounded-xl bg-purple-500/20 px-4 py-2 text-xs font-black text-purple-200 disabled:opacity-40">{mode === 'buff' ? '+1 Lv.' : '-1 Lv.'}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-200"><AlertTriangle className="h-4 w-4" /> สถานะพิเศษ</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {EFFECTS.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setEffect(item.id)} className={`rounded-xl border p-2 text-left transition ${effect === item.id ? effectClasses[item.tone] + ' ring-1 ring-white/20' : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-500'}`}><Icon className="mb-1 h-4 w-4" /><div className="text-[11px] font-black">{item.name}</div></button>; })}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-slate-400">พลัง<select value={effectPower} onChange={e => setEffectPower(Number(e.target.value) || 0)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"><option value={1}>1</option><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
              <label className="text-[11px] text-slate-400">ระยะเวลา (รอบ)<input type="number" min={1} max={99} value={duration} onChange={e => setDuration(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white" /></label>
              <button onClick={applyEffect} disabled={saving} className={`self-end rounded-xl py-2.5 text-xs font-black ${mode === 'buff' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'} disabled:opacity-50`}>{mode === 'buff' ? 'มอบบัฟ' : 'ลงเนิร์ฟ'} {selectedEffect.name}</button>
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-700/80 bg-slate-950/45 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-mono tracking-[.2em] text-cyan-300">LIVE MODIFIERS</div><h3 className="text-lg font-black text-white">สถานะปัจจุบัน</h3></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">REALTIME</span></div>
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs text-slate-500">สถานะสรุป</div><div className="mt-1 text-sm font-bold text-amber-200">{target.statusBuffs || 'ปกติ · ไม่มีสถานะจากผู้ดูแล'}</div></div>
          <div className="space-y-2">
            {adminEffects.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">ยังไม่มีบัฟ/เนิร์ฟที่ใช้งานอยู่</div>}
            {adminEffects.map(e => { const info = EFFECTS.find(x => x.id === e.kind); const Icon = info?.icon || Sparkles; return <div key={e.id} className={`rounded-2xl border p-3 ${e.mode === 'buff' ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-rose-500/30 bg-rose-950/20'}`}><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><Icon className="h-4 w-4" /><div><div className="text-sm font-black text-white">{e.name}</div><div className="text-[11px] text-slate-400">พลัง {e.power} · เหลือ {e.remaining ?? e.duration} รอบ</div></div></div><button onClick={() => removeEffect(e.id)} className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"><Ban className="h-4 w-4" /></button></div></div>; })}
          </div>
          {message && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {message}</div>}
          <div className="mt-4 text-[10px] leading-relaxed text-slate-600">คำสั่งทั้งหมดถูกบันทึกผ่านระบบตัวละคร Real-time และจะถูกส่งไปยังผู้เล่นผ่านข้อมูลตัวละครเดียวกัน</div>
        </aside>
      </div>
    </section>
  );
};
