import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
let s = readFileSync(servicePath, 'utf8');

// FIRESTORE IS THE ONLY SOURCE OF TRUTH FOR ADMIN BUFF/NERF.
// The admin editor already produces the exact desired character object.
// Re-running health synchronization during persistence can reconstruct old
// modifiers from snapshots and is the reason deleted BUFF/NERF comes back.

// Never derive a new character from the Firestore snapshot before displaying it.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');

// Never derive a new character from the requested admin edit before saving it.
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');

// Also cover equivalent calls left by earlier patches.
s = s.replaceAll('syncCharacterHealth(requested)', 'requested');
s = s.replaceAll('syncCharacterHealth(source)', 'source');

// Remove every legacy realtime HP/MAX-HP auto-fix. A realtime listener must
// never write derived values back to Firestore because that races deletions.
s = s.replace(/\n\s*\/\/ Auto-fix legacy inflated HP or corrupted values in Firestore[\s\S]*?\n\s*\}\n\s*\}\);/g, '\n      });');
s = s.replace(/\n\s*if \([\s\S]*?raw\.maxHp[\s\S]*?\) \{\s*updateDoc\(docSnap\.ref, \{\s*hp:\s*synced\.hp,\s*maxHp:\s*synced\.maxHp,\s*powerScore:\s*calculatePowerScore\(synced\),\s*\}\)\.catch\(\(\) => \{\}\);\s*\}/g, '');

// Disable the old browser overlay completely. It is not a persistence layer.
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

// Final guard: no persistence path may call health synchronization.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');
s = s.replaceAll('syncCharacterHealth(requested)', 'requested');
s = s.replaceAll('syncCharacterHealth(source)', 'source');

writeFileSync(servicePath, s);
console.log('Applied definitive Firestore-authoritative BUFF/NERF deletion fix.');
