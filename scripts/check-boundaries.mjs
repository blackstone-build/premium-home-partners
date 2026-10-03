#!/usr/bin/env node
// Fails when a file imports a layer it does not own.
//   node scripts/check-boundaries.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve('apps/mobile/src');
const errors = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function specs(text) {
  return [...text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
}

function top(rel) {
  if (rel.startsWith('features/')) return 'features';
  return rel.split('/')[0];
}

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  if (rel.startsWith('app/')) {
    const ok = /^export \{ default \} from '\.\.\/(?:\.\.\/)*features\/[A-Za-z0-9_./-]+';\n$/.test(text);
    if (!ok) errors.push(`${rel} must re-export one feature screen and contain nothing else`);
    continue;
  }
  const feature = rel.startsWith('features/') ? rel.split('/')[1] : null;
  for (const spec of specs(text)) {
    const target = relative(SRC, resolve(dirname(file), spec)).replaceAll('\\', '/');
    const kind = top(rel);
    const targetKind = top(target);
    const targetFeature = target.startsWith('features/') ? target.split('/')[1] : null;
    if (kind === 'features' && targetKind === 'features' && targetFeature !== feature) {
      if (targetFeature === 'auth' || targetFeature === 'shell') continue;
      errors.push(`${rel} imports another feature (${target})`);
    }
    if (kind === 'features' && targetKind === 'app') errors.push(`${rel} imports ${target}`);
    if (kind === 'ui' && ['store', 'data', 'features', 'app', 'components'].includes(targetKind)) {
      errors.push(`${rel} imports ${target}`);
    }
    if (kind === 'data' && ['features', 'app', 'ui'].includes(targetKind)) errors.push(`${rel} imports ${target}`);
    if (kind === 'lib' && ['features', 'app'].includes(targetKind)) errors.push(`${rel} imports ${target}`);
    if (kind === 'store' && ['features', 'ui', 'app'].includes(targetKind)) errors.push(`${rel} imports ${target}`);
    if (kind === 'components' && ['features', 'app'].includes(targetKind)) errors.push(`${rel} imports ${target}`);
  }
}

if (errors.length) {
  for (const err of errors) console.error(err);
  process.exit(1);
}
console.log(`boundaries ok (${walk(SRC).length} files)`);
