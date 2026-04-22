import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(SCRIPT_DIR, '../src');
const conflictPattern = /^(<<<<<<<|=======|>>>>>>>)/m;
const filesWithConflicts = [];

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(jsx?|tsx?|css|json)$/.test(entry)) continue;
    const content = readFileSync(fullPath, 'utf8');
    if (conflictPattern.test(content)) {
      filesWithConflicts.push(fullPath);
    }
  }
}

walk(ROOT);

if (filesWithConflicts.length > 0) {
  console.error('\n❌ Se detectaron marcadores de merge sin resolver:');
  for (const file of filesWithConflicts) {
    console.error(`- ${file}`);
  }
  console.error('\nResolvé los conflictos (<<<<<<<, =======, >>>>>>>) antes de ejecutar dev/build.\n');
  process.exit(1);
}

console.log('✅ Sin marcadores de merge en frontend/src.');
