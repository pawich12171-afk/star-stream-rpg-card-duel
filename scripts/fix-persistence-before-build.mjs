import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/services/characterService.ts');
let source = fs.readFileSync(file, 'utf8');

// Firestore writes are last-write-wins. Serialize writes for the same Shop/Gacha
// document so rapid save/delete operations cannot finish out of order.
const helper = `
// Serialize persistence writes per document to prevent stale writes from winning.
const persistenceWriteQueues = new Map<string, Promise<void>>();

function enqueuePersistenceWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = persistenceWriteQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  persistenceWriteQueues.set(key, next);
  return next.finally(() => {
    if (persistenceWriteQueues.get(key) === next) persistenceWriteQueues.delete(key);
  });
}
`;

if (!source.includes('const persistenceWriteQueues = new Map<string, Promise<void>>();')) {
  const anchor = 'const pendingShopDeletes = new Set<string>();';
  if (!source.includes(anchor)) throw new Error('Persistence anchor not found');
  source = source.replace(anchor, `${anchor}\n${helper}`);
}

const replacements = [
  [
    'await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem));',
    'await enqueuePersistenceWrite(`shop:${id}`, () => setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem)));'
  ],
  [
    'await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));',
    'await enqueuePersistenceWrite(`shop:${itemId}`, () => deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId)));'
  ],
  [
    'await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward);',
    'await enqueuePersistenceWrite(`gacha-reward:${id}`, () => setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward));'
  ],
  [
    'await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));',
    'await enqueuePersistenceWrite(`gacha-reward:${rewardId}`, () => deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId)));'
  ],
  [
    'await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config);',
    'await enqueuePersistenceWrite("gacha-config:main", () => setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config));'
  ]
];

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replace(from, to);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Persistence patch applied: Shop/Gacha writes are serialized per document.');
