/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADD_ONS, SERVICE_CATALOG } from '../src/data/seed';
import {
  CANCELABLE,
  DECLINABLE,
  ROUTABLE,
  ageLabel,
  canReschedule,
  canReviseEstimate,
  chicagoMonth,
  defaultTitle,
  titleRepeatsDescription,
  estimateRange,
  groupCatalog,
  homeownerStatusLine,
  inOfficeFilter,
  mapCategoryRow,
  mapServiceRequest,
  nextProjectStep,
  parseEstimate,
  uuidFrom,
  type ServiceRequestVM,
} from '../src/data/servicesModel';

test('the seed catalog matches the spec: 8 maintenance, 8 seasonal, 10 contracted', () => {
  const by = (line: string) => SERVICE_CATALOG.filter((c) => c.line === line);
  assert.equal(by('maintenance').length, 8);
  assert.equal(by('seasonal').length, 8);
  assert.equal(by('contracted').length, 10);
  assert.equal(new Set(SERVICE_CATALOG.map((c) => c.id)).size, SERVICE_CATALOG.length);
  for (const c of SERVICE_CATALOG) {
    assert.equal(c.handledBy, c.line === 'contracted' ? 'php' : 'network', c.id);
    assert.equal(c.base === null, c.line === 'contracted', c.id);
    assert.equal(c.seasonMonths !== null, c.line === 'seasonal', c.id);
  }
  // The six original add-ons keep their ids, names and prices.
  for (const [id, base] of [['lawn', 65], ['land', 1400], ['win', 420], ['press', 340], ['lights', 1150], ['tree', 780]] as const) {
    assert.equal(ADD_ONS.find((a) => a.id === id)?.base, base, id);
  }
  // ADD_ONS is every network service (what the quote flow and vendors cover).
  assert.equal(ADD_ONS.length, 16);
});

test('groupCatalog: In season follows the month and sorts first in Seasonal', () => {
  const oct = groupCatalog(SERVICE_CATALOG, 10);
  const inOct = oct.lines.seasonal.filter((c) => c.inSeason).map((c) => c.id);
  assert.deepEqual(inOct, ['lights', 'leaves', 'hvac_tune', 'winterize', 'chimney', 'pool_close']);
  assert.deepEqual(
    oct.lines.seasonal.map((c) => c.inSeason),
    [true, true, true, true, true, true, false, false],
  );
  const jul = groupCatalog(SERVICE_CATALOG, 7);
  assert.equal(jul.lines.seasonal.filter((c) => c.inSeason).length, 0);
  assert.deepEqual(
    jul.lines.seasonal.map((c) => c.id),
    ['lights', 'leaves', 'hvac_tune', 'winterize', 'chimney', 'pool_open', 'pool_close', 'storm'],
  );
  const apr = groupCatalog(SERVICE_CATALOG, 4);
  assert.deepEqual(apr.lines.seasonal.slice(0, 3).map((c) => c.id), ['hvac_tune', 'pool_open', 'storm']);
  // Maintenance keeps its catalog order and never shows In season.
  assert.deepEqual(oct.lines.maintenance.map((c) => c.id), ['lawn', 'land', 'win', 'press', 'gutter', 'pest', 'carpet', 'tree']);
  assert.ok(oct.lines.maintenance.every((c) => !c.inSeason));
  assert.equal(oct.lines.contracted[0].id, 'roof');
});

test('chicagoMonth uses Chicago, not UTC', () => {
  // 2026-10-01 02:00 UTC is still Sep 30 in Chicago.
  assert.equal(chicagoMonth(Date.parse('2026-10-01T02:00:00Z')), 9);
  assert.equal(chicagoMonth(Date.parse('2026-10-01T12:00:00Z')), 10);
});

test('mapCategoryRow is tolerant of old rows and array literals', () => {
  // A pre-v2 row (no line/handled_by/season_months/sort) takes the seed's values.
  assert.deepEqual(mapCategoryRow({ id: 'lights', name: 'Holiday lights', sub: 'Roofline', base: '1150.00' }), {
    id: 'lights',
    line: 'seasonal',
    handledBy: 'network',
    name: 'Holiday lights',
    sub: 'Roofline',
    base: 1150,
    seasonMonths: [10, 11, 12],
    sort: 1,
  });
  const row = mapCategoryRow({ id: 'x', name: 'X', sub: null, base: null, line: 'seasonal', handled_by: 'network', season_months: '{3,4}', sort: 9 });
  assert.equal(row?.line, 'seasonal');
  assert.deepEqual(row?.seasonMonths, [3, 4]);
  assert.equal(mapCategoryRow({ id: 'roof', line: 'contracted', handled_by: 'php', season_months: null })?.seasonMonths, null);
  assert.equal(mapCategoryRow({ name: 'no id' }), null);
});

const base: ServiceRequestVM = mapServiceRequest({ id: 'r1', kind: 'photo', description: 'Back door sticks', status: 'new', created_at: '2026-09-26T15:00:00Z' });

test('mapServiceRequest defaults and photos', () => {
  const r = mapServiceRequest(
    {
      id: 'r2',
      kind: 'project',
      category: 'cabinets',
      title: null,
      description: '  Kitchen cabinets are peeling  ',
      room: 'kitchen',
      urgency: 'soon',
      status: 'estimate_sent',
      estimate_low: '4200.00',
      estimate_high: 5600,
      service_request_photos: [
        { id: 'p2', path: 'r2/b.jpg', created_at: '2026-09-26T15:02:00Z' },
        { id: 'p1', path: 'r2/a.jpg', created_at: '2026-09-26T15:01:00Z' },
      ],
      homes: { address: '12 Linden Court, Mountain Brook, AL 35213', owner: [{ full_name: 'Elena Alvarez' }] },
    },
    { signed: { 'r2/a.jpg': 'https://signed/a' } },
  );
  assert.equal(r.title, 'Cabinet refinishing');
  assert.equal(r.description, 'Kitchen cabinets are peeling');
  assert.equal(r.estimateLow, 4200);
  assert.deepEqual(r.photos, [
    { id: 'p1', path: 'r2/a.jpg', uri: 'https://signed/a' },
    { id: 'p2', path: 'r2/b.jpg', uri: null },
  ]);
  assert.deepEqual(r.client, { name: 'Elena Alvarez', street: '12 Linden Court' });
  // Unknown values fall back safely.
  const odd = mapServiceRequest({ id: 'r3', status: 'bogus', urgency: 'asap', room: 'attic' });
  assert.equal(odd.status, 'new');
  assert.equal(odd.urgency, 'whenever');
  assert.equal(odd.room, null);
  assert.equal(odd.kind, 'photo');
  assert.equal(base.title, 'Back door sticks');
});

test('homeownerStatusLine says what happened', () => {
  assert.equal(homeownerStatusLine({ ...base, status: 'scheduled', visitStart: '2026-10-14T14:00:00Z' }).text, 'Added to your Oct 14 visit');
  assert.equal(homeownerStatusLine({ ...base, status: 'scheduled', visitLabel: 'Oct 15' }).text, 'Added to your Oct 15 visit');
  assert.equal(homeownerStatusLine({ ...base, status: 'quoted' }).text, 'Quotes on the way');
  assert.equal(homeownerStatusLine({ ...base, status: 'closed', officeNote: 'That squeak is the subfloor; we will shim it.' }).text, 'We replied: That squeak is the subfloor; we will shim it.');
  // The range itself is shown large under the line, with Approve estimate / Not now.
  assert.equal(homeownerStatusLine({ ...base, kind: 'project', status: 'estimate_sent', estimateLow: 18500, estimateHigh: 22000 }).text, 'Your estimate is ready');
  assert.equal(homeownerStatusLine({ ...base, status: 'scheduled' }).text, 'Added to your next visit');
  assert.equal(
    homeownerStatusLine({ ...base, kind: 'project', status: 'assessment_scheduled', assessmentAt: '2026-09-29T15:00:00Z' }).text,
    'Assessment · Tue, Sep 29 · 10:00 AM',
  );
});

test('office filters, project steps and estimate parsing', () => {
  assert.equal(inOfficeFilter({ kind: 'photo', status: 'new' }, 'new'), true);
  assert.equal(inOfficeFilter({ kind: 'project', status: 'new' }, 'new'), true);
  assert.equal(inOfficeFilter({ kind: 'project', status: 'new' }, 'projects'), true);
  assert.equal(inOfficeFilter({ kind: 'project', status: 'approved' }, 'new'), false);
  assert.equal(inOfficeFilter({ kind: 'photo', status: 'scheduled' }, 'routed'), true);
  assert.equal(inOfficeFilter({ kind: 'photo', status: 'quoted' }, 'routed'), true);
  assert.equal(inOfficeFilter({ kind: 'project', status: 'done' }, 'projects'), false);
  assert.equal(inOfficeFilter({ kind: 'project', status: 'done' }, 'closed'), true);
  assert.equal(inOfficeFilter({ kind: 'photo', status: 'closed' }, 'closed'), true);
  assert.deepEqual(['new', 'reviewing', 'assessment_scheduled', 'estimate_sent', 'approved', 'in_progress', 'done'].map((s) => nextProjectStep(s as never)), [
    'schedule',
    'schedule',
    'estimate',
    null,
    'start',
    'finish',
    null,
  ]);
  assert.deepEqual(ROUTABLE, ['new', 'reviewing']);
  assert.deepEqual(CANCELABLE, ['new', 'reviewing', 'assessment_scheduled', 'estimate_sent']);
  // office_update_project: decline from any open status; reschedule and revise before approval.
  assert.deepEqual(DECLINABLE, ['new', 'reviewing', 'assessment_scheduled', 'estimate_sent', 'approved', 'in_progress']);
  assert.equal(canReschedule('assessment_scheduled'), true);
  assert.equal(canReschedule('estimate_sent'), false);
  assert.equal(canReviseEstimate('estimate_sent'), true);
  assert.equal(canReviseEstimate('approved'), false);
  // The same wording as office_update_project.
  assert.deepEqual(parseEstimate('$4,200', '5600'), { low: 4200, high: 5600 });
  assert.deepEqual(parseEstimate('0', '5'), { error: 'Enter an estimate above $0.' });
  assert.deepEqual(parseEstimate('6', '5'), { error: "The low estimate can't be more than the high one." });
  assert.deepEqual(parseEstimate('', '5'), { error: 'Enter the low and high estimate.' });
  assert.deepEqual(parseEstimate('1', '10000000'), { error: 'Enter an estimate under $10,000,000.' });
  assert.equal(estimateRange(18500, 22000), '$18,500 – $22,000');
  assert.equal(estimateRange(500, 500), '$500');
});

test('uuidFrom tolerates every RPC return shape', () => {
  const id = 'c0000000-0000-4000-8000-000000000042';
  assert.equal(uuidFrom(id), id);
  assert.equal(uuidFrom({ id }), id);
  assert.equal(uuidFrom([{ id }]), id);
  assert.equal(uuidFrom({ quote_request_id: id }, ['quote_request_id', 'id']), id);
  assert.equal(uuidFrom({ create_service_request: id }, ['id', 'create_service_request']), id);
  assert.equal(uuidFrom('not-a-uuid'), null);
  assert.equal(uuidFrom(null), null);
});

test('defaultTitle matches private.short_title, and titleRepeatsDescription spots it', () => {
  assert.equal(defaultTitle('Cabinet refinishing', 'anything'), 'Cabinet refinishing');
  assert.equal(defaultTitle(null, "Back door sticks and won't latch"), "Back door sticks and won't latch");
  assert.equal(defaultTitle(null, '  two\n\nlines  '), 'two lines');
  const text = 'The floor in the upstairs hallway squeaks loudly every time anyone walks over it at night, even in socks.';
  const long = defaultTitle(null, text);
  // Cut at a word within 79 characters, plus an ellipsis.
  assert.equal(long, 'The floor in the upstairs hallway squeaks loudly every time anyone walks over…');
  assert.ok(long.length <= 80);
  assert.equal(titleRepeatsDescription(long, text), true);
  assert.equal(titleRepeatsDescription("Back door sticks and won't latch", "Back door sticks and won't latch"), true);
  assert.equal(titleRepeatsDescription('Cabinet refinishing', 'Kitchen cabinets are chipped'), false);
  assert.equal(titleRepeatsDescription("Back door sticks and won't latch", 'The back door drags at the top.'), false);
  const now = Date.parse('2026-09-26T15:00:00Z');
  assert.equal(ageLabel('2026-09-26T14:59:40Z', now), 'just now');
  assert.equal(ageLabel('2026-09-26T14:48:00Z', now), '12 min ago');
  assert.equal(ageLabel('2026-09-26T12:00:00Z', now), '3 hr ago');
  assert.equal(ageLabel('2026-09-25T12:00:00Z', now), '1 day ago');
  assert.equal(ageLabel('2026-09-20T12:00:00Z', now), '6 days ago');
  assert.equal(ageLabel('garbage', now), '');
});
