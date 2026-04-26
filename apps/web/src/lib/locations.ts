/**
 * Lightweight static catalog of countries / states / counties / major cities
 * used to power the cascading location selector on the search form.
 *
 * This is intentionally a curated short-list — the form also accepts a
 * "Custom city" free-text override, so users can search anywhere on earth
 * even when their target isn't in this catalog.
 */

export interface CityEntry {
  name: string;
  /** Optional county / district the city belongs to. */
  county?: string;
}

export interface StateEntry {
  code: string;
  name: string;
  counties?: string[];
  cities: CityEntry[];
}

export interface CountryEntry {
  code: string; // ISO-3166-1 alpha-2
  name: string;
  states: StateEntry[];
}

export const LOCATIONS: CountryEntry[] = [
  {
    code: 'US',
    name: 'United States',
    states: [
      {
        code: 'CA',
        name: 'California',
        counties: ['Los Angeles', 'San Francisco', 'San Diego', 'Orange', 'Santa Clara'],
        cities: [
          { name: 'Los Angeles', county: 'Los Angeles' },
          { name: 'San Francisco', county: 'San Francisco' },
          { name: 'San Diego', county: 'San Diego' },
          { name: 'San Jose', county: 'Santa Clara' },
          { name: 'Anaheim', county: 'Orange' },
          { name: 'Long Beach', county: 'Los Angeles' }
        ]
      },
      {
        code: 'TX',
        name: 'Texas',
        counties: ['Harris', 'Dallas', 'Travis', 'Bexar', 'Tarrant'],
        cities: [
          { name: 'Houston', county: 'Harris' },
          { name: 'Dallas', county: 'Dallas' },
          { name: 'Austin', county: 'Travis' },
          { name: 'San Antonio', county: 'Bexar' },
          { name: 'Fort Worth', county: 'Tarrant' }
        ]
      },
      {
        code: 'NY',
        name: 'New York',
        counties: ['New York', 'Kings', 'Queens', 'Bronx', 'Erie'],
        cities: [
          { name: 'New York', county: 'New York' },
          { name: 'Brooklyn', county: 'Kings' },
          { name: 'Queens', county: 'Queens' },
          { name: 'Buffalo', county: 'Erie' }
        ]
      },
      {
        code: 'FL',
        name: 'Florida',
        counties: ['Miami-Dade', 'Broward', 'Orange', 'Hillsborough'],
        cities: [
          { name: 'Miami', county: 'Miami-Dade' },
          { name: 'Orlando', county: 'Orange' },
          { name: 'Tampa', county: 'Hillsborough' },
          { name: 'Fort Lauderdale', county: 'Broward' }
        ]
      },
      {
        code: 'IL',
        name: 'Illinois',
        counties: ['Cook', 'DuPage'],
        cities: [
          { name: 'Chicago', county: 'Cook' },
          { name: 'Naperville', county: 'DuPage' }
        ]
      },
      {
        code: 'WA',
        name: 'Washington',
        counties: ['King', 'Pierce'],
        cities: [
          { name: 'Seattle', county: 'King' },
          { name: 'Bellevue', county: 'King' },
          { name: 'Tacoma', county: 'Pierce' }
        ]
      }
    ]
  },
  {
    code: 'CA',
    name: 'Canada',
    states: [
      {
        code: 'ON',
        name: 'Ontario',
        cities: [{ name: 'Toronto' }, { name: 'Ottawa' }, { name: 'Mississauga' }, { name: 'Hamilton' }]
      },
      {
        code: 'QC',
        name: 'Quebec',
        cities: [{ name: 'Montreal' }, { name: 'Quebec City' }, { name: 'Laval' }]
      },
      {
        code: 'BC',
        name: 'British Columbia',
        cities: [{ name: 'Vancouver' }, { name: 'Victoria' }, { name: 'Surrey' }]
      },
      {
        code: 'AB',
        name: 'Alberta',
        cities: [{ name: 'Calgary' }, { name: 'Edmonton' }]
      }
    ]
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    states: [
      {
        code: 'ENG',
        name: 'England',
        cities: [
          { name: 'London' },
          { name: 'Manchester' },
          { name: 'Birmingham' },
          { name: 'Leeds' },
          { name: 'Liverpool' }
        ]
      },
      { code: 'SCT', name: 'Scotland', cities: [{ name: 'Edinburgh' }, { name: 'Glasgow' }] },
      { code: 'WLS', name: 'Wales', cities: [{ name: 'Cardiff' }, { name: 'Swansea' }] }
    ]
  },
  {
    code: 'IN',
    name: 'India',
    states: [
      {
        code: 'MH',
        name: 'Maharashtra',
        cities: [{ name: 'Mumbai' }, { name: 'Pune' }, { name: 'Nagpur' }, { name: 'Nashik' }]
      },
      {
        code: 'KA',
        name: 'Karnataka',
        cities: [{ name: 'Bengaluru' }, { name: 'Mysuru' }, { name: 'Mangaluru' }]
      },
      {
        code: 'DL',
        name: 'Delhi',
        cities: [{ name: 'New Delhi' }, { name: 'Delhi' }]
      },
      {
        code: 'TN',
        name: 'Tamil Nadu',
        cities: [{ name: 'Chennai' }, { name: 'Coimbatore' }, { name: 'Madurai' }]
      },
      {
        code: 'TG',
        name: 'Telangana',
        cities: [{ name: 'Hyderabad' }, { name: 'Warangal' }]
      },
      {
        code: 'GJ',
        name: 'Gujarat',
        cities: [{ name: 'Ahmedabad' }, { name: 'Surat' }, { name: 'Vadodara' }]
      }
    ]
  },
  {
    code: 'AU',
    name: 'Australia',
    states: [
      {
        code: 'NSW',
        name: 'New South Wales',
        cities: [{ name: 'Sydney' }, { name: 'Newcastle' }]
      },
      { code: 'VIC', name: 'Victoria', cities: [{ name: 'Melbourne' }, { name: 'Geelong' }] },
      { code: 'QLD', name: 'Queensland', cities: [{ name: 'Brisbane' }, { name: 'Gold Coast' }] }
    ]
  },
  {
    code: 'DE',
    name: 'Germany',
    states: [
      {
        code: 'BE',
        name: 'Berlin',
        cities: [{ name: 'Berlin' }]
      },
      {
        code: 'BY',
        name: 'Bavaria',
        cities: [{ name: 'Munich' }, { name: 'Nuremberg' }]
      },
      {
        code: 'HH',
        name: 'Hamburg',
        cities: [{ name: 'Hamburg' }]
      }
    ]
  }
];

/** Compose a final search location string from cascading inputs. */
export function composeLocation(parts: {
  customCity?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}): string {
  const ordered = [parts.customCity || parts.city, parts.county, parts.state, parts.country]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  // Drop duplicates while preserving order.
  const seen = new Set<string>();
  return ordered.filter((p) => (seen.has(p.toLowerCase()) ? false : (seen.add(p.toLowerCase()), true))).join(', ');
}
