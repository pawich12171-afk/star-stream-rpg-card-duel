import React, { useMemo, useState } from 'react';
import type { CharacterProfile, CraftingRecipe, Item } from '../types';

interface Props {
  character: CharacterProfile;
  shopItems: Item[];
  recipes: CraftingRecipe[];
  isAdmin?: boolean;
  onCraft: (recipe: CraftingRecipe) => Promise<void>;
  onSaveRecipe?: (recipe: CraftingRecipe) => Promise<void>;
  onDeleteRecipe?: (id: string) => Promise<void>;
}

export const CraftingPanel: React.FC<Props> = ({character,shopItems,recipes,isAdmin,onCraft,onSaveRecipe,onDeleteRecipe}) => {
  const [name,setName]=useState(''); const [desc,setDesc]=useState('');
  const [output,setOutput]=useState(''); const [outputQty,setOutputQty]=useState(1);
  const [ingredients,setIngredients]=useState<Array<{itemId:string;quantity:number}>>([{itemId:'',quantity:1}]);
  const counts=useMemo(()=>{const m:Record<string,number>={}; (character.inventory||[]).forEach(i=>m[i.id]=(m[i.id]||0)+(Number(i.quantity)||0)); return m;},[character.inventory]);
  const item=(id:string)=>shopItems.find(x=>x.id===id);
  const addIngredient=()=>setIngredients(x=>[...x,{itemId:'',quantity:1}]);
  const save=async()=>{if(!name.trim()||!output||ingredients.some(x=>!x.itemId||x.quantity<1)){alert('กรอกสูตรให้ครบ');return;} await onSaveRecipe?.({id:'recipe-'+Date.now(),name:name.trim(),description:desc.trim(),ingredients:ingredients.map(x=>({...x,quantity:Math.max(1,Math.floor(x.quantity))})),outputItemId:output,outputQuantity:Math.max(1,Math.floor(outputQty)),enabled:true,createdAt:Date.now(),updatedAt:Date.now()}); setName('');setDesc('');setOutput('');setIngredients([{itemId:'',quantity:1}]);};
  return <div className="space-y-6">
    <div className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-6">
      <h2 className="text-xl font-black text-white">🔨 โรงคราฟต์ / Crafting</h2>
      <p className="text-xs text-slate-400 mt-1">ผู้เล่นเห็นสูตรที่แอดมินเปิดใช้งาน และใช้วัตถุดิบในกระเป๋าคราฟต์ของได้ทันที</p>
      <div className="grid md:grid-cols-2 gap-4 mt-5">{recipes.map(r=>{
        const ready=r.ingredients.every(x=>(counts[x.itemId]||0)>=x.quantity);
        return <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <div className="font-black text-white">{r.name}</div><div className="text-xs text-slate-400 mt-1">{r.description}</div>
          <div className="mt-3 text-sm">{r.ingredients.map((x,i)=><div key={i} className="flex justify-between text-slate-300"><span>{item(x.itemId)?.name||x.itemId}</span><span>{counts[x.itemId]||0}/{x.quantity}</span></div>)}</div>
          <div className="mt-3 rounded-xl bg-cyan-500/10 p-3 text-cyan-200">➡️ ได้ {item(r.outputItemId)?.name||r.outputItemId} × {r.outputQuantity}</div>
          <button disabled={!ready} onClick={()=>onCraft(r)} className="mt-3 w-full rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 disabled:opacity-40">คราฟต์ของ</button>
        </div>;
      })}</div>
    </div>
    {isAdmin && <div className="rounded-3xl border border-fuchsia-500/30 bg-slate-900/80 p-6">
      <h3 className="font-black text-white">⚙️ Admin — ตั้งค่าสูตรคราฟต์</h3>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อสูตร" className="mt-3 w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-white"/>
      <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="วิธีคราฟ / คำอธิบาย" className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-white"/>
      <div className="mt-3 space-y-2">{ingredients.map((x,i)=><div key={i} className="flex gap-2">
        <select value={x.itemId} onChange={e=>setIngredients(a=>a.map((v,j)=>j===i?{...v,itemId:e.target.value}:v))} className="flex-1 rounded-xl bg-slate-950 border border-slate-700 p-2 text-white">
          <option value="">เลือกวัตถุดิบ</option>{shopItems.filter(x=>x.category==='material').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select><input type="number" min="1" value={x.quantity} onChange={e=>setIngredients(a=>a.map((v,j)=>j===i?{...v,quantity:Number(e.target.value)}:v))} className="w-20 rounded-xl bg-slate-950 border border-slate-700 p-2 text-white"/>
      </div>)}<button onClick={addIngredient} className="text-xs text-cyan-300">+ เพิ่มวัตถุดิบ</button></div>
      <div className="flex gap-2 mt-3"><select value={output} onChange={e=>setOutput(e.target.value)} className="flex-1 rounded-xl bg-slate-950 border border-slate-700 p-2 text-white"><option value="">เลือกไอเทมผลลัพธ์</option>{shopItems.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input type="number" min="1" value={outputQty} onChange={e=>setOutputQty(Number(e.target.value))} className="w-20 rounded-xl bg-slate-950 border border-slate-700 p-2 text-white"/></div>
      <button onClick={save} className="mt-4 rounded-xl bg-fuchsia-500 px-5 py-2 font-black text-white">บันทึกสูตร</button>
      <div className="mt-4 space-y-2">{recipes.map(r=><div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs text-white"><span>{r.name}</span><button onClick={()=>onDeleteRecipe?.(r.id)} className="text-rose-300">ลบ</button></div>)}</div>
    </div>}
  </div>;
};
