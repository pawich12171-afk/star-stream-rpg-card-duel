import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
let s = readFileSync(servicePath, 'utf8');

// Firestore is the source of truth. Remove every health/snapshot rewrite from the
// realtime path that can resurrect an already-deleted admin modifier.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');

// The realtime listener must never auto-write derived HP/MAX HP back to Firestore.
// Such a write can race an admin deletion and restore the previous modifier state.
const autoFixStart = '        // Auto-fix legacy inflated HP or corrupted values in Firestore';
const autoFixPos = s.indexOf(autoFixStart);
if (autoFixPos >= 0) {
  const autoFixEnd = s.indexOf('        }\n      });', autoFixPos);
  if (autoFixEnd >= 0) {
    s = s.slice(0, autoFixPos) + s.slice(autoFixEnd + '        }\n'.length);
  }
}

// Disable the legacy browser overlay completely. It must not participate in
// character persistence, because deleted BUFF/NERF must stay deleted after reload.
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
  // Disabled. Firestore is authoritative.
}

function ensureSnapshot`);
}

// IMPORTANT: keep this final normalization at the end so it also fixes versions
// of characterService that already contain earlier, conflicting patches.
s = s.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
s = s.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');

writeFileSync(servicePath, s);
console.log('Admin BUFF/NERF persistence source-of-truth patch applied.');
