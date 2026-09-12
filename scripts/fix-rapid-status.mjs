import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/StatusWindow.tsx');
let s = fs.readFileSync(file, 'utf8');

// React handlers close over the previous render. During rapid clicks every click
// could therefore calculate from the same value (e.g. 101 -> 102). Keep a
// synchronous ref that is advanced immediately after each accepted upgrade.
s = s.replace(
  "import React, { useState } from 'react';",
  "import React, { useRef, useState } from 'react';"
);

const componentAnchor = "}) => {\n  const [showAddSkillModal";
if (!s.includes(componentAnchor)) throw new Error('StatusWindow component anchor not found');
if (!s.includes('const latestStatusCharacterRef = useRef<CharacterProfile>(character);')) {
  s = s.replace(
    componentAnchor,
    "}) => {\n  const latestStatusCharacterRef = useRef<CharacterProfile>(character);\n\n  const [showAddSkillModal"
  );
}

const start = s.indexOf('  const handleUpgradeTranscendenceStat = ');
const end = s.indexOf('  const handleUpgradeSkill = ', start);
if (start < 0 || end < 0) throw new Error('Status upgrade handler boundaries not found');

const handler = `  const handleUpgradeTranscendenceStat = (statName: 'strength' | 'durability' | 'agility' | 'magic') => {
    const base = latestStatusCharacterRef.current;
    const allStats100 = base.stats.strength >= 100 && base.stats.durability >= 100 && base.stats.agility >= 100 && base.stats.magic >= 100;
    const upgradeTimes = base.statUpgradeCount || 0;
    const cost = calculateStatUpgradeCost(upgradeTimes);

    if (!allStats100) {
      alert('ต้องมีสเตตัสครบ 100 ทุกค่าก่อนจึงจะปลดล็อกการอัปเกรดทะลุขีดจำกัด!');
      return;
    }
    if (base.coins < cost) {
      alert(\`เหรียญไม่เพียงพอ ต้องการ \${cost.toLocaleString()} Coins (คุณมี \${base.coins.toLocaleString()} Coins)\`);
      return;
    }

    const now = Date.now();
    const nextTimes = upgradeTimes + 1;
    const newStats = {
      ...base.stats,
      [statName]: Number(base.stats[statName] || 0) + 1,
    };
    const nextCost = Math.round(cost * COMPOUND_RATE);
    const updatedChar: CharacterProfile = {
      ...base,
      coins: base.coins - cost,
      stats: newStats,
      statUpgradeCount: nextTimes,
      lastUpdated: Math.max(now, Number(base.lastUpdated) || 0) + 1,
      notifications: [
        {
          id: \`notif-stat-up-\${now}-\${nextTimes}\`,
          title: 'อัปเกรดสเตตัสทะลุขีดจำกัดสำเร็จ!',
          message: \`เพิ่มค่า \${statName} +1 (ปัจจุบัน Lv.\${newStats[statName]}) ใช้เหรียญ \${cost.toLocaleString()} Coins (ครั้งต่อไป +20% เป็น \${nextCost.toLocaleString()} C)\`,
          timestamp: now,
          read: false,
          type: 'system',
        },
        ...(base.notifications || []),
      ],
    };

    // Advance synchronously BEFORE React/Firebase can deliver another render.
    latestStatusCharacterRef.current = updatedChar;
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.5 } });
    onUpdateCharacter(syncCharacterHealth(updatedChar));
  };

`;
s = s.slice(0, start) + handler + s.slice(end);

fs.writeFileSync(file, s, 'utf8');
console.log('Rapid Status upgrade fix applied.');
