#!/usr/bin/env node
// The single required status check. It passes only when every gate job passed.
// pr-size does not run on a push to main, so a skip is accepted there.
// A skipped job on a pull request is a failure. Vercel is not one of these jobs.

const event = process.env.GITHUB_EVENT_NAME || '';
const results = {
  check: process.env.CHECK_RESULT,
  'verify-php': process.env.VERIFY_RESULT,
  'skill-eval': process.env.EVAL_RESULT,
  'pr-size': process.env.SIZE_RESULT,
};

let failed = false;
for (const [name, result] of Object.entries(results)) {
  if (result === 'success') {
    console.log(`${name}: success`);
    continue;
  }
  if (name === 'pr-size' && result === 'skipped' && event !== 'pull_request') {
    console.log('pr-size: skipped on a non-pull-request run');
    continue;
  }
  console.error(`${name}: ${result || 'missing'}`);
  failed = true;
}
if (failed) process.exit(1);
console.log('merge-gate passed');
