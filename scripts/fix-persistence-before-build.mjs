import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
let s = readFileSync(servicePath, 'utf8');

// IMPORTANT: Firestore is the single source of truth for character/admin balance data.
// Never let a browser recovery overlay or an old admin snapshot overwrite a newer UI edit.
const updateRe = /export async function updateCharacterData\(char: CharacterProfile\): Promise<void> \{[\s\S]*?\n\}\n\n\/\/ Delete Character/;
const updateReplacement = `export async function updateCharacterData(char: CharacterProfile): Promise<void> {
  const previousVersion = Number(localCharacters.find(c => c.id === char.id)?.lastUpdated) || 0;
  const requestedVersion = Number(char.lastUpdated) || 0;
  const lastUpdated = Math.max(Date.now(), previousVersion + 1, requestedVersion);

  // Persist EXACTLY the object supplied by the UI. Do not run syncCharacterHealth here:
  // that function derives values from admin snapshots and can resurrect deleted modifiers.
  const updated: CharacterProfile = {
    ...char,
    powerScore: calculatePowerScore(char),
    lastUpdated,
  };

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

// Realtime listener must render the server document exactly as stored.
// Running the admin balance synchronizer here is forbidden because it can recreate deleted BUFF/NERF.
s = s.replace(/const synced = syncCharacterHealth\(source\);/g, 'const synced = source;');

// Never auto-write derived HP/maxHP back into Firestore from the listener.
const autoRe = /\n        \/\/ Auto-fix legacy inflated HP or corrupted values in Firestore\n        if \([\s\S]*?\n        \}\n      \}\);/;
s = s.replace(autoRe, '');

// Disable the old local admin overlay recovery layer. It is no longer allowed to compete
// with Firestore and is the primary cause of deleted BUFF/NERF returning after refresh.
const overlayReadRe = /function readPersistentAdminOverlay\(character: CharacterProfile\): CharacterProfile \{[\s\S]*?\n\}\n\nfunction persistAdminOverlay/;
if (overlayReadRe.test(s)) {
  s = s.replace(overlayReadRe, `function readPersistentAdminOverlay(character: CharacterProfile): CharacterProfile {
  return character;
}

function persistAdminOverlay`);
}

const overlayPersistRe = /function persistAdminOverlay\(character: CharacterProfile\) \{[\s\S]*?\n\}\n\nfunction ensureSnapshot/;
if (overlayPersistRe.test(s)) {
  s = s.replace(overlayPersistRe, `function persistAdminOverlay(_character: CharacterProfile) {
  // Disabled: Firestore is authoritative. Browser overlay must never resurrect deleted data.
}

function ensureSnapshot`);
}

writeFileSync(servicePath, s);
console.log('Firestore-authoritative character persistence patch applied.');
