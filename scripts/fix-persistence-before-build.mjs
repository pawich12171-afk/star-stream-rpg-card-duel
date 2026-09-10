import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/services/characterService.ts';
const healthPath = 'src/utils/healthSystem.ts';
const statusPath = 'src/components/StatusWindow.tsx';
const shopPath = 'src/components/ShopInventory.tsx';

let service = readFileSync(servicePath, 'utf8');
let health = readFileSync(healthPath, 'utf8');
let status = readFileSync(statusPath, 'utf8');
let shop = readFileSync(shopPath, 'utf8');

// FIRESTORE IS THE ONLY SOURCE OF TRUTH.
// Never derive/rebuild admin state while saving or reading realtime data.
service = service.replaceAll('const synced = syncCharacterHealth(char);', 'const synced = char;');
service = service.replaceAll('const synced = syncCharacterHealth(source);', 'const synced = source;');
service = service.replaceAll('const synced = syncCharacterHealth(requested);', 'const synced = requested;');
service = service.replaceAll('syncCharacterHealth(requested)', 'requested');
service = service.replaceAll('syncCharacterHealth(source)', 'source');
service = service.replaceAll('list.push(syncCharacterHealth(raw));', 'list.push(raw);');
service = service.replaceAll('return parsed.map(syncCharacterHealth);', 'return parsed;');
service = service.replaceAll('return INITIAL_CHARACTERS.map(syncCharacterHealth);', 'return INITIAL_CHARACTERS;');
service = service.replaceAll('localCharacters = localCharacters.map(syncCharacterHealth);', 'localCharacters = [...localCharacters];');

// Remove the exact realtime HP auto-fix block. Reads must never write derived
// HP/MAX HP back to Firestore and resurrect an admin deletion.
const autoFixBlock = /\n\s*\/\/ Auto-fix legacy inflated HP or corrupted values in Firestore[\s\S]*?\n\s*}\n(?=\s*list\.sort\()/;
service = service.replace(autoFixBlock, '\n');

// Admin/user edits must reach updateCharacterData unchanged. These callers used
// to run syncCharacterHealth() before persistence, which could re-add stale data.
status = status.replaceAll('onUpdateCharacter(syncCharacterHealth(updatedChar));', 'onUpdateCharacter(updatedChar);');
status = status.replaceAll('onUpdateCharacter(syncCharacterHealth(updated));', 'onUpdateCharacter(updated);');
shop = shop.replaceAll('updatedChar = syncCharacterHealth(updatedChar);', '/* Firestore persistence owns the authoritative character state. */');

// Disable the legacy browser admin overlay completely. It is only a cache and
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
writeFileSync(statusPath, status);
writeFileSync(shopPath, shop);
console.log('Firebase-authoritative persistence patch applied to character, admin, status and shop flows.');
