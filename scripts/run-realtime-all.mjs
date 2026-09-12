import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const patch = path.resolve('scripts/fix-realtime-all.mjs');
let source = fs.readFileSync(patch, 'utf8');

// The first version used a text check that did not match the `let` declaration it
// inserted, so a second build could insert duplicate battle variables. Normalize it
// before running the patch, making repeated Vercel builds safe.
source = source.replace(
  "if (!source.includes('const pendingBattleConfig:')) {",
  "if (!source.includes('let pendingBattleConfig: BattleConfig | null = null;')) {"
);
fs.writeFileSync(patch, source, 'utf8');

await import(pathToFileURL(patch).href + `?run=${Date.now()}`);
console.log('Realtime all-systems patch completed safely.');
