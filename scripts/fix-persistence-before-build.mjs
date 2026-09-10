import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/services/characterService.ts';
let s = readFileSync(path, 'utf8');

// Firestore writes must persist the exact object produced by the UI.
const updateRe = /export async function updateCharacterData\(char: CharacterProfile\): Promise<void> \{[\s\S]*?\n\}\n\n\/\/ Delete Character/;
const updateReplacement = `export async function updateCharacterData(char: CharacterProfile): Promise<void> {
  const score = calculatePowerScore(char);
  const previousVersion = Number(localCharacters.find(c => c.id === char.id)?.lastUpdated) || 0;
  const requestedVersion = Number(char.lastUpdated) || 0;
  const lastUpdated = Math.max(Date.now(), previousVersion + 1, requestedVersion);
  const updated: CharacterProfile = { ...char, powerScore: score, lastUpdated };

  pendingCharacterUpdates.set(updated.id, updated);
  localCharacters = localCharacters.map(c => c.id === updated.id ? updated : c);
  if (!localCharacters.some(c => c.id === updated.id)) localCharacters.push(updated);
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    await setDoc(doc(db, CHARACTERS_COLLECTION, updated.id), sanitizeForFirestore(updated));
  } catch (err) {
    pendingCharacterUpdates.delete(updated.id);
    console.error("Error updating character in Firestore:", err);
    throw err;
  }
}

// Delete Character`;
if (!updateRe.test(s)) throw new Error('Could not find updateCharacterData');
s = s.replace(updateRe, updateReplacement);

// A successful Firestore snapshot is already the resolved persisted state.
// Re-running the recovery/sync layer here can resurrect old admin modifiers.
if (!s.includes('const synced = syncCharacterHealth(source);')) {
  // The build may already contain this fix.
} else {
  s = s.replace('const synced = syncCharacterHealth(source);', 'const synced = source;');
}

// Do not auto-write derived HP values from the realtime listener. Admin edits
// already persist the exact HP/maxHP they selected.
const autoRe = /\n        \/\/ Auto-fix legacy inflated HP or corrupted values in Firestore\n        if \([\s\S]*?\n        \}\n      \}\);/;
const autoMatch = s.match(autoRe);
if (autoMatch) {
  s = s.replace(autoRe, '');
}

writeFileSync(path, s);
console.log('Persistence source-of-truth patch applied.');
