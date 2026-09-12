import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/StatusWindow.tsx');
let source = fs.readFileSync(file, 'utf8');

// Fix rapid +/- stat clicks. The old handlers could capture an old tempStats
// object, so 3 quick clicks could turn 101 -> 102 instead of 104.
source = source.replace(
  /setTempStats\(\{\s*\.\.\.tempStats,\s*(strength|durability|agility|magic):\s*tempStats\.\1\s*([+-])\s*(\d+)\s*\}\)/g,
  (_m, stat, op, amount) => `setTempStats(prev => ({ ...prev, ${stat}: prev.${stat} ${op} ${amount} }))`
);

// Keep the edit form synchronized with the character actually selected.
if (!source.includes("const statusEditCharacterIdRef")) {
  source = source.replace(
    "import React, { useState } from 'react';",
    "import React, { useEffect, useRef, useState } from 'react';"
  );
  const anchor = "  const [newCharacteristic, setNewCharacteristic] = useState('');\n";
  const insert = `${anchor}\n  const statusEditCharacterIdRef = useRef<string>('');\n\n  // Refresh the editor from the latest saved character whenever the modal opens\n  // or the selected character changes. Do not overwrite edits while the modal is open.\n  useEffect(() => {\n    if (!showStatEditModal || statusEditCharacterIdRef.current !== character.id) {\n      setTempStats({ ...character.stats });\n      setTempHp(character.hp);\n      setTempMaxHp(character.maxHp);\n      setTempBuffs(character.statusBuffs || '');\n      setTempCharacteristics([...(character.characteristics || [])]);\n      statusEditCharacterIdRef.current = character.id;\n    }\n  }, [character, showStatEditModal]);\n`;
  if (!source.includes(anchor)) throw new Error('Status editor state anchor not found');
  source = source.replace(anchor, insert);
}

// Always send a fresh revision when saving the complete status form.
source = source.replace(
  "      characteristics: tempCharacteristics,\n    };\n    onUpdateCharacter(syncCharacterHealth(updated));",
  "      characteristics: [...tempCharacteristics],\n      lastUpdated: Date.now() + 1,\n    };\n    onUpdateCharacter(syncCharacterHealth(updated));"
);

fs.writeFileSync(file, source, 'utf8');
console.log('Status rapid-click and editor synchronization fixes applied.');
