/**
 * Name service tests — API fetch with nationality weighting and fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNames, getNames } from './nameService.ts';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchNames', () => {
  it('constructs correct URL with nat code and result count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { name: { first: 'James', last: 'Smith' }, nat: 'GB' },
        ],
      }),
    });

    await fetchNames(1, 'GB');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('randomuser.me/api/');
    expect(url).toContain('results=1');
    expect(url).toContain('nat=gb');
    expect(url).toContain('inc=name,nat');
  });

  it('parses response into NameEntry array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { name: { first: 'Carlos', last: 'Garcia' }, nat: 'ES' },
          { name: { first: 'Miguel', last: 'Lopez' }, nat: 'ES' },
        ],
      }),
    });

    const names = await fetchNames(2, 'ES');
    expect(names).toHaveLength(2);
    expect(names[0]).toEqual({ first: 'Carlos', last: 'Garcia', nationality: 'ES' });
    expect(names[1]).toEqual({ first: 'Miguel', last: 'Lopez', nationality: 'ES' });
  });

  it('throws on non-OK HTTP status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchNames(1, 'GB')).rejects.toThrow();
  });
});

describe('getNames', () => {
  function makeApiResponse(names: Array<{ first: string; last: string; nat: string }>) {
    return {
      ok: true,
      json: async () => ({
        results: names.map(n => ({ name: { first: n.first, last: n.last }, nat: n.nat })),
      }),
    };
  }

  it('returns exactly count names', async () => {
    // Mock 5 separate fetch calls (one per nationality)
    mockFetch
      .mockResolvedValueOnce(makeApiResponse(Array.from({ length: 4 }, () => ({ first: 'James', last: 'Smith', nat: 'GB' })))) // GB: round(10*0.40)=4
      .mockResolvedValueOnce(makeApiResponse(Array.from({ length: 3 }, () => ({ first: 'Carlos', last: 'Garcia', nat: 'ES' })))) // ES: round(10*0.25)=3 (adjusted)
      .mockResolvedValueOnce(makeApiResponse(Array.from({ length: 2 }, () => ({ first: 'Antoine', last: 'Martin', nat: 'FR' })))) // FR: round(10*0.20)=2
      .mockResolvedValueOnce(makeApiResponse(Array.from({ length: 1 }, () => ({ first: 'Lukas', last: 'Mueller', nat: 'DE' })))) // DE: round(10*0.10)=1
      .mockResolvedValueOnce(makeApiResponse([])); // BR: round(10*0.05)=1, but adjusted to 0

    const rng = () => 0.5;
    const names = await getNames(10, rng);
    expect(names).toHaveLength(10);
  });

  it('returns names in "First Last" format', async () => {
    mockFetch
      .mockResolvedValueOnce(makeApiResponse([{ first: 'Harry', last: 'Kane', nat: 'GB' }]))
      .mockResolvedValueOnce(makeApiResponse([]))
      .mockResolvedValueOnce(makeApiResponse([]))
      .mockResolvedValueOnce(makeApiResponse([]))
      .mockResolvedValueOnce(makeApiResponse([]));

    const rng = () => 0.5;
    const names = await getNames(1, rng);
    expect(names[0]!.name).toBe('Harry Kane');
    expect(names[0]!.nationality).toBe('GB');
  });

  it('falls back to generatePlayerName when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const rng = (() => {
      let i = 0;
      const vals = [0.1, 0.3, 0.7]; // nationality, first, last picks
      return () => vals[i++ % vals.length]!;
    })();

    const names = await getNames(3, rng);
    expect(names).toHaveLength(3);
    // Each entry should have a name and nationality from the fallback generator
    for (const entry of names) {
      expect(entry.name).toMatch(/\S+ \S+/);
      expect(entry.nationality).toBeTruthy();
    }
  });

  it('falls back when fetch returns non-OK status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

    const rng = (() => {
      let i = 0;
      const vals = [0.1, 0.3, 0.7];
      return () => vals[i++ % vals.length]!;
    })();

    const names = await getNames(5, rng);
    expect(names).toHaveLength(5);
    for (const entry of names) {
      expect(entry.name).toMatch(/\S+ \S+/);
    }
  });

  it('calls fetchNames with correct nationality proportions', async () => {
    // For count=25: GB=10, ES=6, FR=5, DE=3, BR=1
    const counts: Record<string, number> = {};
    mockFetch.mockImplementation(async (url: string) => {
      const natMatch = url.match(/nat=(\w+)/);
      const resultsMatch = url.match(/results=(\d+)/);
      if (natMatch && resultsMatch) {
        const nat = natMatch[1]!.toUpperCase();
        const count = parseInt(resultsMatch[1]!, 10);
        counts[nat] = count;
        return makeApiResponse(
          Array.from({ length: count }, () => ({ first: 'Test', last: 'Name', nat }))
        );
      }
      return makeApiResponse([]);
    });

    const rng = () => 0.5;
    const names = await getNames(25, rng);
    expect(names).toHaveLength(25);

    // Verify proportions are approximately correct
    expect(counts['GB']).toBe(10);  // 25 * 0.40 = 10
    expect(counts['ES']).toBe(6);   // 25 * 0.25 = 6.25 -> 6
    expect(counts['FR']).toBe(5);   // 25 * 0.20 = 5
    expect(counts['DE']).toBe(3);   // 25 * 0.10 = 2.5 -> 3 (adjusted)
    expect(counts['BR']).toBe(1);   // 25 * 0.05 = 1.25 -> 1
  });
});
