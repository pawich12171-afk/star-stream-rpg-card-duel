import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import type { Item } from '../types';

interface ItemPickerProps {
  items: Item[];
  value: string;
  onChange: (itemId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export const ItemPicker: React.FC<ItemPickerProps> = ({ items, value, onChange, placeholder = 'ค้นหาไอเทมด้วยชื่อหรือ ID...', emptyLabel = 'ไม่เลือกไอเทม', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = items.find(item => item.id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return items;
    return items.filter(item =>
      String(item.name || '').toLocaleLowerCase().includes(q) ||
      String(item.id || '').toLocaleLowerCase().includes(q) ||
      String(item.rarity || '').toLocaleLowerCase().includes(q) ||
      String(item.category || '').toLocaleLowerCase().includes(q)
    );
  }, [items, search]);
  const choose = (itemId: string) => { onChange(itemId); setOpen(false); setSearch(''); };

  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(prev => !prev)} className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none flex items-center justify-between gap-2 text-left">
        <span className={selected ? 'truncate' : 'text-slate-500 truncate'}>{selected ? `${selected.name} [${selected.rarity || 'common'}]` : emptyLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
      {open && <>
        <button type="button" aria-label="ปิดรายการไอเทม" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-800">
            <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-700 px-3">
              <Search className="w-4 h-4 text-slate-500 shrink-0" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} placeholder={placeholder} className="w-full bg-transparent outline-none py-2.5 text-xs text-white" />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {value && <button type="button" onClick={() => choose('')} className="w-full rounded-xl px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-800">{emptyLabel}</button>}
            {filtered.length === 0 ? <div className="px-3 py-8 text-center text-xs text-slate-500">ไม่พบไอเทมที่ค้นหา</div> : filtered.map(item => (
              <button key={item.id} type="button" onClick={() => choose(item.id)} className={`w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-800 flex items-center gap-2 ${item.id === value ? 'bg-cyan-500/10 border border-cyan-500/20' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-white">{item.adminOnly ? '🎁 ' : ''}{item.name}</span>
                  <span className="block truncate text-[10px] text-slate-500">ID: {item.id} · {item.rarity || 'common'} · {item.category || 'consumable'}</span>
                </span>
                {item.id === value && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </>}
    </div>
  );
};
