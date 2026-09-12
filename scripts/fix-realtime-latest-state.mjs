import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "import React, { useState, useEffect } from 'react';",
  "import React, { useState, useEffect, useRef } from 'react';"
);

const marker = "  const currentUser = characters.find(c => c.id === currentUserId) || characters[0];";
if (!source.includes(marker)) throw new Error('currentUser marker not found');

if (!source.includes('const latestCharactersRef = useRef<CharacterProfile[]>(characters);')) {
  const helper = `
  // Realtime latest-state layer: React state is asynchronous, so rapid actions
  // must build from this synchronous ref instead of the previous render.
  const renderedCharactersRef = useRef<CharacterProfile[]>(characters);
  const latestCharactersRef = useRef<CharacterProfile[]>(characters);
  useEffect(() => {
    renderedCharactersRef.current = characters;
  }, [characters]);

  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const mergeLatest = (latest, base, incoming) => {
    if (incoming === undefined) return latest;
    if (Object.is(incoming, base)) return latest;
    if (Object.is(latest, base)) return incoming;
    if (typeof incoming === 'number' && typeof base === 'number' && typeof latest === 'number') {
      return latest + (incoming - base);
    }
    if (Array.isArray(incoming) && Array.isArray(base) && Array.isArray(latest)) {
      const keyed = incoming.every(x => isRecord(x) && typeof x.id === 'string') && base.every(x => isRecord(x) && typeof x.id === 'string');
      if (keyed) {
        const baseMap = new Map(base.map(x => [x.id, x]));
        const latestMap = new Map(latest.map(x => [x.id, x]));
        const result = latest.map(x => x);
        for (const item of incoming) {
          const oldItem = baseMap.get(item.id);
          const currentItem = latestMap.get(item.id);
          if (!oldItem) {
            if (!latestMap.has(item.id)) result.push(item);
          } else if (currentItem) {
            const i = result.findIndex(x => x.id === item.id);
            result[i] = mergeLatest(currentItem, oldItem, item);
          }
        }
        // Preserve explicit removals made by this action.
        for (const oldItem of base) {
          if (!incoming.some(x => isRecord(x) && x.id === oldItem.id)) {
            const i = result.findIndex(x => x.id === oldItem.id);
            if (i >= 0 && valuesEqual(result[i], oldItem)) result.splice(i, 1);
          }
        }
        return result;
      }
      return incoming;
    }
    if (isRecord(incoming) && isRecord(base) && isRecord(latest)) {
      const result = { ...latest };
      for (const key of Object.keys(incoming)) result[key] = mergeLatest(latest[key], base[key], incoming[key]);
      return result;
    }
    return incoming;
  };
  const valuesEqual = (a, b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return Object.is(a, b); }
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
    const merged = base && current ? mergeLatest(current, base, updated) : (current || updated);
    const committed = {
      ...merged,
      id: updated.id,
      lastUpdated: Math.max(Date.now(), Number(current?.lastUpdated || 0) + 1, Number(updated.lastUpdated || 0)),
    };

    // Commit synchronously to the ref before React/Firebase can yield.
    latestCharactersRef.current = latestCharactersRef.current.some(c => c.id === committed.id)
      ? latestCharactersRef.current.map(c => c.id === committed.id ? committed : c)
      : [...latestCharactersRef.current, committed];
    setCharacters(latestCharactersRef.current);

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

// Make direct coin updates use the synchronous latest ref too.
const coinStart = source.indexOf('  const handleUpdateCharacterCoins = (characterId: string, deltaCoins: number) => {');
if (coinStart >= 0) {
  const coinEnd = source.indexOf('\n  };', coinStart) + 5;
  const coinHandler = `  const handleUpdateCharacterCoins = (characterId: string, deltaCoins: number) => {
    const target = latestCharactersRef.current.find(char => char.id === characterId);
    if (!target) return;
    void handleUpdateCharacter({
      ...target,
      coins: Math.max(0, Number(target.coins || 0) + deltaCoins),
    });
  };`;
  source = source.slice(0, coinStart) + coinHandler + source.slice(coinEnd);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Applied global realtime latest-state fix.');
