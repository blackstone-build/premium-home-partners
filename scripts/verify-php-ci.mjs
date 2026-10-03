#!/usr/bin/env node
// Drive the offline demo through the verify-php scenarios.
// Exits 0 only when every scenario passes. A deadline stops a hung run.
//
//   node scripts/verify-php-ci.mjs
//
// VERIFY_PHP_DEADLINE_MS defaults to 12 minutes. VERIFY_PHP_COMMAND_MS defaults to 45 seconds.
// Screenshots and score.json are copied to verify-php-output/.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVE = join(ROOT, '.cursor/skills/verify-php/drive.mjs');
const OUT = join(ROOT, 'verify-php-output');
const THRESHOLD = 1;
const DEADLINE_MS = Number(process.env.VERIFY_PHP_DEADLINE_MS || 12 * 60 * 1000);
const COMMAND_MS = Number(process.env.VERIFY_PHP_COMMAND_MS || 45_000);
const started = Date.now();

function remaining() {
  return DEADLINE_MS - (Date.now() - started);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function readyMessage(buf) {
  let from = 0;
  while (from < buf.length) {
    const start = buf.indexOf('{', from);
    if (start < 0) return null;
    try {
      const msg = JSON.parse(buf.slice(start));
      if (msg && msg.ok && msg.url && msg.evidence) return msg;
    } catch {
      // The web build log and the pretty-printed ready line share stdout.
    }
    from = start + 1;
  }
  return null;
}

function runNode(args, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out after ${timeoutMs}ms: node ${args.slice(-3).join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, out, err });
    });
  });
}

async function drive(args) {
  if (remaining() < 1000) throw new Error('Verification deadline exceeded.');
  const timeout = Math.min(COMMAND_MS, remaining());
  const result = await runNode([DRIVE, ...args], timeout);
  let reply = null;
  try {
    reply = JSON.parse(result.out);
  } catch {
    reply = null;
  }
  if (result.code !== 0 || !reply?.ok) {
    throw new Error(reply?.error || result.err.trim() || result.out.trim() || `drive ${args[0]} exited ${result.code}`);
  }
  return reply;
}

async function launch() {
  if (remaining() < 5000) throw new Error('Verification deadline exceeded before launch.');
  const child = spawn(process.execPath, [DRIVE, 'launch'], { cwd: ROOT });
  let buf = '';
  const timeout = Math.min(8 * 60 * 1000, remaining());
  const ready = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Launch timed out before the offline demo was ready.'));
    }, timeout);
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const msg = readyMessage(buf);
      if (!msg) return;
      clearTimeout(timer);
      resolvePromise(msg);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Launch exited ${code} before the app was ready.`));
    });
  });
  return ready;
}

const scenarios = [];

function scenario(id, run) {
  scenarios.push({ id, run });
}

scenario('doctor-offline', async () => {
  await drive(['reset']);
  const doc = await drive(['doctor']);
  if (!doc.offlineDemo) throw new Error('Doctor did not report offline demo.');
});

scenario('launcher-open', async () => {
  await drive(['expect-text', 'One home, four apps']);
  await drive(['expect-text', 'OFFLINE DEMO', '--exact']);
  await drive(['screenshot', 'launcher.png']);
});

scenario('launcher-theme', async () => {
  await drive(['click', '--role', 'button', '--name', 'Dark mode']);
  await drive(['expect-text', 'Light mode']);
  await drive(['screenshot', 'launcher-dark.png']);
  await drive(['click', '--role', 'button', '--name', 'Light mode']);
  await drive(['expect-text', 'Dark mode']);
});

scenario('signin-redirect', async () => {
  await drive(['goto', '/login']);
  await drive(['expect-text', 'One home, four apps']);
  const seen = await drive(['text']);
  if (new URL(seen.url).pathname !== '/') throw new Error(`Stayed on ${seen.url}`);
  await drive(['expect-text', 'OFFLINE DEMO', '--exact']);
  await drive(['screenshot', 'sign-in-redirect.png']);
});

scenario('signup-redirect', async () => {
  await drive(['goto', '/signup']);
  await drive(['expect-text', 'One home, four apps']);
  await drive(['expect-text', 'OFFLINE DEMO', '--exact']);
  await drive(['screenshot', 'signup-redirect.png']);
});

scenario('onboard-welcome', async () => {
  await drive(['click', '--testid', 'launch-homeowner']);
  await drive(['expect-text', 'Set up my home']);
  await drive(['screenshot', 'onboarding-welcome.png']);
});

scenario('onboard-address', async () => {
  await drive(['click', '--role', 'button', '--name', 'Set up my home']);
  await drive(['expect-text', 'YOUR NAME']);
  await drive(['expect-text', 'SERVICE ADDRESS']);
  await drive(['expect-text', 'Inside our service area']);
  await drive(['screenshot', 'onboarding-address.png']);
});

scenario('onboard-scan', async () => {
  await drive(['click', '--role', 'button', '--name', 'Continue']);
  for (let n = 0; n < 5; n++) {
    await drive(['click', '--label', 'Capture serial plate']);
    await sleep(1400);
  }
  await drive(['expect-text', 'All 5 appliances found']);
  await drive(['screenshot', 'onboarding-plates.png']);
  await drive(['click', '--role', 'button', '--name', 'Continue']);
});

scenario('onboard-research', async () => {
  await drive(['click', '--role', 'button', '--name', 'Build my plan']);
  await drive(['expect-text', '100%', '--exact']);
  await drive(['screenshot', 'onboarding-research.png']);
});

scenario('onboard-tier', async () => {
  await drive(['click', '--role', 'button', '--name', 'See my plan options']);
  await drive(['screenshot', 'onboarding-tiers.png']);
  await drive(['click', '--role', 'button', '--name', 'Start PHP Recommended']);
  await drive(['expect-url', '/homeowner/home']);
});

scenario('home-next', async () => {
  await drive(['expect-text', 'NEXT VISIT', '--exact']);
  await drive(['screenshot', 'home.png']);
});

scenario('home-confirm', async () => {
  await drive(['click', '--role', 'button', '--name', 'Confirm']);
  await drive(['expect-text', 'Confirmed']);
  await drive(['screenshot', 'home-confirmed.png']);
});

scenario('plan-open', async () => {
  await drive(['click', '--role', 'tab', '--name', 'Plan']);
  await drive(['expect-text', 'Your plan']);
  await drive(['expect-text', 'Your year of care']);
  await drive(['expect-text', '/mo']);
  await drive(['screenshot', 'plan.png']);
});

scenario('plan-change', async () => {
  await drive(['click', '--text', 'Change coverage ›']);
  await drive(['expect-text', 'Done']);
  await drive(['click', '--text', 'Done']);
  await drive(['expect-text', 'Your plan']);
});

scenario('reports-empty', async () => {
  await drive(['click', '--role', 'tab', '--name', 'Reports']);
  await drive(['expect-text', 'Your first report arrives after the visit']);
  await drive(['screenshot', 'reports-empty.png']);
});

scenario('services-lines', async () => {
  await drive(['click', '--role', 'tab', '--name', 'Services']);
  await drive(['expect-text', 'Something not right?']);
  await drive(['click', '--testid', 'services-line-seasonal']);
  await drive(['click', '--testid', 'services-line-contracted']);
  await drive(['expect-text', 'Roofing']);
  await drive(['click', '--testid', 'services-line-maintenance']);
  await drive(['expect-text', 'Lawn care']);
  await drive(['screenshot', 'services.png']);
});

scenario('request-show', async () => {
  await drive(['click', '--testid', 'show-us-start']);
  await drive(['expect-text', 'Show us']);
  await drive(['fill', '--testid', 'request-description', '--value', 'The hallway switch sparks.']);
  await drive(['click', '--testid', 'request-room-kitchen']);
  await drive(['click', '--testid', 'request-urgency-soon']);
  await drive(['click', '--testid', 'request-submit']);
  await drive(['expect-text', 'Sent']);
  await drive(['screenshot', 'request-sent.png']);
});

scenario('tech-finish', async () => {
  await drive(['goto', '/']);
  await drive(['click', '--testid', 'launch-tech']);
  await drive(['expect-text', "Today's route"]);
  await drive(['screenshot', 'tech-route.png']);
  await drive(['click', '--role', 'button', '--name', 'tap to open']);
  await drive(['expect-text', 'Elena Alvarez']);
  await drive(['click', '--role', 'button', '--name', 'Start driving · notify client']);
  await drive(['click', '--role', 'button', '--name', 'Mark arrived on site']);
  for (const id of ['task-hvac', 'task-fridge', 'task-ice', 'task-dish', 'task-wh', 'task-dryer', 'task-smoke']) {
    await drive(['click', '--testid', id]);
  }
  await drive(['click', '--role', 'button', '--name', 'Complete & send report']);
  await drive(['expect-text', 'Report sent ✓']);
  await drive(['screenshot', 'tech-report-sent.png']);
});

scenario('reports-detail', async () => {
  await drive(['goto', '/homeowner/reports']);
  await drive(['click', '--testid', 'report-card']);
  await drive(['expect-text', 'Visit report']);
  await drive(['expect-text', 'Home health']);
  await drive(['screenshot', 'reports-detail.png']);
});

scenario('vendor-bid', async () => {
  await drive(['goto', '/homeowner/services']);
  await drive(['click', '--testid', 'services-line-maintenance']);
  await drive(['click', '--role', 'button', '--name', 'Get quotes']);
  await sleep(2000);
  await drive(['goto', '/vendor']);
  await drive(['expect-text', 'Quote requests']);
  await drive(['click', '--testid', 'vendor-request-lawn']);
  await drive(['click', '--testid', 'vendor-submit']);
  await drive(['expect-text', 'Quote sent']);
  await drive(['screenshot', 'vendor-quote-sent.png']);
});

scenario('office-pricing', async () => {
  await drive(['viewport', '--width', '1280', '--height', '900']);
  await drive(['goto', '/']);
  await drive(['click', '--testid', 'launch-office']);
  await drive(['expect-text', 'Tier pricing']);
  await drive(['expect-url', '/office/pricing']);
  const before = await drive(['text']);
  await drive(['click', '--label', 'Increase']);
  const after = await drive(['text']);
  if (before.text === after.text) throw new Error('Increase did not change the pricing page.');
  await drive(['screenshot', 'office-pricing.png']);
});

scenario('office-dispatch', async () => {
  await drive(['click', '--testid', 'office-tab-dispatch']);
  await drive(['expect-text', 'Dispatch']);
  await drive(['click', '--role', 'button', '--name', 'Send 48-hr reminders']);
  await drive(['expect-text', '48-hr reminders sent ✓']);
  await drive(['screenshot', 'office-dispatch.png']);
});

scenario('office-quotes', async () => {
  await drive(['click', '--testid', 'office-tab-quotes']);
  await drive(['expect-text', 'Add-on quotes']);
  await drive(['expect-text', 'Coordination fees']);
  await drive(['screenshot', 'office-quotes.png']);
});

scenario('office-requests', async () => {
  await drive(['click', '--testid', 'office-tab-requests']);
  await drive(['expect-text', 'Requests']);
  await drive(['click', '--testid', 'requests-filter-projects']);
  await drive(['expect-text', 'Pool resurfacing']);
  await drive(['expect-text', 'Roof inspection after the last storm']);
  await drive(['screenshot', 'office-requests.png']);
});

function writeScore(evidence, results) {
  const passed = results.filter((item) => item.ok).length;
  const score = {
    skill: 'verify-php',
    threshold: THRESHOLD,
    score: results.length ? passed / results.length : 0,
    passed,
    total: results.length,
    elapsedMs: Date.now() - started,
    scenarios: results,
  };
  const body = `${JSON.stringify(score, null, 2)}\n`;
  if (evidence) writeFileSync(join(evidence, 'score.json'), body);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  if (evidence && existsSync(evidence)) cpSync(evidence, OUT, { recursive: true });
  else writeFileSync(join(OUT, 'score.json'), body);
  console.log(body);
  return score;
}

async function main() {
  await drive(['cleanup']).catch(() => {});
  await sleep(300);
  let evidence = null;
  const results = [];
  try {
    const session = await launch();
    evidence = session.evidence;
    for (const item of scenarios) {
      const at = Date.now();
      try {
        await item.run();
        results.push({ id: item.id, ok: true, elapsedMs: Date.now() - at });
        console.error(`pass ${item.id} ${Date.now() - at}ms`);
      } catch (error) {
        const message = error.message || String(error);
        results.push({ id: item.id, ok: false, elapsedMs: Date.now() - at, error: message });
        console.error(`fail ${item.id}: ${message}`);
        for (const rest of scenarios.slice(results.length)) {
          results.push({ id: rest.id, ok: false, elapsedMs: 0, error: 'Not run because an earlier scenario failed.' });
        }
        break;
      }
    }
  } catch (error) {
    console.error(error.stack || error.message || error);
    if (!results.length) {
      results.push({ id: 'launch', ok: false, elapsedMs: Date.now() - started, error: error.message || String(error) });
    }
  } finally {
    await drive(['cleanup']).catch(() => {});
  }
  const score = writeScore(
    evidence,
    results.length ? results : scenarios.map((item) => ({ id: item.id, ok: false, error: 'Did not run.' })),
  );
  if (score.score < THRESHOLD) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
