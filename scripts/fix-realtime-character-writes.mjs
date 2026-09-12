import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = fs.readFileSync(file, 'utf8');

// Make every character write build from a synchronous latest-state ref.
source = source.replace(
  "import React, { useState, useEffect } from 'react';",
  "import React, { useState, useEffect, useRef } from 'react';"
);

const marker = "  const currentUser = characters.find(c => c.id === currentUserId) || characters[0];";
if (!source.includes(marker)) throw new Error('currentUser marker not found');

if (!source.includes('const latestCharactersRef = useRef<CharacterProfile[]>(characters);')) {
  const helpers = `  const latestCharactersRef = useRef<CharacterProfile[]>(characters);\n  useEffect(() => {\n    latestCharactersRef.current = characters;\n  }, [characters]);\n\n`;
  source = source.replace(marker, helpers + marker);
}

const start = source.indexOf('  const handleUpdateCharacter = ');
if (start < 0) throw new Error('handleUpdateCharacter not found');
const end = source.indexOf('\n  };', start);
if (end < 0) throw new Error('handleUpdateCharacter end not found');
const endPos = end + 5;

const handler = `  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    // IMPORTANT: do not depend on React's async render cycle. Each action gets
    // the exact character currently committed by the previous action.
    const current = latestCharactersRef.current.find(c => c.id === updated.id);
    const committed: CharacterProfile = {
      ...(current || {} as CharacterProfile),
      ...updated,
      lastUpdated: Math.max(Date.now(), Number(current?.lastUpdated || 0) + 1),
    };

    latestCharactersRef.current = latestCharactersRef.current.some(c => c.id === committed.id)
      ? latestCharactersRef.current.map(c => c.id === committed.id ? committed : c)
      : [...latestCharactersRef.current, committed];

    // Render immediately, then persist this exact version.
    setCharacters([...latestCharactersRef.current]);
    try {
      await updateCharacterInDB(committed);
      return true;
    } catch (error) {
      console.error('Failed to persist character update:', error);
      return false;
    }
  };`;
source = source.slice(0, start) + handler + source.slice(endPos);

fs.writeFileSync(file, source, 'utf8');
console.log('Applied synchronous latest-state character persistence fix.');
