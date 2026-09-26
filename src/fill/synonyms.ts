const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico",
};

const COUNTRY_ALIASES: string[][] = [
  ["united states", "united states of america", "usa", "us", "u s", "u s a", "america"],
  ["united kingdom", "uk", "u k", "great britain", "britain", "england"],
  ["canada", "ca"],
  ["india", "in"],
  ["south korea", "korea", "republic of korea", "korea republic of", "korea south"],
  ["china", "people s republic of china", "prc"],
  ["germany", "deutschland", "de"],
];

const DEGREE_LEVELS: [string, RegExp][] = [
  ["high school", /\b(high school|ged|secondary)\b/],
  ["associate", /\b(associate s?|aa|as|aas)\b/],
  ["bachelor", /\b(bachelor s?|bachelors|bs|ba|bsc|bse|beng|b s|b a|b sc|b eng|undergrad\w*)\b/],
  ["master", /\b(master s?|masters|ms|ma|msc|mba|meng|m s|m a|m sc|m eng|graduate)\b/],
  ["doctorate", /\b(doctorate|doctoral|phd|ph d|doctor)\b/],
];

/** Lowercase alphanumerics separated by single spaces. */
export function simplify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stateAbbreviation(state: string): string {
  const upper = state.trim().toUpperCase();
  if (US_STATES[upper]) return upper;
  const simple = simplify(state);
  const found = Object.entries(US_STATES).find(([, name]) => simplify(name) === simple);
  return found ? found[0] : state.trim();
}

export function stateName(state: string): string {
  return US_STATES[state.trim().toUpperCase()] ?? state.trim();
}

export function stateAliases(state: string): string[] {
  const abbreviation = stateAbbreviation(state);
  const name = stateName(abbreviation);
  return [...new Set([state, abbreviation, name].map(simplify).filter(Boolean))];
}

export function countryAliases(country: string): string[] {
  const simple = simplify(country);
  const group = COUNTRY_ALIASES.find((aliases) => aliases.includes(simple));
  return group ? [simple, ...group] : [simple];
}

export function degreeLevel(text: string): string | null {
  const simple = simplify(text);
  // Check higher levels first so "Master of Science" never reads as a bachelor's "ms/ba" collision.
  for (const [level, pattern] of [...DEGREE_LEVELS].reverse()) {
    if (pattern.test(simple)) return level;
  }
  return null;
}
