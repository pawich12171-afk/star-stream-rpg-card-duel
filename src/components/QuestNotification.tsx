import React from 'react';
import { CharacterProfile, NotificationItem } from '../types';
import { Bell, CheckCircle, Clock, Gift, ShieldAlert, Sparkles, X } from 'lucide-react';

interface QuestNotificationProps {
  character: CharacterProfile;
  onUpdateCharacter: (updated: CharacterProfile) => void;
}

export const QuestNotification: React.FC<QuestNotificationProps> = ({
  character,
  onUpdateCharacter,
}) => {
  const notifications = character.notifications || [];

  const handleMarkAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    onUpdateCharacter({
      ...character,
      notifications: updated,
    });
  };

  const handleClearNotifications = () => {
    onUpdateCharacter({
      ...character,
      notifications: [],
    });
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case 'gacha':
        return <Gift className="w-4 h-4 text-purple-400" />;
      case 'duel':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case 'system':
      default:
        return <Sparkles className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            การแจ้งเตือนและภารกิจดวงดาว ({notifications.length})
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ข้อความสารท้าดวลไพ่ การได้รับเหรียญ และบันทึกประวัติการกระทำใน Star Stream
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notifications.some(n => !n.read) && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              อ่านทั้งหมดแล้ว
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearNotifications}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs font-bold transition-all cursor-pointer"
            >
              ล้างข้อความทั้งหมด
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-slate-850/40 border border-slate-800 text-slate-500 text-xs">
          <Bell className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          ยังไม่มีการแจ้งเตือนใหม่ในขณะนี้
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                !item.read
                  ? 'bg-slate-850 border-cyan-500/50 shadow-md'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 shrink-0 mt-0.5">
                  {getIcon(item.type)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-xs font-bold ${!item.read ? 'text-white' : 'text-slate-300'}`}>
                      {item.title}
                    </h4>
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 pt-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.timestamp).toLocaleString('th-TH')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
