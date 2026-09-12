import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "import React, { useState, useEffect } from 'react';",
  "import React, { useState, useEffect, useRef } from 'react';"
);

const stateAnchor = "  const [isAdminMode, setIsAdminMode] = useState<boolean>(true);\n";
if (!source.includes('const characterSaveQueuesRef = useRef<Map<string, Promise<void>>>(new Map());')) {
  if (!source.includes(stateAnchor)) throw new Error('App state anchor not found');
  source = source.replace(stateAnchor, stateAnchor + `
  // Serialize status writes per character. This prevents a fast calculation/save
  // sequence from writing an older object after the newer one.
  const characterSaveQueuesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const latestCharacterSaveRef = useRef<Map<string, CharacterProfile>>(new Map());
`);
}

const start = source.indexOf('  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {');
const end = source.indexOf('\n  // Keep the React view in sync immediately with admin inventory mutations.', start);
if (start < 0 || end < 0) throw new Error('handleUpdateCharacter block not found');

const replacement = `  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    const id = updated.id;
    const previous = characters.find(character => character.id === id);

    // The newest calculated Status always wins. Put every write for the same
    // character into one FIFO queue so Firestore can never finish an older save
    // after a newer save.
    latestCharacterSaveRef.current.set(id, updated);
    setCharacters(prev => {
      const exists = prev.some(character => character.id === id);
      return exists
        ? prev.map(character => character.id === id ? updated : character)
        : [...prev, updated];
    });

    const previousQueue = characterSaveQueuesRef.current.get(id) || Promise.resolve(true);
    const nextQueue = previousQueue.catch(() => false).then(async () => {
      const newest = latestCharacterSaveRef.current.get(id) || updated;
      try {
        // updateCharacterInDB resolves only after the Firestore write is
        // acknowledged by the backend. Do not start the next write early.
        await updateCharacterInDB(newest);

        const stillLatest = latestCharacterSaveRef.current.get(id);
        if (stillLatest === newest) {
          setCharacters(prev => prev.map(character => character.id === id ? newest : character));
        }
        return true;
      } catch (error) {
        const stillLatest = latestCharacterSaveRef.current.get(id);
        if (stillLatest === newest && previous) {
          latestCharacterSaveRef.current.set(id, previous);
          setCharacters(prev => prev.map(character => character.id === id ? previous : character));
        }
        console.error('Failed to persist character update:', error);
        return false;
      }
    });

    characterSaveQueuesRef.current.set(id, nextQueue);
    const result = await nextQueue;
    if (characterSaveQueuesRef.current.get(id) === nextQueue) {
      characterSaveQueuesRef.current.delete(id);
    }
    if (!result) {
      alert('บันทึกข้อมูลตัวละครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
    return result;
  };
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source, 'utf8');
console.log('Character save race fix applied.');
