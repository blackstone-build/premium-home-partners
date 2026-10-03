#!/usr/bin/env node
// Headless driver for the Premium Home Partners web app.
// One process owns the static server and the browser. Later commands talk to it.
//
//   node .cursor/skills/verify-php/drive.mjs launch
//   node .cursor/skills/verify-php/drive.mjs doctor
//   node .cursor/skills/verify-php/drive.mjs click --testid launch-homeowner
//   node .cursor/skills/verify-php/drive.mjs click --role button --name "Set up my home"
//   node .cursor/skills/verify-php/drive.mjs expect-text "OFFLINE DEMO"
//   node .cursor/skills/verify-php/drive.mjs screenshot launcher.png
//   node .cursor/skills/verify-php/drive.mjs cleanup

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = join(ROOT, 'apps/mobile/dist');
const STAMP = join(DIST, '.verify-php-demo');
const RUN_DIR = '/tmp/verify-php';
const SOCK = join(RUN_DIR, 'sock');
const SESSION = join(RUN_DIR, 'session.json');
const PORT = Number(process.env.VERIFY_PHP_PORT || 8117);
const BASE = `http://127.0.0.1:${PORT}`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {
    return '';
  }
}

function killIfOurs(pid, needle) {
  if (!pid) return;
  const cmd = cmdline(pid);
  if (!cmd) return;
  if (!cmd.includes(needle)) {
    throw new Error(`Refusing to kill pid ${pid}. Command was "${cmd.trim()}".`);
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

function readSession() {
  try {
    return JSON.parse(readFileSync(SESSION, 'utf8'));
  } catch {
    return null;
  }
}

function send(payload) {
  return new Promise((resolvePromise, reject) => {
    const sock = connect(SOCK);
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('Driver timed out after 60s.'));
    }, 60_000);
    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('end', () => {
      clearTimeout(timer);
      try {
        resolvePromise(JSON.parse(buf));
      } catch {
        reject(new Error(`Bad reply: ${buf.slice(0, 400)}`));
      }
    });
    sock.write(JSON.stringify(payload) + '\n');
  });
}

async function client(command, flags) {
  const msg = { ...flags, command, _: (flags._ || []).slice(1) };
  if (command === 'cleanup' && !existsSync(SOCK)) {
    const session = readSession();
    if (session) {
      killIfOurs(session.serverPid, 'e2e/serve.mjs');
      killIfOurs(session.pid, 'drive.mjs');
      rmSync(RUN_DIR, { recursive: true, force: true });
    }
    console.log(JSON.stringify({ ok: true, cleaned: true, evidence: session?.evidence || null }));
    return;
  }
  let reply;
  try {
    reply = await send(msg);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
  console.log(JSON.stringify(reply, null, 2));
  if (!reply.ok) process.exit(1);
}

function buildDemo() {
  return new Promise((resolvePromise, reject) => {
    const env = { ...process.env };
    delete env.EXPO_PUBLIC_SUPABASE_URL;
    delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    env.EXPO_PUBLIC_DEMO_MODE = '1';
    const child = spawn('npm', ['run', 'build:web'], { cwd: ROOT, env, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`npm run build:web exited ${code}`));
      else resolvePromise();
    });
  });
}

async function launch() {
  mkdirSync(RUN_DIR, { recursive: true });
  if (existsSync(SOCK)) {
    try {
      const reply = await send({ command: 'doctor' });
      if (reply.ok) {
        console.error(`A verification instance is already up at ${reply.url}. Refusing to start a second one. Run cleanup first.`);
        process.exit(2);
      }
    } catch {
      rmSync(SOCK, { force: true });
    }
  }
  if (!existsSync(join(DIST, 'index.html')) || !existsSync(STAMP)) {
    await buildDemo();
    writeFileSync(STAMP, `demo\n${new Date().toISOString()}\n`);
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const evidence = `/tmp/verify-php-evidence/${runId}`;
  mkdirSync(evidence, { recursive: true });

  const server = spawn(process.execPath, [join(ROOT, 'e2e/serve.mjs'), DIST, String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  const ready = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not listen. ${serverLog}`)), 20_000);
    const check = () => {
      if (serverLog.includes(`http://localhost:${PORT}`)) {
        clearTimeout(timer);
        resolvePromise();
      }
    };
    server.stdout.on('data', check);
    server.stderr.on('data', check);
    server.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}. ${serverLog}`));
    });
  });
  void ready;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByText('One home, four apps').first().waitFor({ timeout: 30_000 });

  const session = {
    pid: process.pid,
    serverPid: server.pid,
    port: PORT,
    url: BASE,
    evidence,
    runId,
  };
  writeFileSync(SESSION, JSON.stringify(session, null, 2));

  const sockets = createServer({ allowHalfOpen: true }, (socket) => {
    let buf = '';
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buf += chunk;
      const end = buf.indexOf('\n');
      if (end < 0) return;
      const raw = buf.slice(0, end);
      buf = buf.slice(end + 1);
      handle(raw)
        .then((result) => {
          if (!socket.writable) return;
          socket.end(JSON.stringify(result) + '\n');
        })
        .catch((err) => {
          if (!socket.writable) return;
          socket.end(JSON.stringify({ ok: false, error: err.message || String(err) }) + '\n');
        });
    });
  });
  await new Promise((resolvePromise, reject) => {
    sockets.once('error', reject);
    sockets.listen(SOCK, resolvePromise);
  });

  async function visibleText() {
    return page.locator('body').innerText();
  }

  function visible(locator) {
    return locator.filter({ visible: true }).first();
  }

  async function target(msg) {
    if (msg.testid) return visible(page.getByTestId(msg.testid));
    if (msg.label) return visible(page.getByLabel(msg.label, { exact: true }));
    if (msg.role) return visible(page.getByRole(msg.role, { name: msg.name, exact: msg.exact === true || msg.exact === 'true' }));
    if (msg.text) return visible(page.getByText(msg.text, { exact: msg.exact === true || msg.exact === 'true' }));
    throw new Error('Name a --testid, --role and --name, --label, or --text.');
  }

  async function handle(raw) {
    const msg = JSON.parse(raw);
    if (msg.command === 'doctor') {
      const res = await fetch(BASE + '/');
      const text = await visibleText();
      const offline = text.includes('OFFLINE DEMO');
      return {
        ok: res.status === 200 && offline,
        url: page.url(),
        port: PORT,
        pid: process.pid,
        serverPid: server.pid,
        status: res.status,
        offlineDemo: offline,
        evidence,
        error: offline ? undefined : 'Page is up but OFFLINE DEMO is not visible. Rebuild without Supabase env.',
      };
    }
    if (msg.command === 'goto') {
      const path = msg._?.[0] || msg.path || '/';
      await page.goto(BASE + (path.startsWith('/') ? path : `/${path}`), { waitUntil: 'domcontentloaded' });
      return { ok: true, url: page.url() };
    }
    if (msg.command === 'click') {
      const loc = await target(msg);
      await loc.click();
      return { ok: true, url: page.url() };
    }
    if (msg.command === 'fill') {
      const loc = await target(msg);
      await loc.fill(String(msg.value ?? ''));
      return { ok: true, url: page.url() };
    }
    if (msg.command === 'expect-text') {
      const text = msg._?.[0] || msg.text;
      if (!text) throw new Error('expect-text needs the text.');
      const loc = visible(page.getByText(text, { exact: msg.exact === true || msg.exact === 'true' }));
      await loc.waitFor({ timeout: 20_000 });
      return { ok: true, url: page.url(), found: text };
    }
    if (msg.command === 'expect-url') {
      const path = msg._?.[0] || msg.path;
      const url = page.url();
      const ok = url.includes(path);
      return { ok, url, error: ok ? undefined : `URL ${url} does not include ${path}` };
    }
    if (msg.command === 'text') {
      const text = await visibleText();
      return { ok: true, url: page.url(), text: text.slice(0, 4000) };
    }
    if (msg.command === 'screenshot') {
      const name = msg._?.[0] || 'screen.png';
      const file = name.startsWith('/') ? name : join(evidence, name);
      if (!file.startsWith('/tmp/verify-php-evidence/')) {
        throw new Error('Screenshots stay under /tmp/verify-php-evidence.');
      }
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: true });
      return { ok: true, path: file, url: page.url() };
    }
    if (msg.command === 'viewport') {
      await page.setViewportSize({ width: Number(msg.width || 390), height: Number(msg.height || 844) });
      return { ok: true, width: Number(msg.width || 390), height: Number(msg.height || 844) };
    }
    if (msg.command === 'reset') {
      await page.evaluate(() => localStorage.clear());
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.getByText('One home, four apps').first().waitFor({ timeout: 30_000 });
      return { ok: true, url: page.url() };
    }
    if (msg.command === 'cleanup') {
      const evidencePath = evidence;
      setTimeout(() => {
        sockets.close();
        browser.close().finally(() => {
          killIfOurs(server.pid, 'e2e/serve.mjs');
          rmSync(RUN_DIR, { recursive: true, force: true });
          process.exit(0);
        });
      }, 50);
      return { ok: true, cleaned: true, evidence: evidencePath };
    }
    throw new Error(`Unknown command ${msg.command}`);
  }

  console.log(JSON.stringify({ ok: true, url: BASE, evidence, pid: process.pid, serverPid: server.pid }, null, 2));
  await new Promise(() => {});
}

const parsed = args(process.argv.slice(2));
const command = parsed._[0];
if (!command) {
  console.error('Usage: node .cursor/skills/verify-php/drive.mjs <launch|doctor|goto|click|fill|expect-text|expect-url|text|screenshot|viewport|reset|cleanup>');
  process.exit(1);
}
if (command === 'launch') {
  launch().catch((err) => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
} else {
  client(command, parsed);
}
