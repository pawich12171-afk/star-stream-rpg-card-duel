import React, { useState, useEffect, useRef } from 'react';
import { CharacterProfile, PlayingCard, CardSuit, CardDuelRoom } from '../types';
import { 
  settleCard21Bet, 
  subscribeToDuelRooms, 
  createDuelRoom, 
  acceptDuelChallenge, 
  cancelDuelRoom, 
  updateDuelRoom 
} from '../services/characterService';
import { 
  Gamepad2, 
  Coins, 
  Trophy, 
  RotateCcw, 
  Users, 
  Bot, 
  Swords, 
  AlertCircle, 
  CheckCircle, 
  HelpCircle,
  Sparkles,
  UserPlus,
  Bell,
  Clock,
  Radio,
  ArrowRight,
  ShieldCheck,
  XCircle,
  Play
} from 'lucide-react';
import confetti from '../utils/confetti';

interface CardGameProps {
  currentUser: CharacterProfile;
  allCharacters: CharacterProfile[];
  onUpdateCharacter: (updated: CharacterProfile) => void;
}

const SUITS: { suit: CardSuit; name: 'spades' | 'hearts' | 'diamonds' | 'clubs'; color: 'red' | 'black' }[] = [
  { suit: '♠', name: 'spades', color: 'black' },
  { suit: '♥', name: 'hearts', color: 'red' },
  { suit: '♦', name: 'diamonds', color: 'red' },
  { suit: '♣', name: 'clubs', color: 'black' },
];

const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const s of SUITS) {
    for (const v of VALUES) {
      let num = parseInt(v, 10);
      if (v === 'A') num = 11;
      else if (['J', 'Q', 'K'].includes(v)) num = 10;
      deck.push({
        suit: s.suit,
        suitName: s.name,
        value: v,
        numValue: num,
        color: s.color,
      });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateHandScore(hand: PlayingCard[]): number {
  let score = 0;
  let aceCount = 0;
  for (const card of hand) {
    if (card.value === 'A') {
      aceCount += 1;
      score += 11;
    } else {
      score += card.numValue;
    }
  }
  while (score > 21 && aceCount > 0) {
    score -= 10;
    aceCount -= 1;
  }
  return score;
}

export const CardGame: React.FC<CardGameProps> = ({
  currentUser,
  allCharacters,
  onUpdateCharacter,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'lobby' | 'single_ai'>('lobby');

  // Real-time Rooms State
  const [duelRooms, setDuelRooms] = useState<CardDuelRoom[]>([]);
  const [currentActiveRoomId, setCurrentActiveRoomId] = useState<string | null>(null);

  // Immediate Alert State for when players are ready
  const [immediateAlert, setImmediateAlert] = useState<{
    show: boolean;
    title: string;
    message: string;
    roomId: string;
  } | null>(null);

  // Create Room Form State
  const [createBetAmount, setCreateBetAmount] = useState<number>(500);
  const [targetInviteeId, setTargetInviteeId] = useState<string>('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Single Player AI mode state
  const [aiBetAmount, setAiBetAmount] = useState<number>(200);
  const [aiGameActive, setAiGameActive] = useState(false);
  const [aiDeck, setAiDeck] = useState<PlayingCard[]>([]);
  const [aiPlayerHand, setAiPlayerHand] = useState<PlayingCard[]>([]);
  const [aiDealerHand, setAiDealerHand] = useState<PlayingCard[]>([]);
  const [aiPlayerStanding, setAiPlayerStanding] = useState(false);
  const [aiDealerStanding, setAiDealerStanding] = useState(false);
  const [aiCurrentTurn, setAiCurrentTurn] = useState<'player' | 'dealer'>('player');
  const [aiGameResult, setAiGameResult] = useState<{
    winner: 'player' | 'dealer' | 'tie';
    reason: string;
  } | null>(null);

  // Ref to track last seen room statuses to avoid duplicate sound/alerts
  const alertedRoomIdsRef = useRef<Set<string>>(new Set());

  // Subscribe to real-time duel rooms
  useEffect(() => {
    const unsub = subscribeToDuelRooms((rooms) => {
      setDuelRooms(rooms);

      // Check if any room involving currentUser just became READY
      rooms.forEach((room) => {
        const isParticipant = room.creatorId === currentUser.id || room.opponentId === currentUser.id;
        const isFull = (room.readyPlayers?.length || 0) >= (room.requiredPlayersCount || 2);

        if (isParticipant && (room.status === 'ready' || (room.status === 'in_progress' && isFull))) {
          if (!alertedRoomIdsRef.current.has(room.id)) {
            alertedRoomIdsRef.current.add(room.id);
            // Trigger Immediate Alert!
            setImmediateAlert({
              show: true,
      title: "ผู้เล่นพร้อมเล่นครบตามจำนวนที่กำหนดไว้ทันที",
              message: `ผู้เล่นครบ ${room.requiredPlayersCount || 2} คนแล้ว! (${room.creatorName} VS ${room.opponentName}) พร้อมเริ่มศึกดวลไพ่ 21 ทันที!`,
              roomId: room.id
            });
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.4 }
            });
            setCurrentActiveRoomId(room.id);
          }
        }
      });
    });
    return () => unsub();
  }, [currentUser.id]);

  // Current active room object
  const activeRoom = duelRooms.find(r => r.id === currentActiveRoomId);
  const isUserCreatorInActiveRoom = activeRoom?.creatorId === currentUser.id;
  const isUserOpponentInActiveRoom = activeRoom?.opponentId === currentUser.id;

  // Handle Create Duel Room & Invite
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.coins < createBetAmount) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${createBetAmount.toLocaleString()} Coins แต่คุณมี ${currentUser.coins.toLocaleString()} Coins`);
      return;
    }

    const freshDeck = createDeck();
    const p1First = freshDeck.pop()!;
    const p2First = freshDeck.pop()!;

    const newRoom: CardDuelRoom = {
      id: `duel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      creatorId: currentUser.id,
      creatorName: currentUser.displayName,
      creatorAvatar: currentUser.avatarUrl,
      invitedPlayerId: targetInviteeId || undefined,
      betAmount: createBetAmount,
      status: 'waiting',
      requiredPlayersCount: 2,
      readyPlayers: [currentUser.id],
      turn: 'creator',
      creatorHand: [p1First],
      opponentHand: [p2First],
      creatorStanding: false,
      opponentStanding: false,
      deck: freshDeck,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setIsCreatingRoom(true);
    await createDuelRoom(newRoom);
    setIsCreatingRoom(false);
    setCurrentActiveRoomId(newRoom.id);

    const inviteeName = allCharacters.find(c => c.id === targetInviteeId)?.displayName;
    alert(
      targetInviteeId
        ? `สร้างห้องดวลไพ่สำเร็จและส่งสารเชิญไปยัง "${inviteeName}" แล้ว! ระบบกำลังรอให้ผู้เล่นเข้าร่วม...`
        : `สร้างห้องดวลไพ่สำเร็จ! ห้องจะรอผู้เล่นอื่นเข้าร่วมก่อนจึงจะเริ่มเล่นได้`
    );
  };

  // Handle Accept / Join Room
  const handleJoinRoom = async (room: CardDuelRoom) => {
    if (currentUser.coins < room.betAmount) {
      alert(`เหรียญของคุณไม่พอสำหรับการเดิมพัน ${room.betAmount.toLocaleString()} Coins`);
      return;
    }
    try {
      await acceptDuelChallenge(room.id, currentUser);
      setCurrentActiveRoomId(room.id);
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถเข้าร่วมห้องได้');
    }
  };

  // Handle Cancel Room
  const handleCancelRoom = async (roomId: string) => {
    if (confirm('คุณต้องการยกเลิกห้องดวลนี้ใช่หรือไม่?')) {
      await cancelDuelRoom(roomId);
      if (currentActiveRoomId === roomId) {
        setCurrentActiveRoomId(null);
      }
    }
  };

  // Multiplayer Gameplay: Hit
  const handleRoomHit = async () => {
    if (!activeRoom || activeRoom.status === 'completed') return;
    const isCreator = isUserCreatorInActiveRoom;
    const remainingDeck = [...(activeRoom.deck || [])];
    const newCard = remainingDeck.pop();
    if (!newCard) return;

    let creatorHand = [...activeRoom.creatorHand];
    let opponentHand = [...activeRoom.opponentHand];
    let creatorStanding = activeRoom.creatorStanding;
    let opponentStanding = activeRoom.opponentStanding;

    if (isCreator) {
      creatorHand.push(newCard);
    } else {
      opponentHand.push(newCard);
    }

    const s1 = calculateHandScore(creatorHand);
    const s2 = calculateHandScore(opponentHand);

    let winner: 'creator' | 'opponent' | 'tie' | null = null;
    let resultReason = '';
    let isFinished = false;

    if (s1 === 21) {
      winner = 'creator';
      resultReason = `${activeRoom.creatorName} ได้ 21 แต้ม ชนะทันที!`;
      isFinished = true;
    } else if (s2 === 21) {
      winner = 'opponent';
      resultReason = `${activeRoom.opponentName} ได้ 21 แต้ม ชนะทันที!`;
      isFinished = true;
    } else if (s1 > 21) {
      winner = 'opponent';
      resultReason = `${activeRoom.creatorName} แต้มเกิน 21 (${s1} แต้ม - Bust!)`;
      isFinished = true;
    } else if (s2 > 21) {
      winner = 'creator';
      resultReason = `${activeRoom.opponentName} แต้มเกิน 21 (${s2} แต้ม - Bust!)`;
      isFinished = true;
    }

    let nextTurn = activeRoom.turn;
    if (!isFinished) {
      if (isCreator) {
        if (!opponentStanding) nextTurn = 'opponent';
      } else {
        if (!creatorStanding) nextTurn = 'creator';
      }
    }

    const updated: CardDuelRoom = {
      ...activeRoom,
      creatorHand,
      opponentHand,
      deck: remainingDeck,
      turn: nextTurn,
      winner: isFinished ? winner : undefined,
      resultReason: isFinished ? resultReason : undefined,
      status: isFinished ? 'completed' : 'in_progress',
      updatedAt: Date.now(),
    };

    await updateDuelRoom(updated);

    if (isFinished && winner) {
      const creatorChar = allCharacters.find(c => c.id === activeRoom.creatorId);
      const opponentChar = allCharacters.find(c => c.id === activeRoom.opponentId);
      if (winner === 'creator' && creatorChar && opponentChar) {
        await settleCard21Bet(creatorChar, opponentChar, activeRoom.betAmount, false, resultReason);
      } else if (winner === 'opponent' && creatorChar && opponentChar) {
        await settleCard21Bet(opponentChar, creatorChar, activeRoom.betAmount, false, resultReason);
      }
    }
  };

  // Multiplayer Gameplay: Stand
  const handleRoomStand = async () => {
    if (!activeRoom || activeRoom.status === 'completed') return;
    const isCreator = isUserCreatorInActiveRoom;
    let creatorStanding = activeRoom.creatorStanding;
    let opponentStanding = activeRoom.opponentStanding;

    if (isCreator) {
      creatorStanding = true;
    } else {
      opponentStanding = true;
    }

    const s1 = calculateHandScore(activeRoom.creatorHand);
    const s2 = calculateHandScore(activeRoom.opponentHand);

    let winner: 'creator' | 'opponent' | 'tie' | null = null;
    let resultReason = '';
    let isFinished = false;

    if (creatorStanding && opponentStanding) {
      isFinished = true;
      if (s1 > s2) {
        winner = 'creator';
        resultReason = `${activeRoom.creatorName} (${s1} แต้ม) ชนะ ${activeRoom.opponentName} (${s2} แต้ม)`;
      } else if (s2 > s1) {
        winner = 'opponent';
        resultReason = `${activeRoom.opponentName} (${s2} แต้ม) ชนะ ${activeRoom.creatorName} (${s1} แต้ม)`;
      } else {
        winner = 'tie';
        resultReason = `เสมอด้วยคะแนนเท่ากัน (${s1} แต้ม)`;
      }
    }

    let nextTurn = activeRoom.turn;
    if (!isFinished) {
      nextTurn = isCreator ? 'opponent' : 'creator';
    }

    const updated: CardDuelRoom = {
      ...activeRoom,
      creatorStanding,
      opponentStanding,
      turn: nextTurn,
      winner: isFinished ? winner : undefined,
      resultReason: isFinished ? resultReason : undefined,
      status: isFinished ? 'completed' : 'in_progress',
      updatedAt: Date.now(),
    };

    await updateDuelRoom(updated);

    if (isFinished && winner && winner !== 'tie') {
      const creatorChar = allCharacters.find(c => c.id === activeRoom.creatorId);
      const opponentChar = allCharacters.find(c => c.id === activeRoom.opponentId);
      if (winner === 'creator' && creatorChar && opponentChar) {
        await settleCard21Bet(creatorChar, opponentChar, activeRoom.betAmount, false, resultReason);
      } else if (winner === 'opponent' && creatorChar && opponentChar) {
        await settleCard21Bet(opponentChar, creatorChar, activeRoom.betAmount, false, resultReason);
      }
    }
  };

  // Single Player AI Game Handlers
  const handleStartAiGame = () => {
    if (currentUser.coins < aiBetAmount) {
      alert(`เหรียญไม่เพียงพอ ต้องการ ${aiBetAmount.toLocaleString()} C`);
      return;
    }
    const freshDeck = createDeck();
    const pFirst = freshDeck.pop()!;
    const dFirst = freshDeck.pop()!;
    setAiDeck(freshDeck);
    setAiPlayerHand([pFirst]);
    setAiDealerHand([dFirst]);
    setAiPlayerStanding(false);
    setAiDealerStanding(false);
    setAiCurrentTurn('player');
    setAiGameResult(null);
    setAiGameActive(true);
  };

  const handleAiHit = () => {
    if (!aiGameActive || aiCurrentTurn !== 'player' || aiPlayerStanding) return;
    const remainingDeck = [...aiDeck];
    const newCard = remainingDeck.pop();
    if (!newCard) return;
    const newHand = [...aiPlayerHand, newCard];
    setAiDeck(remainingDeck);
    setAiPlayerHand(newHand);

    const s1 = calculateHandScore(newHand);
    const s2 = calculateHandScore(aiDealerHand);

    if (s1 === 21) {
      finishAiGame('player', `${currentUser.displayName} ได้ 21 แต้ม ชนะทันที!`);
    } else if (s1 > 21) {
      finishAiGame('dealer', `${currentUser.displayName} แต้มเกิน 21 (${s1} แต้ม - Bust!)`);
    } else {
      if (!aiDealerStanding) {
        setAiCurrentTurn('dealer');
      }
    }
  };

  const handleAiStand = () => {
    if (!aiGameActive || aiCurrentTurn !== 'player') return;
    setAiPlayerStanding(true);
    const s1 = calculateHandScore(aiPlayerHand);
    const s2 = calculateHandScore(aiDealerHand);

    if (aiDealerStanding) {
      if (s1 > s2) finishAiGame('player', `${currentUser.displayName} (${s1} แต้ม) ชนะ AI Dealer (${s2} แต้ม)`);
      else if (s2 > s1) finishAiGame('dealer', `AI Dealer (${s2} แต้ม) ชนะ ${currentUser.displayName} (${s1} แต้ม)`);
      else finishAiGame('tie', `เสมอกันที่ ${s1} แต้ม`);
    } else {
      setAiCurrentTurn('dealer');
    }
  };

  // AI Dealer Turn Automation
  useEffect(() => {
    if (!aiGameActive || aiCurrentTurn !== 'dealer' || aiDealerStanding) return;

    const timer = setTimeout(() => {
      const dScore = calculateHandScore(aiDealerHand);
      const pScore = calculateHandScore(aiPlayerHand);

      const shouldStand = dScore >= 17 || (aiPlayerStanding && dScore > pScore && dScore <= 21);

      if (shouldStand) {
        setAiDealerStanding(true);
        if (aiPlayerStanding) {
          if (pScore > dScore) finishAiGame('player', `${currentUser.displayName} (${pScore} แต้ม) ชนะ Dealer (${dScore} แต้ม)`);
          else if (dScore > pScore) finishAiGame('dealer', `Dealer (${dScore} แต้ม) ชนะ ${currentUser.displayName} (${pScore} แต้ม)`);
          else finishAiGame('tie', `เสมอกันที่ ${pScore} แต้ม`);
        } else {
          setAiCurrentTurn('player');
        }
      } else {
        const remainingDeck = [...aiDeck];
        const newCard = remainingDeck.pop();
        if (newCard) {
          const newHand = [...aiDealerHand, newCard];
          setAiDeck(remainingDeck);
          setAiDealerHand(newHand);
          const newScore = calculateHandScore(newHand);

          if (newScore === 21) {
            finishAiGame('dealer', `AI Dealer ได้ 21 แต้ม ชนะทันที!`);
          } else if (newScore > 21) {
            finishAiGame('player', `AI Dealer แต้มเกิน 21 (${newScore} แต้ม - Bust!)`);
          } else {
            if (!aiPlayerStanding) setAiCurrentTurn('player');
          }
        }
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [aiGameActive, aiCurrentTurn, aiDealerStanding, aiDealerHand, aiPlayerHand, aiPlayerStanding, aiDeck]);

  const finishAiGame = async (winner: 'player' | 'dealer' | 'tie', reason: string) => {
    setAiGameActive(false);
    setAiGameResult({ winner, reason });
    if (winner === 'player') {
      confetti({ particleCount: 70, spread: 60 });
      await settleCard21Bet(currentUser, null, aiBetAmount, false, reason);
      onUpdateCharacter({
        ...currentUser,
        coins: currentUser.coins + aiBetAmount,
      });
    } else if (winner === 'dealer') {
      onUpdateCharacter({
        ...currentUser,
        coins: Math.max(0, currentUser.coins - aiBetAmount),
      });
    }
  };

  // Rooms Filter
  const waitingRooms = duelRooms.filter(r => r.status === 'waiting');
  const activeRooms = duelRooms.filter(r => r.status === 'ready' || r.status === 'in_progress');
  const myRooms = duelRooms.filter(r => r.creatorId === currentUser.id || r.opponentId === currentUser.id);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 border border-indigo-500/40 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase tracking-widest flex items-center gap-1">
                <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
                CONSTELLATION CARD 21 ARENA
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              ศึกดวลไพ่ 21 (Card 21 Multiplayer & Duel)
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-xl leading-relaxed">
              สามารถเชิญผู้เล่นอื่นมาดวลได้ ต้องรอคนครบตามจำนวนที่กำหนด ระบบจะแจ้งเตือนเมื่อพร้อมเล่นทันที!
            </p>
          </div>
          <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-4 flex items-center gap-4 shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">เหรียญของคุณ</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-amber-300">
                  {currentUser.coins.toLocaleString()}
                </span>
                <span className="text-xs text-amber-500/80 font-mono">Coins</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* IMMEDIATE ALERT POPUP BANNER WHEN PLAYERS ARE READY */}
      {immediateAlert && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-emerald-500/20 border-2 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.5)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg animate-bounce">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                  {immediateAlert.title}
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-sm font-bold text-white mt-0.5">
                {immediateAlert.message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setCurrentActiveRoomId(immediateAlert.roomId);
                setImmediateAlert(null);
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              เข้าสู่กระดานดวลไพ่ทันที
            </button>
            <button
              onClick={() => setImmediateAlert(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-white"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Mode Subtabs */}
      <div className="flex items-center gap-2 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveSubTab('lobby')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'lobby'
              ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          ห้องดวลระหว่างผู้เล่น (เชิญคน / รอคนเล่น)
        </button>
        <button
          onClick={() => setActiveSubTab('single_ai')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'single_ai'
              ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Bot className="w-4 h-4" />
          ซ้อมมือกับ Dokkaebi Dealer AI
        </button>
      </div>

      {/* ==================== SUBTAB 1: MULTIPLAYER LOBBY ==================== */}
      {activeSubTab === 'lobby' && (
        <div className="space-y-6">
          {/* If there is an active room we are currently inside */}
          {activeRoom ? (
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
              {/* Room Top Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold">
                    <Swords className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      ห้องดวลไพ่ 21: {activeRoom.creatorName} VS {activeRoom.opponentName || '(กำลังรอผู้เล่นเข้าร่วม...)'}
                    </h3>
                    <span className="text-xs text-amber-400 font-mono">
                      เงินเดิมพัน: {activeRoom.betAmount.toLocaleString()} Coins | รวมกองกลาง: {(activeRoom.betAmount * 2).toLocaleString()} Coins
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeRoom.status === 'waiting' && isUserCreatorInActiveRoom && (
                    <button
                      onClick={() => handleCancelRoom(activeRoom.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      ยกเลิกห้อง
                    </button>
                  )}
                  <button
                    onClick={() => setCurrentActiveRoomId(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    กลับสู่ล็อบบี้
                  </button>
                </div>
              </div>

              {/* STATE 1: WAITING FOR OPPONENT */}
              {activeRoom.status === 'waiting' && (
                <div className="py-12 px-6 rounded-3xl bg-slate-850/80 border border-slate-800 text-center space-y-4">
                  <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-cyan-500/30 animate-ping" />
                    <div className="w-16 h-16 rounded-full bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-xl">
                      <Radio className="w-8 h-8 animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400 bg-cyan-950/80 px-3 py-1 rounded-full border border-cyan-800">
                      ต้องรอคนก่อนถึงจะเล่นได้ (1/2 คนพร้อม)
                    </span>
                    <h4 className="text-lg font-black text-white mt-2">
                      กำลังรอผู้เล่นเข้าร่วมห้องดวล...
                    </h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      {activeRoom.invitedPlayerId
                        ? `ระบบได้ส่งคำเชิญท้าดวลไปยังผู้เล่นเป้าหมายแล้ว กำลังรอการตอบรับ...`
                        : `ห้องดวลเปิดรับผู้เล่นทุกคน เมื่อมีผู้เล่นกดเข้าร่วมห้อง ระบบจะแจ้งเตือนและเริ่มการดวลทันที!`}
                    </p>
                  </div>

                  <div className="pt-2 flex justify-center items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">
                      รหัสห้อง: {activeRoom.id}
                    </span>
                  </div>
                </div>
              )}

              {/* STATE 2: MATCH READY / IN PROGRESS / COMPLETED */}
              {(activeRoom.status === 'ready' || activeRoom.status === 'in_progress' || activeRoom.status === 'completed') && (
                <div className="space-y-6">
                  {/* Opponent Area */}
                  <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={activeRoom.opponentAvatar || '/avatars/system.svg'}
                          alt={activeRoom.opponentName || 'ผู้เล่น 2'}
                          className="w-10 h-10 rounded-xl object-cover border border-purple-500/40"
                        />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{activeRoom.opponentName || 'ผู้เล่น 2'}</span>
                            {isUserOpponentInActiveRoom && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                                ตัวคุณ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {activeRoom.opponentStanding ? 'หมอบแล้ว (Stand)' : 'กำลังแข่งขัน'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">แต้มปัจจุบัน</span>
                        <span className={`text-xl font-mono font-black ${
                          calculateHandScore(activeRoom.opponentHand) === 21 
                            ? 'text-amber-300' 
                            : calculateHandScore(activeRoom.opponentHand) > 21 
                            ? 'text-rose-400' 
                            : 'text-purple-300'
                        }`}>
                          {calculateHandScore(activeRoom.opponentHand)}
                        </span>
                      </div>
                    </div>

                    {/* Opponent Cards */}
                    <div className="flex flex-wrap gap-2.5 pt-2">
                      {activeRoom.opponentHand.map((card, idx) => (
                        <div
                          key={idx}
                          className={`w-16 h-22 rounded-xl border p-2 flex flex-col justify-between shadow-lg transition-transform ${
                            card.color === 'red'
                              ? 'bg-white text-rose-600 border-rose-200'
                              : 'bg-white text-slate-900 border-slate-200'
                          }`}
                        >
                          <div className="text-xs font-black leading-none">{card.value}</div>
                          <div className="text-xl text-center leading-none">{card.suit}</div>
                          <div className="text-xs font-black text-right leading-none">{card.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-slate-800 w-full"></div>
                    <span className="absolute bg-slate-900 px-3 text-xs font-mono font-bold text-slate-500">
                      VS
                    </span>
                  </div>

                  {/* Creator Area */}
                  <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={activeRoom.creatorAvatar}
                          alt={activeRoom.creatorName}
                          className="w-10 h-10 rounded-xl object-cover border border-cyan-500/40"
                        />
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{activeRoom.creatorName}</span>
                            {isUserCreatorInActiveRoom && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                                ตัวคุณ
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {activeRoom.creatorStanding ? 'หมอบแล้ว (Stand)' : 'กำลังแข่งขัน'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">แต้มปัจจุบัน</span>
                        <span className={`text-xl font-mono font-black ${
                          calculateHandScore(activeRoom.creatorHand) === 21 
                            ? 'text-amber-300' 
                            : calculateHandScore(activeRoom.creatorHand) > 21 
                            ? 'text-rose-400' 
                            : 'text-cyan-300'
                        }`}>
                          {calculateHandScore(activeRoom.creatorHand)}
                        </span>
                      </div>
                    </div>

                    {/* Creator Cards */}
                    <div className="flex flex-wrap gap-2.5 pt-2">
                      {activeRoom.creatorHand.map((card, idx) => (
                        <div
                          key={idx}
                          className={`w-16 h-22 rounded-xl border p-2 flex flex-col justify-between shadow-lg transition-transform ${
                            card.color === 'red'
                              ? 'bg-white text-rose-600 border-rose-200'
                              : 'bg-white text-slate-900 border-slate-200'
                          }`}
                        >
                          <div className="text-xs font-black leading-none">{card.value}</div>
                          <div className="text-xl text-center leading-none">{card.suit}</div>
                          <div className="text-xs font-black text-right leading-none">{card.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Turn Controls */}
                  {activeRoom.status !== 'completed' && (
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs">
                        <span className="text-slate-400">เทิร์นปัจจุบัน: </span>
                        <span className="font-bold text-amber-300">
                          {activeRoom.turn === 'creator' ? activeRoom.creatorName : activeRoom.opponentName}
                        </span>
                        {((activeRoom.turn === 'creator' && isUserCreatorInActiveRoom) ||
                          (activeRoom.turn === 'opponent' && isUserOpponentInActiveRoom)) && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold animate-pulse">
                            (ถึงตาคุณเล่นแล้ว!)
                          </span>
                        )}
                      </div>

                      {/* Controls enabled if it's the user's turn */}
                      {((activeRoom.turn === 'creator' && isUserCreatorInActiveRoom && !activeRoom.creatorStanding) ||
                        (activeRoom.turn === 'opponent' && isUserOpponentInActiveRoom && !activeRoom.opponentStanding)) && (
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={handleRoomHit}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            จั่วไพ่ (Hit)
                          </button>
                          <button
                            onClick={handleRoomStand}
                            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 font-bold text-xs shadow-md cursor-pointer"
                          >
                            พอแล้ว / หมอบ (Stand)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Result Box */}
                  {activeRoom.status === 'completed' && activeRoom.resultReason && (
                    <div className="p-6 rounded-3xl bg-amber-950/40 border-2 border-amber-400/80 text-center space-y-3 shadow-2xl">
                      <Trophy className="w-8 h-8 text-amber-400 mx-auto animate-bounce" />
                      <h4 className="text-lg font-black text-white">
                        ผลการดวลไพ่ 21
                      </h4>
                      <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                        {activeRoom.resultReason}
                      </p>
                      <div className="pt-2 flex justify-center gap-2">
                        <button
                          onClick={() => setCurrentActiveRoomId(null)}
                          className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow cursor-pointer"
                        >
                          กลับสู่ล็อบบี้ห้องดวล
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Lobby View: Create Room & List Rooms */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Create Duel Room Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-cyan-400" />
                  สร้างห้องดวลไพ่ & เชิญผู้เล่น
                </h3>
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">
                      เลือกเชิญผู้เล่นเฉพาะเจาะจง (หรือปล่อยว่างเพื่อเปิดห้องสาธารณะ):
                    </label>
                    <select
                      value={targetInviteeId}
                      onChange={(e) => setTargetInviteeId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-cyan-400 cursor-pointer"
                    >
                      <option value="">-- เปิดห้องสาธารณะ (ให้ใครก็ได้เข้าร่วม) --</option>
                      {allCharacters
                        .filter(c => c.id !== currentUser.id)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            เชิญ: {c.displayName} ({c.nickname}) - มี {c.coins.toLocaleString()} C
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">
                      จำนวนเหรียญเดิมพัน (Bet Amount):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[100, 200, 500, 1000, 2500, 5000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCreateBetAmount(amt)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                            createBetAmount === amt
                              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          {amt.toLocaleString()} C
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">ผู้เล่นที่ต้องพร้อม:</span>
                      <span className="font-bold text-white">2 คน (ดวล 1v1)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">เงินกองกลาง (Pot x2):</span>
                      <span className="font-mono font-bold text-amber-300">
                        +{(createBetAmount * 2).toLocaleString()} Coins
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingRoom || currentUser.coins < createBetAmount}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Swords className="w-4 h-4" />
                    {isCreatingRoom ? 'กำลังสร้างห้อง...' : 'สร้างห้องดวลไพ่ & ส่งคำเชิญ'}
                  </button>
                </form>
              </div>

              {/* Right: Rooms Lobby List */}
              <div className="lg:col-span-2 space-y-4">
                {/* Section 1: Rooms Waiting for Opponent */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" />
                        ห้องดวลที่รอคนเล่น ({waitingRooms.length} ห้อง)
                      </h3>
                      <p className="text-xs text-slate-400">
                        ต้องรอคนก่อนถึงจะเล่นได้ ระบบจะแจ้งเตือนเมื่อผู้เล่นครบ 2 คนทันที
                      </p>
                    </div>
                  </div>

                  {waitingRooms.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-slate-800/40 border border-slate-800 text-center text-slate-500 text-xs">
                      ขณะนี้ยังไม่มีห้องดวลที่รอผู้เล่น สามารถกดสร้างห้องเพื่อเชิญเพื่อนได้
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {waitingRooms.map(room => {
                        const isCreator = room.creatorId === currentUser.id;
                        const isInvitedMe = room.invitedPlayerId === currentUser.id;
                        return (
                          <div
                            key={room.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                              isInvitedMe
                                ? 'bg-amber-950/40 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                : 'bg-slate-800/80 border-slate-700/80'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={room.creatorAvatar}
                                    alt={room.creatorName}
                                    className="w-8 h-8 rounded-lg object-cover border border-cyan-500/40"
                                  />
                                  <div>
                                    <span className="text-xs font-bold text-white block">
                                      {room.creatorName}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {room.invitedPlayerId ? 'ห้องท้าดวลเฉพาะบุคคล' : 'ห้องท้าดวลสาธารณะ'}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs font-mono font-bold text-amber-400">
                                  {room.betAmount.toLocaleString()} C
                                </span>
                              </div>

                              {isInvitedMe && (
                                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
                                  <Bell className="w-3.5 h-3.5" />
                                  ห้องนี้ส่งคำเชิญท้าดวลถึงคุณโดยตรง!
                                </div>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
                              <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800">
                                กำลังรอผู้เล่น (1/2 คน)
                              </span>
                              {isCreator ? (
                                <button
                                  onClick={() => setCurrentActiveRoomId(room.id)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-all cursor-pointer"
                                >
                                  ดูห้องของคุณ
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleJoinRoom(room)}
                                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black shadow transition-all cursor-pointer"
                                >
                                  {isInvitedMe ? 'ยอมรับคำท้า' : 'เข้าร่วมดวล'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section 2: Active or Completed Matches */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Swords className="w-4 h-4 text-purple-400" />
                    ห้องที่เริ่มดวลแล้ว / ห้องของคุณ ({myRooms.length} ห้อง)
                  </h3>
                  {myRooms.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      คุณยังไม่ได้เข้าร่วมการดวลใดๆ ในขณะนี้
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {myRooms.map(room => (
                        <div
                          key={room.id}
                          className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">
                              {room.creatorName} VS {room.opponentName || '(รอคู่ต่อสู้)'}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2 font-mono">
                              เดิมพัน: {room.betAmount.toLocaleString()} C
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              room.status === 'completed'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            }`}>
                              {room.status === 'completed' ? 'จบแล้ว' : 'กำลังแข่งขัน'}
                            </span>
                            <button
                              onClick={() => setCurrentActiveRoomId(room.id)}
                              className="px-3 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] cursor-pointer"
                            >
                              เข้าชม / เล่น
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SUBTAB 2: PRACTICE WITH AI ==================== */}
      {activeSubTab === 'single_ai' && (
        <div className="space-y-6">
          {!aiGameActive && !aiGameResult && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                โหมดซ้อมมือดวลกับ Dokkaebi Dealer AI
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                เหมาะสำหรับฝึกซ้อมกลยุทธ์การจั่วไพ่ 21 และทดสอบแต้มโดยไม่ต้องรอผู้เล่นคนอื่น
              </p>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  จำนวนเหรียญเดิมพัน (Bet Amount):
                </label>
                <div className="flex flex-wrap gap-2">
                  {[100, 200, 500, 1000, 2500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAiBetAmount(amt)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        aiBetAmount === amt
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      {amt.toLocaleString()} C
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleStartAiGame}
                  className="px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-slate-950 font-black text-sm shadow-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  เริ่มการซ้อมดวลกับ AI Dealer
                </button>
              </div>
            </div>
          )}

          {(aiGameActive || aiGameResult) && (
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-xs font-bold text-slate-400">
                  เดิมพัน: <strong className="text-amber-400 font-mono">{aiBetAmount.toLocaleString()} C</strong>
                </span>
                {aiGameActive && (
                  <span className={`text-xs font-black px-3 py-1 rounded-full ${
                    aiCurrentTurn === 'player'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 animate-pulse'
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 animate-pulse'
                  }`}>
                    {aiCurrentTurn === 'player' ? 'ตาของคุณเล่น' : 'Dealer กำลังคิด...'}
                  </span>
                )}
              </div>

              {/* Dealer Area */}
              <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src="/avatars/system.svg"
                      alt="Dealer"
                      className="w-10 h-10 rounded-xl object-cover border border-purple-500/40"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Dokkaebi Dealer (AI)</span>
                      <span className="text-[11px] text-slate-400">
                        {aiDealerStanding ? 'หมอบแล้ว (Stand)' : 'กำลังแข่งขัน'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">แต้ม</span>
                    <span className="text-xl font-mono font-black text-purple-300">
                      {calculateHandScore(aiDealerHand)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {aiDealerHand.map((card, idx) => (
                    <div
                      key={idx}
                      className={`w-16 h-22 rounded-xl border p-2 flex flex-col justify-between shadow-lg ${
                        card.color === 'red'
                          ? 'bg-white text-rose-600 border-rose-200'
                          : 'bg-white text-slate-900 border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-black leading-none">{card.value}</div>
                      <div className="text-xl text-center leading-none">{card.suit}</div>
                      <div className="text-xs font-black text-right leading-none">{card.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* User Area */}
              <div className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.displayName}
                      className="w-10 h-10 rounded-xl object-cover border border-cyan-500/40"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {currentUser.displayName} (คุณ)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {aiPlayerStanding ? 'หมอบแล้ว (Stand)' : 'กำลังแข่งขัน'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">แต้ม</span>
                    <span className="text-xl font-mono font-black text-cyan-300">
                      {calculateHandScore(aiPlayerHand)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {aiPlayerHand.map((card, idx) => (
                    <div
                      key={idx}
                      className={`w-16 h-22 rounded-xl border p-2 flex flex-col justify-between shadow-lg ${
                        card.color === 'red'
                          ? 'bg-white text-rose-600 border-rose-200'
                          : 'bg-white text-slate-900 border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-black leading-none">{card.value}</div>
                      <div className="text-xl text-center leading-none">{card.suit}</div>
                      <div className="text-xs font-black text-right leading-none">{card.value}</div>
                    </div>
                  ))}
                </div>

                {aiGameActive && aiCurrentTurn === 'player' && !aiPlayerStanding && (
                  <div className="pt-3 border-t border-slate-800 flex gap-2">
                    <button
                      onClick={handleAiHit}
                      className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow cursor-pointer"
                    >
                      จั่วไพ่ (Hit)
                    </button>
                    <button
                      onClick={handleAiStand}
                      className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 font-bold text-xs shadow cursor-pointer"
                    >
                      พอแล้ว (Stand)
                    </button>
                  </div>
                )}
              </div>

              {aiGameResult && (
                <div className="p-6 rounded-2xl border text-center space-y-3 bg-slate-800/80 border-slate-700">
                  <h4 className="text-lg font-black text-white">
                    {aiGameResult.winner === 'player' ? 'คุณชนะการดวล!' : aiGameResult.winner === 'dealer' ? 'Dealer ชนะ' : 'เสมอ'}
                  </h4>
                  <p className="text-xs text-slate-300">{aiGameResult.reason}</p>
                  <button
                    onClick={handleStartAiGame}
                    className="px-6 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs cursor-pointer"
                  >
                    เล่นซ้ำอีกครั้ง
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
