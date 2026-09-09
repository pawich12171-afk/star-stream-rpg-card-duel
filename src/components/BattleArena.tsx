import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Crown, Dice5, Plus, Settings2, Shield, Skull, Swords, Target, Trash2, UsersRound, Zap } from 'lucide-react';
import { BattleBot, BattleCombatant, BattleConfig, BattleDiceFace, BattleRoom, CharacterProfile } from '../types';
import {
  DEFAULT_BATTLE_CONFIG,
  createBattleRoom,
  deleteBattleBot,
  deleteBattleRoom,
  resolveBattleTurn,
  saveBattleBot,
  saveBattleConfig,
  subscribeToBattleBots,
  subscribeToBattleConfig,
  subscribeToBattleRooms,
  updateBattleRoom,
} from '../services/characterService';

type BattleArenaProps = {
  currentUser: CharacterProfile;
  allCharacters: CharacterProfile[];
  isAdmin: boolean;
};

const panelClass = 'rounded-3xl border border-slate-800 bg-slate-900/70 shadow-xl';
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400';
const buttonClass = 'rounded-xl px-3 py-2 text-xs font-black transition-all';

function makePlayerCombatant(character: CharacterProfile, team: 'a' | 'b'): BattleCombatant {
  return {
    id: 'player:' + character.id,
    sourceId: character.id,
    name: character.displayName,
    avatarUrl: character.avatarUrl,
    type: 'player',
    team,
    stats: { ...character.stats },
    hp: character.hp,
    maxHp: character.maxHp,
  };
}

function makeBotCombatant(bot: BattleBot, team: 'a' | 'b'): BattleCombatant {
  return {
    id: 'bot:' + bot.id,
    sourceId: bot.id,
    name: bot.name,
    avatarUrl: bot.avatarUrl,
    type: 'bot',
    team,
    stats: { ...bot.stats },
    hp: bot.hp,
    maxHp: bot.maxHp,
    isBoss: bot.isBoss,
  };
}

function healthPercent(unit: BattleCombatant) {
  return Math.max(0, Math.min(100, Math.round((unit.hp / Math.max(1, unit.maxHp)) * 100)));
}

export function BattleArena({ currentUser, allCharacters, isAdmin }: BattleArenaProps) {
  const [config, setConfig] = useState<BattleConfig>(DEFAULT_BATTLE_CONFIG);
  const [bots, setBots] = useState<BattleBot[]>([]);
  const [rooms, setRooms] = useState<BattleRoom[]>([]);
  const [mode, setMode] = useState<'pvp' | 'pve'>('pve');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([currentUser.id]);
  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [showAdmin, setShowAdmin] = useState(isAdmin);
  const [botForm, setBotForm] = useState({ name: '', description: '', hp: '30', strength: '9', durability: '6', agility: '5', magic: '0', isBoss: false, avatarUrl: '/avatars/system.svg' });

  useEffect(() => {
    const unsubConfig = subscribeToBattleConfig(setConfig);
    const unsubBots = subscribeToBattleBots(setBots);
    const unsubRooms = subscribeToBattleRooms(setRooms);
    return () => { unsubConfig(); unsubBots(); unsubRooms(); };
  }, []);

  useEffect(() => {
    if (!selectedTeamIds.includes(currentUser.id)) setSelectedTeamIds([currentUser.id]);
  }, [currentUser.id, selectedTeamIds]);

  useEffect(() => {
    if (!isAdmin) setShowAdmin(false);
  }, [isAdmin]);

  const otherPlayers = useMemo(() => allCharacters.filter(character => character.id !== currentUser.id), [allCharacters, currentUser.id]);
  const activeBots = bots.filter(bot => bot.hp > 0);
  const myRooms = rooms.filter(room => [...room.teamA, ...room.teamB].some(unit => unit.type === 'player' && unit.sourceId === currentUser.id));

  const toggleTeamMember = (id: string) => {
    if (id === currentUser.id) return;
    setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const toggleBot = (id: string) => {
    setSelectedBotIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const createRoom = async () => {
    if (!config.enabled) { alert('สนามรบถูกปิดใช้งานโดยแอดมิน'); return; }
    const teamMembers = allCharacters.filter(character => selectedTeamIds.includes(character.id));
    if (!teamMembers.some(character => character.id === currentUser.id)) teamMembers.unshift(currentUser);
    const enemies = mode === 'pve'
      ? bots.filter(bot => selectedBotIds.includes(bot.id))
      : otherPlayers.filter(character => character.id === selectedOpponentId);
    if (!enemies.length) { alert(mode === 'pve' ? 'เลือกบอทหรือบอสก่อนสร้างห้อง' : 'เลือกผู้เล่นฝ่ายตรงข้ามก่อนสร้างห้อง'); return; }
    const teamA = teamMembers.slice(0, 3).map(character => makePlayerCombatant(character, 'a'));
    const teamB = mode === 'pve'
      ? enemies.slice(0, 3).map(bot => makeBotCombatant(bot as BattleBot, 'b'))
      : enemies.slice(0, 3).map(character => makePlayerCombatant(character as CharacterProfile, 'b'));
    const room: BattleRoom = {
      id: 'battle-' + Date.now(),
      mode,
      status: 'active',
      createdBy: currentUser.id,
      createdByName: currentUser.displayName,
      teamA,
      teamB,
      turnActorId: teamA[0].id,
      round: 1,
      log: [{ id: 'battle-log-' + Date.now(), timestamp: Date.now(), actorName: 'SYSTEM', message: 'เริ่มการต่อสู้แบบทีม — พลัง 3 แต้มคิดเป็นดาเมจพื้นฐาน 1 หน่วย' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await createBattleRoom(room);
    setSelectedBotIds([]);
    setSelectedOpponentId('');
  };

  const takeTurn = async (room: BattleRoom) => {
    const resolved = resolveBattleTurn(room, config);
    if (resolved.result || resolved.room.status !== room.status || resolved.room.turnActorId !== room.turnActorId) {
      await updateBattleRoom(resolved.room);
    }
  };

  const canPlayerAct = (room: BattleRoom) => {
    const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
    return room.status === 'active' && actor?.type === 'player' && actor.sourceId === currentUser.id;
  };

  const canBotAct = (room: BattleRoom) => {
    const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
    return room.status === 'active' && room.mode === 'pve' && actor?.type === 'bot' && myRooms.some(item => item.id === room.id);
  };

  const updateFace = (index: number, patch: Partial<BattleDiceFace>) => {
    setConfig(prev => ({ ...prev, faces: prev.faces.map((face, faceIndex) => faceIndex === index ? { ...face, ...patch } : face) }));
  };

  const saveConfig = async () => {
    try { await saveBattleConfig(config); alert('บันทึกกติกาลูกเต๋าแล้ว'); } catch (error) { alert('บันทึกกติกาไม่สำเร็จ'); }
  };

  const createBot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!botForm.name.trim()) return;
    const now = Date.now();
    const hp = Math.max(1, Number(botForm.hp) || 1);
    const bot: BattleBot = {
      id: 'bot-' + now,
      name: botForm.name.trim(),
      description: botForm.description.trim() || 'นักสู้ที่ถูกสร้างโดยแอดมิน',
      avatarUrl: botForm.avatarUrl || '/avatars/system.svg',
      isBoss: botForm.isBoss,
      stats: {
        strength: Math.max(0, Number(botForm.strength) || 0),
        durability: Math.max(0, Number(botForm.durability) || 0),
        agility: Math.max(0, Number(botForm.agility) || 0),
        magic: Math.max(0, Number(botForm.magic) || 0),
      },
      hp,
      maxHp: hp,
      aiProfile: botForm.isBoss ? 'aggressive' : 'balanced',
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveBattleBot(bot);
      setBotForm({ name: '', description: '', hp: '30', strength: '9', durability: '6', agility: '5', magic: '0', isBoss: false, avatarUrl: '/avatars/system.svg' });
    } catch (error) { alert('สร้างบอทไม่สำเร็จ'); }
  };

  const deleteRoom = async (room: BattleRoom) => {
    if (!isAdmin && room.createdBy !== currentUser.id) return;
    await deleteBattleRoom(room.id);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-violet-950/40 p-5 md:p-7 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.2em] text-cyan-300"><Swords className="h-4 w-4" /> TEAM BATTLE / DICE PROTOCOL</div>
            <h2 className="text-2xl font-black text-white md:text-3xl">สนามรบกลุ่มดาว</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">รวมทีมเข้าต่อสู้กับผู้เล่นหรือบอท/บอส ทอยลูกเต๋าเพื่อกำหนดผลการโจมตีตามกติกาที่แอดมินตั้งค่าได้</p>
          </div>
          {isAdmin && <button type="button" onClick={() => setShowAdmin(prev => !prev)} className={buttonClass + ' flex items-center gap-2 bg-amber-500 text-slate-950 hover:bg-amber-300'}><Settings2 className="h-4 w-4" />{showAdmin ? 'ซ่อนแผงแอดมิน' : 'ตั้งค่าสนามรบ'}</button>}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">กติกา</div><div className="mt-1 font-black text-cyan-200">พลัง {config.strengthPerDamage} = 1 DMG</div></div>
          <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">ลูกเต๋า</div><div className="mt-1 font-black text-violet-200">D{config.sides} / {config.faces.length} ผลลัพธ์</div></div>
          <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">สถานะ</div><div className="mt-1 font-black text-emerald-200">{config.enabled ? 'เปิดรับศึก' : 'ปิดสนามรบ'}</div></div>
        </div>
      </section>

      {showAdmin && isAdmin && (
        <section className={panelClass + ' p-5 md:p-6'}>
          <div className="mb-5 flex items-center gap-2"><Settings2 className="h-5 w-5 text-amber-300" /><h3 className="text-lg font-black text-white">แผงควบคุมแอดมิน</h3><span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200">ADMIN ONLY</span></div>
          <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-black text-cyan-200">กติกาลูกเต๋าแต่ละหน้า</h4><button type="button" onClick={saveConfig} className={buttonClass + ' bg-cyan-400 text-slate-950 hover:bg-cyan-300'}><Check className="mr-1 inline h-3.5 w-3.5" />บันทึกกติกา</button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">จำนวนแต้มต่อดาเมจ<input className={inputClass + ' mt-1'} type="number" min="1" value={config.strengthPerDamage} onChange={event => setConfig(prev => ({ ...prev, strengthPerDamage: Math.max(1, Number(event.target.value) || 1) }))} /></label>
                <label className="flex items-center gap-2 self-end rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={config.enabled} onChange={event => setConfig(prev => ({ ...prev, enabled: event.target.checked }))} /> เปิดให้สร้างห้องรบ</label>
              </div>
              <div className="space-y-2">
                {config.faces.map((face, index) => <div key={face.face} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[2.5rem_7rem_5rem_1fr] sm:items-center"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 font-black text-violet-200">{face.face}</div><select className={inputClass} value={face.effect} onChange={event => updateFace(index, { effect: event.target.value as BattleDiceFace['effect'] })}><option value="damage">โจมตี</option><option value="critical">คริติคอล</option><option value="heal">ฟื้นฟู</option><option value="miss">พลาด</option><option value="stun">สตัน</option></select><input className={inputClass} type="number" step="0.5" value={face.value} onChange={event => updateFace(index, { value: Number(event.target.value) || 0 })} placeholder="ค่า" /><div className="grid gap-2 sm:grid-cols-2"><input className={inputClass} value={face.label} onChange={event => updateFace(index, { label: event.target.value })} placeholder="ชื่อผล" /><input className={inputClass} value={face.description} onChange={event => updateFace(index, { description: event.target.value })} placeholder="คำอธิบาย" /></div></div>)}
              </div>
            </div>
            <form onSubmit={createBot} className="space-y-4 rounded-2xl border border-rose-500/20 bg-rose-950/10 p-4"><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-rose-300" /><h4 className="font-black text-rose-200">สร้างบอท / บอส</h4></div><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} value={botForm.name} onChange={event => setBotForm(prev => ({ ...prev, name: event.target.value }))} placeholder="ชื่อบอทหรือบอส" required /><input className={inputClass} value={botForm.avatarUrl} onChange={event => setBotForm(prev => ({ ...prev, avatarUrl: event.target.value }))} placeholder="URL รูป avatar" /></div><input className={inputClass} value={botForm.description} onChange={event => setBotForm(prev => ({ ...prev, description: event.target.value }))} placeholder="คำอธิบาย AI / กลไกบอส" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><label className="text-[10px] text-slate-500">HP<input className={inputClass + ' mt-1'} type="number" min="1" value={botForm.hp} onChange={event => setBotForm(prev => ({ ...prev, hp: event.target.value }))} /></label><label className="text-[10px] text-slate-500">พลัง<input className={inputClass + ' mt-1'} type="number" min="0" value={botForm.strength} onChange={event => setBotForm(prev => ({ ...prev, strength: event.target.value }))} /></label><label className="text-[10px] text-slate-500">ทนทาน<input className={inputClass + ' mt-1'} type="number" min="0" value={botForm.durability} onChange={event => setBotForm(prev => ({ ...prev, durability: event.target.value }))} /></label><label className="text-[10px] text-slate-500">ว่องไว<input className={inputClass + ' mt-1'} type="number" min="0" value={botForm.agility} onChange={event => setBotForm(prev => ({ ...prev, agility: event.target.value }))} /></label><label className="text-[10px] text-slate-500">เวท<input className={inputClass + ' mt-1'} type="number" min="0" value={botForm.magic} onChange={event => setBotForm(prev => ({ ...prev, magic: event.target.value }))} /></label></div><label className="flex items-center gap-2 text-xs text-rose-100"><input type="checkbox" checked={botForm.isBoss} onChange={event => setBotForm(prev => ({ ...prev, isBoss: event.target.checked }))} /> <Crown className="h-4 w-4 text-amber-300" /> ตั้งเป็น Boss</label><button type="submit" className={buttonClass + ' w-full bg-rose-500 text-white hover:bg-rose-400'}><Plus className="mr-1 inline h-4 w-4" />สร้างบอท</button></form>
          </div>
          {bots.length > 0 && <div className="mt-6 grid gap-3 md:grid-cols-2">{bots.map(bot => <div key={bot.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex min-w-0 items-center gap-3"><img src={bot.avatarUrl} alt="" className="h-10 w-10 rounded-xl border border-slate-700 object-cover" /><div className="min-w-0"><div className="flex items-center gap-2 truncate font-bold text-white">{bot.isBoss && <Crown className="h-3.5 w-3.5 text-amber-300" />}{bot.name}</div><div className="text-[11px] text-slate-500">HP {bot.maxHp} · พลัง {bot.stats.strength} · {bot.description}</div></div></div><button type="button" onClick={() => void deleteBattleBot(bot.id)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300" title="ลบบอท"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
        </section>
      )}

      <section className={panelClass + ' p-5 md:p-6'}>
        <div className="mb-5 flex items-center gap-2"><Target className="h-5 w-5 text-cyan-300" /><h3 className="text-lg font-black text-white">สร้างศึกใหม่</h3></div>
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode('pve')} className={buttonClass + ' ' + (mode === 'pve' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-400')}><Bot className="mr-1 inline h-4 w-4" />ตีบอท / บอส</button><button type="button" onClick={() => setMode('pvp')} className={buttonClass + ' ' + (mode === 'pvp' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400')}><UsersRound className="mr-1 inline h-4 w-4" />สู้ผู้เล่น</button></div><div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><div className="mb-2 text-xs font-bold text-slate-300">ทีมของคุณ <span className="text-slate-500">(เลือกได้สูงสุด 3 คน)</span></div><div className="space-y-2">{allCharacters.filter(character => character.id === currentUser.id || selectedTeamIds.includes(character.id)).map(character => <label key={character.id} className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-2 text-sm"><input type="checkbox" checked={selectedTeamIds.includes(character.id)} disabled={character.id === currentUser.id} onChange={() => toggleTeamMember(character.id)} /><img src={character.avatarUrl} alt="" className="h-7 w-7 rounded-lg object-cover" /><span className="font-bold text-white">{character.displayName}</span><span className="ml-auto text-[10px] text-slate-500">STR {character.stats.strength}</span></label>)}{otherPlayers.map(character => !selectedTeamIds.includes(character.id) && <label key={character.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2 text-sm"><input type="checkbox" checked={false} onChange={() => toggleTeamMember(character.id)} /><img src={character.avatarUrl} alt="" className="h-7 w-7 rounded-lg object-cover" /><span className="text-slate-300">{character.displayName}</span><span className="ml-auto text-[10px] text-slate-600">เพิ่มเข้าทีม</span></label>)}</div></div></div>
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/35 p-3"><div className="text-xs font-bold text-slate-300">ฝ่ายตรงข้าม</div>{mode === 'pvp' ? <select className={inputClass} value={selectedOpponentId} onChange={event => setSelectedOpponentId(event.target.value)}><option value="">เลือกผู้เล่น</option>{otherPlayers.map(character => <option key={character.id} value={character.id}>{character.displayName} · STR {character.stats.strength}</option>)}</select> : <div className="space-y-2">{activeBots.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">ยังไม่มีบอท — ให้แอดมินสร้างก่อน</div>}{activeBots.map(bot => <label key={bot.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-sm"><input type="checkbox" checked={selectedBotIds.includes(bot.id)} onChange={() => toggleBot(bot.id)} /><img src={bot.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" /><span className="font-bold text-white">{bot.name}</span>{bot.isBoss ? <span className="ml-auto flex items-center gap-1 text-[10px] font-black text-amber-300"><Skull className="h-3 w-3" />BOSS</span> : <span className="ml-auto text-[10px] text-slate-500">HP {bot.maxHp}</span>}</label>)}</div>}<button type="button" onClick={() => void createRoom()} disabled={!config.enabled} className={buttonClass + ' mt-2 w-full bg-emerald-500 text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40'}><Plus className="mr-1 inline h-4 w-4" />เปิดห้องรบ</button></div>
        </div>
      </section>

      <section className="space-y-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-black text-white"><Shield className="h-5 w-5 text-emerald-300" />ห้องรบของคุณ</h3><span className="text-xs text-slate-500">{myRooms.length} ห้อง</span></div>{myRooms.length === 0 && <div className={panelClass + ' p-8 text-center text-sm text-slate-500'}>ยังไม่มีห้องรบ สร้างศึกแรกของคุณได้ด้านบน</div>}{myRooms.map(room => { const units = [...room.teamA, ...room.teamB]; const actor = units.find(unit => unit.id === room.turnActorId); const canAct = canPlayerAct(room); const botTurn = canBotAct(room); const winner = room.winnerTeam ? (room.winnerTeam === 'a' ? 'ทีมคุณชนะ' : room.winnerTeam === 'b' ? 'ฝ่ายตรงข้ามชนะ' : 'เสมอ') : ''; return <article key={room.id} className={panelClass + ' overflow-hidden'}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/35 p-4"><div className="flex items-center gap-2"><span className={'rounded-full px-2 py-1 text-[10px] font-black ' + (room.mode === 'pve' ? 'bg-violet-500/20 text-violet-200' : 'bg-cyan-500/20 text-cyan-200')}>{room.mode === 'pve' ? 'PVE' : 'PVP'}</span><span className="text-xs text-slate-500">รอบ {room.round}</span>{room.status === 'completed' && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-200">จบศึก: {winner}</span>}</div><div className="flex items-center gap-2">{room.status === 'active' && <span className="flex items-center gap-1 text-xs text-amber-200"><Zap className="h-3.5 w-3.5" />เทิร์น: {actor?.name}</span>}{(isAdmin || room.createdBy === currentUser.id) && <button type="button" onClick={() => void deleteRoom(room)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}</div></div><div className="grid gap-4 p-4 md:grid-cols-2"><div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-3"><div className="mb-3 text-xs font-black uppercase tracking-widest text-cyan-200">ทีม A · ผู้ท้าศึก</div><div className="space-y-2">{room.teamA.map(unit => <div key={unit.id} className="flex items-center gap-2"><img src={unit.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-bold text-white">{unit.name}</span><span className="text-slate-400">{unit.hp}/{unit.maxHp}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: healthPercent(unit) + '%' }} /></div></div>{unit.stunnedTurns ? <span className="text-[10px] text-amber-300">STUN</span> : null}</div>)}</div></div><div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 p-3"><div className="mb-3 text-xs font-black uppercase tracking-widest text-rose-200">ทีม B · เป้าหมาย</div><div className="space-y-2">{room.teamB.map(unit => <div key={unit.id} className="flex items-center gap-2"><img src={unit.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-bold text-white">{unit.name}</span><span className="text-slate-400">{unit.hp}/{unit.maxHp}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-rose-400" style={{ width: healthPercent(unit) + '%' }} /></div></div>{unit.isBoss && <Crown className="h-3.5 w-3.5 text-amber-300" />}{unit.stunnedTurns ? <span className="text-[10px] text-amber-300">STUN</span> : null}</div>)}</div></div></div><div className="flex flex-wrap items-center gap-2 border-t border-slate-800 p-4">{canAct && <button type="button" onClick={() => void takeTurn(room)} className={buttonClass + ' flex items-center gap-2 bg-cyan-400 text-slate-950 hover:bg-cyan-300'}><Dice5 className="h-4 w-4" />ทอยลูกเต๋าโจมตี</button>}{botTurn && <button type="button" onClick={() => void takeTurn(room)} className={buttonClass + ' flex items-center gap-2 bg-violet-500 text-white hover:bg-violet-400'}><Bot className="h-4 w-4" />ให้บอทตัดสินใจ</button>}{room.status === 'active' && !canAct && !botTurn && <span className="text-xs text-slate-500">รอเทิร์นของ {actor?.name || 'ผู้ต่อสู้'}...</span>}{room.status === 'completed' && <span className="flex items-center gap-2 text-xs font-bold text-emerald-200"><Check className="h-4 w-4" />การต่อสู้จบแล้ว</span>}</div><div className="max-h-44 overflow-y-auto border-t border-slate-800 bg-slate-950/25 p-4">{(room.log || []).slice(0, 8).map(entry => <div key={entry.id} className="mb-2 flex gap-2 text-xs leading-5 text-slate-300"><span className="font-black text-cyan-300">{entry.actorName}</span><span>{entry.message}</span></div>)}</div></article>; })}</section>
    </div>
  );
}
