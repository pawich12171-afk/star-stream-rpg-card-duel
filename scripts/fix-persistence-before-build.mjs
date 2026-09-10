import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
const healthPath = 'src/utils/healthSystem.ts';

let service = readFileSync(servicePath, 'utf8');
let health = readFileSync(healthPath, 'utf8');

// FIRESTORE IS THE ONLY SOURCE OF TRUTH.
// Admin edits must be persisted exactly as supplied by the UI. Re-running the
// derived health synchronizer before setDoc can resurrect deleted modifiers.
service = service.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
service = service.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');
service = service.replaceAll('syncCharacterHealth(requested)', 'requested');
service = service.replaceAll('syncCharacterHealth(source)', 'source');

// Remove the realtime HP auto-fix. A listener must never write derived HP back
// to Firestore while an admin deletion is being persisted.
const autoStart = service.indexOf('        // Auto-fix legacy inflated HP or corrupted values in Firestore');
if (autoStart >= 0) {
  const autoEnd = service.indexOf('      });', autoStart);
  if (autoEnd > autoStart) service = service.slice(0, autoStart) + service.slice(autoEnd);
}

// Disable the legacy browser overlay completely. Deleted BUFF/NERF data must
// never be recovered from localStorage on a later refresh.
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
