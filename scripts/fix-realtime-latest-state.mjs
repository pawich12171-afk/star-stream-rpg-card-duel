import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = fs.readFileSync(file, 'utf8');

// React state updates are asynchronous. Components can emit several actions
// before the next render, so install a synchronous latest-state layer.
source = source.replace(
  "import React, { useState, useEffect } from 'react';",
  "import React, { useState, useEffect, useRef } from 'react';"
);

const marker = "  const currentUser = characters.find(c => c.id === currentUserId) || characters[0];";
if (!source.includes(marker)) throw new Error('currentUser marker not found');

if (!source.includes('const latestCharactersRef = useRef<CharacterProfile[]>(characters);')) {
  const helper = `
  const renderedCharactersRef = useRef<CharacterProfile[]>(characters);
  const latestCharactersRef = useRef<CharacterProfile[]>(characters);
  useEffect(() => {
    renderedCharactersRef.current = characters;
    if (latestCharactersRef.current.length === 0 && characters.length > 0) {
      latestCharactersRef.current = characters;
    }
  }, [characters]);

  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const valuesEqual = (a, b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return Object.is(a, b); }
  };

  // Rebase an update made from an older React render onto the latest value.
  // Numeric fields accumulate deltas; nested objects and id-keyed arrays merge.
  const mergeLatest = (latest, base, incoming) => {
    if (incoming === undefined) return latest;
    if (valuesEqual(incoming, base)) return latest;
    if (valuesEqual(latest, base)) return incoming;
    if (typeof incoming === 'number' && typeof base === 'number' && typeof latest === 'number') {
      return latest + (incoming - base);
    }
    if (Array.isArray(incoming) && Array.isArray(base) && Array.isArray(latest)) {
      const keyed = incoming.every(x => isRecord(x) && typeof x.id === 'string') &&
        base.every(x => isRecord(x) && typeof x.id === 'string') &&
        latest.every(x => isRecord(x) && typeof x.id === 'string');
      if (!keyed) return incoming;
      const baseMap = new Map(base.map(x => [x.id, x]));
      const latestMap = new Map(latest.map(x => [x.id, x]));
      const result = latest.map(x => x);
      for (const item of incoming) {
        const oldItem = baseMap.get(item.id);
        const currentItem = latestMap.get(item.id);
        if (!oldItem) {
          if (!latestMap.has(item.id)) result.push(item);
        } else if (currentItem) {
          const index = result.findIndex(x => x.id === item.id);
          result[index] = mergeLatest(currentItem, oldItem, item);
        }
      }
      for (const oldItem of base) {
        if (!incoming.some(x => isRecord(x) && x.id === oldItem.id)) {
          const index = result.findIndex(x => x.id === oldItem.id);
          if (index >= 0 && valuesEqual(result[index], oldItem)) result.splice(index, 1);
        }
      }
      return result;
    }
    if (isRecord(incoming) && isRecord(base) && isRecord(latest)) {
      const result = { ...latest };
      for (const key of Object.keys(incoming)) {
        result[key] = mergeLatest(latest[key], base[key], incoming[key]);
      }
      return result;
    }
    return incoming;
  };
`;
  source = source.replace(marker, helper + '\n' + marker);
}

const start = source.indexOf('  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {');
if (start < 0) throw new Error('handleUpdateCharacter not found');
const end = source.indexOf('\n  // Keep the React view in sync immediately with admin inventory mutations.', start);
if (end < 0) throw new Error('handleUpdateCharacter end marker not found');

const handler = `  const handleUpdateCharacter = async (updated: CharacterProfile): Promise<boolean> => {
    const base = renderedCharactersRef.current.find(c => c.id === updated.id);
    const current = latestCharactersRef.current.find(c => c.id === updated.id);
    const rebased = base && current ? mergeLatest(current, base, updated) : (current || updated);
    const committed: CharacterProfile = {
      ...rebased,
      id: updated.id,
      lastUpdated: Math.max(Date.now(), Number(current?.lastUpdated || 0) + 1, Number(updated.lastUpdated || 0)),
    };

    // Commit synchronously before awaiting Firestore. The next rapid click
    // immediately sees this exact value.
    latestCharactersRef.current = latestCharactersRef.current.some(c => c.id === committed.id)
      ? latestCharactersRef.current.map(c => c.id === committed.id ? committed : c)
      : [...latestCharactersRef.current, committed];
    setCharacters([...latestCharactersRef.current]);

    try {
      await updateCharacterInDB(committed);
      return true;
    } catch (error) {
      console.error('Failed to persist character update:', error);
      return false;
    }
  };
`;
source = source.slice(0, start) + handler + source.slice(end);

const coinStart = source.indexOf('  const handleUpdateCharacterCoins = (characterId: string, deltaCoins: number) => {');
if (coinStart >= 0) {
  const coinEnd = source.indexOf('\n  };', coinStart) + 5;
  const coinHandler = `  const handleUpdateCharacterCoins = (characterId: string, deltaCoins: number) => {
    const target = latestCharactersRef.current.find(char => char.id === characterId);
    if (!target) return;
    void handleUpdateCharacter({ ...target, coins: Math.max(0, Number(target.coins || 0) + deltaCoins) });
  };`;
  source = source.slice(0, coinStart) + coinHandler + source.slice(coinEnd);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Applied global synchronous latest-state persistence fix.');
