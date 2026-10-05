/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_ACCESS, DEMO_PASSWORD, DEMO_TOOLS, SHOW_DEMO_ACCOUNTS, flagOn } from '../src/lib/flags';

test('a demo flag is on only when the value is exactly 1', () => {
  assert.equal(flagOn(undefined), false);
  assert.equal(flagOn(''), false);
  assert.equal(flagOn('0'), false);
  assert.equal(flagOn('true'), false);
  assert.equal(flagOn('1'), true);
});

test('this process is a production-shaped build: demo backdoors stay off', () => {
  assert.equal(process.env.EXPO_PUBLIC_DEMO_ACCESS, undefined);
  assert.equal(process.env.EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS, undefined);
  assert.equal(process.env.EXPO_PUBLIC_ALLOW_DEMO_TOOLS, undefined);
  assert.equal(DEMO_ACCESS, false);
  assert.equal(SHOW_DEMO_ACCOUNTS, false);
  assert.equal(DEMO_TOOLS, false);
  assert.equal(DEMO_PASSWORD, '');
});
