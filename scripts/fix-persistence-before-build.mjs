import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
const healthPath = 'src/utils/healthSystem.ts';

let service = readFileSync(servicePath, 'utf8');
let health = readFileSync(healthPath, 'utf8');

// FIRESTORE IS THE ONLY SOURCE OF TRUTH.
// Do not derive/rebuild admin state while saving or reading realtime data.
// The previous implementation still called syncCharacterHealth(char) and
// syncCharacterHealth(raw), which could reconstruct deleted BUFF/NERF/skills.
service = service.replaceAll('const synced = syncCharacterHealth(char);', 'const synced = char;');
service = service.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
service = service.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');
service = service.replaceAll('syncCharacterHealth(requested)', 'requested');
service = service.replaceAll('syncCharacterHealth(source)', 'source');
service = service.replaceAll('list.push(syncCharacterHealth(raw));', 'list.push(raw);');
service = service.replaceAll('return parsed.map(syncCharacterHealth);', 'return parsed;');
service = service.replaceAll('return INITIAL_CHARACTERS.map(syncCharacterHealth);', 'return INITIAL_CHARACTERS;');
service = service.replaceAll('localCharacters = localCharacters.map(syncCharacterHealth);', 'localCharacters = [...localCharacters];');

// Remove every realtime HP auto-fix. A listener must never write derived
// values back to Firestore while an admin deletion/edit is being persisted.
const autoStart = service.indexOf('        // Auto-fix legacy inflated HP or corrupted values in Firestore');
if (autoStart >= 0) {
  const autoEnd = service.indexOf('      });', autoStart);
  if (autoEnd > autoStart) service = service.slice(0, autoStart) + service.slice(autoEnd);
}

// Disable legacy browser admin overlays completely. They are only a cache and
// must never resurrect data that was deleted from Firestore.
const readStart = health.indexOf('function readPersistentAdminOverlay(');
const persistStart = health.indexOf('\nfunction persistAdminOverlay', readStart);
if (readStart >= 0 && persistStart > readStart) {
  health = health.slice(0, readStart)
    + 'function readPersistentAdminOverlay(character: CharacterProfile): CharacterProfile {\n  return character;\n}\n'
    + health.slice(persistStart + 1);
}

const writeStart = health.indexOf('function persistAdminOverlay(');
const ensureStart = health.indexOf('\nfunction ensureSnapshot', writeStart);
if (writeStart >= 0 && ensureStart > writeStart) {
  health = health.slice(0, writeStart)
    + 'function persistAdminOverlay(_character: CharacterProfile) {\n  // Disabled. Firestore is authoritative.\n}\n'
    + health.slice(ensureStart + 1);
}

writeFileSync(servicePath, service);
writeFileSync(healthPath, health);
console.log('Firebase-authoritative character persistence patch applied.');
