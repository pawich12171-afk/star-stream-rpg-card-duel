import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
let s = readFileSync(servicePath, 'utf8');

// FIRESTORE IS THE ONLY SOURCE OF TRUTH FOR ADMIN BUFF/NERF.
// Never recalculate or write health back to Firestore from the realtime listener.
// That old auto-fix raced an admin deletion: it could receive the old snapshot,
// calculate the deleted state, and write old HP/MAX HP while the modifier remained.

// 1) Realtime character listener must display the server/pending object exactly.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');

// 2) Remove every legacy auto-fix block from subscribeToCharacters.
// Match from the comment through the updateDoc call, regardless of formatting.
s = s.replace(/\n\s*\/\/ Auto-fix legacy inflated HP or corrupted values in Firestore[\s\S]*?\n\s*\}\n\s*\}\);/g, '\n      });');

// Also remove any remaining standalone auto-fix updateDoc block if an earlier
// patch changed its comment/indentation.
s = s.replace(/\n\s*if \([\s\S]*?raw\.maxHp[\s\S]*?\) \{\s*updateDoc\(docSnap\.ref, \{\s*hp:\s*synced\.hp,\s*maxHp:\s*synced\.maxHp,\s*powerScore:\s*calculatePowerScore\(synced\),\s*\}\)\.catch\(\(\) => \{\}\);\s*\}/g, '');

// 3) Never let the legacy browser overlay participate in persistence.
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
  // Disabled: Firestore is authoritative.
}

function ensureSnapshot`);
}

// 4) Final hard normalization. If previous patches left another sync call in
// the exact persistence paths, it must not be allowed to resurrect modifiers.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');

writeFileSync(servicePath, s);
console.log('Applied Firestore-authoritative BUFF/NERF deletion persistence fix.');
