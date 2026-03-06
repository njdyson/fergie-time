/**
 * Name fetching service with API + fallback to procedural generation.
 * Fetches realistic player names from randomuser.me with nationality weighting.
 */

import { generatePlayerName } from './nameGen.ts';

export interface NameEntry {
  first: string;
  last: string;
  nationality: string;
}

const NAT_WEIGHTS = [
  { code: 'GB', weight: 0.40 },
  { code: 'ES', weight: 0.25 },
  { code: 'FR', weight: 0.20 },
  { code: 'DE', weight: 0.10 },
  { code: 'BR', weight: 0.05 },
] as const;

/**
 * Fetch names from randomuser.me API for a specific nationality.
 * @param count - Number of names to fetch
 * @param natCode - Nationality code (e.g. 'GB', 'ES')
 * @throws On non-OK HTTP status
 */
export async function fetchNames(count: number, natCode: string): Promise<NameEntry[]> {
  if (count <= 0) return [];

  const url = `https://randomuser.me/api/?results=${count}&nat=${natCode.toLowerCase()}&gender=male&inc=name,nat`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`fetchNames failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.results as Array<{ name: { first: string; last: string }; nat: string }>).map(
    (entry) => ({
      first: entry.name.first,
      last: entry.name.last,
      nationality: entry.nat,
    }),
  );
}

/**
 * Get player names with nationality weighting.
 * Fetches from API in parallel per nationality, falls back to procedural generation on any error.
 * @param count - Total number of names needed
 * @param rng - Random number generator for fallback
 * @returns Array of "First Last" name strings
 */
export interface PlayerName {
  name: string;
  nationality: string;
}

export async function getNames(count: number, rng: () => number): Promise<PlayerName[]> {
  try {
    // Calculate per-nationality counts
    const counts: Array<{ code: string; count: number }> = [];
    let allocated = 0;

    for (let i = 0; i < NAT_WEIGHTS.length; i++) {
      const w = NAT_WEIGHTS[i]!;
      if (i === NAT_WEIGHTS.length - 1) {
        // Last nationality gets the remainder to ensure exact total
        counts.push({ code: w.code, count: count - allocated });
      } else {
        const n = Math.round(count * w.weight);
        counts.push({ code: w.code, count: n });
        allocated += n;
      }
    }

    // Fetch all nationalities in parallel
    const batches = await Promise.all(
      counts.map(({ code, count: n }) => fetchNames(n, code)),
    );

    // Flatten to PlayerName objects
    const names: PlayerName[] = [];
    for (const batch of batches) {
      for (const entry of batch) {
        names.push({ name: `${entry.first} ${entry.last}`, nationality: entry.nationality });
      }
    }

    return names;
  } catch {
    // Fallback to procedural generation — assign random nationalities
    const natCodes = NAT_WEIGHTS.map(w => w.code);
    return Array.from({ length: count }, () => ({
      name: generatePlayerName(rng),
      nationality: natCodes[Math.floor(rng() * natCodes.length)]!,
    }));
  }
}
