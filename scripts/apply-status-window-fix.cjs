const fs = require('fs');
const file = 'src/components/StatusWindow.tsx';
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  "import React, { useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';"
);

if (!s.includes('const latestCharacterRef = useRef<CharacterProfile>(character);')) {
  const anchor = "  const [newCharacteristic, setNewCharacteristic] = useState('');\n";
  const helper = [
    "  const latestCharacterRef = useRef<CharacterProfile>(character);",
    "",
    "  useEffect(() => {",
    "    latestCharacterRef.current = character;",
    "  }, [character]);",
    "",
    "  const commitCharacterUpdate = (updated: CharacterProfile) => {",
    "    const committed = { ...updated, lastUpdated: Date.now() };",
    "    latestCharacterRef.current = committed;",
    "    onUpdateCharacter(committed);",
    "  };",
    ""
  ].join("\n");
  if (s.includes(anchor)) s = s.replace(anchor, anchor + helper, 1);
}

const start = s.indexOf('  const handleSaveStats = ');
const end = s.indexOf('\n  return (', start);
if (start < 0 || end < 0) throw new Error('handleSaveStats not found');

const save = [
  "  const handleSaveStats = () => {",
  "    const latest = latestCharacterRef.current;",
  "    const updated: CharacterProfile = {",
  "      ...latest,",
  "      stats: { ...tempStats },",
  "      hp: Number(tempHp),",
  "      maxHp: Number(tempMaxHp),",
  "      statusBuffs: tempBuffs,",
  "      characteristics: [...tempCharacteristics],",
  "      lastUpdated: Date.now(),",
  "    };",
  "",
  "    // Direct Status edits are authoritative. Do not rebuild them from stale admin snapshots.",
  "    commitCharacterUpdate(updated);",
  "    setShowStatEditModal(false);",
  "  };"
].join("\n");
s = s.slice(0, start) + save + s.slice(end);

s = s.replace(
  /setTempStats\(\{\s*\.\.\.tempStats,\s*(strength|durability|agility|magic):\s*tempStats\.\1\s*([+-])\s*(\d+)\s*\}\)/g,
  function(_, stat, op, amount) {
    return "setTempStats(prev => ({ ...prev, " + stat + ": prev." + stat + " " + op + " " + amount + " }))";
  }
);

fs.writeFileSync(file, s, 'utf8');
console.log('StatusWindow fix applied');
