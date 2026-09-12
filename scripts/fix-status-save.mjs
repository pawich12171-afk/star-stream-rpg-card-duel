import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/StatusWindow.tsx');
let source = fs.readFileSync(file, 'utf8');

// Keep a mutable latest-character ref so every Status action uses the newest
// character instead of a stale React closure when several saves happen quickly.
source = source.replace(
  "import React, { useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';"
);

if (!source.includes('const latestCharacterRef = useRef<CharacterProfile>(character);')) {
  const anchor = "  const [newCharacteristic, setNewCharacteristic] = useState('');\n";
  if (!source.includes(anchor)) throw new Error('StatusWindow state anchor not found');
  const helper = `
  const latestCharacterRef = useRef<CharacterProfile>(character);

  useEffect(() => {
    const incomingVersion = Number(character.lastUpdated) || 0;
    const localVersion = Number(latestCharacterRef.current.lastUpdated) || 0;
    if (latestCharacterRef.current.id !== character.id || incomingVersion >= localVersion) {
      latestCharacterRef.current = character;
    }
  }, [character]);

  const commitCharacterUpdate = (updated: CharacterProfile) => {
    const committed = {
      ...updated,
      lastUpdated: Math.max(Date.now(), Number(updated.lastUpdated) || 0),
    };
    latestCharacterRef.current = committed;
    onUpdateCharacter(committed);
  };
`;
  source = source.replace(anchor, anchor + helper);
}

function patchHandler(source, handlerName, nextHandlerName) {
  const startToken = `  const ${handlerName} = `;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Handler not found: ${handlerName}`);
  const end = nextHandlerName
    ? source.indexOf(`  const ${nextHandlerName} = `, start + startToken.length)
    : source.indexOf('\n  return (', start + startToken.length);
  if (end < 0) throw new Error(`Handler end not found: ${handlerName}`);

  let block = source.slice(start, end);
  if (!block.includes('const baseCharacter = latestCharacterRef.current;')) {
    const firstBrace = block.indexOf('{');
    block = block.slice(0, firstBrace + 1) +
      '\n    const baseCharacter = latestCharacterRef.current;' +
      block.slice(firstBrace + 1);
  }

  block = block.replace(/\bcharacter\b/g, 'baseCharacter');
  block = block.replace(/onUpdateCharacter\(/g, 'commitCharacterUpdate(');
  source = source.slice(0, start) + block + source.slice(end);
  return source;
}

source = patchHandler(source, 'handleUpgradeTranscendenceStat', 'handleUpgradeSkill');
source = patchHandler(source, 'handleUpgradeSkill', 'handleDeleteSkill');
source = patchHandler(source, 'handleDeleteSkill', 'handleAddCustomSkill');
source = patchHandler(source, 'handleAddCustomSkill', 'handleAddCharacteristic');
source = patchHandler(source, 'handleSaveStats', null);

// IMPORTANT: syncCharacterHealth intentionally applies admin modifiers on top of
// adminBalanceSnapshot. If the user edits the displayed/effective Status value
// directly (for example 101 -> 104), sync would otherwise rebuild it from the old
// snapshot and turn 104 back into 102. Before syncing, convert the requested final
// values into the new base snapshot so sync returns exactly what was entered.
const saveStart = source.indexOf('  const handleSaveStats = ');
if (saveStart < 0) throw new Error('handleSaveStats not found after patching');
const saveEnd = source.indexOf('\n  return (', saveStart);
if (saveEnd < 0) throw new Error('handleSaveStats end not found');
let saveBlock = source.slice(saveStart, saveEnd);

const marker = '    const adminModifiers = baseCharacter.adminBalanceModifiers || [];';
if (!saveBlock.includes(marker)) {
  const insertAfter = '    const baseCharacter = latestCharacterRef.current;';
  const at = saveBlock.indexOf(insertAfter);
  if (at < 0) throw new Error('latest character anchor missing in handleSaveStats');
  const insertPos = at + insertAfter.length;
  const reconciliation = `

    const adminModifiers = baseCharacter.adminBalanceModifiers || [];
    const signedModifier = (modifier: any) => modifier.mode === 'buff' ? Number(modifier.amount || 0) : -Number(modifier.amount || 0);
    const statKeys = ['strength', 'durability', 'agility', 'magic'] as const;
    let adminSnapshot = baseCharacter.adminBalanceSnapshot;

    if (adminModifiers.length > 0) {
      const baseStats = { ...tempStats };
      for (const key of statKeys) {
        const delta = adminModifiers
          .filter((modifier: any) => modifier.kind === 'stat' && modifier.stat === key)
          .reduce((sum: number, modifier: any) => sum + signedModifier(modifier), 0);
        baseStats[key] = Math.max(0, Number(tempStats[key] || 0) - delta);
      }

      const maxHpDelta = adminModifiers
        .filter((modifier: any) => modifier.kind === 'hp' && modifier.id.startsWith('admin-maxhp-'))
        .reduce((sum: number, modifier: any) => sum + signedModifier(modifier), 0);
      const hpDelta = adminModifiers
        .filter((modifier: any) => modifier.kind === 'hp' && !modifier.id.startsWith('admin-maxhp-'))
        .reduce((sum: number, modifier: any) => sum + signedModifier(modifier), 0);

      adminSnapshot = adminSnapshot
        ? {
            ...adminSnapshot,
            stats: baseStats,
            hp: Math.max(0, Number(tempHp) - hpDelta),
            maxHp: Math.max(1, Number(tempMaxHp) - maxHpDelta),
            capturedAt: Date.now(),
          }
        : {
            stats: baseStats,
            hp: Math.max(0, Number(tempHp) - hpDelta),
            maxHp: Math.max(1, Number(tempMaxHp) - maxHpDelta),
            skills: (baseCharacter.skills || []).map((skill) => ({ ...skill })),
            capturedAt: Date.now(),
          };
    }
`;
  saveBlock = saveBlock.slice(0, insertPos) + reconciliation + saveBlock.slice(insertPos);
}

// Add the reconciled snapshot to the object saved by the Status editor.
if (!saveBlock.includes('adminBalanceSnapshot: adminSnapshot')) {
  const characteristicsLine = '      characteristics: tempCharacteristics,';
  if (!saveBlock.includes(characteristicsLine)) throw new Error('Status save object anchor not found');
  saveBlock = saveBlock.replace(
    characteristicsLine,
    `${characteristicsLine}\n      adminBalanceSnapshot: adminSnapshot,\n      lastUpdated: Date.now() + 1,`
  );
}

source = source.slice(0, saveStart) + saveBlock + source.slice(saveEnd);

// Functional state updates prevent rapid clicks from using one stale tempStats object.
source = source.replace(
  /setTempStats\(\{\s*\.\.\.tempStats,\s*(strength|durability|agility|magic):\s*tempStats\.\1\s*([+-])\s*(\d+)\s*\}\)/g,
  (_m, stat, op, amount) => `setTempStats(prev => ({ ...prev, ${stat}: prev.${stat} ${op} ${amount} }))`
);

fs.writeFileSync(file, source, 'utf8');
console.log('Status exact-value save fix applied.');
