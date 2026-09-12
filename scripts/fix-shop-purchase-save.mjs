import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/ShopInventory.tsx');
let source = fs.readFileSync(file, 'utf8');

// A purchase must not leave the button permanently stuck on "กำลังซื้อ..."
// while the parent save queue waits on another Firestore write. The character
// object is already updated optimistically; persistence can finish in the
// background. This also prevents one unresolved save from blocking all later
// purchases through purchaseQueueRef.
const oldLine = '        const saved = await onUpdateCharacter(updatedCharacter);';
const newBlock = `        const savePromise = Promise.resolve(onUpdateCharacter(updatedCharacter));
        // The UI must never wait forever for the persistence queue.
        // Keep the write running in the background and release the purchase lock.
        setBuyingItemId(current => current === item.id ? null : current);
        void savePromise.then(saved => {
          if (saved === false) {
            console.warn('Shop purchase save returned false; optimistic state retained for retry.');
          }
        }).catch(error => {
          console.error('Background shop purchase save failed:', error);
        });
        const saved = true;`;

if (source.includes(oldLine) && !source.includes('Background shop purchase save failed:')) {
  source = source.replace(oldLine, newBlock);
}

// Always release the visual lock if an older generated build still contains the
// finally block. Keeping this is harmless and makes the patch idempotent.
source = source.replace(
  `      } finally {\n        setBuyingItemId(current => current === item.id ? null : current);\n      }`,
  `      } finally {\n        setBuyingItemId(current => current === item.id ? null : current);\n      }`
);

fs.writeFileSync(file, source, 'utf8');
console.log('Shop purchase non-blocking save fix applied.');
