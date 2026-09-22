import React, { useState } from 'react';
import { Coins, Dices, CircleDot, Sparkles, Target, Trophy, RotateCcw, Gamepad2 } from 'lucide-react';
import { CharacterProfile } from '../types';

interface GameCenterProps {
  currentUser: CharacterProfile;
  onUpdateCharacter: (updated: CharacterProfile) => void;
}

type GameId = 'coin' | 'dice' | 'number' | 'wheel';

const GAMES: Array<{ id: GameId; title: string; description: string; icon: React.ReactNode }> = [
  { id: 'coin', title: 'หัวหรือก้อย', description: 'ทายผลเหรียญ 50/50', icon: <CircleDot className="w-6 h-6" /> },
  { id: 'dice', title: 'ดวลลูกเต๋า', description: 'ทอยลูกเต๋าแข่งกับ Dealer', icon: <Dices className="w-6 h-6" /> },
  { id: 'number', title: 'ทายเลขจักรวาล', description: 'ทายเลข 1–10 ให้ตรงกับระบบ', icon: <Target className="w-6 h-6" /> },
  { id: 'wheel', title: 'วงล้อแห่งโชค', description: 'เลือกช่องแล้วหมุนวงล้อ', icon: <Sparkles className="w-6 h-6" /> },
];

export const GameCenter: React.FC<GameCenterProps> = ({ currentUser, onUpdateCharacter }) => {
  const [activeGame, setActiveGame] = useState<GameId>('coin');
  const [bet, setBet] = useState(200);
  const [choice, setChoice] = useState('หัว');
  const [number, setNumber] = useState(5);
  const [wheelChoice, setWheelChoice] = useState('STAR');
  const [message, setMessage] = useState('เลือกเกมและเดิมพันเพื่อเริ่มเล่น');
  const [busy, setBusy] = useState(false);

  const settle = (won: boolean, text: string) => {
    const safeBet = Math.max(1, Math.floor(bet));
    if (currentUser.coins < safeBet) {
      setMessage(`Coins ไม่พอ ต้องการ ${safeBet.toLocaleString()} แต่คุณมี ${currentUser.coins.toLocaleString()} Coins`);
      return false;
    }
    onUpdateCharacter({
      ...currentUser,
      coins: Math.max(0, currentUser.coins + (won ? safeBet : -safeBet)),
      lastUpdated: Date.now(),
    });
    setMessage(won ? `ชนะ! รับกำไร ${safeBet.toLocaleString()} Coins — ${text}` : `แพ้! เสียเดิมพัน ${safeBet.toLocaleString()} Coins — ${text}`);
    return true;
  };

  const play = () => {
    if (busy) return;
    setBusy(true);
    const safeBet = Math.max(1, Math.floor(bet));
    if (currentUser.coins < safeBet) {
      setMessage(`Coins ไม่พอ ต้องการ ${safeBet.toLocaleString()} Coins`);
      setBusy(false);
      return;
    }
    setBet(safeBet);

    if (activeGame === 'coin') {
      const result = Math.random() < 0.5 ? 'หัว' : 'ก้อย';
      settle(choice === result, `ระบบออก “${result}”`);
    } else if (activeGame === 'dice') {
      const player = 1 + Math.floor(Math.random() * 6);
      const dealer = 1 + Math.floor(Math.random() * 6);
      if (player === dealer) {
        setMessage(`เสมอ! คุณ ${player} แต้ม / Dealer ${dealer} แต้ม — ไม่เสียหรือได้ Coins`);
      } else {
        settle(player > dealer, `คุณทอยได้ ${player} / Dealer ได้ ${dealer}`);
      }
    } else if (activeGame === 'number') {
      const result = 1 + Math.floor(Math.random() * 10);
      settle(number === result, `ระบบสุ่มได้เลข ${result}`);
    } else {
      const slots = ['STAR', 'MOON', 'SUN', 'VOID'];
      const result = slots[Math.floor(Math.random() * slots.length)];
      settle(wheelChoice === result, `วงล้อหยุดที่ ${result}`);
    }

    window.setTimeout(() => setBusy(false), 450);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-mono tracking-widest text-cyan-400">STAR STREAM ARCADE</div>
            <h2 className="text-2xl font-black text-white">กิจกรรมเกม</h2>
            <p className="text-sm text-slate-400">เกมเสี่ยงดวงหลายแบบ ใช้ Coins เป็นเดิมพัน และรับกำไรแบบเดียวกับศึกดวลไพ่</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2 rounded-xl bg-amber-950/40 border border-amber-500/30 px-3 py-2 text-amber-300 font-black text-sm">
            <Coins className="w-4 h-4" /> {currentUser.coins.toLocaleString()} C
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {GAMES.map(game => (
          <button
            key={game.id}
            onClick={() => { setActiveGame(game.id); setMessage('เลือกเดิมพันแล้วกดเริ่มเกม'); }}
            className={`text-left rounded-2xl border p-4 transition ${activeGame === game.id ? 'border-cyan-400 bg-cyan-950/40 shadow-lg' : 'border-slate-800 bg-slate-900 hover:bg-slate-800'}`}
          >
            <div className="text-cyan-300 mb-3">{game.icon}</div>
            <div className="font-black text-white">{game.title}</div>
            <div className="text-xs text-slate-400 mt-1">{game.description}</div>
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono tracking-widest text-cyan-400">GAME #{GAMES.findIndex(g => g.id === activeGame) + 1}</div>
            <h3 className="text-xl font-black text-white">{GAMES.find(g => g.id === activeGame)?.title}</h3>
          </div>
          <Trophy className="w-6 h-6 text-amber-300" />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400">เดิมพัน Coins</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[200, 500, 1000].map(v => (
              <button key={v} onClick={() => setBet(v)} className={`rounded-xl border px-3 py-3 font-black ${bet === v ? 'border-cyan-400 bg-cyan-950/50 text-white' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
                {v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {activeGame === 'coin' && (
          <div className="grid grid-cols-2 gap-3">
            {['หัว', 'ก้อย'].map(v => <button key={v} onClick={() => setChoice(v)} className={`rounded-2xl p-5 text-xl font-black border ${choice === v ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-800 text-white'}`}>{v}</button>)}
          </div>
        )}

        {activeGame === 'number' && (
          <div>
            <label className="text-xs font-bold text-slate-400">เลือกเลข 1–10</label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mt-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(v => <button key={v} onClick={() => setNumber(v)} className={`rounded-xl p-3 font-black border ${number === v ? 'border-cyan-400 bg-cyan-950/50 text-white' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>{v}</button>)}
            </div>
          </div>
        )}

        {activeGame === 'wheel' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['STAR', 'MOON', 'SUN', 'VOID'].map(v => <button key={v} onClick={() => setWheelChoice(v)} className={`rounded-2xl p-5 font-black border ${wheelChoice === v ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-800 text-white'}`}>{v}</button>)}
          </div>
        )}

        {activeGame === 'dice' && (
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-5 text-center text-slate-300">
            🎲 กดเริ่มเกม ระบบจะทอย 1–6 ให้คุณและ Dealer อัตโนมัติ
          </div>
        )}

        <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 text-center text-sm text-slate-300 min-h-12">
          {message}
        </div>

        <button onClick={play} disabled={busy} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-4 font-black text-white shadow-lg disabled:opacity-50">
          {busy ? 'กำลังสุ่ม...' : 'เริ่มเกม / เล่นอีกครั้ง'}
        </button>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>ชนะ = +เดิมพัน • แพ้ = -เดิมพัน • ดวลลูกเต๋าเสมอ = คืนเดิมพัน</span>
          <button onClick={() => setMessage('เลือกเกมและเดิมพันเพื่อเริ่มเล่น')} className="flex items-center gap-1 hover:text-white"><RotateCcw className="w-3 h-3" /> รีเซ็ต</button>
        </div>
      </div>
    </div>
  );
};
