import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Users } from 'lucide-react';
import { CharacterProfile, ChatMessage } from '../types';

interface ChatPanelProps {
  currentUser: CharacterProfile;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ currentUser, messages, onSendMessage }) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try { await onSendMessage(text); setDraft(''); }
    catch (error) { alert(error instanceof Error ? error.message : 'ส่งข้อความไม่สำเร็จ'); }
    finally { setSending(false); }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  return <div className="space-y-4">
    <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-cyan-400" /> แชทผู้เล่น (Player Chat)</h2>
          <p className="text-xs text-slate-400 mt-1">พูดคุยกับผู้เล่นคนอื่นใน Star Stream</p>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-cyan-950/50 border border-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {messages.length} ข้อความ</div>
      </div>
    </div>
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 shadow-xl overflow-hidden">
      <div className="h-[55vh] min-h-[360px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-center text-slate-500"><MessageCircle className="w-12 h-12 mb-3 text-slate-700" /><p className="text-sm font-bold">ยังไม่มีข้อความ</p><p className="text-xs mt-1">เริ่มบทสนทนาได้เลย!</p></div> : messages.map(msg => {
          const mine = msg.senderId === currentUser.id;
          return <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <img src={msg.senderAvatar || ''} alt="" className="w-8 h-8 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0" />
              <div className={mine ? 'text-right' : 'text-left'}>
                <div className="text-[10px] text-slate-500 mb-1">{msg.senderName} · {new Date(msg.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className={`inline-block rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${mine ? 'bg-cyan-600 text-white rounded-tr-md' : 'bg-slate-800 text-slate-200 rounded-tl-md'}`}>{msg.message}</div>
              </div>
            </div>
          </div>;
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-800 p-3 bg-slate-950/60">
        <div className="flex gap-2">
          <input value={draft} maxLength={300} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} placeholder="พิมพ์ข้อความ..." className="flex-1 min-w-0 rounded-2xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-500/60" />
          <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} className="px-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Send className="w-4 h-4" /></button>
        </div>
        <div className="text-[10px] text-slate-600 mt-1.5 text-right">{draft.length}/300</div>
      </div>
    </div>
    </div>
  </div>;
};
