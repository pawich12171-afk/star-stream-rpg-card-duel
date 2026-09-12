import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src/App.tsx');
const gachaPath = path.join(root, 'src/components/GachaSystem.tsx');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text, 'utf8'); }

// ---------- App: synchronous latest character state ----------
let app = read(appPath);
app = app.replace(
  "import React, { useState, useEffect } from 'react';",
  "import React, { useState, useEffect, useRef } from 'react';"
);

const currentUserMarker = "  const currentUser = characters.find(c => c.id === currentUserId) || characters[0];";
if (!app.includes('const latestCharactersRef = useRef<CharacterProfile[]>(characters);')) {
  if (!app.includes(currentUserMarker)) throw new Error('App currentUser marker not found');
  app = app.replace(currentUserMarker, `  const latestCharactersRef = useRef<CharacterProfile[]>(characters);\n  useEffect(() => { latestCharactersRef.current = characters; }, [characters]);\n\n${currentUserMarker}`);
}

// Keep the synchronous ref current when Firestore emits a snapshot.
app = app.replace(/\s*setCharacters\(chars\);\s*setIsRealtimeLinked\(true\);/, `\n        latestCharactersRef.current = chars;\n        setCharacters(chars);\n        setIsRealtimeLinked(true);`);

const handlerStart = app.indexOf('  const handleUpdateCharacter = async (updated: CharacterProfile)');
if (handlerStart < 0) throw new Error('App handleUpdateCharacter not found');
const handlerEnd = app.indexOf('\n  };', handlerStart);
if (handlerEnd < 0) throw new Error('App handleUpdateCharacter end not found');
const handlerEndPos = handlerEnd + 5;
const newHandler = `  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    // React state is asynchronous. Actions such as Gacha/Status/Shop can fire
    // several times before a render. Always commit from this synchronous ref.
    const latest = latestCharactersRef.current;
    const previous = latest.find(character => character.id === updated.id);
    const committed: CharacterProfile = {
      ...(previous || {} as CharacterProfile),
      ...updated,
      lastUpdated: Math.max(Date.now(), Number(previous?.lastUpdated || 0) + 1, Number(updated.lastUpdated || 0)),
    };

    latestCharactersRef.current = latest.some(character => character.id === committed.id)
      ? latest.map(character => character.id === committed.id ? committed : character)
      : [...latest, committed];
    setCharacters([...latestCharactersRef.current]);

    try {
      await updateCharacterInDB(committed);
      return true;
    } catch (error) {
      console.error('Failed to persist character update:', error);
      return false;
    }
  };`;
app = app.slice(0, handlerStart) + newHandler + app.slice(handlerEndPos);
write(appPath, app);

// ---------- Gacha: no stale character closure and no 1.2s lock ----------
let gacha = read(gachaPath);
gacha = gacha.replace(
  "import React, { useState } from 'react';",
  "import React, { useState, useRef, useEffect } from 'react';"
);

const gachaStateMarker = "  const [filterRarity, setFilterRarity] = useState<string>('all');";
if (!gacha.includes('const latestCharacterRef = useRef<CharacterProfile>(character);')) {
  if (!gacha.includes(gachaStateMarker)) throw new Error('Gacha state marker not found');
  gacha = gacha.replace(gachaStateMarker, `${gachaStateMarker}\n  const latestCharacterRef = useRef<CharacterProfile>(character);\n  useEffect(() => { latestCharacterRef.current = character; }, [character]);`);
}

// Replace the entire pull function with a synchronous, repeat-safe implementation.
const pullStart = gacha.indexOf('  const handlePull = (count: number) => {');
if (pullStart < 0) throw new Error('Gacha handlePull not found');
const pullEnd = gacha.indexOf('\n  };', pullStart);
if (pullEnd < 0) throw new Error('Gacha handlePull end not found');
const pullEndPos = pullEnd + 5;
const newPull = `  const handlePull = (count: number) => {
    const current = latestCharacterRef.current;
    const cost = count === 1 ? pullCost : tenPullCost;
    if (current.coins < cost) {
      alert(\`เหรียญไม่เพียงพอ ต้องการ \${cost.toLocaleString()} C แต่คุณมี \${current.coins.toLocaleString()} C\`);
      return;
    }
    if (gachaRewards.length === 0) {
      alert('ขณะนี้ไม่มีรายการของรางวัลในตู้กาชา');
      return;
    }

    const results: GachaReward[] = [];
    let totalCoinReward = 0;
    const newItemsToAdd: InventoryItem[] = [];
    const newSkillsToAdd: Skill[] = [];
    const newCharacteristicsToAdd: string[] = [];
    const actionId = Date.now();

    for (let i = 0; i < count; i++) {
      const reward = pickRandomReward(gachaRewards);
      results.push(reward);
      if (reward.type === 'coin' && reward.coinAmount) totalCoinReward += reward.coinAmount;
      else if (reward.type === 'item' && reward.itemData) {
        newItemsToAdd.push({ ...reward.itemData, quantity: 1, instanceId: \`inv-gacha-\${actionId}-\${i}\`, isEquipped: false });
      } else if (reward.type === 'skill') {
        const fallbackRank: Skill['orvRank'] = reward.rarity === 'mythic' ? 'myth' : reward.rarity === 'legendary' ? 'legendary' : reward.rarity === 'epic' ? 'hero' : reward.rarity === 'rare' ? 'rare' : 'general';
        const skillReward: Skill = reward.skillData || {
          id: reward.id, name: reward.name.replace(/^สกิล:\\s*/i, ''), level: 1, multiplier: 1,
          type: 'วิชาจากกาชา', description: reward.description || 'สกิลที่ได้รับจากตู้กาชา', category: 'general', orvRank: fallbackRank,
          battleEffect: /สะท้อน|reflect/i.test(\`\${reward.name} \${reward.description}\`) ? 'reflect' : /ฟื้น|รักษา|heal/i.test(\`\${reward.name} \${reward.description}\`) ? 'heal' : /ป้องกัน|เกราะ|โล่|shield/i.test(\`\${reward.name} \${reward.description}\`) ? 'defense' : 'damage',
          battlePower: 5, cooldownTurns: 3, cooldown: '3 เทิร์น'
        };
        newSkillsToAdd.push({ ...skillReward, id: \`skill-gacha-\${actionId}-\${i}\`, upgradeCount: 0 });
      } else if (reward.type === 'characteristic' && reward.characteristic?.trim()) newCharacteristicsToAdd.push(reward.characteristic.trim());
    }

    const inventory = [...(current.inventory || [])];
    for (const item of newItemsToAdd) {
      const idx = inventory.findIndex(inv => inv.id === item.id && !inv.isEquipped && item.category === 'consumable');
      if (idx >= 0) inventory[idx] = { ...inventory[idx], quantity: inventory[idx].quantity + 1 };
      else inventory.push(item);
    }

    const skills = [...(current.skills || [])];
    for (const newSkill of newSkillsToAdd) {
      const existing = skills.find(s => s.name === newSkill.name);
      if (existing) {
        existing.level = Math.min(10, existing.level + 1);
        existing.battleEffect = newSkill.battleEffect ?? existing.battleEffect;
        existing.battlePower = newSkill.battlePower ?? existing.battlePower;
        existing.cooldownTurns = newSkill.cooldownTurns ?? existing.cooldownTurns;
        existing.cooldown = newSkill.cooldown ?? existing.cooldown;
      } else skills.push(newSkill);
    }

    const characteristics = [...(current.characteristics || [])];
    for (const value of newCharacteristicsToAdd) {
      if (!characteristics.some(c => c.trim().toLowerCase() === value.toLowerCase())) characteristics.push(value);
    }

    const updated: CharacterProfile = {
      ...current,
      coins: Math.max(0, current.coins + totalCoinReward - cost),
      inventory,
      skills,
      characteristics,
      notifications: [{
        id: \`notif-gacha-\${actionId}\`, title: \`สุ่มกาชาสำเร็จ (\${count} ครั้ง)\`,
        message: \`ได้รับรางวัล: \${results.map(r => r.name).slice(0, 3).join(', ')}\${results.length > 3 ? \` และอื่นๆ อีก \${results.length - 3} รายการ\` : ''}\`,
        timestamp: actionId, read: false, type: 'gacha' as const
      }, ...(current.notifications || [])]
    };

    // Advance the ref BEFORE calling the parent. The next click therefore sees
    // this exact balance/inventory even if React has not rendered yet.
    latestCharacterRef.current = updated;
    onUpdateCharacter(updated);
    setPullResults(results);
    const hasHighTier = results.some(r => r.rarity === 'mythic' || r.rarity === 'legendary');
    if (hasHighTier) confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
  };`;
gacha = gacha.slice(0, pullStart) + newPull + gacha.slice(pullEndPos);

// The old UI lock must never disable rapid pulls.
gacha = gacha.replace(/disabled=\{isPulling[^}]*\}/g, 'disabled={false}');
write(gachaPath, gacha);

console.log('Applied all-system realtime latest-state fixes.');
