import React, { useMemo, useState } from 'react';
import { CharacterProfile, PlayingCard, CardSuit } from '../types';
import { Gamepad2, Coins, Trophy, RotateCcw, Bot, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import confetti from '../utils/confetti';

interface CardGameProps {
  currentUser: CharacterProfile;
  allCharacters: CharacterProfile[];
  onUpdateCharacter: (updated: CharacterProfile) => void;
}

const SUITS: { suit: CardSuit; suitName: PlayingCard['suitName']; color: 'red' | 'black' }[] = [
  { suit: '♠', suitName: 'spades', color: 'black' },
  { suit: '♥', suitName: 'hearts', color: 'red' },
  { suit: '♦', suitName: 'diamonds', color: 'red' },
  { suit: '♣', suitName: 'clubs', color: 'black' },
];

const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const s of SUITS) {
    for (const value of VALUES) {
      const numValue = value === 'A' ? 11 : ['J', 'Q', 'K'].includes(value) ? 10 : Number(value);
      deck.push({ suit: s.suit, suitName: s.suitName, value, numValue, color: s.color });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function scoreHand(hand: PlayingCard[]): number {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    score += card.numValue;
    if (card.value === 'A') aces++;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

const CardView: React.FC<{ card: PlayingCard; hidden?: boolean }> = ({ card, hidden }) => (
  <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl bg-white text-slate-900 border border-slate-300 shadow-xl flex flex-col items-center justify-center select-none">
    {hidden ? (
      <div className="w-full h-full rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 text-2xl font-black">★</div>
    ) : (
      <>
        <span className="text-xl sm:text-2xl font-black leading-none" style={{ color: card.color === 'red' ? '#ef4444' : '#0f172a' }}>{card.value}</span>
        <span className="text-2xl sm:text-3xl leading-none mt-1" style={{ color: card.color === 'red' ? '#ef4444' : '#0f172a' }}>{card.suit}</span>
      </>
    )}
  </div>
);

export const CardGame: React.FC<CardGameProps> = ({ currentUser, onUpdateCharacter }) => {
  const [betAmount, setBetAmount] = useState(200);
  const [gameActive, setGameActive] = useState(false);
  const [deck, setDeck] = useState<PlayingCard[]>([]);
  const [playerHand, setPlayerHand] = useState<PlayingCard[]>([]);
  const [dealerHand, setDealerHand] = useState<PlayingCard[]>([]);
  const [playerStanding, setPlayerStanding] = useState(false);
  const [result, setResult] = useState<{ winner: 'player' | 'dealer' | 'tie'; reason: string } | null>(null);
  const [message, setMessage] = useState('เดิมพันแล้วลองเอาชนะ Dokkaebi Dealer AI ให้ได้!');

  const playerScore = useMemo(() => scoreHand(playerHand), [playerHand]);
  const dealerScore = useMemo(() => scoreHand(dealerHand), [dealerHand]);

  const updateCoins = (delta: number) => {
    onUpdateCharacter({
      ...currentUser,
      coins: Math.max(0, currentUser.coins + delta),
      lastUpdated: Date.now(),
    });
  };

  const finishGame = (winner: 'player' | 'dealer' | 'tie', reason: string) => {
    setResult({ winner, reason });
    setGameActive(false);
    setPlayerStanding(true);

    // The bet is settled once, at the end of the game. This avoids stale
    // character state when the real-time Firestore listener updates coins.
    if (winner === 'player') {
      updateCoins(betAmount);
      setMessage(`ชนะ! รับกำไร ${betAmount} Coins`);
      confetti({ particleCount: 100, spread: 70 });
    } else if (winner === 'tie') {
      setMessage(`เสมอ คืนเดิมพัน ${betAmount} Coins`);
    } else {
      updateCoins(-betAmount);
      setMessage(`แพ้! เสียเดิมพัน ${betAmount} Coins`);
    }
  };

  const startGame = () => {
    const safeBet = Math.max(1, Math.floor(betAmount));
    if (currentUser.coins < safeBet) {
      alert(`Coins ไม่พอ ต้องการ ${safeBet.toLocaleString()} Coins แต่คุณมี ${currentUser.coins.toLocaleString()} Coins`);
      return;
    }

    const freshDeck = createDeck();
    const player = [freshDeck.pop()!, freshDeck.pop()!];
    const dealer = [freshDeck.pop()!, freshDeck.pop()!];

    setBetAmount(safeBet);
    setDeck(freshDeck);
    setPlayerHand(player);
    setDealerHand(dealer);
    setPlayerStanding(false);
    setResult(null);
    setGameActive(true);
    setMessage('ตาคุณแล้ว — จั่วไพ่หรือหยุด');

    const p = scoreHand(player);
    const d = scoreHand(dealer);
    if (p === 21 || d === 21) {
      setTimeout(() => {
        if (p === 21 && d === 21) finishGame('tie', 'ทั้งผู้เล่นและ Dealer ได้ 21 แต้ม');
        else if (p === 21) finishGame('player', 'ผู้เล่นได้ 21 แต้ม!');
        else finishGame('dealer', 'Dealer ได้ 21 แต้ม!');
      }, 250);
    }
  };

  const dealerTurn = (finalPlayerHand = playerHand, remainingDeck = deck) => {
    let dealer = [...dealerHand];
    const cards = [...remainingDeck];
    while (scoreHand(dealer) < 17 && cards.length) dealer.push(cards.pop()!);
    setDealerHand(dealer);
    setDeck(cards);

    const p = scoreHand(finalPlayerHand);
    const d = scoreHand(dealer);
    if (d > 21 || p > d) finishGame('player', d > 21 ? `Dealer แต้มเกิน 21 (${d})` : `${p} แต้ม ชนะ Dealer ${d} แต้ม`);
    else if (p === d) finishGame('tie', `เสมอกันที่ ${p} แต้ม`);
    else finishGame('dealer', `Dealer ${d} แต้ม ชนะ ${p} แต้ม`);
  };

  const drawCard = () => {
    if (!gameActive || playerStanding) return;
    const next = deck[deck.length - 1];
    if (!next) return;
    const remaining = deck.slice(0, -1);
    const hand = [...playerHand, next];
    setDeck(remaining);
    setPlayerHand(hand);

    const score = scoreHand(hand);
    if (score > 21) finishGame('dealer', `แต้มผู้เล่นเกิน 21 (${score})`);
    else if (score === 21) dealerTurn(hand, remaining);
    else setMessage(`คุณได้ ${score} แต้ม — จั่วต่อหรือหยุด`);
  };

  const stand = () => {
    if (!gameActive || playerStanding) return;
    setPlayerStanding(true);
    setMessage('Dealer กำลังเปิดไพ่...');
    setTimeout(() => dealerTurn(), 250);
  };

  const reset = () => {
    setGameActive(false);
    setPlayerStanding(false);
    setPlayerHand([]);
    setDealerHand([]);
    setDeck([]);
    setResult(null);
    setMessage('เดิมพันแล้วลองเอาชนะ Dokkaebi Dealer AI ให้ได้!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-3">
        <Gamepad2 className="w-5 h-5 text-cyan-400" />
        <div>
          <div className="text-sm font-black text-white">CARD 21 — AI PRACTICE</div>
          <div className="text-[11px] text-slate-400">ซ้อมมือกับ Dokkaebi Dealer AI เท่านั้น</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-emerald-300 font-bold">
          <Bot className="w-4 h-4" /> AI ONLINE
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6">
        {!gameActive && !result && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-cyan-400" />
              </div>
              <h2 className="text-xl font-black text-white">ซ้อมมือกับ Dokkaebi Dealer AI</h2>
              <p className="text-sm text-slate-400">เล่น Card 21 แบบผู้เล่นคนเดียว ไม่มีห้องดวลระหว่างผู้เล่น</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-400">เดิมพัน (Coins)</label>
                <div className="mt-2 flex gap-2">
                  {[200, 500, 1000].map(amount => (
                    <button key={amount} onClick={() => setBetAmount(amount)} className={`flex-1 rounded-xl px-3 py-3 text-sm font-black border transition ${betAmount === amount ? 'bg-cyan-600/30 border-cyan-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                      {amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={startGame} className="rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-3 font-black text-white shadow-lg hover:scale-[1.01] transition">
                เริ่มเกม
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded-xl p-3">
              <Coins className="w-4 h-4" /> Coins ของคุณ: {currentUser.coins.toLocaleString()}
            </div>
          </div>
        )}

        {(gameActive || result) && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-cyan-400 font-mono">CARD 21</div>
                <h2 className="text-lg font-black text-white">Dokkaebi Dealer AI</h2>
              </div>
              <div className="text-right text-xs text-amber-300 font-bold">เดิมพัน {betAmount.toLocaleString()} Coins</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-300">Dealer</span>
                <span className="text-lg font-black text-white">{result ? dealerScore : (dealerHand.length ? '??' : 0)}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {dealerHand.map((card, i) => <CardView key={i} card={card} hidden={!result && i === 1} />)}
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-300">คุณ</span>
                <span className="text-lg font-black text-cyan-300">{playerScore}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {playerHand.map((card, i) => <CardView key={i} card={card} />)}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-300 rounded-xl bg-slate-800/60 p-3">
              {result ? (result.winner === 'player' ? <Trophy className="w-5 h-5 text-amber-300" /> : result.winner === 'tie' ? <CheckCircle className="w-5 h-5 text-cyan-300" /> : <AlertCircle className="w-5 h-5 text-rose-300" />) : <Bot className="w-5 h-5 text-cyan-400" />}
              <span>{result?.reason || message}</span>
            </div>

            {gameActive && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={drawCard} disabled={playerStanding} className="rounded-xl bg-cyan-600 px-4 py-3 font-black text-white disabled:opacity-40">จั่วไพ่</button>
                <button onClick={stand} disabled={playerStanding} className="rounded-xl bg-slate-700 px-4 py-3 font-black text-white disabled:opacity-40">หยุด</button>
              </div>
            )}

            {result && (
              <button onClick={reset} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-black text-white hover:bg-slate-700 transition flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> เล่นอีกครั้ง
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
