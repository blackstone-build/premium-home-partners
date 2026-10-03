#!/usr/bin/env node
// Fail when a pull request touches .cursor/skills/** and the fresh verify-php
// score is below the threshold written in the rubric.
// The committed score.json must stay at or above that threshold on every run.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const RUBRIC = '.cursor/skills/verify-php/eval/rubric.md';
const COMMITTED = '.cursor/skills/verify-php/eval/score.json';
const SCENARIOS = '.cursor/skills/verify-php/eval/scenarios.md';
const FRESH = process.env.VERIFY_PHP_FRESH_SCORE || 'verify-php-output/score.json';

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim();
}

function thresholdOf(text) {
  const match = text.match(/Threshold:\s*\**\s*([0-9.]+)/i);
  if (!match) throw new Error(`${RUBRIC} does not document a Threshold.`);
  return Number(match[1]);
}

function scenarioIds(markdown) {
  return [...markdown.matchAll(/^\| `([a-z0-9-]+)` /gm)].map((match) => match[1]);
}

const threshold = thresholdOf(readFileSync(RUBRIC, 'utf8'));
const committed = JSON.parse(readFileSync(COMMITTED, 'utf8'));
if (typeof committed.score !== 'number' || committed.score < threshold) {
  console.error(`Committed score ${committed.score} is below ${threshold}.`);
  process.exit(1);
}

const expected = scenarioIds(readFileSync(SCENARIOS, 'utf8'));
const actual = (committed.scenarios || []).map((item) => item.id);
if (expected.join('\n') !== actual.join('\n')) {
  console.error('score.json scenarios do not match scenarios.md.');
  console.error(`expected: ${expected.join(', ')}`);
  console.error(`actual: ${actual.join(', ')}`);
  process.exit(1);
}

const event = process.env.GITHUB_EVENT_NAME || '';
const base = process.env.PR_BASE || process.env.GITHUB_BASE_REF || '';
let touches = false;
if (event === 'pull_request' && base) {
  execSync(`git fetch --no-tags origin ${base}`, { stdio: 'inherit' });
  const names = git(`diff --name-only origin/${base}...HEAD`);
  touches = names.split('\n').filter(Boolean).some((name) => name.startsWith('.cursor/skills/'));
} else if (event === 'push') {
  const names = git('diff --name-only HEAD^ HEAD');
  touches = names.split('\n').filter(Boolean).some((name) => name.startsWith('.cursor/skills/'));
}

if (!touches) {
  console.log(`skill-eval ok. Committed score ${committed.score}. .cursor/skills was not changed.`);
  process.exit(0);
}

if (!existsSync(FRESH)) {
  console.error('This pull request changes .cursor/skills and the fresh verify-php score is missing.');
  process.exit(1);
}
const fresh = JSON.parse(readFileSync(FRESH, 'utf8'));
if (typeof fresh.score !== 'number' || fresh.score < threshold) {
  console.error(`Fresh verify-php score ${fresh.score} is below ${threshold}.`);
  process.exit(1);
}
console.log(`skill-eval ok. Fresh score ${fresh.score} meets threshold ${threshold}.`);
