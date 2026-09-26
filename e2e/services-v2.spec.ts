// Services v2 (docs/SERVICES_V2.md) across devices:
//   * Show us: Elena sends a photo request with filter.jpg; the office sees it
//     live with its photo and adds it to the next visit; Marcus sees the
//     "Client request" row on Elena's checklist.
//   * Contracted: Elena asks for a Cabinets assessment; the office schedules
//     it and sends an estimate; Elena sees it live and approves; the office
//     sees Approved.
//   * Seasonal: the In-season badges match this month in Chicago.
// Plus the same Show us and contracted flows in offline demo mode (no backend).
//
// The live specs reset the shared demo data: run them only after a live demo.

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  FILTER_JPG,
  SERVICES_SEED,
  SERVICE_LINES,
  SERVICE_NAMES,
  closeAll,
  expectNoReload,
  expectRpc,
  inSeason,
  markNoReload,
  openAs,
  presetDemo,
  requireBackend,
  resetDemo,
  shown,
  type RolePage,
} from './helpers';

const LIVE = { timeout: 15_000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOOR = "The back door sticks at the top and won't latch unless you lean on it.";
const CABINETS = 'Kitchen cabinets are chipped along the bottom. We want them painted white with new pulls.';

/** The visible element with this testID (screens you leave stay mounted, hidden). */
const testId = (page: Page, id: string) => shown(page.getByTestId(id));

/** The uuid create_service_request answered with (PostgREST returns the scalar as a JSON string). */
async function createdId(res: { json(): Promise<unknown> }): Promise<string> {
  const raw = await res.json();
  const id = typeof raw === 'string' ? raw : ((raw as { id?: string } | null)?.id ?? '');
  expect(id, 'create_service_request returns the new id').toMatch(UUID);
  return id;
}

/** Photos inside `scope` that loaded from Supabase Storage (signed URLs). */
async function expectStoragePhoto(scope: Locator, message: string): Promise<void> {
  await expect
    .poll(
      () =>
        scope
          .locator('img')
          .evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.src.includes('/storage/v1/') && i.complete && i.naturalWidth > 0).length),
      { timeout: 20_000, message },
    )
    .toBeGreaterThan(0);
}

/** Fill the request screen and add filter.jpg through the file picker (web capture). */
async function fillShowUs(p: Page): Promise<void> {
  await testId(p, 'request-description').fill(DOOR);
  await testId(p, 'request-room-kitchen').click();
  await testId(p, 'request-urgency-soon').click();
  const chooser = p.waitForEvent('filechooser');
  await testId(p, 'request-photo-add').click();
  await (await chooser).setFiles(FILTER_JPG);
  await expect(testId(p, 'request-photo-0')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Live: Show us → office → next visit → tech
// ---------------------------------------------------------------------------

test.describe.serial('services v2 · Show us: photo request → office → next visit → tech', () => {
  requireBackend();

  let home: RolePage;
  let office: RolePage;
  let tech: RolePage;
  let requestId = '';

  test.beforeAll(async ({ browser }) => {
    await resetDemo();
    home = await openAs(browser, 'homeowner', { path: '/homeowner/services', ready: (p) => p.getByTestId('show-us-start') });
    office = await openAs(browser, 'office', { path: '/office/requests', ready: (p) => p.getByTestId('office-requests') });
    tech = await openAs(browser, 'tech');
    for (const r of [home, office, tech]) await markNoReload(r.page);
  });

  test.afterAll(async () => {
    await closeAll(home, office, tech);
  });

  test('the office sees the seeded requests', async () => {
    const p = office.page;
    const { davidRoof, whitfieldsPool, priyaDoor } = SERVICES_SEED.requests;
    await testId(p, 'requests-filter-projects').click();
    await expect(testId(p, `office-request-${davidRoof.id}`)).toContainText(davidRoof.title);
    await expect(testId(p, `office-request-${davidRoof.id}`)).toContainText('Assessment');
    await expect(testId(p, `office-request-${whitfieldsPool.id}`)).toContainText('$18,500 – $22,000');
    await testId(p, 'requests-filter-routed').click();
    await expect(testId(p, `office-request-${priyaDoor.id}`)).toContainText(priyaDoor.title);
    await testId(p, 'requests-filter-new').click();
  });

  test('Elena sends a Show us request with a photo', async () => {
    const p = home.page;
    await testId(p, 'show-us-start').click();
    await expect(p).toHaveURL(/\/homeowner\/request/);
    await fillShowUs(p);
    // The row first, then the photo: upload to request-photos, then add_service_request_photo.
    const photo = expectRpc(p, 'add_service_request_photo', async () => {});
    const created = await expectRpc(p, 'create_service_request', () => testId(p, 'request-submit').click(), {
      p_kind: 'photo',
      p_room: 'kitchen',
      p_urgency: 'soon',
      p_description: DOOR,
    });
    requestId = await createdId(created.response);
    const { body } = await photo;
    expect(body.p_request_id).toBe(requestId);
    expect(String(body.p_path)).toMatch(new RegExp(`^${requestId}/[0-9a-f-]{36}\\.jpg$`));

    await expect(p).toHaveURL(/\/homeowner\/services/);
    const card = testId(p, `request-${requestId}`);
    await expect(card).toBeVisible(LIVE);
    await expect(card).toContainText('Sent');
    await expectNoReload(p);
  });

  test('the office sees it live, with its photo, and adds it to the next visit', async () => {
    const p = office.page;
    const card = testId(p, `office-request-${requestId}`);
    await expect(card).toBeVisible(LIVE);
    await expect(card).toContainText('Elena Alvarez');
    await expect(card).toContainText(DOOR);
    await expect(card).toContainText('Kitchen');
    await expectStoragePhoto(card, "the client's photo, signed from request-photos");
    await expectNoReload(p);

    await expectRpc(p, 'office_route_request', () => testId(p, `request-route-visit-${requestId}`).click(), {
      p_request_id: requestId,
      p_route: 'visit',
    });
    await testId(p, 'requests-filter-routed').click();
    await expect(testId(p, `office-request-${requestId}`)).toContainText('On next visit');
  });

  test('Elena sees where it went, live', async () => {
    await expect(testId(home.page, `request-${requestId}`)).toContainText('Added to your', LIVE);
    await expectNoReload(home.page);
  });

  test('Marcus sees the Client request on Elena’s checklist', async () => {
    const p = tech.page;
    await p.getByRole('button').filter({ hasText: 'Linden Court' }).first().click();
    await expect(p).toHaveURL(/\/tech\/job/);
    const row = testId(p, `client-request-${requestId}`);
    await expect(row).toBeVisible(LIVE);
    await expect(row).toContainText('Client request');
    await expect(row).toContainText(DOOR);
    await expectStoragePhoto(row, 'the client photo, signed for the linked tech');
  });
});

// ---------------------------------------------------------------------------
// Live: contracted project
// ---------------------------------------------------------------------------

test.describe.serial('services v2 · contracted: Cabinets assessment → estimate → approval', () => {
  requireBackend();

  let home: RolePage;
  let office: RolePage;
  let requestId = '';

  test.beforeAll(async ({ browser }) => {
    await resetDemo();
    home = await openAs(browser, 'homeowner', { path: '/homeowner/services', ready: (p) => p.getByTestId('services-line-contracted') });
    office = await openAs(browser, 'office', { path: '/office/requests', ready: (p) => p.getByTestId('office-requests') });
    for (const r of [home, office]) await markNoReload(r.page);
  });

  test.afterAll(async () => {
    await closeAll(home, office);
  });

  test('Elena requests a Cabinets assessment', async () => {
    const p = home.page;
    await testId(p, 'services-line-contracted').click();
    await testId(p, 'contracted-cabinets').click();
    await expect(p).toHaveURL(/\/homeowner\/request/);
    await expect(shown(p.getByText(`Request an assessment · ${SERVICE_NAMES.cabinets}`))).toBeVisible();
    await testId(p, 'request-description').fill(CABINETS);
    const created = await expectRpc(p, 'create_service_request', () => testId(p, 'request-submit').click(), {
      p_kind: 'project',
      p_category: 'cabinets',
    });
    requestId = await createdId(created.response);
    await expect(testId(p, `request-${requestId}`)).toBeVisible(LIVE);
  });

  test('the office schedules the assessment', async () => {
    const p = office.page;
    await testId(p, 'requests-filter-projects').click();
    const card = testId(p, `office-request-${requestId}`);
    await expect(card).toBeVisible(LIVE);
    await expect(card).toContainText(SERVICE_NAMES.cabinets);
    await testId(p, `request-schedule-${requestId}`).click();
    await testId(p, `request-time-${requestId}-10`).click();
    const { body } = await expectRpc(p, 'office_update_project', () => testId(p, `request-confirm-${requestId}`).click(), {
      p_request_id: requestId,
      p_status: 'assessment_scheduled',
    });
    expect(Number.isNaN(Date.parse(String(body.p_assessment_at)))).toBe(false);
    await expect(card).toContainText('Assessment scheduled');
  });

  test('Elena sees the assessment live', async () => {
    await expect(testId(home.page, `request-${requestId}`)).toContainText('Assessment ·', LIVE);
    await expectNoReload(home.page);
  });

  test('the office sends an estimate', async () => {
    const p = office.page;
    await testId(p, `request-estimate-${requestId}`).click();
    await testId(p, `request-low-${requestId}`).fill('4200');
    await testId(p, `request-high-${requestId}`).fill('5600');
    await expectRpc(p, 'office_update_project', () => testId(p, `request-confirm-${requestId}`).click(), {
      p_request_id: requestId,
      p_status: 'estimate_sent',
      p_estimate_low: 4200,
      p_estimate_high: 5600,
    });
    await expect(testId(p, `office-request-${requestId}`)).toContainText('$4,200 – $5,600');
  });

  test('Elena sees the estimate live and approves it', async () => {
    const p = home.page;
    const card = testId(p, `request-${requestId}`);
    await expect(card).toContainText('$4,200 – $5,600', LIVE);
    await expectNoReload(p);
    await expectRpc(p, 'approve_estimate', () => testId(p, `request-approve-${requestId}`).click(), { p_request_id: requestId });
    await expect(card).toContainText('Approved');
  });

  test('the office sees Approved live', async () => {
    const p = office.page;
    const card = testId(p, `office-request-${requestId}`);
    await expect(card).toContainText('Approved', LIVE);
    await expect(testId(p, `request-start-${requestId}`)).toBeVisible();
    await expectNoReload(p);
  });
});

// ---------------------------------------------------------------------------
// Live: Seasonal
// ---------------------------------------------------------------------------

/** In-season seasonal tiles show the badge and come first, each group in catalog order. */
async function expectSeasonal(p: Page): Promise<void> {
  await testId(p, 'services-line-seasonal').click();
  const want = inSeason();
  for (const id of SERVICE_LINES.seasonal) {
    const tile = testId(p, `addon-${id}`);
    await expect(tile).toContainText(SERVICE_NAMES[id]);
    if (want.includes(id)) await expect(tile, `${id} is in season`).toContainText('In season');
    else await expect(tile, `${id} is out of season`).not.toContainText('In season');
  }
  const order = await shown(p.locator('[data-testid^="addon-"]')).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('addon-'.length)));
  expect(order).toEqual([...want, ...SERVICE_LINES.seasonal.filter((id) => !want.includes(id))]);
}

test.describe('services v2 · Seasonal', () => {
  requireBackend();

  test('the In-season badge matches this month in Chicago', async ({ browser }) => {
    const home = await openAs(browser, 'homeowner', { path: '/homeowner/services', ready: (p) => p.getByTestId('services-line-seasonal') });
    try {
      await expectSeasonal(home.page);
    } finally {
      await closeAll(home);
    }
  });
});

// ---------------------------------------------------------------------------
// Offline demo: the same flows on the local store
// ---------------------------------------------------------------------------

test.describe('services v2 · offline demo', () => {
  test('Show us → office → next visit → tech, on one device', async ({ page }) => {
    await presetDemo(page, { step: 6 });
    await page.goto('/homeowner/services');
    await expectSeasonal(page);
    await testId(page, 'show-us-start').click();
    await fillShowUs(page);
    await testId(page, 'request-submit').click();
    const card = shown(page.locator('[data-testid^="request-local-"]')).first();
    await expect(card).toContainText('Sent');
    const id = (await card.getAttribute('data-testid'))!.slice('request-'.length);

    await page.goto('/office/requests');
    const officeCard = testId(page, `office-request-${id}`);
    await expect(officeCard).toContainText(DOOR);
    await expect(officeCard.locator('img')).toHaveCount(1);
    await testId(page, `request-route-visit-${id}`).click();
    await testId(page, 'requests-filter-routed').click();
    await expect(testId(page, `office-request-${id}`)).toContainText('On next visit');

    await page.goto('/tech/job');
    await shown(page.getByRole('button', { name: 'Start driving · notify client' })).click();
    await shown(page.getByRole('button', { name: 'Mark arrived on site' })).click();
    await expect(testId(page, `client-request-${id}`)).toContainText(DOOR);
    const box = testId(page, `task-request-req-${id}`);
    await box.click();
    await expect(box).toBeChecked();

    await page.goto('/homeowner/services');
    await expect(testId(page, `request-${id}`)).toContainText('Added to your');
  });

  test('contracted: assessment → estimate → approval', async ({ page }) => {
    await presetDemo(page, { step: 6 });
    await page.goto('/homeowner/services');
    await testId(page, 'services-line-contracted').click();
    await testId(page, 'contracted-cabinets').click();
    await testId(page, 'request-description').fill(CABINETS);
    await testId(page, 'request-submit').click();
    const card = shown(page.locator('[data-testid^="request-local-"]')).first();
    await expect(card).toContainText(SERVICE_NAMES.cabinets);
    const id = (await card.getAttribute('data-testid'))!.slice('request-'.length);

    await page.goto('/office/requests');
    await testId(page, 'requests-filter-projects').click();
    await testId(page, `request-schedule-${id}`).click();
    await testId(page, `request-confirm-${id}`).click();
    await expect(testId(page, `office-request-${id}`)).toContainText('Assessment scheduled');
    await testId(page, `request-estimate-${id}`).click();
    await testId(page, `request-low-${id}`).fill('4200');
    await testId(page, `request-high-${id}`).fill('5600');
    await testId(page, `request-confirm-${id}`).click();
    await expect(testId(page, `office-request-${id}`)).toContainText('$4,200 – $5,600');

    await page.goto('/homeowner/services');
    await expect(testId(page, `request-${id}`)).toContainText('$4,200 – $5,600');
    await testId(page, `request-approve-${id}`).click();
    await expect(testId(page, `request-${id}`)).toContainText('Approved');
  });
});
