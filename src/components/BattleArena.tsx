import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Crown, Dice5, Heart, Package, Plus, Settings2, Shield, Skull, Sparkles, Swords, Target, Trash2, UsersRound, Zap } from 'lucide-react';
import { BattleBot, BattleCombatant, BattleConfig, BattleDiceConfig, BattleDiceFace, BattleExtraEffect, BattleRandomReward, BattleRoom, CharacterProfile, Skill, BattleBotSkill, Item } from '../types';
import {
  DEFAULT_BATTLE_CONFIG,
  createBattleRoom,
  createBattleRoomWithEntryFee,
  settleBattleVictoryReward,
  deleteBattleBot,
  deleteBattleRoom,
  getBattleSkillProfile,
  resolveBattleTurn,
  saveBattleBot,
  saveBattleConfig,
  subscribeToBattleBots,
  subscribeToBattleConfig,
  subscribeToBattleRooms,
  updateBattleRoom,
  updateCharacterInDB,
  updateCharacterFields,
  useBattleItem,
} from '../services/characterService';

type BattleArenaProps = {
  currentUser: CharacterProfile;
  allCharacters: CharacterProfile[];
  shopItems: Item[];
  isAdmin: boolean;
};

const panelClass = 'rounded-3xl border border-slate-800 bg-slate-900/70 shadow-xl';
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400';
const buttonClass = 'rounded-xl px-3 py-2 text-xs font-black transition-all';

async function fileToDataUrl(file: File): Promise<string> { return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('อ่านไฟล์ไม่สำเร็จ')); reader.readAsDataURL(file); }); }

function makePlayerCombatant(character: CharacterProfile, team: 'a' | 'b'): BattleCombatant {
  const equippedPassives = (character.inventory || [])
    .filter(item => item.isEquipped && item.passiveEffects?.length)
    .flatMap(item => {
      const copies = Math.max(1, Number(item.equippedQuantity) || 1);
      return Array.from({ length: copies }, (_, copyIndex) =>
        (item.passiveEffects || []).map(effect => ({
          ...effect,
          id: copies > 1 ? `${effect.id}:equip:${copyIndex + 1}` : effect.id,
          stackKey: effect.stackKey || `item:${item.id}:${effect.id}`,
          name: copies > 1 ? `${effect.name} ×${copies}` : effect.name,
        }))
      ).flat();
    });
  // Skill passives are true "ติดตัว": every skill the character owns is active
  // for the whole battle, just like an equipped item's passive.
  const skillPassives = (character.skills || [])
    .filter(skill => skill.passiveEffects?.length)
    .flatMap(skill => (skill.passiveEffects || []).map(effect => ({
      ...effect,
      stackKey: effect.stackKey || `skill:${skill.id}:${effect.id}`,
    })));
  const allPassives = [...equippedPassives, ...skillPassives];
  // Normalize legacy character data before battle calculations.
  // Older saved characters may have a missing/partial stats object.
  const rawStats = character.stats || {};
  const stats = {
    strength: Number(rawStats.strength) || 0,
    durability: Number(rawStats.durability) || 0,
    agility: Number(rawStats.agility) || 0,
    magic: Number(rawStats.magic) || 0,
  };
  // Direct stat bonuses configured on equipped items are active in battle.
  (character.inventory || [])
    .filter(item => item.isEquipped && item.category === 'equipment')
    .forEach(item => {
      const copies = Math.max(1, Number(item.equippedQuantity) || 1);
      stats.strength += (Number(item.equipmentStrengthBonus) || 0) * copies;
      stats.durability += (Number(item.equipmentDurabilityBonus) || 0) * copies;
      stats.agility += (Number(item.equipmentAgilityBonus) || 0) * copies;
      stats.magic += (Number(item.equipmentMagicBonus) || 0) * copies;
    });
  allPassives.filter(effect => effect.kind === 'buff_stat' && effect.targetStat).forEach(effect => {
    const stat = effect.targetStat as keyof typeof stats;
    stats[stat] = (stats[stat] || 0) + (Number(effect.value) || 0);
  });
  return {
    id: `player:${character.id}`,
    sourceId: character.id,
    name: character.displayName,
    avatarUrl: character.avatarUrl,
    type: 'player',
    team,
    stats,
    hp: character.hp,
    maxHp: character.maxHp,
    adminStatusEffects: character.adminStatusEffects?.map(effect => ({ ...effect })),
    equippedPassives,
    activeSkillPassives: skillPassives,
    passiveStacks: {},
    skills: [...(character.skills || [])],
    traits: [...(character.characteristics || [])],
  };
}

function makeBotCombatant(bot: BattleBot, team: 'a' | 'b'): BattleCombatant {
  return {
    id: `bot:${bot.id}`,
    sourceId: bot.id,
    name: bot.name,
    avatarUrl: bot.avatarUrl,
    type: 'bot',
    team,
    stats: {
      strength: Number(bot.stats?.strength) || 0,
      durability: Number(bot.stats?.durability) || 0,
      agility: Number(bot.stats?.agility) || 0,
      magic: Number(bot.stats?.magic) || 0,
    },
    hp: Math.max(0, Number(bot.hp) || 0),
    maxHp: Math.max(1, Number(bot.maxHp) || 1),
    isBoss: bot.isBoss,
    skills: (bot.skills || []).map(skill => ({ ...skill })),
    skillCooldowns: {},
  };
}

function healthPercent(unit: BattleCombatant) {
  return Math.max(0, Math.min(100, Math.round((unit.hp / Math.max(1, unit.maxHp)) * 100)));
}

function defaultDiceFace(face: number): BattleDiceFace {
  if (face === 1) return { face, effect: 'miss', value: 0, label: 'พลาด', description: 'การโจมตีไม่สร้างความเสียหาย' };
  if (face === 5) return { face, effect: 'critical', value: 2, label: 'คริติคอล', description: 'ดาเมจพื้นฐาน x2' };
  if (face === 6) return { face, effect: 'heal', value: 2, label: 'ฟื้นฟู', description: 'ฟื้น HP 2 หน่วย' };
  return { face, effect: 'damage', value: face === 4 ? 1.5 : 1, label: face === 4 ? 'โจมตีหนัก' : 'โจมตีปกติ', description: face === 4 ? 'ดาเมจพื้นฐาน x1.5' : 'ดาเมจพื้นฐาน' };
}

function makeDiceFaces(existing: BattleDiceFace[] = [], sides: number) {
  return Array.from({ length: Math.max(2, Math.min(100, sides || 6)) }, (_, index) => {
    const face = index + 1;
    return existing.find(item => item.face === face) || defaultDiceFace(face);
  });
}

function effectStyle(effect?: BattleDiceFace['effect'] | 'stun_skip') {
  if (effect === 'critical') return 'border-amber-400/50 bg-amber-500/10 text-amber-100';
  if (effect === 'heal') return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100';
  if (effect === 'miss') return 'border-slate-600 bg-slate-800/60 text-slate-300';
  if (effect === 'stun' || effect === 'stun_skip') return 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-100';
  if (effect === 'defense') return 'border-sky-400/50 bg-sky-500/10 text-sky-100';
  if (effect === 'reflect') return 'border-rose-400/50 bg-rose-500/10 text-rose-100';
  return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
}

function skillEffectLabel(effect: ReturnType<typeof getBattleSkillProfile>['effect']) {
  if (effect === 'heal') return 'ฟื้นฟู';
  if (effect === 'defense') return 'โล่';
  if (effect === 'reflect') return 'สะท้อน';
  if (effect === 'stun') return 'สตัน';
  return 'โจมตี';
}

function DiceEditor({ title, accent, dice, faces, onPatch, onSidesChange }: {
  title: string;
  accent: 'violet' | 'amber';
  dice: BattleDiceConfig;
  faces: BattleDiceFace[];
  onPatch: (patch: Partial<BattleDiceConfig>) => void;
  onSidesChange: (sides: number) => void;
}) {
  const accentText = accent === 'amber' ? 'text-amber-200' : 'text-cyan-200';
  return <div className={`space-y-3 rounded-2xl border ${accent === 'amber' ? 'border-amber-500/20 bg-amber-950/10' : 'border-violet-500/20 bg-violet-950/10'} p-3`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className={`font-black ${accentText}`}>{title}</h4>{accent === 'amber' && <label className="flex items-center gap-2 text-xs text-amber-100"><input type="checkbox" checked={dice.enabled} onChange={event => onPatch({ enabled: event.target.checked })} /> เปิดใช้ลูกเต๋าบอส</label>}</div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">จำนวนหน้าเต๋า<input className={inputClass + ' mt-1'} type="number" min="2" max="100" value={dice.sides} onChange={event => onSidesChange(Number(event.target.value))} /></label><label className="text-xs text-slate-400">แต้มพลังต่อดาเมจ<input className={inputClass + ' mt-1'} type="number" min="1" value={dice.strengthPerDamage} onChange={event => onPatch({ strengthPerDamage: Math.max(1, Number(event.target.value) || 1) })} /></label></div>
    {faces.map(face => <div key={face.face} className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[2.5rem_7rem_5rem_1fr] sm:items-center">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent === 'amber' ? 'bg-amber-500/20 text-amber-200' : 'bg-violet-500/20 text-violet-200'} font-black`}>{face.face}</div>
      <select className={inputClass} value={face.effect} onChange={event => onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, effect: event.target.value as BattleDiceFace['effect'] } : item) })}><option value="damage">โจมตี</option><option value="critical">คริติคอล</option><option value="heal">ฟื้นฟู</option><option value="miss">พลาด</option><option value="stun">สตัน</option><option value="defense">ป้องกัน</option><option value="reflect">สะท้อน</option></select>
      <input className={inputClass} type="number" step="0.5" value={face.value} onChange={event => onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, value: Number(event.target.value) || 0 } : item) })} placeholder="ค่า" />
      <div className="grid gap-2 sm:grid-cols-2"><input className={inputClass} value={face.label} onChange={event => onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, label: event.target.value } : item) })} placeholder="ชื่อผล" /><input className={inputClass} value={face.description} onChange={event => onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, description: event.target.value } : item) })} placeholder="คำอธิบาย" /></div>
      <div className="sm:col-span-4 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-2">
        <div className="mb-2 text-[10px] font-black text-fuchsia-200">เพิ่มผลพิเศษสำหรับหน้านี้ (ของเดิมยังทำงานเหมือนเดิม)</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem_auto]">
          <select id={`extra-${face.face}-kind`} className={inputClass} defaultValue="bleeding">
            <option value="bleeding">เลือดไหล</option><option value="burn">เผาไหม้</option><option value="poison">พิษ</option><option value="freeze">Freeze</option><option value="stun">สตัน</option><option value="reduce_max_hp_percent">ลด MAX HP %</option><option value="reduce_defense_percent">ลดป้องกัน %</option><option value="damage_percent">เพิ่มดาเมจ %</option><option value="heal_percent">ฟื้น HP %</option><option value="shield">โล่</option><option value="reflect">สะท้อน %</option>
          </select>
          <input id={`extra-${face.face}-value`} className={inputClass} type="number" min="0" step="0.1" defaultValue="15" placeholder="ค่า" />
          <input id={`extra-${face.face}-duration`} className={inputClass} type="number" min="1" defaultValue="1" placeholder="รอบ" />
          <input id={`extra-${face.face}-chance`} className={inputClass} type="number" min="0" max="100" defaultValue="100" placeholder="โอกาส %" />
          <button type="button" className={buttonClass + " bg-fuchsia-500/15 text-fuchsia-100"} onClick={() => {
            const kind = (document.getElementById(`extra-${face.face}-kind`) as HTMLSelectElement)?.value as BattleExtraEffect['kind'];
            const value = Number((document.getElementById(`extra-${face.face}-value`) as HTMLInputElement)?.value || 0);
            const duration = Number((document.getElementById(`extra-${face.face}-duration`) as HTMLInputElement)?.value || 1);
            const chance = Number((document.getElementById(`extra-${face.face}-chance`) as HTMLInputElement)?.value || 100);
            const extra: BattleExtraEffect = { kind, value, duration, chance, target: kind === 'heal_percent' || kind === 'shield' || kind === 'reflect' ? 'self' : 'enemy', label: kind === 'freeze' ? 'Freeze' : undefined };
            onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, extraEffects: [...(item.extraEffects || []), extra] } : item) });
          }}>+ เพิ่ม</button>
        </div>
        {(face.extraEffects || []).map((extra, index) => <div key={index} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-slate-300">
          <span>{extra.label || extra.kind} • {extra.value}{extra.kind.includes("percent") || extra.kind === "reflect" ? "%" : ""} • {extra.duration || 1} รอบ • {extra.chance ?? 100}%</span>
          <button type="button" className="text-rose-300 hover:text-white" onClick={() => onPatch({ faces: faces.map(item => item.face === face.face ? { ...item, extraEffects: (item.extraEffects || []).filter((_, i) => i !== index) } : item) })}>ลบ</button>
        </div>)}
      </div>
    </div>)}
  </div>;
}

export function BattleArena({ currentUser, allCharacters, shopItems, isAdmin }: BattleArenaProps) {
  const [config, setConfig] = useState<BattleConfig>(DEFAULT_BATTLE_CONFIG);
  const [bots, setBots] = useState<BattleBot[]>([]);
  const [rooms, setRooms] = useState<BattleRoom[]>([]);
  const [mode, setMode] = useState<'pvp' | 'pve' | 'random'>('pve');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([currentUser.id]);
  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [botSkillDraftId, setBotSkillDraftId] = useState('');
  const [botSkillChance, setBotSkillChance] = useState('25');
  const [selectedBattleItemId, setSelectedBattleItemId] = useState('');
  const [usingBattleItemId, setUsingBattleItemId] = useState('');
  // Synchronous action lock: React state alone updates after the click event,
  // so a double-tap could enter handleUseBattleItem twice before disabled rerenders.
  const usingBattleItemRef = useRef(false);
  const [showAdmin, setShowAdmin] = useState(isAdmin);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  // Lock room creation synchronously on the first click. This prevents rapid clicks
  // from entering the async flow multiple times before React can re-render.
  const creatingRoomRef = useRef(false);
  const [botForm, setBotForm] = useState({ name: '', description: '', hp: '30', strength: '9', durability: '6', agility: '5', magic: '0', isBoss: false, avatarUrl: '/avatars/system.svg', avatarFileName: '', encounterChancePercent: '10', skills: [] as BattleBotSkill[] });
  const [editingBotId, setEditingBotId] = useState('');
  const [victoryImageFileName, setVictoryImageFileName] = useState('');
  const [victoryVideoFileName, setVictoryVideoFileName] = useState('');
  const [randomRewardName, setRandomRewardName] = useState('');
  const [randomRewardType, setRandomRewardType] = useState<'coin' | 'item' | 'skill'>('coin');
  const [randomRewardAmount, setRandomRewardAmount] = useState('10000');
  const [randomRewardRate, setRandomRewardRate] = useState('10');
  const [randomRewardItemId, setRandomRewardItemId] = useState('');
  const [randomRewardSkillId, setRandomRewardSkillId] = useState('');

  useEffect(() => {
    const unsubConfig = subscribeToBattleConfig(next => setConfig({ ...DEFAULT_BATTLE_CONFIG, ...next, bossDice: { ...DEFAULT_BATTLE_CONFIG.bossDice, ...(next.bossDice || {}) } }));
    const unsubBots = subscribeToBattleBots(setBots);
    const unsubRooms = subscribeToBattleRooms(setRooms);
    return () => { unsubConfig(); unsubBots(); unsubRooms(); };
  }, []);

  useEffect(() => { if (!selectedTeamIds.includes(currentUser.id)) setSelectedTeamIds([currentUser.id]); }, [currentUser.id, selectedTeamIds]);
  useEffect(() => { if (!isAdmin) setShowAdmin(false); }, [isAdmin]);
  useEffect(() => {
    const completed = rooms.filter(room => (room.mode === 'pve' || room.mode === 'random') && room.status === 'completed' && room.createdBy === currentUser.id && room.winnerTeam === 'a' && !room.rewardClaimedBy);
    completed.forEach(room => {
      void settleBattleVictoryReward(room, currentUser.id).then(paid => {
        if (paid > 0) alert(`ชนะการต่อสู้! ได้รับรางวัล +${paid.toLocaleString()} Coins`);
      }).catch(error => console.warn('ไม่สามารถจ่ายรางวัลการต่อสู้ได้', error));
    });
  }, [rooms, currentUser.id]);

  const otherPlayers = useMemo(() => allCharacters.filter(character => character.id !== currentUser.id), [allCharacters, currentUser.id]);
  const activeBots = bots.filter(bot => bot.hp > 0);
  const myRooms = rooms.filter(room => [...room.teamA, ...room.teamB].some(unit => unit.type === 'player' && unit.sourceId === currentUser.id));
  const normalDice = { enabled: true, sides: config.sides, strengthPerDamage: config.strengthPerDamage, faces: config.faces || [] };
  const bossDice = config.bossDice || DEFAULT_BATTLE_CONFIG.bossDice;
  const normalFaces = useMemo(() => makeDiceFaces(normalDice.faces, normalDice.sides), [config.faces, config.sides]);
  const bossFaces = useMemo(() => makeDiceFaces(bossDice.faces, bossDice.sides), [bossDice.faces, bossDice.sides]);
  const BOT_VICTORY_REWARD = 7000;
  const BOSS_VICTORY_REWARD = 10000;
  const BATTLE_ENTRY_FEE = 5000;
  // Random Monster/Boss mode has a fixed entry fee, independent from Gacha pricing/rates.
  const RANDOM_BATTLE_ENTRY_FEE = 15000;
  const randomRewards = config.randomBattleRewards || [];

  const normalizeRandomReward = (reward: BattleRandomReward): BattleRandomReward | null => {
    const type: 'coin' | 'item' | 'skill' =
      reward.type === 'item' ? 'item' : reward.type === 'skill' ? 'skill' : 'coin';
    if (type === 'coin') {
      const amount = Math.max(0, Math.floor(Number(reward.coinAmount) || 0));
      return amount > 0 ? { ...reward, type, coinAmount: amount, name: amount.toLocaleString() + ' Coins' } : null;
    }
    if (type === 'item' && reward.itemData?.name) return { ...reward, type, name: reward.itemData.name };
    if (type === 'skill' && reward.skillData?.name) return { ...reward, type, name: reward.skillData.name };
    return null;
  };

  const validRandomRewards = randomRewards
    .map(normalizeRandomReward)
    .filter((reward): reward is BattleRandomReward => !!reward && Number(reward.rate) > 0);

  const toggleTeamMember = (id: string) => { if (id !== currentUser.id) setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]); };
  const toggleBot = (id: string) => setSelectedBotIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  const createRoom = async () => {
    // Synchronous double-click guard: only the first click is allowed into the
    // async room/coin transaction. Other clicks return immediately.
    if (creatingRoomRef.current) {
      return;
    }
    creatingRoomRef.current = true;
    setIsCreatingRoom(true);

    if (!config.enabled) {
      creatingRoomRef.current = false;
      setIsCreatingRoom(false);
      alert('สนามรบถูกปิดใช้งานโดยแอดมิน');
      return;
    }
    try {
      if (mode === 'random' && Number(currentUser.coins) < RANDOM_BATTLE_ENTRY_FEE) {
        const balance = Math.max(0, Math.floor(Number(currentUser.coins) || 0));
        throw new Error('Coins ไม่พอ ต้องใช้ ' + RANDOM_BATTLE_ENTRY_FEE.toLocaleString() + ' Coins แต่คุณมี ' + balance.toLocaleString() + ' Coins');
      }

      const teamMembers = allCharacters.filter(character => selectedTeamIds.includes(character.id));
    if (!teamMembers.some(character => character.id === currentUser.id)) teamMembers.unshift(currentUser);
    let enemies: (BattleBot | CharacterProfile)[] = [];
    if (mode === 'pve') {
      enemies = bots.filter(bot => selectedBotIds.includes(bot.id));
    } else if (mode === 'random') {
      const pool = bots.filter(bot => bot.hp > 0);
      if (pool.length < 3) {
        creatingRoomRef.current = false; setIsCreatingRoom(false);
        alert('โหมดสุ่มต้องมีมอนหรือบอสที่ใช้งานได้อย่างน้อย 3 ตัว'); return;
      }
      // Random mode prepares exactly 3 unique enemies up front. They are
      // fought one-by-one; the next enemy is loaded only after the current
      // enemy is defeated, and the reward is settled only after enemy #3.
      const remainingPool = [...pool];
      const pickedBots: BattleBot[] = [];
      while (pickedBots.length < 3) {
        const weighted = remainingPool.map(bot => ({ bot, weight: Math.max(0, Number(bot.encounterChancePercent) || 0) }));
        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        let picked = remainingPool[remainingPool.length - 1];
        if (totalWeight > 0) {
          let roll = Math.random() * totalWeight;
          for (const item of weighted) { roll -= item.weight; if (roll <= 0) { picked = item.bot; break; } }
        } else {
          picked = remainingPool[Math.floor(Math.random() * remainingPool.length)];
        }
        pickedBots.push(picked);
        remainingPool.splice(remainingPool.findIndex(bot => bot.id === picked.id), 1);
      }
      enemies = pickedBots;
    } else {
      enemies = otherPlayers.filter(character => character.id === selectedOpponentId);
    }
    if (!enemies.length) {
      creatingRoomRef.current = false;
      setIsCreatingRoom(false);
      alert(mode === 'pve' ? 'เลือกบอทหรือบอสก่อนสร้างห้อง' : mode === 'random' ? 'ไม่ต้องเลือก — ระบบจะสุ่มมอน/บอสให้เอง' : 'เลือกผู้เล่นฝ่ายตรงข้ามก่อนสร้างห้อง');
      return;
    }
    const teamA = teamMembers.slice(0, 3).map(character => makePlayerCombatant(character, 'a'));
    const selectedBots = (mode === 'pve' || mode === 'random') ? enemies.slice(0, 3).map(bot => bot as BattleBot) : [];
    const teamB = (mode === 'pve' || mode === 'random') ? [makeBotCombatant(selectedBots[0], 'b')] : enemies.slice(0, 3).map(character => makePlayerCombatant(character as CharacterProfile, 'b'));
    const randomBattleQueue = mode === 'random' ? selectedBots.slice(1).map(bot => makeBotCombatant(bot, 'b')) : undefined;
    const isPveBoss = selectedBots.some(bot => bot.isBoss);
    let randomReward: BattleRandomReward | undefined;
    if (mode === 'random') {
      const rewardPool = validRandomRewards;
      const totalRate = rewardPool.reduce((sum, reward) => sum + Number(reward.rate), 0);
      if (!rewardPool.length || totalRate <= 0) throw new Error('แอดมินยังไม่ได้ตั้งค่ารางวัลสุ่มหรือเรทรางวัล');
      let rewardRoll = Math.random() * totalRate;
      randomReward = rewardPool[rewardPool.length - 1];
      for (const reward of rewardPool) { rewardRoll -= Number(reward.rate); if (rewardRoll <= 0) { randomReward = reward; break; } }
    }
    const victoryReward = mode === 'random' ? Math.max(0, Number(randomReward?.coinAmount) || 0) : (mode === 'pve' ? (isPveBoss ? BOSS_VICTORY_REWARD : BOT_VICTORY_REWARD) : 0);
    const now = Date.now();
    const room: BattleRoom = {
      id: 'battle-' + now, mode, status: 'active', createdBy: currentUser.id, createdByName: currentUser.displayName,
      teamA, teamB, turnActorId: teamA[0].id, round: 1,
      log: [
        ...teamA.flatMap(unit => [
          ...(unit.traits || []).length ? [{ id: `battle-trait-${unit.id}-${now}`, timestamp: now, actorName: unit.name, message: `🧬 TRAIT: ${unit.traits!.join(' · ')}` }] : [],
          ...(unit.activeSkillPassives || []).map(passive => ({ id: `battle-skill-passive-${unit.id}-${passive.id}-${now}`, timestamp: now, actorName: unit.name, message: `🌸 SKILL PASSIVE พร้อมทำงาน: ${passive.name} · ${passive.description || passive.kind}` })),
          ...(unit.equippedPassives || []).map(passive => ({ id: `battle-item-passive-${unit.id}-${passive.id}-${now}`, timestamp: now, actorName: unit.name, message: `⚙️ ITEM PASSIVE พร้อมทำงาน: ${passive.name} · ${passive.description || passive.kind}` })),
        ]),
        ...teamB.flatMap(unit => [
          ...(unit.traits || []).length ? [{ id: `battle-trait-${unit.id}-${now}`, timestamp: now, actorName: unit.name, message: `🧬 TRAIT: ${unit.traits!.join(' · ')}` }] : [],
          ...(unit.activeSkillPassives || []).map(passive => ({ id: `battle-skill-passive-${unit.id}-${passive.id}-${now}`, timestamp: now, actorName: unit.name, message: `🌸 SKILL PASSIVE พร้อมทำงาน: ${passive.name} · ${passive.description || passive.kind}` })),
          ...(unit.equippedPassives || []).map(passive => ({ id: `battle-item-passive-${unit.id}-${passive.id}-${now}`, timestamp: now, actorName: unit.name, message: `⚙️ ITEM PASSIVE พร้อมทำงาน: ${passive.name} · ${passive.description || passive.kind}` })),
        ]),
        { id: 'battle-log-' + now, timestamp: now, actorName: 'SYSTEM', message: mode === 'pve' || mode === 'random' ? `เริ่มการต่อสู้ — หักค่าเข้า ${(mode === 'random' ? randomEntryFee : BATTLE_ENTRY_FEE).toLocaleString()} Coins · รางวัลสุ่ม ${victoryReward.toLocaleString()} Coins` : 'เริ่มการต่อสู้ — Passive/TRAIT พร้อมทำงาน · เลือกสกิลเพื่อใช้พร้อมการทอยลูกเต๋า' },
      ],
      entryFeeCoins: mode === 'random' ? RANDOM_BATTLE_ENTRY_FEE : (mode === 'pve' ? BATTLE_ENTRY_FEE : 0), victoryRewardCoins: victoryReward, randomReward, randomBattleQueue, randomBattleStage: mode === 'random' ? 1 : undefined, createdAt: now, updatedAt: now
    };
      await (mode === 'pve' || mode === 'random' ? createBattleRoomWithEntryFee(room, currentUser.id, mode === 'random' ? RANDOM_BATTLE_ENTRY_FEE : BATTLE_ENTRY_FEE) : createBattleRoom(room));
      setSelectedBotIds([]);
      setSelectedOpponentId('');
    } catch (error: any) {
      alert(error?.message || 'ไม่สามารถเปิดห้องรบได้');
    } finally {
      creatingRoomRef.current = false;
      setIsCreatingRoom(false);
    }
  };

  const persistBattleHp = async (room: BattleRoom) => {
    await Promise.all([...room.teamA, ...room.teamB].filter(unit => unit.type === 'player').map(async unit => {
      const character = allCharacters.find(item => item.id === unit.sourceId);
      if (!character) return;
      const activeEffects = unit.adminStatusEffects?.filter(effect => effect.remaining > 0) ?? unit.adminStatusEffects;
      const statusSummary = activeEffects?.map(effect => `${effect.mode === 'buff' ? '✨' : '⚠️'} ${effect.name} (${effect.remaining}/${effect.duration})`).join(' · ') || '';
      const statusPatch = unit.adminStatusEffects === undefined ? {} : { adminStatusEffects: activeEffects || [], statusBuffs: statusSummary };
      const nextMaxHp = Math.max(1, Number(unit.maxHp) || Number(character.maxHp) || 1);
      const nextHp = Math.max(0, Math.min(nextMaxHp, Number(unit.hp) || 0));
      if (character.hp !== nextHp || character.maxHp !== nextMaxHp || unit.adminStatusEffects !== undefined) {
        await updateCharacterFields(character.id, {
          ...statusPatch,
          hp: nextHp,
          maxHp: nextMaxHp,
        });
      }
    }));
  };

  const getSkillId = (skill: Skill) => String(skill?.id ?? skill?.name ?? ('skill-' + (skill?.name || 'unknown'))).trim();

  const battleInventory = useMemo(() => {
    const raw = Array.isArray(currentUser.inventory) ? currentUser.inventory : [];
    return raw.filter((item): item is any =>
      !!item &&
      typeof item === 'object' &&
      Number(item.quantity) > 0 &&
      item.category === 'consumable'
    );
  }, [currentUser.inventory]);

  const getBattleItemLabel = (item: any) => {
    if (item.effectType === 'heal_hp') return `💚 ฟื้น HP +${Math.round(Number(item.effectValue) || 0)}`;
    if (item.effectType === 'buff_stat') return `✨ +${Math.round(Number(item.effectValue) || 0)} ${String(item.targetStat || 'STAT').toUpperCase()}`;
    if (item.effectType === 'boost_max_hp') return `❤️‍🔥 เพิ่ม MAX HP +${Math.round(Number(item.effectValue) || 0)}`;
    if (item.effectType === 'enhance_skill') return `⚡ ${item.skillEnhanceDesc || 'เสริมพลังสกิล'}`;
    return '🧪 ใช้ไอเทม';
  };

  const handleUseBattleItem = async (room: BattleRoom, item: any) => {
    if (usingBattleItemRef.current || usingBattleItemId) return;
    if (!room || room.status !== 'active') return;
    const actor = [...(room.teamA || []), ...(room.teamB || [])].find(unit => unit.id === room.turnActorId);
    if (!actor || actor.type !== 'player' || actor.sourceId !== currentUser.id) return;
    const requestedItemId = String(item?.instanceId || item?.id || '').trim();
    if (!requestedItemId) {
      alert('ไอเทมนี้ไม่มีรหัสสำหรับใช้งาน กรุณารีเฟรชกระเป๋าแล้วลองใหม่');
      return;
    }
    // Validate the selected object before taking the synchronous lock.
    // A bad legacy item must never leave the action lock permanently stuck.
    if (!item || item.category !== 'consumable' || Number(item.quantity) <= 0) {
      alert('ไอเทมนี้ไม่สามารถใช้ระหว่างการต่อสู้ได้');
      return;
    }
    usingBattleItemRef.current = true;
    const liveRoom = rooms.find(candidate => candidate.id === room.id) || room;
    setUsingBattleItemId(requestedItemId);
    try {
      // useBattleItem is the single source of truth for the bag: it reads the
      // newest shared character, consumes the item, saves the new inventory and
      // updates the battle room. Do NOT call persistBattleHp here afterwards,
      // because that helper intentionally uses the parent component's older
      // character snapshot and could race the inventory write.
      const nextRoom = await useBattleItem(liveRoom, currentUser.id, requestedItemId);

      if (nextRoom.mode === 'pve' || nextRoom.mode === 'random') {
        let botRoom = nextRoom;
        try {
          for (let step = 0; step < 9 && botRoom.status === 'active'; step += 1) {
            const botActor = [...botRoom.teamA, ...botRoom.teamB].find(unit => unit.id === botRoom.turnActorId);
            if (!botActor || botActor.type !== 'bot') break;
            await new Promise(resolve => window.setTimeout(resolve, 350));
            const botResolved = resolveBattleTurn(botRoom, config, chooseBotSkill(botActor));
            if (!botResolved.result && botResolved.room.turnActorId === botRoom.turnActorId && botResolved.room.status === botRoom.status) break;
            botRoom = botResolved.room;
            // Persist the room once per bot turn. Do NOT write every player
            // character on every step here: that causes the characters realtime
            // listener to rerender the whole BattleArena while the item action
            // is still running and can freeze mobile browsers.
            await updateBattleRoom(botRoom);
          }
        } catch (botError) {
          // The item was already consumed successfully. A malformed bot turn
          // must never make the whole battle page crash or undo the bag write.
          console.error('Bot turn after item failed:', botError);
          try { await updateBattleRoom(botRoom); } catch {}
        }
        // Sync the final player HP/status once after all automatic bot turns.
        // This avoids a write storm when a single item use advances several turns.
        try { await persistBattleHp(botRoom); } catch (persistError) {
          console.warn('Final Battle HP sync after item failed:', persistError);
        }
      }
      setSelectedBattleItemId('');
    } catch (error) {
      console.error('Battle item failed', error);
      alert('ใช้ไอเทมไม่สำเร็จ: ' + (error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'));
    } finally {
      setUsingBattleItemId('');
      usingBattleItemRef.current = false;
    }
  };

  const chooseBotSkill = (bot: BattleCombatant): Skill | undefined => {
    const candidates = (bot.skills || []).filter(skill => {
      const id = getSkillId(skill);
      return (Number(bot.skillCooldowns?.[id] || 0) <= 0) && (Number((skill as BattleBotSkill).aiChancePercent ?? 0) > 0);
    });
    if (!candidates.length) return undefined;
    const total = candidates.reduce((sum, skill) => sum + Math.max(0, Math.min(100, Number((skill as BattleBotSkill).aiChancePercent) || 0)), 0);
    if (total <= 0 || Math.random() * 100 >= Math.min(100, total)) return undefined;
    let roll = Math.random() * total;
    for (const skill of candidates) {
      roll -= Math.max(0, Math.min(100, Number((skill as BattleBotSkill).aiChancePercent) || 0));
      if (roll <= 0) return skill;
    }
    return candidates[candidates.length - 1];
  };

  const takeTurn = async (room: BattleRoom, skill?: Skill) => {
    try {
      room = rooms.find(item => item.id === room.id) || room;
      const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
      if (!actor || actor.type !== 'player' || actor.sourceId !== currentUser.id) {
        alert('ยังไม่ใช่เทิร์นของคุณ');
        return;
      }

      let resolvedSkill = skill;
      if (skill) {
        const actorCharacter = allCharacters.find(character => character.id === actor.sourceId);
        const latestSkill = actorCharacter?.skills?.find(item =>
          (skill.id != null && String(item.id) === String(skill.id)) || item.name === skill.name
        );
        if (!latestSkill) {
          alert('ไม่พบสกิลนี้ในตัวละครแล้ว กรุณาเลือกสกิลใหม่');
          setSelectedSkillId('');
          return;
        }

        const skillId = getSkillId(latestSkill);
        const cooldown = Number(actor.skillCooldowns?.[skillId] || actor.skillCooldowns?.[latestSkill.id || ''] || 0);
        if (cooldown > 0) {
          alert(`สกิล "${latestSkill.name}" ยังติดคูลดาวน์อีก ${cooldown} เทิร์น`);
          return;
        }

        resolvedSkill = {
          ...latestSkill,
          id: skillId,
          battleEffect: latestSkill.battleEffect || 'damage',
          battlePower: Math.max(1, Number(latestSkill.battlePower) || 5),
          cooldownTurns: Math.max(0, Number(latestSkill.cooldownTurns) || 0),
          maxRepeatAttacks: Math.max(1, Number(latestSkill.maxRepeatAttacks) || 1),
        };
      }

      const resolved = resolveBattleTurn(room, config, resolvedSkill);

      // A valid turn must always move the actor. Persist it first.
      if (resolved.result || resolved.room.status !== room.status || resolved.room.turnActorId !== room.turnActorId) {
        await updateBattleRoom(resolved.room);
        try { await persistBattleHp(resolved.room); } catch (error) {
          console.warn('ไม่สามารถบันทึก HP หลังเทิร์นได้', error);
        }

        // PVE: immediately run every bot turn from the freshly resolved room.
        if (resolved.room.mode === 'pve' || resolved.room.mode === 'random') {
          let botRoom = resolved.room;

          for (let step = 0; step < 9 && botRoom.status === 'active'; step += 1) {
            const botActor = [...botRoom.teamA, ...botRoom.teamB]
              .find(unit => unit.id === botRoom.turnActorId);

            if (!botActor || botActor.type !== 'bot') break;

            await new Promise(resolve => window.setTimeout(resolve, 350));

            // IMPORTANT: use botRoom, not React's polling snapshot.
            const botNow = [...botRoom.teamA, ...botRoom.teamB]
              .find(unit => unit.id === botRoom.turnActorId);

            if (!botNow || botNow.type !== 'bot') break;

            const botResolved = resolveBattleTurn(botRoom, config);

            if (!botResolved.result &&
                botResolved.room.turnActorId === botRoom.turnActorId &&
                botResolved.room.status === botRoom.status) {
              console.error('[PVE BOT] BOT TURN STUCK', {
                roomId: botRoom.id,
                actorId: botRoom.turnActorId,
                actorName: botNow.name,
                actorType: botNow.type,
                team: botNow.team,
                hp: botNow.hp,
              });
              break;
            }

            botRoom = botResolved.room;
            await updateBattleRoom(botRoom);
            try { await persistBattleHp(botRoom); } catch (error) {
              console.warn('ไม่สามารถบันทึก HP หลังบอทเดินได้', error);
            }
          }
        }
      } else {
        console.warn('[BATTLE] turn was rejected without state change', {
          roomId: room.id,
          actorId: room.turnActorId,
          skill: resolvedSkill?.name || 'normal attack',
          status: resolved.room.status,
        });
      }
    } catch (error) {
      console.error('Battle turn failed', error);
      alert('การโจมตีไม่สำเร็จ: ' + (error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'));
    }
  };

  const availableBotSkills = useMemo(() => {
    const map = new Map<string, Skill>();
    allCharacters.flatMap(character => character.skills || []).forEach(skill => {
      const id = getSkillId(skill);
      if (id && !map.has(id)) map.set(id, skill);
    });
    return Array.from(map.values());
  }, [allCharacters]);

  const addBotSkill = () => {
    const source = availableBotSkills.find(skill => getSkillId(skill) === botSkillDraftId);
    if (!source) return;
    const skill = { ...source, id: getSkillId(source), aiChancePercent: Math.max(0, Math.min(100, Number(botSkillChance) || 0)) } as BattleBotSkill;
    setBotForm(prev => ({ ...prev, skills: [...prev.skills.filter(item => getSkillId(item) !== skill.id), skill] }));
    setBotSkillDraftId('');
  };

  const removeBotSkill = (skillId: string) => {
    setBotForm(prev => ({ ...prev, skills: prev.skills.filter(skill => getSkillId(skill) !== skillId) }));
  };

  const canPlayerAct = (room: BattleRoom) => {
    const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
    return room.status === 'active' && actor?.type === 'player' && actor.sourceId === currentUser.id;
  };
  const canBotAct = (room: BattleRoom) => {
    const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
    return room.status === 'active' && (room.mode === 'pve' || room.mode === 'random') && actor?.type === 'bot' && room.createdBy === currentUser.id;
  };

  const patchNormalDice = (patch: Partial<BattleDiceConfig>) => setConfig(prev => ({ ...prev, ...patch }));
  const patchBossDice = (patch: Partial<BattleDiceConfig>) => setConfig(prev => ({ ...prev, bossDice: { ...(prev.bossDice || DEFAULT_BATTLE_CONFIG.bossDice), ...patch } }));
  const changeSides = (dice: BattleDiceConfig, nextSides: number, patch: (value: Partial<BattleDiceConfig>) => void) => {
    const sides = Math.max(2, Math.min(100, Math.round(nextSides) || dice.sides));
    patch({ sides, faces: makeDiceFaces(dice.faces, sides) });
  };
  const saveConfig = async () => { try { await saveBattleConfig(config); alert('บันทึกกติกาและเรทรางวัลแล้ว'); } catch (error) { alert('บันทึกกติกาไม่สำเร็จ'); } };
  const addRandomReward = () => {
    const rate = Math.max(0, Number(randomRewardRate) || 0);
    const item = shopItems.find(value => value.id === randomRewardItemId);
    const skill = allCharacters.flatMap(character => character.skills || []).find(value => value.id === randomRewardSkillId);
    if (!randomRewardName.trim() || rate <= 0) return alert('กรุณากรอกชื่อรางวัลและเรทให้ครบ');
    if (randomRewardType === 'coin' && Math.max(1, Math.floor(Number(randomRewardAmount) || 0)) <= 0) return alert('จำนวน Coins ไม่ถูกต้อง');
    if (randomRewardType === 'item' && !item) return alert('กรุณาเลือกไอเทมรางวัล');
    if (randomRewardType === 'skill' && !skill) return alert('กรุณาเลือกสกิลรางวัล');
    const reward: BattleRandomReward = {
      id: 'random-reward-' + Date.now(),
      name: randomRewardName.trim(),
      type: randomRewardType,
      rate,
      coinAmount: randomRewardType === 'coin' ? Math.max(1, Math.floor(Number(randomRewardAmount) || 0)) : undefined,
      itemData: randomRewardType === 'item' ? { ...item! } : undefined,
      skillData: randomRewardType === 'skill' ? { ...skill! } : undefined,
    };
    setConfig(prev => ({ ...prev, randomBattleRewards: [...(prev.randomBattleRewards || []), reward] }));
    setRandomRewardName('');
    setRandomRewardItemId('');
    setRandomRewardSkillId('');
    setRandomRewardName('');
  };
  const removeRandomReward = (id: string) => setConfig(prev => ({ ...prev, randomBattleRewards: (prev.randomBattleRewards || []).filter(reward => reward.id !== id) }));
  const saveVictoryMedia = async (file: File | undefined, kind: 'image' | 'video') => { if (!file) return; const ok = kind === 'image' ? file.type.startsWith('image/') : file.type.startsWith('video/'); if (!ok) return alert(kind === 'image' ? 'กรุณาเลือกไฟล์รูปภาพ' : 'กรุณาเลือกไฟล์วิดีโอ'); const limit = kind === 'image' ? 4 : 8; if (file.size > limit * 1024 * 1024) return alert(`ไฟล์ต้องไม่เกิน ${limit}MB`); const dataUrl = await fileToDataUrl(file); setConfig(prev => ({ ...prev, ...(kind === 'image' ? { victoryImageUrl: dataUrl, victoryImageFileName: file.name } : { victoryVideoUrl: dataUrl, victoryVideoFileName: file.name }) })); if (kind === 'image') setVictoryImageFileName(file.name); else setVictoryVideoFileName(file.name); };

  const createBot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!botForm.name.trim()) return;
    const now = Date.now();
    const hp = Math.max(1, Number(botForm.hp) || 1);
    try {
      await saveBattleBot({ id: editingBotId || 'bot-' + now, name: botForm.name.trim(), description: botForm.description.trim() || 'นักสู้ที่ถูกสร้างโดยแอดมิน', avatarUrl: botForm.avatarUrl || '/avatars/system.svg', avatarFileName: botForm.avatarFileName || undefined, isBoss: botForm.isBoss, stats: { strength: Math.max(0, Number(botForm.strength) || 0), durability: Math.max(0, Number(botForm.durability) || 0), agility: Math.max(0, Number(botForm.agility) || 0), magic: Math.max(0, Number(botForm.magic) || 0) }, hp, maxHp: hp, aiProfile: botForm.isBoss ? 'aggressive' : 'balanced', encounterChancePercent: Math.max(0, Math.min(100, Number(botForm.encounterChancePercent) || 0)), skills: botForm.skills.map(skill => ({ ...skill })), createdAt: now, updatedAt: now });
      setBotForm({ name: '', description: '', hp: '30', strength: '9', durability: '6', agility: '5', magic: '0', isBoss: false, avatarUrl: '/avatars/system.svg', avatarFileName: '', encounterChancePercent: '10', skills: [] }); setEditingBotId('');
    } catch (error) { alert('สร้างบอทไม่สำเร็จ'); }
  };

  return <div className="space-y-6">
    <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-violet-950/40 p-5 shadow-2xl md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.2em] text-cyan-300"><Swords className="h-4 w-4" /> TEAM BATTLE / SKILL DICE</div><h2 className="text-2xl font-black text-white md:text-3xl">สนามรบกลุ่มดาว</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">เลือกสกิลตัวละครเพื่อใช้พร้อมการทอยเต๋า สกิลโจมตีเริ่มต้นทำดาเมจ 5 และรองรับฟื้นฟู ป้องกัน และสะท้อน</p></div>{isAdmin && <button type="button" onClick={() => setShowAdmin(prev => !prev)} className={buttonClass + ' flex items-center gap-2 bg-amber-500 text-slate-950 hover:bg-amber-300'}><Settings2 className="h-4 w-4" />{showAdmin ? 'ซ่อนแผงแอดมิน' : 'ตั้งค่าสนามรบ'}</button>}</div><div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">โจมตี</div><div className="mt-1 font-black text-cyan-200">สกิลพื้นฐาน 5 DMG</div></div><div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">ลูกเต๋า</div><div className="mt-1 font-black text-violet-200">D{config.sides}</div></div><div className="rounded-2xl border border-amber-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">บอส</div><div className="mt-1 font-black text-amber-200">{bossDice.enabled ? `D${bossDice.sides} เฉพาะบอส` : 'ใช้ลูกเต๋าปกติ'}</div></div><div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">สถานะ</div><div className="mt-1 font-black text-emerald-200">{config.enabled ? 'เปิดรับศึก' : 'ปิดสนามรบ'}</div></div></div></section>

    {showAdmin && isAdmin && <section className={panelClass + ' p-5 md:p-6'}><div className="mb-5 flex items-center gap-2"><Settings2 className="h-5 w-5 text-amber-300" /><h3 className="text-lg font-black text-white">แผงควบคุมแอดมิน</h3><span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200">ADMIN ONLY</span></div><div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]"><div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-black text-cyan-200">กติกาลูกเต๋า</h4><button type="button" onClick={saveConfig} className={buttonClass + ' bg-cyan-400 text-slate-950 hover:bg-cyan-300'}><Check className="mr-1 inline h-3.5 w-3.5" />บันทึกกติกา</button></div><label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={config.enabled} onChange={event => setConfig(prev => ({ ...prev, enabled: event.target.checked }))} /> เปิดให้สร้างห้องรบ</label><DiceEditor title="ลูกเต๋าผู้เล่น" accent="violet" dice={normalDice} faces={normalFaces} onPatch={patchNormalDice} onSidesChange={value => changeSides(normalDice, value, patchNormalDice)} /><DiceEditor title="ลูกเต๋าเฉพาะบอส" accent="amber" dice={bossDice} faces={bossFaces} onPatch={patchBossDice} onSidesChange={value => changeSides(bossDice, value, patchBossDice)} /><div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-950/10 p-3">
<h4 className="font-black text-amber-200">🎲 รางวัลโหมดสุ่มมอน / บอส</h4>
<div className="grid gap-2 sm:grid-cols-4">
<label className="text-[10px] text-slate-400 sm:col-span-1">ค่าเข้า (Coins)<input className={inputClass + ' mt-1'} type="number" min="0" value={RANDOM_BATTLE_ENTRY_FEE} readOnly /></label>
<label className="text-[10px] text-slate-400">ชื่อรางวัล<input className={inputClass + ' mt-1'} value={randomRewardName} onChange={event => setRandomRewardName(event.target.value)} placeholder="เช่น Jackpot / ดาบพิเศษ / สกิล" /></label>
<label className="text-[10px] text-slate-400">ประเภท<select className={inputClass + ' mt-1'} value={randomRewardType} onChange={event => setRandomRewardType(event.target.value as 'coin' | 'item' | 'skill')}><option value="coin">Coins</option><option value="item">ไอเทม</option><option value="skill">สกิล</option></select></label>
{randomRewardType === 'coin' && <label className="text-[10px] text-slate-400">จำนวน Coins<input className={inputClass + ' mt-1'} type="number" min="1" value={randomRewardAmount} onChange={event => setRandomRewardAmount(event.target.value)} /></label>}
{randomRewardType === 'item' && <label className="text-[10px] text-slate-400">ไอเทม<select className={inputClass + ' mt-1'} value={randomRewardItemId} onChange={event => setRandomRewardItemId(event.target.value)}><option value="">เลือกไอเทม</option>{shopItems.map(item => <option key={item.id} value={item.id}>{item.name}{item.adminOnly ? ' [รางวัลพิเศษ]' : ''}</option>)}</select></label>}
{randomRewardType === 'skill' && <label className="text-[10px] text-slate-400">สกิล<select className={inputClass + ' mt-1'} value={randomRewardSkillId} onChange={event => setRandomRewardSkillId(event.target.value)}><option value="">เลือกสกิล</option>{Array.from(new Map(allCharacters.flatMap(character => character.skills || []).map(skill => [skill.id, skill])).values()).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>}
<label className="text-[10px] text-slate-400">เรท (%)<input className={inputClass + ' mt-1'} type="number" min="0.001" step="0.001" value={randomRewardRate} onChange={event => setRandomRewardRate(event.target.value)} /></label>
</div>
<button type="button" onClick={addRandomReward} className={buttonClass + ' bg-amber-400 text-slate-950'}>+ เพิ่มรางวัลสุ่ม</button>
<div className="space-y-1">{randomRewards.map(reward => {
  const normalized = normalizeRandomReward(reward);
  const label = normalized?.name || 'รางวัลไม่สมบูรณ์';
  const typeLabel = normalized?.type === 'item' ? '🎁 ไอเทม' : normalized?.type === 'skill' ? '🧬 สกิล' : '💰 Coins';
  return (
    <div key={reward.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
      <span className="font-bold text-white">{label} · {typeLabel} · เรท {Number(reward.rate)}%</span>
      <button type="button" onClick={() => removeRandomReward(reward.id)} className="text-rose-300">ลบ</button>
    </div>
  );
})}
{!randomRewards.length && <div className="text-[10px] text-rose-200">ยังไม่มีรางวัลสุ่ม — ต้องเพิ่มอย่างน้อย 1 รายการ</div>}
</div>
<div className="text-[10px] text-slate-500">ระบบใช้เฉพาะ Reward Pool ของโหมดนี้ — Coins แสดงเป็นจำนวน Coins, Item แสดงชื่อ Item, Skill แสดงเฉพาะรายการที่ Admin เพิ่มเป็น Skill เท่านั้น</div>
</div><div className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-3"><h4 className="font-black text-emerald-200">🏆 หน้าชนะการต่อสู้</h4><p className="text-[10px] text-slate-500">ใส่ URL รูปหรือวิดีโอได้ เมื่อจบศึกจะแสดงชื่อผู้เล่น/ผู้ชนะพร้อมสื่อที่ตั้งไว้</p><input className={inputClass} value={config.victoryTitle || ''} onChange={event => setConfig(prev => ({ ...prev, victoryTitle: event.target.value }))} placeholder="หัวข้อ เช่น VICTORY" /><input className={inputClass} value={config.victoryMessage || ''} onChange={event => setConfig(prev => ({ ...prev, victoryMessage: event.target.value }))} placeholder="ข้อความชนะ" /><input className={inputClass} value={config.victoryImageUrl?.startsWith("data:") ? "" : (config.victoryImageUrl || "")} onChange={event => setConfig(prev => ({ ...prev, victoryImageUrl: event.target.value, victoryImageFileName: "" }))} placeholder="URL รูปภาพตอนชนะ (ถ้าต้องการใช้ URL)" /><label className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-400/20 bg-slate-950/50 px-3 py-2 text-xs text-slate-300"><span>🖼️ เลือกไฟล์รูป {victoryImageFileName ? `· ${victoryImageFileName}` : ""}</span><input type="file" accept="image/*" className="hidden" onChange={e=>void saveVictoryMedia(e.target.files?.[0],"image")} /></label><input className={inputClass} value={config.victoryVideoUrl?.startsWith("data:") ? "" : (config.victoryVideoUrl || "")} onChange={event => setConfig(prev => ({ ...prev, victoryVideoUrl: event.target.value, victoryVideoFileName: "" }))} placeholder="URL วิดีโอตอนชนะ (ถ้าต้องการใช้ URL)" /><label className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-400/20 bg-slate-950/50 px-3 py-2 text-xs text-slate-300"><span>🎬 เลือกไฟล์วิดีโอ {victoryVideoFileName ? `· ${victoryVideoFileName}` : ""}</span><input type="file" accept="video/*" className="hidden" onChange={e=>void saveVictoryMedia(e.target.files?.[0],"video")} /></label></div></div><form onSubmit={createBot} className="space-y-4 rounded-2xl border border-rose-500/20 bg-rose-950/10 p-4"><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-rose-300" /><h4 className="font-black text-rose-200">สร้างบอท / บอส</h4></div><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} value={botForm.name} onChange={event => setBotForm(prev => ({ ...prev, name: event.target.value }))} placeholder="ชื่อบอทหรือบอส" required /><div className="space-y-2"><input className={inputClass} value={botForm.avatarUrl.startsWith("data:") ? "" : botForm.avatarUrl} onChange={event => setBotForm(prev => ({ ...prev, avatarUrl: event.target.value, avatarFileName: "" }))} placeholder="URL รูป avatar (หรือเลือกไฟล์)" /><label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"><span>🖼️ รูปโปรไฟล์ {botForm.avatarFileName ? `· ${botForm.avatarFileName}` : ""}</span><input type="file" accept="image/*" className="hidden" onChange={async e => { const f=e.target.files?.[0]; if(!f)return; if(f.size>4*1024*1024)return alert("รูปโปรไฟล์ต้องไม่เกิน 4MB"); const d=await fileToDataUrl(f); setBotForm(p=>({...p,avatarUrl:d,avatarFileName:f.name})); }} /></label></div></div><input className={inputClass} value={botForm.description} onChange={event => setBotForm(prev => ({ ...prev, description: event.target.value }))} placeholder="คำอธิบาย AI / กลไกบอส" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['hp', 'HP'], ['strength', 'พลัง'], ['durability', 'ทนทาน'], ['agility', 'ว่องไว'], ['magic', 'เวท']].map(([key, label]) => <label key={key} className="text-[10px] text-slate-500">{label}<input className={inputClass + ' mt-1'} type="number" min={key === 'hp' ? '1' : '0'} value={botForm[key as keyof typeof botForm] as string} onChange={event => setBotForm(prev => ({ ...prev, [key]: event.target.value }))} /></label>)}</div><label className="flex items-center gap-2 text-xs text-rose-100"><input type="checkbox" checked={botForm.isBoss} onChange={event => setBotForm(prev => ({ ...prev, isBoss: event.target.checked }))} /> <Crown className="h-4 w-4 text-amber-300" /> ตั้งเป็น Boss</label><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-slate-500">โอกาสถูกสุ่มเจอ (%)<input className={inputClass + ' mt-1'} type="number" min="0" max="100" value={botForm.encounterChancePercent} onChange={event => setBotForm(prev => ({ ...prev, encounterChancePercent: event.target.value }))} /></label><div className="text-[10px] text-slate-500 rounded-xl border border-amber-500/20 bg-amber-950/10 p-2">โหมดสุ่มจะใช้ค่านี้เป็นน้ำหนักการออกของมอน/บอส</div></div>
<div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-3">
  <div className="mb-2 text-xs font-black text-fuchsia-200">🧠 สกิลของมอน / บอส</div>
  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
    <select className={inputClass} value={botSkillDraftId} onChange={event => setBotSkillDraftId(event.target.value)}>
      <option value="">เลือกสกิลจากคลังตัวละคร</option>
      {availableBotSkills.map(skill => <option key={getSkillId(skill)} value={getSkillId(skill)}>{skill.name}</option>)}
    </select>
    <input className={inputClass} type="number" min="0" max="100" value={botSkillChance} onChange={event => setBotSkillChance(event.target.value)} placeholder="โอกาส %" />
    <button type="button" className={buttonClass + " bg-fuchsia-500 text-white"} onClick={addBotSkill}>+ ใส่สกิล</button>
  </div>
  <div className="mt-2 space-y-1">
    {botForm.skills.map(skill => <div key={getSkillId(skill)} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"><span>{skill.name} · โอกาสใช้ {Number(skill.aiChancePercent ?? 0)}%</span><button type="button" className="text-rose-300" onClick={() => removeBotSkill(getSkillId(skill))}>ลบ</button></div>)}
    {!botForm.skills.length && <div className="text-[10px] text-slate-500">ยังไม่มีสกิล — มอนจะโจมตีปกติ</div>}
  </div>
</div><button type="submit" className={buttonClass + ' w-full bg-rose-500 text-white hover:bg-rose-400'}><Plus className="mr-1 inline h-4 w-4" />{editingBotId ? "บันทึกการแก้ไขบอท" : "สร้างบอท"}</button></form></div>{bots.length > 0 && <div className="mt-6 grid gap-3 md:grid-cols-2">{bots.map(bot => <div key={bot.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex min-w-0 items-center gap-3"><img src={bot.avatarUrl} alt="" className="h-10 w-10 rounded-xl border border-slate-700 object-cover" /><div className="min-w-0"><div className="flex items-center gap-2 truncate font-bold text-white">{bot.isBoss && <Crown className="h-3.5 w-3.5 text-amber-300" />}{bot.name}</div><div className="text-[11px] text-slate-500">HP {bot.maxHp} · พลัง {bot.stats.strength} · {bot.description}</div></div></div><button type="button" onClick={() => { setEditingBotId(bot.id); setBotForm({ name: bot.name, description: bot.description, hp: String(bot.maxHp), strength: String(bot.stats.strength), durability: String(bot.stats.durability), agility: String(bot.stats.agility), magic: String(bot.stats.magic), isBoss: bot.isBoss, avatarUrl: bot.avatarUrl, avatarFileName: bot.avatarFileName || '', encounterChancePercent: String(bot.encounterChancePercent ?? 10), skills: (bot.skills || []).map(skill => ({ ...skill })) }); }} className="rounded-lg p-2 text-sky-300 hover:bg-sky-500/15">✏️</button><button type="button" onClick={() => void deleteBattleBot(bot.id)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</section>}

    <section className={panelClass + ' p-5 md:p-6'}><div className="mb-5 flex items-center gap-2"><Target className="h-5 w-5 text-cyan-300" /><h3 className="text-lg font-black text-white">สร้างศึกใหม่</h3></div><div className="grid gap-6 xl:grid-cols-2"><div className="space-y-4"><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setMode('pve')} className={buttonClass + ' ' + (mode === 'pve' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-400')}><Bot className="mr-1 inline h-4 w-4" />ตีบอท / บอส</button><button type="button" onClick={() => setMode('random')} className={buttonClass + ' ' + (mode === 'random' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400')}><Dice5 className="mr-1 inline h-4 w-4" />สุ่มมอน / บอส</button><button type="button" onClick={() => setMode('pvp')} className={buttonClass + ' ' + (mode === 'pvp' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400')}><UsersRound className="mr-1 inline h-4 w-4" />สู้ผู้เล่น</button></div><div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3"><div className="mb-2 text-xs font-bold text-slate-300">ทีมของคุณ <span className="text-slate-500">(เลือกได้สูงสุด 3 คน)</span></div><div className="space-y-2">{allCharacters.map(character => <label key={character.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2 text-sm"><input type="checkbox" checked={selectedTeamIds.includes(character.id)} disabled={character.id === currentUser.id} onChange={() => toggleTeamMember(character.id)} /><img src={character.avatarUrl} alt="" className="h-7 w-7 rounded-lg object-cover" /><span className={character.id === currentUser.id ? 'font-bold text-white' : 'text-slate-300'}>{character.displayName}</span><span className="ml-auto text-[10px] text-slate-500">STR {character.stats.strength}</span></label>)}</div></div></div><div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/35 p-3"><div className="text-xs font-bold text-slate-300">ฝ่ายตรงข้าม</div>{mode === 'pvp' ? <select className={inputClass} value={selectedOpponentId} onChange={event => setSelectedOpponentId(event.target.value)}><option value="">เลือกผู้เล่น</option>{otherPlayers.map(character => <option key={character.id} value={character.id}>{character.displayName} · STR {character.stats.strength}</option>)}</select> : mode === 'random' ? (<div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100"><div className="font-black">🎲 โหมดต่อสู้สุ่ม</div><div className="mt-1 text-xs text-amber-200/80">ระบบจะสุ่มมอนหรือบอสที่แอดมินสร้างจำนวน 3 ตัวแบบไม่ซ้ำกัน โดยใช้น้ำหนัก “โอกาสถูกสุ่มเจอ” ของแต่ละตัว และมีโอกาสเจอมอน/บอสพิเศษตามค่าที่แอดมินตั้ง</div>
{activeBots.length < 3 && <div className="mt-2 text-xs text-rose-200">ต้องมีมอนหรือบอสที่ใช้งานได้อย่างน้อย 3 ตัว</div>}
<div className="mb-3 rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-4 shadow-lg shadow-amber-500/10">
  <div className="text-base font-black text-amber-100">🎲 โหมดสุ่มมอน / Boss</div>
  <div className="mt-2 text-xl font-black text-yellow-300">💰 ค่าเข้า: 15,000 Coins</div>
  <div className="mt-1 text-xs font-bold text-slate-200">💳 Coin ของคุณ: {Math.max(0, Math.floor(Number(currentUser.coins) || 0)).toLocaleString()} Coins</div>
  <div className="mt-2 text-xs font-bold text-amber-200/90">⚠️ ต้องมีอย่างน้อย 15,000 Coins เพื่อเริ่ม ระบบจะตรวจ Coin ก่อนเริ่มและหัก 15,000 Coins เมื่อเริ่มสำเร็จ</div>
</div>
<div className="mt-3 rounded-xl border border-cyan-400/20 bg-slate-950/50 p-3">
  <div className="mb-2 text-xs font-black text-cyan-200">🎁 รางวัลที่มีโอกาสได้รับ</div>
  {randomRewards.length > 0 ? (() => {
    const validRewards = randomRewards.filter(reward => Number(reward.rate) > 0);
    const totalRate = validRewards.reduce((sum, reward) => sum + Number(reward.rate), 0);
    return validRewards.map(reward => {
      const chance = totalRate > 0 ? Number(reward.rate) / totalRate * 100 : 0;
      const rewardLabel = reward.type === 'coin'
        ? (Number(reward.coinAmount || 0).toLocaleString() + ' Coins')
        : reward.type === 'item'
          ? (reward.itemData?.name || 'ไอเทม')
          : (reward.skillData?.name || 'สกิล');
      return (
        <div key={reward.id} className="flex items-center justify-between gap-2 border-b border-slate-800 py-1.5 last:border-0 text-[11px]">
          <span className="truncate text-slate-200">{rewardLabel}</span>
          <span className="shrink-0 font-black text-emerald-300">{chance.toFixed(2)}%</span>
        </div>
      );
    });
  })() : <div className="text-[11px] text-rose-200">ยังไม่มีรางวัลที่แอดมินตั้งค่า</div>}
</div></div>) : <div className="space-y-2">{activeBots.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">ยังไม่มีบอท — ให้แอดมินสร้างก่อน</div>}{activeBots.map(bot => <label key={bot.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-sm"><input type="checkbox" checked={selectedBotIds.includes(bot.id)} onChange={() => toggleBot(bot.id)} /><img src={bot.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" /><span className="font-bold text-white">{bot.name}</span>{bot.isBoss ? <span className="ml-auto flex items-center gap-1 text-[10px] font-black text-amber-300"><Skull className="h-3 w-3" />BOSS</span> : <span className="ml-auto text-[10px] text-slate-500">HP {bot.maxHp}</span>}</label>)}
<button type="button" disabled={isCreatingRoom} onClick={() => void createRoom()} className={buttonClass + ' mt-2 w-full bg-emerald-500 text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50'}><Plus className="mr-1 inline h-4 w-4" />{isCreatingRoom ? '⏳ กำลังสร้างห้อง...' : mode === 'pve' || mode === 'random' ? 'เริ่มต่อสู้' : 'เปิดห้องรบ'}</button></div></div></section>

    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-black text-white">
          <Shield className="h-5 w-5 text-emerald-300" />
          ห้องรบของคุณ
        </h3>
        <span className="text-xs text-slate-500">{myRooms.length} ห้อง</span>
      </div>

      {myRooms.length === 0 && (
        <div className={panelClass + ' p-8 text-center text-sm text-slate-500'}>
          ยังไม่มีห้องรบ สร้างศึกแรกของคุณได้ด้านบน
        </div>
      )}

      {myRooms.map(room => {
        const units = [...room.teamA, ...room.teamB];
        const actor = units.find(unit => unit.id === room.turnActorId);
        const canAct = canPlayerAct(room);
        const botTurn = canBotAct(room);
        const actorCharacter = actor?.type === 'player'
          ? allCharacters.find(character => character.id === actor.sourceId)
          : undefined;
        const winner = room.winnerTeam
          ? (room.winnerTeam === 'a' ? 'ทีมคุณชนะ' : room.winnerTeam === 'b' ? 'ฝ่ายตรงข้ามชนะ' : 'เสมอ')
          : '';

        return (
          <article key={room.id} className={panelClass + ' overflow-hidden'}>
            <div className="border-b border-slate-800 bg-gradient-to-r from-slate-950/80 via-cyan-950/20 to-violet-950/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={'rounded-full px-2 py-1 text-[10px] font-black ' + (room.mode === 'pve' ? 'bg-violet-500/20 text-violet-200' : 'bg-cyan-500/20 text-cyan-200')}>
                    {room.mode === 'random' ? 'RANDOM PVE' : room.mode === 'pve' ? 'PVE' : 'PVP'}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-400">รอบ {room.round}</span>
                  {room.status === 'active' && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-200">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                      กำลังต่อสู้
                    </span>
                  )}
                  {room.status === 'completed' && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-200">
                      จบศึก: {winner}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {room.status === 'active' && (
                    <span className="flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-100">
                      <Zap className="h-3.5 w-3.5 text-amber-300" />
                      เทิร์น: {actor?.name}
                    </span>
                  )}
                  {(isAdmin || room.createdBy === currentUser.id) && (
                    <button type="button" onClick={() => void deleteBattleRoom(room.id)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {room.status === 'completed' && (
                <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-emerald-100">
                  <div className="flex items-center gap-2 text-sm font-black">
                    <Crown className="h-4 w-4 text-amber-300" />
                    {config.victoryTitle || 'VICTORY'} — {winner}
                  </div>
                  <div className="mt-1 text-xs text-emerald-200/80">{config.victoryMessage || 'ผู้ชนะการต่อสู้'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {room.teamA.filter(u => u.hp > 0 && room.winnerTeam === 'a').map(u => (
                      <span key={u.id} className="rounded-full border border-emerald-300/20 bg-slate-950/30 px-3 py-1 text-xs font-bold">🏆 {u.name}</span>
                    ))}
                    {room.teamB.filter(u => u.hp > 0 && room.winnerTeam === 'b').map(u => (
                      <span key={u.id} className="rounded-full border border-emerald-300/20 bg-slate-950/30 px-3 py-1 text-xs font-bold">🏆 {u.name}</span>
                    ))}
                  </div>
                  {config.victoryImageUrl && (
                    <img src={config.victoryImageUrl} alt="Victory" className="mt-4 max-h-80 w-full rounded-2xl border border-emerald-300/20 object-contain" />
                  )}
                  {config.victoryVideoUrl && (
                    <video src={config.victoryVideoUrl} controls playsInline className="mt-4 max-h-96 w-full rounded-2xl border border-emerald-300/20 bg-black object-contain" />
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
              {(['a', 'b'] as const).map(team => (
                <div key={team} className={`rounded-2xl border ${team === 'a' ? 'border-cyan-500/20 bg-cyan-950/10' : 'border-rose-500/20 bg-rose-950/10'} p-3`}>
                  <div className={`mb-3 text-xs font-black uppercase tracking-widest ${team === 'a' ? 'text-cyan-200' : 'text-rose-200'}`}>
                    ทีม {team.toUpperCase()} · {team === 'a' ? 'ผู้ท้าศึก' : 'เป้าหมาย'}
                  </div>
                  <div className="space-y-2">
                    {(team === 'a' ? room.teamA : room.teamB).map(unit => (
                      <div key={unit.id} className={'flex items-center gap-2 rounded-xl border p-2 ' + (actor?.id === unit.id ? 'border-cyan-300/60 bg-cyan-400/10 animate-pulse' : 'border-transparent')}>
                        <img src={unit.avatarUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="truncate font-bold text-white">{unit.name}</span>
                            <span className="text-slate-400">{unit.hp}/{unit.maxHp}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-full ${team === 'a' ? 'bg-cyan-400' : 'bg-rose-400'}`} style={{ width: healthPercent(unit) + '%' }} />
                          </div>
                        </div>
                        {unit.isBoss && <Crown className="h-3.5 w-3.5 text-amber-300" />}
                        {unit.defenseTurns ? <span className="text-[10px] text-sky-300">GUARD</span> : null}
                        {unit.reflectTurns ? <span className="text-[10px] text-rose-300">REFLECT</span> : null}
                        {unit.stunnedTurns ? <span className="text-[10px] text-amber-300">STUN</span> : null}
                        
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 bg-slate-950/20 px-4 py-3 text-xs text-slate-300">
              <span className="mr-2 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">ล่าสุด</span>
              {room.log?.[0]?.message || 'ยังไม่มีการเคลื่อนไหว'}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 p-4">
              <div className="w-full space-y-2">
                <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-200">
                      <Package className="h-4 w-4" />
                      ไอเทมระหว่างต่อสู้
                    </div>
                    <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-black text-emerald-200">
                      {Number(room.battleItemUses || 0)}/2 ครั้ง · ต่อเกม
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select disabled={usingBattleItemId !== ''} aria-label="เลือกไอเทมสำหรับใช้ระหว่างการต่อสู้" value={selectedBattleItemId} onChange={event => {
                        const value = String(event.target.value || '');
                        if (!value) {
                          setSelectedBattleItemId('');
                          return;
                        }
                        const exists = battleInventory.some(inv => String(inv.instanceId || inv.id || '') === value);
                        setSelectedBattleItemId(exists ? value : '');
                      }} className={inputClass + ' min-h-11'}>
                      <option value="">เลือกไอเทม...</option>
                      {battleInventory.map((item, index) => {
                        const battleItemKey = String(item.instanceId || item.id || ('legacy-' + String(item.name || 'item') + '-' + index));
                        return (
                          <option key={battleItemKey} value={battleItemKey}>
                            {String(item.name || 'ไอเทม')}
                          </option>
                        );
                      })}
                    </select>
                    <button type="button" disabled={!selectedBattleItemId || usingBattleItemId !== '' || Number(room.battleItemUses || 0) >= 2} onClick={() => {
                      const item = battleInventory.find(inv =>
                        String(inv.instanceId || inv.id || '') === String(selectedBattleItemId)
                      );
                      if (item && canAct) void handleUseBattleItem(room, item);
                    }} className={buttonClass + ' min-h-11 bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40'}>
                      <Heart className="mr-1 inline h-4 w-4" />
                      {usingBattleItemId ? 'กำลังใช้...' : canAct ? 'ใช้ไอเทม' : 'รอเทิร์นของคุณ'}
                    </button>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500">
                    ใช้ได้เฉพาะไอเทม Consumable ที่เปิดให้ผู้เล่นใช้ · การใช้ไอเทมกิน 1 เทิร์น · จำกัด 2 ครั้งต่อเกม
                  </div>

                  <div className="space-y-2" hidden={!canAct}>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => {
                        setSelectedSkillId('');
                        void takeTurn(room);
                      }} className={buttonClass + ' flex items-center gap-2 bg-cyan-400 text-slate-950 hover:bg-cyan-300'}>
                        <Dice5 className="h-4 w-4" />
                        โจมตีปกติ + ทอยเต๋า
                      </button>

                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select aria-label="เลือกสกิลสำหรับการต่อสู้" value={selectedSkillId} onChange={event => setSelectedSkillId(event.target.value)} className={inputClass + ' min-h-11'}>
                          <option value="">เลือกสกิลที่ต้องการใช้...</option>
                          {(actorCharacter?.skills || []).map(skill => {
                            const skillId = getSkillId(skill);
                            const cooldown = Number(actor?.skillCooldowns?.[skillId] || actor?.skillCooldowns?.[skill.id || ''] || 0);
                            const profile = getBattleSkillProfile(skill);
                            return (
                              <option key={skillId} value={skillId} disabled={cooldown > 0}>
                                {skill.name} · {skill.passiveEffects?.length && !skill.battleEffect ? 'PASSIVE' : skillEffectLabel(profile.effect)}
                                {cooldown > 0 ? ' · CD ' + cooldown : ' · พร้อมใช้'}
                              </option>
                            );
                          })}
                        </select>

                        <button type="button" disabled={!selectedSkillId} onClick={() => {
                          const selected = (actorCharacter?.skills || []).find(skill => getSkillId(skill) === selectedSkillId);
                          if (selected) void takeTurn(room, selected);
                        }} className={buttonClass + ' min-h-11 bg-violet-500 text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40'}>
                          <Zap className="mr-1 inline h-4 w-4" />
                          ใช้สกิล
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(actorCharacter?.skills || []).map(skill => {
                          const skillId = getSkillId(skill);
                          const cooldown = Number(actor?.skillCooldowns?.[skillId] || actor?.skillCooldowns?.[skill.id || ''] || 0);
                          const profile = getBattleSkillProfile(skill);
                          return (
                            <button key={'quick-' + skillId} type="button" disabled={cooldown > 0} onClick={() => {
                              setSelectedSkillId(skillId);
                              if (cooldown <= 0) void takeTurn(room, skill);
                            }} className={buttonClass + ' min-h-9 border border-violet-400/20 bg-violet-500/10 text-xs text-violet-100 disabled:cursor-not-allowed disabled:opacity-40'}>
                              <Zap className="mr-1 inline h-3 w-3" />
                              {skill.name}
                              <span className="ml-1 opacity-60">{cooldown > 0 ? 'CD ' + cooldown : skillEffectLabel(profile.effect)}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[10px] text-slate-500">
                        กดปุ่มสกิลได้โดยตรง — สกิล Zero Echo และสกิลที่มี PASSIVE ก็สามารถเลือกใช้ในสนามรบทีมได้
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 bg-slate-950/20 p-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[.2em] text-amber-200">📊 สรุปดาเมจ</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {units.map(unit => {
                  const total = (room.log || []).filter(entry => entry.actorName === unit.name).reduce((sum, entry) => sum + Math.max(0, Number(entry.damage) || 0), 0);
                  return <div key={"dmg-" + unit.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"><span className="font-bold text-white">{unit.name}</span><span className="float-right font-black text-rose-300">{total.toLocaleString()} DMG</span></div>;
                })}
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto border-t border-slate-800 bg-slate-950/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-slate-500">
                <Dice5 className="h-3.5 w-3.5 text-cyan-300" />
                COMBAT LOG
              </div>
              {(room.log || []).slice(0, 8).map(entry => (
                <div key={entry.id} className={'mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ' + effectStyle(entry.effect)}>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-950/40 px-1 text-[10px] font-black">{entry.roll ? 'D' + entry.roll : '•'}</span>
                  <span className="font-black">{entry.actorName}</span>
                  <span className="opacity-90">{entry.message}</span>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  </div>;
}
