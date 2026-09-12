export const REQUIRED_COLUMNS = [
  'Name',
  'Form',
  'Pokemon Number',
  'CP',
  'HP',
  'Atk IV',
  'Def IV',
  'Sta IV',
  'Level Min',
  'Level Max',
  'Shadow/Purified',
  'Scan Date',
] as const;

export const OPTIONAL_COLUMNS = [
  'Index',
  'Gender',
  'IV Avg',
  'Quick Move',
  'Charge Move',
  'Charge Move 2',
  'Original Scan Date',
  'Catch Date',
  'Weight',
  'Height',
  'Lucky',
  'Favorite',
  'Dust',
  'Rank % (G)',
  'Rank # (G)',
  'Stat Prod (G)',
  'Dust Cost (G)',
  'Candy Cost (G)',
  'Name (G)',
  'Form (G)',
  'Sha/Pur (G)',
  'Rank % (U)',
  'Rank # (U)',
  'Stat Prod (U)',
  'Dust Cost (U)',
  'Candy Cost (U)',
  'Name (U)',
  'Form (U)',
  'Sha/Pur (U)',
  'Rank % (L)',
  'Rank # (L)',
  'Stat Prod (L)',
  'Dust Cost (L)',
  'Candy Cost (L)',
  'Name (L)',
  'Form (L)',
  'Sha/Pur (L)',
  'Marked for PvP use',
] as const;

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export interface HeaderReport {
  ok: boolean;
  missingRequired: string[];
  missingOptional: string[];
  unknown: string[];
  columnCount: number;
}

export function fingerprintHeader(header: string[]): HeaderReport {
  const present = new Set(header.map((h) => h.trim()));
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  const missingOptional = OPTIONAL_COLUMNS.filter((c) => !present.has(c));
  const known = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const unknown = [...present].filter((h) => !known.has(h) && h !== '');
  return {
    ok: missingRequired.length === 0,
    missingRequired: [...missingRequired],
    missingOptional: [...missingOptional],
    unknown,
    columnCount: header.length,
  };
}
