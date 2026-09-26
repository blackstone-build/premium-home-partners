// Services v2 (docs/SERVICES_V2.md, supabase/migrations/20260926000000_services_v2.sql):
// the service-line catalog, "Show us" photo requests and contracted projects.
// Every RPC's permissions, validation and transitions; the routing side
// effects (visit task, quote request, project); RLS and the request-photos
// storage policies; the realtime publication; and what seed_demo seeds.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  HOME, SEED_COUNTS, U, VISIT, applyMigration, as, asAnon, count, counts, createDb, one, rows, rpc,
} from './harness.mjs';

const SERVICES_V2 = '20260926000000_services_v2.sql';

/** Seeded requests (seed_demo): f = service request, numbered like the homeowner. */
const SR = {
  david: 'f0000000-0000-4000-8000-000000000007',
  whit: 'f0000000-0000-4000-8000-000000000008',
  priya: 'f0000000-0000-4000-8000-000000000009',
};
const PLAN_ELENA = 'c0000000-0000-4000-8000-000000000005';

let db;
before(async () => {
  db = await createDb();
});
after(async () => {
  await db?.close();
});

const reset = () => as(db, U.office, (tx) => rpc(tx, 'reset_demo'));
const call = (userId, fn, args) => as(db, userId, (tx) => rpc(tx, fn, args));
const anonCall = (fn, args) => asAnon(db, (tx) => rpc(tx, fn, args));
/** Expect a user-facing RPC error (errcode P0001) with exactly this message. */
const fails = (promise, message) => assert.rejects(promise, (e) => {
  assert.equal(e.message, message);
  assert.equal(e.code, 'P0001');
  return true;
});
const denied = (promise) => assert.rejects(promise, { code: '42501' });

const NO_ACCESS = "You don't have access to that.";
const NOT_FOUND = "We couldn't find that request.";
const HANDLED = 'This request was already handled.';
const NO_ESTIMATE = "There's no estimate waiting for your approval.";
const CANT_CANCEL = "This request can't be canceled now.";
const BAD_PHOTO = "That photo doesn't belong to this request.";
const PAST_STEP = 'This project is past that step.';

let seq = 0;
/** A "Show us" photo request. Descriptions are unique so the double-tap guard never merges two test requests. */
const showUs = (userId, args = {}) => call(userId, 'create_service_request', {
  p_kind: 'photo', p_category: null, p_title: null, p_description: `The garage door squeaks, take ${++seq}.`,
  p_room: 'garage', p_urgency: 'whenever', ...args,
});
/** A contracted-project assessment request. */
const askProject = (userId, category, args = {}) => call(userId, 'create_service_request', {
  p_kind: 'project', p_category: category, p_title: null, p_description: `We'd like an assessment, take ${++seq}.`,
  p_room: null, p_urgency: 'soon', ...args,
});
const route = (requestId, routeName, args = {}) => call(U.office, 'office_route_request', {
  p_request_id: requestId, p_route: routeName, p_category: null, p_note: null, ...args,
});
const update = (requestId, status, args = {}) => call(U.office, 'office_update_project', {
  p_request_id: requestId, p_status: status, p_assessment_at: null, p_estimate_low: null, p_estimate_high: null, p_note: null, ...args,
});
const request = (id) => one(db, 'select * from service_requests where id = $1', [id]);
const photoPath = (requestId) => `${requestId}/${randomUUID()}.jpg`;
const at = (days, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
const sameTime = (a, b) => assert.equal(new Date(a).getTime(), new Date(b).getTime());

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** docs/SERVICES_V2.md "Catalog", in order: id, line, handled_by, name, sub, base, season_months. */
const CATALOG = [
  ['lawn', 'maintenance', 'network', 'Lawn care', 'Weekly mow, edge and blow', 65, null],
  ['land', 'maintenance', 'network', 'Landscaping', 'Beds, mulch, seasonal color', 1400, null],
  ['win', 'maintenance', 'network', 'Window washing', 'Inside and out, screens', 420, null],
  ['press', 'maintenance', 'network', 'Pressure washing', 'Driveway, walks, siding', 340, null],
  ['gutter', 'maintenance', 'network', 'Gutter cleaning', 'Clean, flush, check downspouts', 225, null],
  ['pest', 'maintenance', 'network', 'Pest control', 'Quarterly, inside and out', 120, null],
  ['carpet', 'maintenance', 'network', 'Carpet & upholstery', 'Deep clean, spot treatment', 280, null],
  ['tree', 'maintenance', 'network', 'Tree service', 'Trim, removal, stump grind', 780, null],
  ['lights', 'seasonal', 'network', 'Holiday lights', 'Roofline install and removal', 1150, [10, 11, 12]],
  ['leaves', 'seasonal', 'network', 'Leaf removal', 'Beds, lawn and gutters', 260, [10, 11, 12]],
  ['hvac_tune', 'seasonal', 'network', 'HVAC tune-up', 'Spring cooling / fall heating check', 160, [3, 4, 9, 10]],
  ['winterize', 'seasonal', 'network', 'Winterize', 'Irrigation blow-out, hose bibs', 150, [10, 11]],
  ['chimney', 'seasonal', 'network', 'Chimney sweep', 'Sweep and safety inspection', 240, [9, 10, 11]],
  ['pool_open', 'seasonal', 'network', 'Pool opening', 'Uncover, balance, start up', 325, [3, 4, 5]],
  ['pool_close', 'seasonal', 'network', 'Pool closing', 'Winterize and cover', 325, [9, 10]],
  ['storm', 'seasonal', 'network', 'Storm prep', 'Generator service, tie-downs', 210, [3, 4, 5, 6]],
  ['roof', 'contracted', 'php', 'Roofing', 'Inspections, repairs, replacement', null, null],
  ['pool', 'contracted', 'php', 'Pools', 'Repair, resurfacing, equipment', null, null],
  ['kitchen_bath', 'contracted', 'php', 'Kitchen & bath refresh', 'Updates without a full gut', null, null],
  ['cabinets', 'contracted', 'php', 'Cabinet refinishing', 'Paint, reface, new hardware', null, null],
  ['floors', 'contracted', 'php', 'Flooring', 'Refinish, repair, replace', null, null],
  ['paint', 'contracted', 'php', 'Painting', 'Interior and exterior', null, null],
  ['outdoor', 'contracted', 'php', 'Decks, patios & fences', 'Build, repair, restain', null, null],
  ['doors_windows', 'contracted', 'php', 'Doors & windows', 'Repair and replacement', null, null],
  ['carpentry', 'contracted', 'php', 'Drywall, trim & carpentry', 'Patches, built-ins, trim', null, null],
  ['project', 'contracted', 'php', 'Something bigger', 'Remodels, additions, anything else', null, null],
];
const NETWORK = CATALOG.filter((c) => c[2] === 'network').map((c) => c[0]);
const CONTRACTED = CATALOG.filter((c) => c[2] === 'php').map((c) => c[0]);

describe('catalog: service lines', () => {
  before(reset);

  test('26 categories in three lines, exactly as the spec table, in sort order', async () => {
    const r = await rows(db, `select id, line, handled_by, name, sub, base::float as base, season_months, sort
                              from service_categories order by sort`);
    assert.deepEqual(r.map((c) => [c.id, c.line, c.handled_by, c.name, c.sub, c.base, c.season_months]), CATALOG);
    assert.deepEqual(r.map((c) => c.sort), CATALOG.map((_, i) => (i + 1) * 10));
    assert.equal(NETWORK.length, 16);
    assert.equal(CONTRACTED.length, 10);
  });

  test('every signed-in role reads the catalog; anon reads none of it', async () => {
    for (const who of [U.elena, U.jordan, U.marcus, U.sam, U.office]) {
      assert.equal(await as(db, who, (tx) => count(tx, 'service_categories')), 26, who);
    }
    assert.equal(await asAnon(db, (tx) => count(tx, 'service_categories')), 0);
  });

  test('constraints keep lines, handlers and seasons consistent', async () => {
    const bad = [
      `('x1', 'X', 'contracted', 'network', null)`,
      `('x2', 'X', 'maintenance', 'php', null)`,
      `('x3', 'X', 'bogus', 'network', null)`,
      `('x4', 'X', 'seasonal', 'network', '{13}')`,
      `('x5', 'X', 'seasonal', 'network', '{0,5}')`,
      `('x6', 'X', 'seasonal', 'network', '{}')`,
    ];
    for (const v of bad) {
      await assert.rejects(db.query(`insert into service_categories (id, name, line, handled_by, season_months) values ${v}`),
        { code: '23514' }, v);
    }
    assert.equal(await count(db, 'service_categories'), 26);
  });
});

// ---------------------------------------------------------------------------
// request_quote
// ---------------------------------------------------------------------------

describe('request_quote: partner quotes for network services only', () => {
  before(reset);

  test('refuses every contracted category, creating nothing', async () => {
    for (const id of CONTRACTED) {
      await fails(call(U.elena, 'request_quote', { p_category: id }), 'Request an assessment for this service instead.');
    }
    assert.equal(await count(db, 'quote_requests'), 0);
  });

  test('new maintenance and seasonal categories open a quote request vendors can see', async () => {
    const gutter = await call(U.elena, 'request_quote', { p_category: 'gutter' });
    assert.deepEqual([gutter.category, gutter.scope, Number(gutter.base), gutter.status], ['gutter', 'Clean, flush, check downspouts', 225, 'open']);
    // Seasonal services can be requested in any month; "In season" is only a badge.
    const storm = await call(U.elena, 'request_quote', { p_category: 'storm' });
    assert.equal(Number(storm.base), 210);
    assert.equal(await as(db, U.sam, (tx) => count(tx, 'quote_requests', 'id = any ($1)', [[gutter.id, storm.id]])), 2);
  });

  test('unknown categories and the other roles are still refused', async () => {
    await fails(call(U.elena, 'request_quote', { p_category: 'hot_tub' }), "That service isn't available yet.");
    await fails(call(U.office, 'request_quote', { p_category: 'lawn' }), NO_ACCESS);
    await denied(anonCall('request_quote', { p_category: 'lawn' }));
  });
});

// ---------------------------------------------------------------------------
// create_service_request
// ---------------------------------------------------------------------------

describe('create_service_request', () => {
  before(reset);

  test('a homeowner sends a photo request: new, on their home, titled from the description', async () => {
    const id = await call(U.elena, 'create_service_request', {
      p_kind: 'photo', p_category: null, p_title: null, p_description: '  The   hall closet door  is off its track. ',
      p_room: 'bedroom', p_urgency: 'soon',
    });
    assert.match(id, /^[0-9a-f-]{36}$/);
    const r = await request(id);
    assert.equal(r.home_id, HOME.elena);
    assert.equal(r.requester_id, U.elena);
    assert.deepEqual([r.kind, r.category, r.status, r.route, r.room, r.urgency], ['photo', null, 'new', null, 'bedroom', 'soon']);
    assert.equal(r.description, 'The   hall closet door  is off its track.');
    assert.equal(r.title, 'The hall closet door is off its track.');
    assert.deepEqual([r.visit_id, r.quote_request_id, r.assessment_at, r.estimate_low, r.estimate_high, r.office_note],
      [null, null, null, null, null, null]);
    assert.ok(r.created_at && r.updated_at);
  });

  test('the title defaults to the category name, else the start of the description; a given title wins', async () => {
    assert.equal((await request(await showUs(U.elena, { p_category: 'press' }))).title, 'Pressure washing');
    assert.equal((await request(await showUs(U.elena, { p_title: '  Loose   stair  railing ' }))).title, 'Loose stair railing');
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const long = (await request(await showUs(U.elena, { p_description: words }))).title;
    assert.ok(long.length <= 80, long);
    assert.ok(long.endsWith('…'), long);
    assert.ok(words.startsWith(long.slice(0, -1)), 'cut at a word');
    assert.ok(/word\d+…$/.test(long), 'no half word before the ellipsis');
    // Exactly 80 is fine; 81 is refused.
    assert.equal((await request(await showUs(U.elena, { p_title: 't'.repeat(80) }))).title, 't'.repeat(80));
    await fails(showUs(U.elena, { p_title: 't'.repeat(81) }), 'Use a title of 80 characters or fewer.');
  });

  test('a project needs a contracted category, and is titled with its name', async () => {
    await fails(askProject(U.elena, null), 'Pick a service for this project.');
    await fails(askProject(U.elena, '  '), 'Pick a service for this project.');
    await fails(askProject(U.elena, 'lawn'), 'Get quotes for this service instead.');
    await fails(askProject(U.elena, 'lights'), 'Get quotes for this service instead.');
    await fails(askProject(U.elena, 'hot_tub'), "That service isn't available yet.");
    const r = await request(await askProject(U.elena, 'cabinets', { p_room: 'kitchen' }));
    assert.deepEqual([r.kind, r.category, r.title, r.status, r.room, r.urgency], ['project', 'cabinets', 'Cabinet refinishing', 'new', 'kitchen', 'soon']);
    // A photo request may carry any known category, including a contracted one.
    assert.equal((await request(await showUs(U.elena, { p_category: 'roof' }))).category, 'roof');
    await fails(showUs(U.elena, { p_category: 'hot_tub' }), "That service isn't available yet.");
  });

  test('validates kind, description, room and urgency', async () => {
    for (const kind of [null, '', 'video', 'PHOTO']) {
      await fails(showUs(U.elena, { p_kind: kind }), "That request type isn't supported.");
    }
    for (const d of [null, '', '   \n ', '\t\r\n']) await fails(showUs(U.elena, { p_description: d }), "Tell us what's going on.");
    // Surrounding newlines are trimmed; the ones inside are kept.
    const multi = await request(await showUs(U.elena, { p_description: '\n  Two things:\n1. latch\n2. hinge \n\n' }));
    assert.deepEqual([multi.description, multi.title], ['Two things:\n1. latch\n2. hinge', 'Two things: 1. latch 2. hinge']);
    await fails(showUs(U.elena, { p_description: 'x'.repeat(1001) }), 'Keep the description to 1,000 characters or fewer.');
    assert.equal((await request(await showUs(U.elena, { p_description: 'y'.repeat(1000) }))).description.length, 1000);
    await fails(showUs(U.elena, { p_room: 'attic' }), 'Pick where in the home.');
    await fails(showUs(U.elena, { p_urgency: 'asap' }), 'Pick how soon you need this.');
    for (const room of ['kitchen', 'bath', 'bedroom', 'living', 'exterior', 'garage', 'other', null, '']) {
      assert.equal((await request(await showUs(U.elena, { p_room: room }))).room, room || null);
    }
    for (const u of ['whenever', 'soon', 'urgent']) assert.equal((await request(await showUs(U.elena, { p_urgency: u }))).urgency, u);
    assert.equal((await request(await showUs(U.elena, { p_urgency: null }))).urgency, 'whenever');
  });

  test('optional parameters can be left out', async () => {
    const id = await call(U.elena, 'create_service_request', { p_kind: 'photo', p_description: 'A dripping outdoor spigot.' });
    const r = await request(id);
    assert.deepEqual([r.title, r.category, r.room, r.urgency], ['A dripping outdoor spigot.', null, null, 'whenever']);
  });

  test('a double tap returns the first request; a different one, or after it moves on, is new', async () => {
    const args = { p_description: 'Water under the kitchen sink.', p_room: 'kitchen' };
    const n = await count(db, 'service_requests');
    const a = await showUs(U.elena, args);
    const b = await showUs(U.elena, args);
    assert.equal(b, a);
    assert.equal(await count(db, 'service_requests'), n + 1);
    const c = await showUs(U.elena, { ...args, p_description: 'Water under the bathroom sink.' });
    assert.notEqual(c, a);
    // The same words from someone else, or once the first is no longer new, make a new request.
    assert.notEqual(await showUs(U.david, args), a);
    await call(U.elena, 'cancel_service_request', { p_request_id: a });
    assert.notEqual(await showUs(U.elena, args), a);
  });

  test('homeowners with a home only', async () => {
    const n = await count(db, 'service_requests');
    await fails(showUs(U.jordan), 'Add your home before sending a request.');
    for (const who of [U.marcus, U.sam, U.office]) await fails(showUs(who), NO_ACCESS);
    await denied(anonCall('create_service_request', { p_kind: 'photo', p_description: 'x' }));
    assert.equal(await count(db, 'service_requests'), n);
  });

  test('holds the demo lock shared, so a reset never interleaves', async () => {
    const KEY = `classid::bigint = (hashtextextended('php:demo-data', 0) >> 32) & 4294967295
                 and objid::bigint = hashtextextended('php:demo-data', 0) & 4294967295 and objsubid = 1`;
    const modes = await as(db, U.elena, async (tx) => {
      await rpc(tx, 'create_service_request', { p_kind: 'photo', p_description: 'Lock check.' });
      return (await rows(tx, `select mode from pg_locks where locktype = 'advisory' and granted and ${KEY}`)).map((r) => r.mode);
    });
    assert.deepEqual(modes, ['ShareLock']);
  });
});

// ---------------------------------------------------------------------------
// add_service_request_photo
// ---------------------------------------------------------------------------

describe('add_service_request_photo', () => {
  let req;
  before(async () => {
    await reset();
    req = await showUs(U.elena);
  });

  test('the requester records up to 4 photos; the same path twice is one row', async () => {
    const paths = [1, 2, 3, 4].map(() => photoPath(req));
    const first = await call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: paths[0] });
    assert.deepEqual([first.request_id, first.path], [req, paths[0]]);
    assert.ok(first.id && first.created_at);
    assert.equal((await call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: paths[0] })).id, first.id);
    for (const p of paths.slice(1)) await call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: p });
    assert.equal(await count(db, 'service_request_photos', 'request_id = $1', [req]), 4);
    await fails(call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: photoPath(req) }), 'You can add up to 4 photos.');
    // A retry of a recorded path still answers with its row.
    assert.equal((await call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: paths[3] })).path, paths[3]);
    assert.equal(await count(db, 'service_request_photos', 'request_id = $1', [req]), 4);
  });

  test("the path is one plainly named file directly in the request's folder", async () => {
    const other = await showUs(U.elena);
    for (const p of [
      null, '', `${other}/x.jpg`, `${SR.david}/x.jpg`, 'x.jpg', `${other}/`, `${other}/a/b.jpg`, `/${other}/x.jpg`,
      `${other}/bad name.jpg`, `${other}/${'n'.repeat(101)}`, `${other.toUpperCase()}/x.jpg`, `${other}x/y.jpg`,
    ]) {
      await fails(call(U.elena, 'add_service_request_photo', { p_request_id: req, p_path: p }), BAD_PHOTO);
    }
    const ok = await call(U.elena, 'add_service_request_photo', { p_request_id: other, p_path: `${other}/IMG_0001-a.b_c.jpeg` });
    assert.equal(ok.request_id, other);
  });

  test('only the requester', async () => {
    const p = photoPath(req);
    await fails(call(U.david, 'add_service_request_photo', { p_request_id: req, p_path: p }), NOT_FOUND);
    await fails(call(U.elena, 'add_service_request_photo', { p_request_id: SR.david, p_path: `${SR.david}/x.jpg` }), NOT_FOUND);
    await fails(call(U.elena, 'add_service_request_photo', { p_request_id: randomUUID(), p_path: p }), NOT_FOUND);
    for (const who of [U.office, U.marcus, U.sam]) {
      await fails(call(who, 'add_service_request_photo', { p_request_id: req, p_path: p }), NO_ACCESS);
    }
    await denied(anonCall('add_service_request_photo', { p_request_id: req, p_path: p }));
  });
});

// ---------------------------------------------------------------------------
// Storage: request-photos
// ---------------------------------------------------------------------------

describe('storage: request-photos bucket', () => {
  let req;
  before(async () => {
    await reset();
    req = await showUs(U.elena);
  });
  after(async () => {
    // seed_demo never deletes storage objects; leave the bucket empty for later counts.
    await db.query(`delete from storage.objects where bucket_id = 'request-photos'`);
  });

  const put = (userId, name) =>
    as(db, userId, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('request-photos', $1, auth.uid())`, [name]));
  const seen = (userId) => as(db, userId, (tx) => count(tx, 'storage.objects', `bucket_id = 'request-photos'`));

  test('the bucket is private, for JPEG, PNG or WebP photos up to 10 MB', async () => {
    const b = await one(db, `select public, file_size_limit::int as max, allowed_mime_types from storage.buckets where id = 'request-photos'`);
    assert.deepEqual(b, { public: false, max: 10485760, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
  });

  test("the request's homeowner uploads directly into its folder; nobody else, nowhere else", async () => {
    await put(U.elena, photoPath(req));
    await denied(put(U.elena, photoPath(SR.david)));
    await denied(put(U.elena, `${randomUUID()}.jpg`));
    await denied(put(U.elena, `${req}/nested/${randomUUID()}.jpg`));
    await denied(put(U.elena, `not-a-uuid/${randomUUID()}.jpg`));
    for (const who of [U.david, U.marcus, U.dana, U.office, U.sam]) await denied(put(who, photoPath(req)));
    await denied(asAnon(db, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('request-photos', $1)`, [photoPath(req)])));
    // A tech linked to a request (Dana, Priya's) still can't upload to it.
    await denied(put(U.dana, photoPath(SR.priya)));
    await put(U.david, photoPath(SR.david));
  });

  test('the owner and the office read (and so sign URLs); a tech only once the request is on their visit', async () => {
    assert.equal(await seen(U.elena), 1);
    assert.equal(await seen(U.david), 1);
    assert.equal(await seen(U.office), 2);
    for (const who of [U.marcus, U.dana, U.sam, U.whit, U.jordan]) assert.equal(await seen(who), 0, who);
    assert.equal(await asAnon(db, (tx) => count(tx, 'storage.objects', `bucket_id = 'request-photos'`)), 0);

    await route(req, 'visit');
    assert.equal(await seen(U.marcus), 1);
    assert.equal(await seen(U.dana), 0);
    assert.equal(await seen(U.sam), 0);
  });

  test('visit-photos rules are unchanged: homeowners still cannot upload there', async () => {
    await denied(as(db, U.elena, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('visit-photos', $1)`, [`${VISIT.elena}/x/before-1.jpg`])));
  });
});

// ---------------------------------------------------------------------------
// office_route_request
// ---------------------------------------------------------------------------

describe('office_route_request', () => {
  beforeEach(reset);

  test("visit: a Client request task on the home's next visit; the request is scheduled", async () => {
    const req = await showUs(U.elena, { p_description: 'The dishwasher door drops open.' });
    const out = await route(req, 'visit');
    assert.match(out.visit_task_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...out, visit_task_id: 'x' }, {
      request_id: req, route: 'visit', status: 'scheduled', kind: 'photo', category: null,
      visit_id: VISIT.elena, visit_task_id: 'x', quote_request_id: null,
    });
    const task = await one(db, 'select * from visit_tasks where id = $1', [out.visit_task_id]);
    assert.deepEqual([task.visit_id, task.task_key, task.name, task.request_id, task.done, task.part_id, task.appliance_id],
      [VISIT.elena, 'request', 'Client request: The dishwasher door drops open.', req, false, null, null]);
    const r = await request(req);
    assert.deepEqual([r.status, r.route, r.visit_id], ['scheduled', 'visit', VISIT.elena]);
    // The homeowner sees it on her visit; Marcus (the visit's tech) now reads the request.
    assert.equal(await as(db, U.elena, (tx) => count(tx, 'visit_tasks', 'request_id = $1', [req])), 1);
    assert.equal(await as(db, U.marcus, (tx) => count(tx, 'visit_tasks', 'request_id = $1', [req])), 1);
    assert.deepEqual(await as(db, U.marcus, (tx) => rows(tx, 'select id, description from service_requests')),
      [{ id: req, description: 'The dishwasher door drops open.' }]);
    assert.equal(await count(db, 'visit_tasks', 'visit_id = $1', [VISIT.elena]), 8);
    await fails(route(req, 'visit'), HANDLED);
    await fails(route(req, 'advice', { p_note: 'x' }), HANDLED);
  });

  test("visit: the earliest open visit from today on, even after today's window has passed", async () => {
    // Today's visit ended at 00:40; one from yesterday was never done; another is in 30 days.
    await db.query(`update visits set window_start = private.chicago_at(private.chicago_today(), time '00:10'),
                                      window_end = private.chicago_at(private.chicago_today(), time '00:40') where id = $1`, [VISIT.elena]);
    const later = (await one(db, `insert into visits (plan_id, home_id, tech_id, window_start, window_end, status)
      values ($1, $2, $3, now() + interval '30 days', now() + interval '30 days 2 hours', 'scheduled') returning id`,
    [PLAN_ELENA, HOME.elena, U.marcus])).id;
    await db.query(`insert into visits (plan_id, home_id, tech_id, window_start, window_end, status)
      values ($1, $2, $3, private.chicago_at(private.chicago_today() - 1, time '09:00'),
              private.chicago_at(private.chicago_today() - 1, time '11:00'), 'scheduled')`, [PLAN_ELENA, HOME.elena, U.marcus]);
    const canceled = (await one(db, `insert into visits (plan_id, home_id, tech_id, window_start, window_end, status)
      values ($1, $2, $3, now() + interval '10 days', now() + interval '10 days 2 hours', 'canceled') returning id`,
    [PLAN_ELENA, HOME.elena, U.marcus])).id;

    assert.equal((await route(await showUs(U.elena), 'visit')).visit_id, VISIT.elena);
    // Once today's visit is done, the next one (skipping the canceled visit) takes new requests.
    await db.query(`update visits set status = 'done' where id = $1`, [VISIT.elena]);
    const out = await route(await showUs(U.elena), 'visit');
    assert.equal(out.visit_id, later);
    assert.notEqual(out.visit_id, canceled);
  });

  test('visit: refused when the home has no open visit from today on', async () => {
    const msg = "There's no visit scheduled for this home.";
    const req = await showUs(U.david);
    await db.query(`update visits set status = 'done' where id = $1`, [VISIT.david]);
    await fails(route(req, 'visit'), msg);
    await db.query(`update visits set status = 'canceled' where id = $1`, [VISIT.david]);
    await fails(route(req, 'visit'), msg);
    await db.query(`update visits set status = 'scheduled', window_start = window_start - interval '3 days',
                                      window_end = window_end - interval '3 days' where id = $1`, [VISIT.david]);
    await fails(route(req, 'visit'), msg);
    // Nothing changed.
    assert.equal((await request(req)).status, 'new');
    assert.equal(await count(db, 'visit_tasks', 'request_id = $1', [req]), 0);
  });

  test('visit: the linked tech ticks the client request like any other task', async () => {
    const task = await one(db, 'select id from visit_tasks where request_id = $1', [SR.priya]);
    await call(U.dana, 'advance_visit', { p_visit: VISIT.priya });
    await call(U.dana, 'advance_visit', { p_visit: VISIT.priya });
    await fails(call(U.dana, 'complete_visit', { p_visit: VISIT.priya }), 'Check off every task before completing the visit.');
    const t = await call(U.dana, 'set_task_done', { p_task: task.id, p_done: true });
    assert.equal(t.done, true);
    assert.equal(t.request_id, SR.priya);
  });

  test('quotes: a network category opens a quote request just as request_quote does', async () => {
    const req = await showUs(U.elena, { p_description: 'Gutters overflowing at the back.' });
    await fails(route(req, 'quotes'), 'Pick a partner service for quotes.');
    await fails(route(req, 'quotes', { p_category: 'roof' }), 'Pick a partner service for quotes.');
    await fails(route(req, 'quotes', { p_category: 'hot_tub' }), "That service isn't available yet.");
    assert.equal(await count(db, 'quote_requests'), 0);

    const out = await route(req, 'quotes', { p_category: 'gutter' });
    assert.match(out.quote_request_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(out, {
      request_id: req, route: 'quotes', status: 'quoted', kind: 'photo', category: 'gutter',
      visit_id: null, visit_task_id: null, quote_request_id: out.quote_request_id,
    });
    const q = await one(db, 'select * from quote_requests where id = $1', [out.quote_request_id]);
    assert.deepEqual([q.home_id, q.category, q.scope, Number(q.base), q.area, q.home_sqft, q.status, q.bid_count],
      [HOME.elena, 'gutter', 'Clean, flush, check downspouts', 225, '12 Linden Court · Mountain Brook 35213', 3420, 'open', 0]);
    const r = await request(req);
    assert.deepEqual([r.status, r.route, r.category, r.quote_request_id], ['quoted', 'quotes', 'gutter', q.id]);
    // The homeowner's own request_quote finds the same request, and the brokerage flow works on it.
    assert.equal((await call(U.elena, 'request_quote', { p_category: 'gutter' })).id, q.id);
    const bid = await call(U.sam, 'submit_bid', { p_request: q.id, p_price: 210, p_available_on: '2026-10-20' });
    assert.equal((await call(U.elena, 'book_bid', { p_bid: bid.id })).status, 'booked');
    // Sam sees the quote request, never the client's service request.
    assert.equal(await as(db, U.sam, (tx) => count(tx, 'quote_requests', 'id = $1', [q.id])), 1);
    assert.equal(await as(db, U.sam, (tx) => count(tx, 'service_requests')), 0);
  });

  test("quotes: reuses the home's active request for that category", async () => {
    const existing = await call(U.elena, 'request_quote', { p_category: 'press' });
    const req = await showUs(U.elena, { p_category: 'press' });
    const out = await route(req, 'quotes');
    assert.equal(out.quote_request_id, existing.id);
    assert.equal(await count(db, 'quote_requests'), 1);
  });

  test('project: a contracted category makes the request a project under review', async () => {
    const req = await showUs(U.elena, { p_description: 'Soft spot in the deck boards.' });
    await fails(route(req, 'project'), 'Pick a Premium Home service for the project.');
    await fails(route(req, 'project', { p_category: 'lawn' }), 'Pick a Premium Home service for the project.');
    const out = await route(req, 'project', { p_category: 'outdoor', p_note: 'A project manager will call to set up a visit.' });
    assert.deepEqual(out, {
      request_id: req, route: 'project', status: 'reviewing', kind: 'project', category: 'outdoor',
      visit_id: null, visit_task_id: null, quote_request_id: null,
    });
    const r = await request(req);
    assert.deepEqual([r.kind, r.status, r.category, r.title, r.office_note],
      ['project', 'reviewing', 'outdoor', 'Soft spot in the deck boards.', 'A project manager will call to set up a visit.']);
    // It is a project now: the office schedules its assessment.
    assert.equal((await update(req, 'assessment_scheduled', { p_assessment_at: at(2) })).status, 'assessment_scheduled');
    // A photo that already carries a contracted category needs no picker.
    const painted = await showUs(U.elena, { p_category: 'paint' });
    assert.equal((await route(painted, 'project')).category, 'paint');
  });

  test('advice: the reply closes the request', async () => {
    const req = await showUs(U.elena, { p_description: 'Is it normal for the water heater to tick?' });
    for (const note of [null, '', '   ', ' \n\t\r\n ']) await fails(route(req, 'advice', { p_note: note }), 'Add a reply for the client.');
    await fails(route(req, 'advice', { p_note: 'z'.repeat(1001) }), 'Keep the note to 1,000 characters or fewer.');
    const out = await route(req, 'advice', { p_note: '  Yes, that is the tank expanding as it heats. Nothing to worry about. ' });
    assert.deepEqual([out.status, out.route], ['closed', 'advice']);
    assert.equal((await as(db, U.elena, (tx) => one(tx, 'select office_note from service_requests where id = $1', [req]))).office_note,
      'Yes, that is the tank expanding as it heats. Nothing to worry about.');
    await fails(route(req, 'visit'), HANDLED);
  });

  test('a request under review can still be routed; canceled or routed ones cannot', async () => {
    const req = await showUs(U.elena);
    await route(req, 'project', { p_category: 'carpentry' });
    assert.equal((await route(req, 'advice', { p_note: 'This is a quick fix; Marcus will handle it.' })).status, 'closed');
    const gone = await showUs(U.elena);
    await call(U.elena, 'cancel_service_request', { p_request_id: gone });
    await fails(route(gone, 'visit'), 'The client canceled this request.');
    await fails(route(SR.priya, 'visit'), HANDLED);
    await fails(route(SR.david, 'advice', { p_note: 'x' }), HANDLED);
  });

  test('office only; the route and the request must exist', async () => {
    const req = await showUs(U.elena);
    for (const who of [U.elena, U.marcus, U.sam]) await fails(call(who, 'office_route_request', { p_request_id: req, p_route: 'visit' }), NO_ACCESS);
    await denied(anonCall('office_route_request', { p_request_id: req, p_route: 'visit' }));
    await fails(route(randomUUID(), 'visit'), NOT_FOUND);
    for (const r of [null, '', 'email', 'VISIT']) await fails(route(req, r), 'Pick how to handle this request.');
    await fails(route(req, 'visit', { p_note: 'n'.repeat(1001) }), 'Keep the note to 1,000 characters or fewer.');
    assert.equal((await request(req)).status, 'new');
    // p_category and p_note can be left out.
    const out = await call(U.office, 'office_route_request', { p_request_id: req, p_route: 'visit' });
    assert.equal(out.status, 'scheduled');
  });
});

// ---------------------------------------------------------------------------
// office_update_project, approve_estimate, cancel_service_request
// ---------------------------------------------------------------------------

describe('office_update_project', () => {
  beforeEach(reset);

  test('assessment, estimate, approval, work, done', async () => {
    const req = await askProject(U.elena, 'cabinets');
    const when = at(3);
    let r = await update(req, 'assessment_scheduled', { p_assessment_at: when });
    assert.equal(r.status, 'assessment_scheduled');
    sameTime(r.assessment_at, when);
    r = await update(req, 'estimate_sent', { p_estimate_low: 4200, p_estimate_high: 5600, p_note: 'Paint and new hardware, 4 days.' });
    assert.deepEqual([r.status, r.estimate_low, r.estimate_high, r.office_note], ['estimate_sent', 4200, 5600, 'Paint and new hardware, 4 days.']);
    sameTime(r.assessment_at, when);
    // The homeowner sees the range live and approves.
    const mine = await as(db, U.elena, (tx) => one(tx, 'select status, estimate_low::float as lo, estimate_high::float as hi from service_requests where id = $1', [req]));
    assert.deepEqual(mine, { status: 'estimate_sent', lo: 4200, hi: 5600 });
    assert.equal((await call(U.elena, 'approve_estimate', { p_request_id: req })).status, 'approved');
    r = await update(req, 'in_progress');
    assert.equal(r.status, 'in_progress');
    assert.equal((await update(req, 'in_progress')).status, 'in_progress');
    r = await update(req, 'done', { p_note: 'All done. Enjoy the new kitchen.' });
    assert.deepEqual([r.status, r.office_note], ['done', 'All done. Enjoy the new kitchen.']);
    assert.equal((await update(req, 'done')).status, 'done');
    await fails(update(req, 'declined', { p_note: 'x' }), 'This project is already done.');
    await fails(update(req, 'in_progress'), 'This project is already done.');
  });

  test("the seeded roof assessment gets an estimate; the Whitfields' estimate can be revised", async () => {
    const r = await update(SR.david, 'estimate_sent', { p_estimate_low: 900, p_estimate_high: 900 });
    assert.deepEqual([r.status, r.estimate_low, r.estimate_high], ['estimate_sent', 900, 900]);
    const w = await update(SR.whit, 'estimate_sent', { p_estimate_low: 19000.555, p_estimate_high: 21500 });
    assert.deepEqual([w.estimate_low, w.estimate_high], [19000.56, 21500]);
    assert.equal(w.office_note, 'Replaster in white quartz, new waterline tile and a start-up balance. About two weeks on site.');
  });

  test('the assessment can be rescheduled, but not once an estimate is out', async () => {
    const t2 = at(5, 2);
    const r = await update(SR.david, 'assessment_scheduled', { p_assessment_at: t2 });
    sameTime(r.assessment_at, t2);
    await fails(update(SR.whit, 'assessment_scheduled', { p_assessment_at: at(1) }), PAST_STEP);
    // Straight to an estimate from new is fine (the office may already know the scope).
    const req = await askProject(U.elena, 'floors');
    assert.equal((await update(req, 'estimate_sent', { p_estimate_low: 3000, p_estimate_high: 4500 })).status, 'estimate_sent');
  });

  test('validates times, ranges, statuses and notes', async () => {
    const req = await askProject(U.elena, 'paint');
    await fails(update(req, 'assessment_scheduled'), 'Pick a date and time for the assessment.');
    for (const [lo, hi] of [[null, 100], [100, null], [null, null]]) {
      await fails(update(req, 'estimate_sent', { p_estimate_low: lo, p_estimate_high: hi }), 'Enter the low and high estimate.');
    }
    for (const [lo, hi] of [[0, 100], [-5, 100], [0, 0]]) {
      await fails(update(req, 'estimate_sent', { p_estimate_low: lo, p_estimate_high: hi }), 'Enter an estimate above $0.');
    }
    await fails(update(req, 'estimate_sent', { p_estimate_low: 500, p_estimate_high: 400 }), "The low estimate can't be more than the high one.");
    await fails(update(req, 'estimate_sent', { p_estimate_low: 500, p_estimate_high: 10000000 }), 'Enter an estimate under $10,000,000.');
    for (const s of [null, '', 'bogus', 'new', 'reviewing', 'scheduled', 'quoted', 'closed', 'canceled']) {
      await fails(update(req, s), "That project status isn't supported.");
    }
    await fails(update(req, 'assessment_scheduled', { p_assessment_at: at(1), p_note: 'n'.repeat(1001) }), 'Keep the note to 1,000 characters or fewer.');
    assert.equal((await request(req)).status, 'new');
    assert.equal((await update(req, 'estimate_sent', { p_estimate_low: 9999999.99, p_estimate_high: 9999999.99 })).estimate_high, 9999999.99);
  });

  test("steps the office can't take", async () => {
    await fails(update(SR.whit, 'approved'), 'Only the client can approve the estimate.');
    await fails(update(SR.whit, 'in_progress'), 'Start work once the client approves the estimate.');
    await fails(update(SR.david, 'in_progress'), 'Start work once the client approves the estimate.');
    await fails(update(SR.david, 'done'), 'Start work before marking the project done.');
    await call(U.whit, 'approve_estimate', { p_request_id: SR.whit });
    await fails(update(SR.whit, 'done'), 'Start work before marking the project done.');
    await fails(update(SR.whit, 'estimate_sent', { p_estimate_low: 1, p_estimate_high: 2 }), PAST_STEP);
    await fails(update(SR.whit, 'assessment_scheduled', { p_assessment_at: at(1) }), PAST_STEP);
    await update(SR.whit, 'in_progress');
    await fails(update(SR.whit, 'estimate_sent', { p_estimate_low: 1, p_estimate_high: 2 }), PAST_STEP);
  });

  test('decline: from any open status, with a note; then it stays declined', async () => {
    const fresh = await askProject(U.elena, 'kitchen_bath');
    await fails(update(fresh, 'declined'), 'Add a note for the client.');
    await fails(update(fresh, 'declined', { p_note: '  ' }), 'Add a note for the client.');
    await fails(update(fresh, 'declined', { p_note: '\n\n' }), 'Add a note for the client.');
    // new, assessment_scheduled, estimate_sent, approved and in_progress can all be declined.
    const reviewing = await showUs(U.elena);
    await route(reviewing, 'project', { p_category: 'project' });
    const approved = await askProject(U.elena, 'floors');
    await update(approved, 'estimate_sent', { p_estimate_low: 10, p_estimate_high: 20 });
    await call(U.elena, 'approve_estimate', { p_request_id: approved });
    const working = await askProject(U.elena, 'carpentry');
    await update(working, 'estimate_sent', { p_estimate_low: 10, p_estimate_high: 20 });
    await call(U.elena, 'approve_estimate', { p_request_id: working });
    await update(working, 'in_progress');
    for (const id of [fresh, reviewing, SR.david, SR.whit, approved, working]) {
      const r = await update(id, 'declined', { p_note: ' Outside what we can take on right now. ' });
      assert.deepEqual([r.status, r.office_note], ['declined', 'Outside what we can take on right now.']);
    }
    assert.equal((await update(fresh, 'declined', { p_note: 'again' })).office_note, 'Outside what we can take on right now.');
    await fails(update(fresh, 'assessment_scheduled', { p_assessment_at: at(1) }), 'This project was declined.');
    await fails(call(U.whit, 'approve_estimate', { p_request_id: SR.whit }), NO_ESTIMATE);
    await fails(call(U.elena, 'cancel_service_request', { p_request_id: fresh }), CANT_CANCEL);
  });

  test('canceled and closed requests stay put', async () => {
    await call(U.david, 'cancel_service_request', { p_request_id: SR.david });
    await fails(update(SR.david, 'estimate_sent', { p_estimate_low: 1, p_estimate_high: 2 }), 'The client canceled this request.');
    const closed = await showUs(U.elena);
    await route(closed, 'project', { p_category: 'roof' });
    await update(closed, 'declined', { p_note: 'No.' });
    await fails(update(closed, 'done'), 'This project was declined.');
  });

  test('office only, projects only', async () => {
    await fails(update(SR.priya, 'assessment_scheduled', { p_assessment_at: at(1) }), "This request isn't a project.");
    await fails(update(await showUs(U.elena), 'declined', { p_note: 'x' }), "This request isn't a project.");
    const args = { p_request_id: SR.david, p_status: 'estimate_sent', p_estimate_low: 1, p_estimate_high: 2 };
    for (const who of [U.david, U.marcus, U.sam]) await fails(call(who, 'office_update_project', args), NO_ACCESS);
    await denied(anonCall('office_update_project', args));
    await fails(update(randomUUID(), 'done'), NOT_FOUND);
    assert.equal((await request(SR.david)).status, 'assessment_scheduled');
    // Only p_request_id and p_status are required.
    assert.equal((await call(U.office, 'office_update_project', { p_request_id: SR.david, p_status: 'declined', p_note: 'Sorry.' })).status, 'declined');
  });
});

describe('approve_estimate', () => {
  beforeEach(reset);

  test("the Whitfields approve their seeded estimate; approving twice is a no-op", async () => {
    const r = await call(U.whit, 'approve_estimate', { p_request_id: SR.whit });
    assert.deepEqual([r.id, r.status, r.estimate_low, r.estimate_high], [SR.whit, 'approved', 18500, 22000]);
    assert.equal((await call(U.whit, 'approve_estimate', { p_request_id: SR.whit })).status, 'approved');
    // The office sees Approved.
    assert.equal((await as(db, U.office, (tx) => one(tx, 'select status from service_requests where id = $1', [SR.whit]))).status, 'approved');
  });

  test("only the home's owner, and only an estimate that is waiting", async () => {
    await fails(call(U.elena, 'approve_estimate', { p_request_id: SR.whit }), NOT_FOUND);
    await fails(call(U.whit, 'approve_estimate', { p_request_id: randomUUID() }), NOT_FOUND);
    for (const who of [U.office, U.marcus, U.sam]) await fails(call(who, 'approve_estimate', { p_request_id: SR.whit }), NO_ACCESS);
    await denied(anonCall('approve_estimate', { p_request_id: SR.whit }));
    await fails(call(U.david, 'approve_estimate', { p_request_id: SR.david }), NO_ESTIMATE);
    await fails(call(U.priya, 'approve_estimate', { p_request_id: SR.priya }), NO_ESTIMATE);
    await fails(call(U.elena, 'approve_estimate', { p_request_id: await askProject(U.elena, 'roof') }), NO_ESTIMATE);
    assert.equal((await request(SR.whit)).status, 'estimate_sent');
  });
});

describe('cancel_service_request', () => {
  beforeEach(reset);

  test('the owner cancels while new, reviewing, assessment scheduled or estimate sent; twice is a no-op', async () => {
    const fresh = await showUs(U.elena);
    const reviewing = await showUs(U.elena);
    await route(reviewing, 'project', { p_category: 'paint' });
    for (const [who, id] of [[U.elena, fresh], [U.elena, reviewing], [U.david, SR.david], [U.whit, SR.whit]]) {
      const r = await call(who, 'cancel_service_request', { p_request_id: id });
      assert.deepEqual([r.id, r.status], [id, 'canceled']);
      assert.equal((await call(who, 'cancel_service_request', { p_request_id: id })).status, 'canceled');
    }
  });

  test('not once it is scheduled, quoted, closed or approved', async () => {
    await fails(call(U.priya, 'cancel_service_request', { p_request_id: SR.priya }), CANT_CANCEL);
    const quoted = await showUs(U.elena);
    await route(quoted, 'quotes', { p_category: 'pest' });
    const closed = await showUs(U.elena);
    await route(closed, 'advice', { p_note: 'Try WD-40 on the hinge.' });
    await call(U.whit, 'approve_estimate', { p_request_id: SR.whit });
    await fails(call(U.elena, 'cancel_service_request', { p_request_id: quoted }), CANT_CANCEL);
    await fails(call(U.elena, 'cancel_service_request', { p_request_id: closed }), CANT_CANCEL);
    await fails(call(U.whit, 'cancel_service_request', { p_request_id: SR.whit }), CANT_CANCEL);
    assert.equal((await request(SR.whit)).status, 'approved');
  });

  test('only the owner', async () => {
    await fails(call(U.elena, 'cancel_service_request', { p_request_id: SR.david }), NOT_FOUND);
    for (const who of [U.office, U.marcus, U.sam]) await fails(call(who, 'cancel_service_request', { p_request_id: SR.david }), NO_ACCESS);
    await denied(anonCall('cancel_service_request', { p_request_id: SR.david }));
    assert.equal((await request(SR.david)).status, 'assessment_scheduled');
  });
});

// ---------------------------------------------------------------------------
// Row-level security
// ---------------------------------------------------------------------------

describe('RLS: who reads requests and photos', () => {
  let elenaReq;
  let elenaQuoted;
  before(async () => {
    await reset();
    elenaReq = await showUs(U.elena);
    await call(U.elena, 'add_service_request_photo', { p_request_id: elenaReq, p_path: photoPath(elenaReq) });
    await call(U.priya, 'add_service_request_photo', { p_request_id: SR.priya, p_path: photoPath(SR.priya) });
    elenaQuoted = await showUs(U.elena, { p_category: 'lawn' });
    await call(U.elena, 'add_service_request_photo', { p_request_id: elenaQuoted, p_path: photoPath(elenaQuoted) });
    await route(elenaQuoted, 'quotes');
  });

  const visible = (who) => as(db, who, async (tx) => ({
    requests: (await rows(tx, 'select id from service_requests order by id')).map((r) => r.id),
    photos: await count(tx, 'service_request_photos'),
  }));

  test('a homeowner sees only their own requests and photos', async () => {
    assert.deepEqual(await visible(U.elena), { requests: [elenaReq, elenaQuoted].sort(), photos: 2 });
    assert.deepEqual(await visible(U.david), { requests: [SR.david], photos: 0 });
    assert.deepEqual(await visible(U.whit), { requests: [SR.whit], photos: 0 });
    assert.deepEqual(await visible(U.priya), { requests: [SR.priya], photos: 1 });
    assert.deepEqual(await visible(U.jordan), { requests: [], photos: 0 });
    assert.deepEqual(await visible(U.bell), { requests: [], photos: 0 });
  });

  test('a tech sees only requests linked to a task on their visits', async () => {
    assert.deepEqual(await visible(U.dana), { requests: [SR.priya], photos: 1 });
    assert.deepEqual(await visible(U.marcus), { requests: [], photos: 0 });
    await route(elenaReq, 'visit');
    assert.deepEqual(await visible(U.marcus), { requests: [elenaReq], photos: 1 });
    assert.deepEqual(await visible(U.dana), { requests: [SR.priya], photos: 1 });
    // Reassigning the visit moves the access with it.
    await db.query('update visits set tech_id = $1 where id = $2', [U.dana, VISIT.elena]);
    assert.deepEqual(await visible(U.marcus), { requests: [], photos: 0 });
    assert.deepEqual(await visible(U.dana), { requests: [elenaReq, SR.priya].sort(), photos: 2 });
    await db.query('update visits set tech_id = $1 where id = $2', [U.marcus, VISIT.elena]);
  });

  test('a vendor never sees requests or photos, even one routed to partner quotes', async () => {
    assert.deepEqual(await visible(U.sam), { requests: [], photos: 0 });
    const q = (await request(elenaQuoted)).quote_request_id;
    assert.equal(await as(db, U.sam, (tx) => count(tx, 'quote_requests', 'id = $1', [q])), 1);
  });

  test('the office sees every request and photo; anon sees nothing', async () => {
    assert.deepEqual(await visible(U.office), { requests: [elenaReq, elenaQuoted, SR.david, SR.whit, SR.priya].sort(), photos: 3 });
    assert.deepEqual(await asAnon(db, async (tx) => [await count(tx, 'service_requests'), await count(tx, 'service_request_photos')]), [0, 0]);
  });

  test('nobody writes around the RPCs', async () => {
    for (const who of [U.elena, U.marcus, U.sam, U.office]) {
      await denied(as(db, who, (tx) => tx.query(`insert into service_requests (home_id, requester_id, kind, title, description)
                                                 values ($1, $2, 'photo', 'x', 'x')`, [HOME.elena, U.elena])));
      await denied(as(db, who, (tx) => tx.query(`update service_requests set status = 'approved'`)));
      await denied(as(db, who, (tx) => tx.query('delete from service_requests')));
      await denied(as(db, who, (tx) => tx.query(`insert into service_request_photos (request_id, path) values ($1, 'x')`, [elenaReq])));
      await denied(as(db, who, (tx) => tx.query('delete from service_request_photos')));
      // visit_tasks.request_id can't be forged either (no client writes on visit_tasks).
      assert.equal(await as(db, who, async (tx) => (await tx.query('update visit_tasks set request_id = $1', [elenaReq])).affectedRows), 0);
    }
    const priv = await one(db, `select ${['select', 'insert', 'update', 'delete', 'truncate'].map((p) =>
      `has_table_privilege('authenticated', 'public.service_requests', '${p}') as r_${p},
       has_table_privilege('authenticated', 'public.service_request_photos', '${p}') as p_${p},
       has_table_privilege('anon', 'public.service_requests', '${p}') as a_${p}`).join(', ')}`);
    assert.deepEqual(priv, {
      r_select: true, p_select: true, a_select: true,
      r_insert: false, p_insert: false, a_insert: false,
      r_update: false, p_update: false, a_update: false,
      r_delete: false, p_delete: false, a_delete: false,
      r_truncate: false, p_truncate: false, a_truncate: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Seed, reset and interactions with the existing RPCs
// ---------------------------------------------------------------------------

describe('seed_demo: the Services v2 scenario', () => {
  before(reset);

  test('three requests, one per stage, with fixed ids; Elena has none', async () => {
    await db.query(`select public.seed_demo('2026-10-14')`);
    const r = await rows(db, `
      select id, home_id, requester_id, kind, category, title, room, urgency, status, route, visit_id, quote_request_id,
             to_char(assessment_at at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') as assessment,
             estimate_low::float as lo, estimate_high::float as hi, office_note is not null as noted,
             created_at <= updated_at as ordered, char_length(description) > 0 as described
      from service_requests order by id`);
    assert.deepEqual(r, [
      { id: SR.david, home_id: HOME.david, requester_id: U.david, kind: 'project', category: 'roof', title: 'Roof inspection after the last storm',
        room: 'exterior', urgency: 'soon', status: 'assessment_scheduled', route: null, visit_id: null, quote_request_id: null,
        assessment: '2026-10-15 10:00', lo: null, hi: null, noted: false, ordered: true, described: true },
      { id: SR.whit, home_id: HOME.whit, requester_id: U.whit, kind: 'project', category: 'pool', title: 'Pool resurfacing',
        room: 'exterior', urgency: 'whenever', status: 'estimate_sent', route: null, visit_id: null, quote_request_id: null,
        assessment: '2026-10-08 14:00', lo: 18500, hi: 22000, noted: true, ordered: true, described: true },
      { id: SR.priya, home_id: HOME.priya, requester_id: U.priya, kind: 'photo', category: null, title: "Back door sticks and won't latch",
        room: 'kitchen', urgency: 'soon', status: 'scheduled', route: 'visit', visit_id: VISIT.priya, quote_request_id: null,
        assessment: null, lo: null, hi: null, noted: false, ordered: true, described: true },
    ]);
    assert.equal(await count(db, 'service_requests', 'home_id = $1', [HOME.elena]), 0);
    assert.equal(await count(db, 'service_request_photos'), 0);
    // Priya's request is on her visit's checklist (Dana, tomorrow), after the seven plan tasks.
    const tasks = await rows(db, 'select task_key, name, request_id, done from visit_tasks where visit_id = $1 order by request_id nulls first, task_key', [VISIT.priya]);
    assert.equal(tasks.length, 8);
    assert.deepEqual(tasks[7], { task_key: 'request', name: "Client request: Back door sticks and won't latch", request_id: SR.priya, done: false });
    assert.equal(await count(db, 'visit_tasks', 'request_id is not null'), 1);
    await db.query('select public.seed_demo()');
  });

  test("David's assessment is tomorrow at 10:00 in Chicago", async () => {
    const r = await one(db, `select (assessment_at at time zone 'America/Chicago')::date - private.chicago_today() as days,
                                    to_char(assessment_at at time zone 'America/Chicago', 'HH24:MI') as t from service_requests where id = $1`, [SR.david]);
    assert.deepEqual(r, { days: 1, t: '10:00' });
  });

  test('a reset clears what people did and restores the seeded requests', async () => {
    const mine = await showUs(U.elena);
    await call(U.elena, 'add_service_request_photo', { p_request_id: mine, p_path: photoPath(mine) });
    await route(mine, 'visit');
    await call(U.david, 'cancel_service_request', { p_request_id: SR.david });
    await call(U.whit, 'approve_estimate', { p_request_id: SR.whit });
    await reset();
    assert.deepEqual(await counts(db), SEED_COUNTS);
    assert.equal(await count(db, 'service_requests', 'id = $1', [mine]), 0);
    assert.deepEqual((await rows(db, 'select status from service_requests order by id')).map((r) => r.status),
      ['assessment_scheduled', 'estimate_sent', 'scheduled']);
  });

  test("a tier switch keeps Priya's client request on her visit", async () => {
    await call(U.priya, 'set_plan_tier', { p_tier: 'low', p_monthly: 50, p_annual: 600, p_materials: 300, p_labor: 300, p_next_tasks: '{hvac,dish}' });
    const keys = (await rows(db, 'select task_key from visit_tasks where visit_id = $1 order by task_key', [VISIT.priya])).map((r) => r.task_key);
    assert.deepEqual(keys, ['dish', 'hvac', 'request']);
    assert.equal((await one(db, 'select request_id from visit_tasks where visit_id = $1 and task_key = $2', [VISIT.priya, 'request'])).request_id, SR.priya);
    await reset();
  });

  test('deleting a visit unlinks its request; deleting a home or an account takes its requests along', async () => {
    await call(U.priya, 'add_service_request_photo', { p_request_id: SR.priya, p_path: photoPath(SR.priya) });
    await db.query('delete from visits where id = $1', [VISIT.priya]);
    const r = await request(SR.priya);
    assert.deepEqual([r.visit_id, r.status], [null, 'scheduled']);
    assert.equal(await count(db, 'visit_tasks', 'request_id = $1', [SR.priya]), 0);
    await db.query('delete from homes where id = $1', [HOME.whit]);
    assert.equal(await count(db, 'service_requests', 'id = $1', [SR.whit]), 0);
    await db.query('delete from auth.users where id = $1', [U.priya]);
    assert.equal(await count(db, 'service_requests', 'id = $1', [SR.priya]), 0);
    assert.equal(await count(db, 'service_request_photos'), 0);
    assert.equal(await count(db, 'service_requests', 'id = $1', [SR.david]), 1);
    await reset();
    assert.deepEqual(await counts(db), SEED_COUNTS);
  });

  test("start_new_customer removes Jordan's requests too", async () => {
    await call(U.jordan, 'save_home', {
      p_full_name: 'Jordan Lee', p_address: '5 Elm St, Homewood, AL 35209', p_sqft: 1800, p_year: 2001, p_beds: 3, p_baths: 2,
      p_floors: 1, p_zones: 1, p_pets: false, p_water: 'city_hard',
    });
    const req = await showUs(U.jordan);
    await call(U.jordan, 'add_service_request_photo', { p_request_id: req, p_path: photoPath(req) });
    await as(db, U.jordan, (tx) => tx.query(`select public.start_new_customer('Taylor Kim', null)`));
    assert.equal(await count(db, 'service_requests', 'requester_id = $1', [U.jordan]), 0);
    assert.equal(await count(db, 'service_request_photos', 'request_id = $1', [req]), 0);
    assert.equal(await count(db, 'service_requests'), 3);
    await reset();
  });
});

// ---------------------------------------------------------------------------
// Realtime, privileges, re-running the migration
// ---------------------------------------------------------------------------

describe('realtime, privileges and re-running the migration', () => {
  test('both tables are in supabase_realtime', async () => {
    const t = (await rows(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'
                               and tablename in ('service_requests', 'service_request_photos', 'visit_tasks') order by 1`)).map((r) => r.tablename);
    assert.deepEqual(t, ['service_request_photos', 'service_requests', 'visit_tasks']);
  });

  test('the RPCs are security definer, search_path public, for authenticated only', async () => {
    const fns = await rows(db, `
      select p.proname, p.prosecdef, p.proconfig,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
             has_function_privilege('anon', p.oid, 'execute') as anon_exec,
             has_function_privilege('public', p.oid, 'execute') as public_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any ($1) order by 1`, [[
      'create_service_request', 'add_service_request_photo', 'office_route_request', 'office_update_project', 'approve_estimate',
      'cancel_service_request', 'request_quote', 'set_plan_tier',
    ]]);
    assert.equal(fns.length, 8);
    for (const f of fns) {
      assert.deepEqual([f.prosecdef, f.proconfig, f.auth_exec, f.anon_exec, f.public_exec],
        [true, ['search_path=public'], true, false, false], f.proname);
    }
    const seed = await one(db, `select has_function_privilege('authenticated', 'public.seed_demo(date)', 'execute') as a,
                                       has_function_privilege('anon', 'public.seed_demo(date)', 'execute') as b`);
    assert.deepEqual(seed, { a: false, b: false });
  });

  test('private helpers: policy helpers for authenticated, the rest for the owner and service role only', async () => {
    const f = await rows(db, `
      select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
             has_function_privilege('anon', p.oid, 'execute') as anon_exec,
             has_function_privilege('service_role', p.oid, 'execute') as service_exec, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = any ($1) order by 1`, [[
      'service_catalog', 'owned_service_request_ids', 'tech_request_ids', 'can_upload_request_photo', 'can_read_request_photo',
      'open_quote_request', 'short_title', 'trim_text',
    ]]);
    assert.deepEqual(f.map((x) => [x.proname, x.auth_exec, x.anon_exec, x.service_exec, x.proconfig]), [
      ['can_read_request_photo', true, false, true, ['search_path=public']],
      ['can_upload_request_photo', true, false, true, ['search_path=public']],
      ['open_quote_request', false, false, true, ['search_path=public']],
      ['owned_service_request_ids', true, false, true, ['search_path=public']],
      ['service_catalog', false, false, true, ['search_path=public']],
      ['short_title', false, false, true, ['search_path=public']],
      ['tech_request_ids', true, false, true, ['search_path=public']],
      ['trim_text', false, false, true, ['search_path=public']],
    ]);
  });

  test('every new foreign key has an index', async () => {
    const unindexed = await rows(db, `
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.conrelid in ('public.service_requests'::regclass, 'public.service_request_photos'::regclass,
                                               'public.visit_tasks'::regclass)
        and a.attname in ('home_id', 'requester_id', 'category', 'visit_id', 'quote_request_id', 'request_id')
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
    assert.deepEqual(unindexed, []);
  });

  test('the migration runs again cleanly and changes nothing', async () => {
    await reset();
    const before = await counts(db);
    const policies = await count(db, 'pg_policies', `tablename in ('service_requests', 'service_request_photos', 'objects')`);
    await applyMigration(db, SERVICES_V2);
    assert.deepEqual(await counts(db), before);
    assert.equal(await count(db, 'pg_policies', `tablename in ('service_requests', 'service_request_photos', 'objects')`), policies);
    await reset();
    assert.deepEqual(await counts(db), SEED_COUNTS);
  });
});
