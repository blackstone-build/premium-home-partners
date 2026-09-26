// Sample data used by demo mode. Mirrors the connected prototype.

export interface Appliance {
  brand: string;
  name: string;
  model: string;
  serial: string;
  note: string;
}

export const APPLIANCES: Appliance[] = [
  { brand: 'CARRIER CORP.', name: 'Carrier Infinity furnace', model: '59TN6B100V21', serial: '2419A83715', note: 'Filter 16×25×4' },
  { brand: 'LG ELECTRONICS', name: 'LG refrigerator', model: 'LRMVS3006S', serial: '309KRBD4Y771', note: 'Filter LT1000P' },
  { brand: 'BSH HOME APPL.', name: 'Bosch 800 dishwasher', model: 'SHPM88Z75N', serial: 'FD9912 00471', note: 'Filter monthly' },
  { brand: 'RHEEM MFG CO.', name: 'Rheem water heater', model: 'XE50T10H45U0', serial: 'Q461504231', note: '11 yrs · flush' },
  { brand: 'WHIRLPOOL CORP.', name: 'Whirlpool dryer', model: 'WED5620HW', serial: 'C92814553', note: 'Vent yearly' },
];

export interface AddOn {
  id: string;
  name: string;
  sub: string;
  base: number;
}

export type ServiceLine = 'maintenance' | 'seasonal' | 'contracted';
export type HandledBy = 'network' | 'php';

/** One row of `service_categories` (docs/SERVICES_V2.md, Catalog). */
export interface ServiceCategory {
  id: string;
  line: ServiceLine;
  /** `network`: vetted partners quote it. `php`: PHP does it under its GC license. */
  handledBy: HandledBy;
  name: string;
  sub: string;
  /** Typical price for network work; null for contracted (priced per project). */
  base: number | null;
  /** Months (1–12) the service is in season; null means year-round. */
  seasonMonths: number[] | null;
  sort: number;
}

const cat = (line: ServiceLine, sort: number, id: string, name: string, sub: string, base: number | null, seasonMonths: number[] | null = null): ServiceCategory => ({
  id,
  line,
  handledBy: line === 'contracted' ? 'php' : 'network',
  name,
  sub,
  base,
  seasonMonths,
  sort,
});

/** The full catalog, as seeded by seed_demo() and used by the offline demo. */
export const SERVICE_CATALOG: ServiceCategory[] = [
  cat('maintenance', 1, 'lawn', 'Lawn care', 'Weekly mow, edge and blow', 65),
  cat('maintenance', 2, 'land', 'Landscaping', 'Beds, mulch, seasonal color', 1400),
  cat('maintenance', 3, 'win', 'Window washing', 'Inside and out, screens', 420),
  cat('maintenance', 4, 'press', 'Pressure washing', 'Driveway, walks, siding', 340),
  cat('maintenance', 5, 'gutter', 'Gutter cleaning', 'Clean, flush, check downspouts', 225),
  cat('maintenance', 6, 'pest', 'Pest control', 'Quarterly, inside and out', 120),
  cat('maintenance', 7, 'carpet', 'Carpet & upholstery', 'Deep clean, spot treatment', 280),
  cat('maintenance', 8, 'tree', 'Tree service', 'Trim, removal, stump grind', 780),
  cat('seasonal', 1, 'lights', 'Holiday lights', 'Roofline install and removal', 1150, [10, 11, 12]),
  cat('seasonal', 2, 'leaves', 'Leaf removal', 'Beds, lawn and gutters', 260, [10, 11, 12]),
  cat('seasonal', 3, 'hvac_tune', 'HVAC tune-up', 'Spring cooling / fall heating check', 160, [3, 4, 9, 10]),
  cat('seasonal', 4, 'winterize', 'Winterize', 'Irrigation blow-out, hose bibs', 150, [10, 11]),
  cat('seasonal', 5, 'chimney', 'Chimney sweep', 'Sweep and safety inspection', 240, [9, 10, 11]),
  cat('seasonal', 6, 'pool_open', 'Pool opening', 'Uncover, balance, start up', 325, [3, 4, 5]),
  cat('seasonal', 7, 'pool_close', 'Pool closing', 'Winterize and cover', 325, [9, 10]),
  cat('seasonal', 8, 'storm', 'Storm prep', 'Generator service, tie-downs', 210, [3, 4, 5, 6]),
  cat('contracted', 1, 'roof', 'Roofing', 'Inspections, repairs, replacement', null),
  cat('contracted', 2, 'pool', 'Pools', 'Repair, resurfacing, equipment', null),
  cat('contracted', 3, 'kitchen_bath', 'Kitchen & bath refresh', 'Updates without a full gut', null),
  cat('contracted', 4, 'cabinets', 'Cabinet refinishing', 'Paint, reface, new hardware', null),
  cat('contracted', 5, 'floors', 'Flooring', 'Refinish, repair, replace', null),
  cat('contracted', 6, 'paint', 'Painting', 'Interior and exterior', null),
  cat('contracted', 7, 'outdoor', 'Decks, patios & fences', 'Build, repair, restain', null),
  cat('contracted', 8, 'doors_windows', 'Doors & windows', 'Repair and replacement', null),
  cat('contracted', 9, 'carpentry', 'Drywall, trim & carpentry', 'Patches, built-ins, trim', null),
  cat('contracted', 10, 'project', 'Something bigger', 'Remodels, additions, anything else', null),
];

/** Network (quote-flow) services: Maintenance and Seasonal. Vendors cover all of them. */
export const ADD_ONS: AddOn[] = SERVICE_CATALOG.filter((c) => c.handledBy === 'network').map((c) => ({
  id: c.id,
  name: c.name,
  sub: c.sub,
  base: c.base ?? 0,
}));

/** Other network vendors that answer each request automatically in demo mode. */
export const OTHER_VENDORS = [
  { vendor: 'Summit Pro Services', rating: 4.8, m: 0.88, when: 'Sat, Oct 18' },
  { vendor: 'Clearview & Sons', rating: 4.7, m: 1.14, when: 'Mon, Oct 20' },
];

export const MY_VENDOR = { vendor: 'Evergreen Outdoor Co.', rating: 4.9 };

export const SLOTS: [string, string][] = [
  ['Tue · Oct 14', '9:00 – 11:00 AM'],
  ['Wed · Oct 15', '1:00 – 3:00 PM'],
  ['Fri · Oct 17', '8:00 – 10:00 AM'],
];

export const VENDOR_DATES = ['Thu, Oct 16', 'Sat, Oct 18', 'Tue, Oct 21'];

export const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

export const TECH = { name: 'Marcus Reyes', initials: 'MR', title: 'Senior technician · 4.9 · 212 visits', van: 'Silver Transit van · PHP-214' };

export const OTHER_JOBS = [
  { time: '12:00 – 2:00 PM', tier: 'Medium', name: 'David Okafor', addr: '4410 Bryn Mawr Dr' },
  { time: '3:00 – 5:00 PM', tier: 'High', name: 'The Whitfields', addr: '88 Beverly Dr' },
];

export const PHOTO_GRADIENTS: Record<string, [string, string]> = {
  dirty: ['#6f604a', '#4a4034'],
  clean: ['#c8d2dc', '#e8edf2'],
  drain: ['#9c8a6c', '#6d5d44'],
  ice: ['#b7c8dc', '#8fa6c0'],
};

export const WATER_OPTIONS = [
  { key: 'city_hard', label: 'City · hard' },
  { key: 'well', label: 'Well' },
  { key: 'softened', label: 'Softened' },
] as const;
