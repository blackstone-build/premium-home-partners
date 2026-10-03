#!/usr/bin/env node
// Fail a pull request that changes more than LIMIT lines.
// A pure rename (git rename detection, zero added or deleted lines) is exempt.

import { execSync } from 'node:child_process';

const LIMIT = 400;

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim();
}

const base = process.env.PR_BASE || process.env.GITHUB_BASE_REF || '';
if (!base) {
  console.log('pr-size skipped: no pull request base.');
  process.exit(0);
}

execSync(`git fetch --no-tags origin ${base}`, { stdio: 'inherit' });
const status = git(`diff -M --name-status origin/${base}...HEAD`);
const numstat = git(`diff -M --numstat origin/${base}...HEAD`);
const rows = status ? status.split('\n') : [];
let added = 0;
let deleted = 0;
if (numstat) {
  for (const line of numstat.split('\n')) {
    const [a, d] = line.split('\t');
    if (a === '-' || d === '-') continue;
    added += Number(a);
    deleted += Number(d);
  }
}
const total = added + deleted;
const onlyRenames = rows.length > 0 && rows.every((row) => row.startsWith('R'));
console.log(`pr-size ${total} lines (limit ${LIMIT}). Pure renames: ${onlyRenames && total === 0}.`);
if (onlyRenames && total === 0) process.exit(0);
if (total > LIMIT) {
  console.error(`This pull request changes ${total} lines. The limit is ${LIMIT}. A pure rename is exempt.`);
  process.exit(1);
}
