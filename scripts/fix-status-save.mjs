import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/StatusWindow.tsx');
let source = fs.readFileSync(file, 'utf8');

// Fix the real race: StatusWindow event handlers can keep an older `character`
// snapshot while several updates are being sent to Firestore. Keep a mutable
// latest-character ref for event handlers, while React props remain render data.
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

  // Only replace references inside the handler, never JSX/rendering code.
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

// Also make functional updates for the temporary stat editor so rapid +/-
// clicks cannot calculate from the same stale tempStats snapshot.
source = source.replace(
  /setTempStats\(\{\s*\.\.\.tempStats,\s*(strength|durability|agility|magic):\s*tempStats\.\1\s*([+-])\s*(\d+)\s*\}\)/g,
  (_m, stat, op, amount) => `setTempStats(prev => ({ ...prev, ${stat}: prev.${stat} ${op} ${amount} }))`
);

fs.writeFileSync(file, source, 'utf8');
console.log('Status latest-state fix applied.');
