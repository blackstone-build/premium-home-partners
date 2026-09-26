# Services v2: Maintenance, Seasonal, Contracted, and "Show us"

The homeowner Services tab grows from six add-on tiles into Premium Home Partners' "one stop, first stop" for anything a client wants done to their house. There are three service lines and one open-ended photo request:

| Line | Who does it | Flow |
|---|---|---|
| **Maintenance** | Vetted service partners (the network) | Get quotes → bids arrive live → Book. PHP keeps the 10% coordination fee. This is today's add-on flow. |
| **Seasonal** | The network | The same quote flow. Tiles show **In season** for the current month (Birmingham calendar) and sort first. |
| **Contracted** | **PHP, under its general contractor's license** | Request an assessment → assessment scheduled → estimate sent (a range) → client approves → in progress → done. For roofs, pools, remodels, cabinets and so on. |
| **Show us** | The office triages it | The client photographs anything (a broken door, a squeaky floor) and describes it. The office routes it to the next visit, network quotes, a contracted project, or a reply. |

This maps onto the website's pricing model: Maintenance Plans, plus Emergency Coordination (Show us, urgent), plus Project Management "priced per project with clear milestones" (Contracted).

## Catalog (`service_categories`)

New columns:
- `line`: `maintenance` | `seasonal` | `contracted`.
- `handled_by`: `network` | `php`.
- `season_months smallint[]`: 1–12; null means year-round.
- `sort smallint`.

The existing ids keep their meaning. Every vendor's `categories` covers all network categories.

| id | line | handled_by | name | sub | base | season_months |
|---|---|---|---|---|---|---|
| lawn | maintenance | network | Lawn care | Weekly mow, edge and blow | 65 | |
| land | maintenance | network | Landscaping | Beds, mulch, seasonal color | 1400 | |
| win | maintenance | network | Window washing | Inside and out, screens | 420 | |
| press | maintenance | network | Pressure washing | Driveway, walks, siding | 340 | |
| gutter | maintenance | network | Gutter cleaning | Clean, flush, check downspouts | 225 | |
| pest | maintenance | network | Pest control | Quarterly, inside and out | 120 | |
| carpet | maintenance | network | Carpet & upholstery | Deep clean, spot treatment | 280 | |
| tree | maintenance | network | Tree service | Trim, removal, stump grind | 780 | |
| lights | seasonal | network | Holiday lights | Roofline install and removal | 1150 | {10,11,12} |
| leaves | seasonal | network | Leaf removal | Beds, lawn and gutters | 260 | {10,11,12} |
| hvac_tune | seasonal | network | HVAC tune-up | Spring cooling / fall heating check | 160 | {3,4,9,10} |
| winterize | seasonal | network | Winterize | Irrigation blow-out, hose bibs | 150 | {10,11} |
| chimney | seasonal | network | Chimney sweep | Sweep and safety inspection | 240 | {9,10,11} |
| pool_open | seasonal | network | Pool opening | Uncover, balance, start up | 325 | {3,4,5} |
| pool_close | seasonal | network | Pool closing | Winterize and cover | 325 | {9,10} |
| storm | seasonal | network | Storm prep | Generator service, tie-downs | 210 | {3,4,5,6} |
| roof | contracted | php | Roofing | Inspections, repairs, replacement | null | |
| pool | contracted | php | Pools | Repair, resurfacing, equipment | null | |
| kitchen_bath | contracted | php | Kitchen & bath refresh | Updates without a full gut | null | |
| cabinets | contracted | php | Cabinet refinishing | Paint, reface, new hardware | null | |
| floors | contracted | php | Flooring | Refinish, repair, replace | null | |
| paint | contracted | php | Painting | Interior and exterior | null | |
| outdoor | contracted | php | Decks, patios & fences | Build, repair, restain | null | |
| doors_windows | contracted | php | Doors & windows | Repair and replacement | null | |
| carpentry | contracted | php | Drywall, trim & carpentry | Patches, built-ins, trim | null | |
| project | contracted | php | Something bigger | Remodels, additions, anything else | null | |

`request_quote` (the network flow) rejects `php` categories with "Request an assessment for this service instead."

## Requests (`service_requests`, `service_request_photos`)

```
service_requests
  id uuid pk, home_id uuid -> homes (cascade), requester_id uuid -> profiles
  kind text: 'photo' | 'project'
  category text -> service_categories (null allowed for 'photo' until routed)
  title text (1..80), description text (1..1000)
  room text null: 'kitchen'|'bath'|'bedroom'|'living'|'exterior'|'garage'|'other'
  urgency text: 'whenever'|'soon'|'urgent'
  status text: 'new'|'reviewing'|'assessment_scheduled'|'estimate_sent'|'approved'
               |'in_progress'|'done'|'scheduled'|'quoted'|'closed'|'declined'|'canceled'
  route text null: 'visit'|'quotes'|'project'|'advice'
  visit_id uuid null -> visits (set null), quote_request_id uuid null -> quote_requests (set null)
  assessment_at timestamptz null, estimate_low numeric null, estimate_high numeric null
  office_note text null, created_at, updated_at
service_request_photos
  id uuid pk, request_id -> service_requests (cascade), path text, created_at
visit_tasks + request_id uuid null -> service_requests (on delete set null)
```

**Storage.** A private bucket `request-photos` with paths `{request_id}/{uuid}.jpg`.
- Insert: the request's homeowner.
- Select: the homeowner, the office, and a tech whose visit has a task linked to the request.

**RLS.** `service_requests` and `service_request_photos` are readable by:
- the home's owner;
- the office (all rows);
- a tech, for requests linked to a `visit_task` on the tech's visits.

All writes go through RPCs. Both tables join the `supabase_realtime` publication.

**RPCs.** All are security definer, `search_path = public`, and granted to `authenticated` only. Errors are user-facing, in the style of the existing ones.

- `create_service_request(p_kind, p_category, p_title, p_description, p_room, p_urgency) returns uuid`
  - Caller: a homeowner with a home.
  - `project` requires a contracted category.
  - `photo` allows a null or any category.
  - The title defaults to the category name or the start of the description.
  - Status is `new`.
- `add_service_request_photo(p_request_id, p_path)`: the requester only. The path must start with `{request_id}/`. At most 4 photos per request.
- `office_route_request(p_request_id, p_route, p_category, p_note) returns jsonb`: office only, for requests in `new` or `reviewing`.
  - `visit`: finds the home's next visit that isn't done and whose window ends after now. It errors "There's no visit scheduled for this home." if none exists. It inserts a `visit_task` (`task_key 'request'`, `name 'Client request: ' || title`, `request_id`). Status becomes `scheduled` and `visit_id` is set.
  - `quotes`: the category must be network. It creates a `quote_request` the same way `request_quote` does. Status becomes `quoted` and `quote_request_id` is set. It returns `{quote_request_id}`; the office client then invokes `fanout-quote` exactly as the homeowner client does.
  - `project`: the category must be contracted. Kind becomes `project` and status `reviewing`.
  - `advice`: the note is required. Status becomes `closed`.
- `office_update_project(p_request_id, p_status, p_assessment_at, p_estimate_low, p_estimate_high, p_note)`: office only, for project requests.
  - `new`/`reviewing` → `assessment_scheduled` (needs `assessment_at`)
  - → `estimate_sent` (needs low and high, with 0 < low ≤ high)
  - `approved` → `in_progress` → `done`
  - any open status → `declined` (needs a note)
- `approve_estimate(p_request_id)`: the owner; `estimate_sent` → `approved`.
- `cancel_service_request(p_request_id)`: the owner, while status is `new`, `reviewing`, `assessment_scheduled` or `estimate_sent`.

**Demo reset (`seed_demo`).** It clears the requests and photos, upserts the full catalog, and seeds:
- David Okafor: project `roof`, "Roof inspection after the last storm". Status `assessment_scheduled`, tomorrow 10:00 Chicago.
- The Whitfields: project `pool`, "Pool resurfacing". Status `estimate_sent`, $18,500–$22,000.
- Priya Shah: a photo request "Back door sticks and won't latch", kitchen, `soon`. It is routed to her visit, with the linked `visit_task`.
- Elena: no requests, so the presenter creates one live.

## App

**Homeowner Services tab** (`app/homeowner/(main)/services.tsx`)
- Title "Services", with copy in the site's voice.
- A **Show us** card (`show-us-start`): "Something not right? Snap a photo and we'll take care of it." It opens `/homeowner/request`.
- **Your requests** (`my-requests`): open requests and projects as cards (`request-<id>`), each with a live status line.
  - When the status is `estimate_sent`, the card shows the range with **Approve estimate** (`request-approve-<id>`) and **Not now** / Cancel (`request-cancel-<id>`).
  - Assessments show the date. Routed photo requests say what happened ("Added to your Oct 14 visit", "Quotes on the way", "We replied: …").
- A segmented control for Maintenance | Seasonal | Contracted (`services-line-<line>`). Maintenance is the default.
  - Maintenance and Seasonal tiles keep `addon-<id>` testIDs and the existing quote → bids → Book behavior. Seasonal tiles show an **In season** badge and sort in-season first.
  - Contracted rows (`contracted-<id>`) open `/homeowner/request?kind=project&category=<id>` with the category chosen.

**Request screen** (`app/homeowner/request.tsx`)
- Up to 4 photos, using the existing capture module (camera on native, file picker on web). `request-photo-add`, thumbnails removable.
- "What's going on?" (`request-description`).
- Where in the home (`request-room-<room>`).
- How soon (`request-urgency-<u>`).
- **Send to Premium Home** (`request-submit`), with errors in `request-error`.
- For a project, the title reads "Request an assessment · <category>". The copy explains that a PHP project manager visits, then sends an estimate.
- Photos upload after the row is created. If an upload fails, the request stays and a toast offers Retry.

**Office**: a new **Requests** tab (`app/office/requests.tsx`, nav `office-tab-requests`), listed after Add-on quotes.
- Filters: New, Projects, Scheduled/quoted, Closed.
- Each card shows the client, short address, title, description, room, urgency, age and photos (signed URLs).
- Actions for new or reviewing requests: **Add to next visit**, **Get partner quotes** (category picker, network only), **Start a project** (contracted category picker), **Reply & close** (note).
- Project actions: **Schedule assessment** (date and time), **Send estimate** (low/high), **Start work**, **Mark done**, **Decline** (note).
- Everything updates live.

**Tech**: in `tech/job.tsx`, checklist rows with a `request_id` show a "Client request" badge, the description and photo thumbnails. They tick like any other task.

**Offline demo mode**: the same UI on the local store.
- Catalog from `data/seed.ts`.
- Requests are created locally, with the photo kept as a local URI and no upload.
- The office Requests tab and its routing work on the local store.

## Tests
- PGlite tests for every RPC's permissions, validation, transitions and RLS:
  - a vendor never sees requests;
  - a homeowner sees only their own;
  - a tech sees only linked requests.
- E2E (`e2e/services-v2.spec.ts`), run only after the live demo, because E2E resets the shared data:
  - Photo flow: Elena sends a Show us request with `e2e/fixtures/filter.jpg`. The office sees it live, with its photo, and adds it to the next visit. Marcus sees the Client request task.
  - Contracted flow: Elena requests a Cabinets assessment. The office schedules the assessment and sends an estimate. Elena sees it live and approves. The office sees Approved.
  - Seasonal: the In-season badge matches the month.
