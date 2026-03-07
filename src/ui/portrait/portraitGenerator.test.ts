import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as portraitGeneratorModule from './portraitGenerator.ts';
import { generatePortrait } from './portraitGenerator.ts';
import { getPalette, FALLBACK_PALETTE, NATIONALITY_PALETTES } from './palettes.ts';
import { getOrGeneratePortrait, clearPortraitCache } from './portraitCache.ts';
import type { PlayerState } from '../../simulation/types.ts';

// --- Canvas mock helpers ---

type MockCtxInternal = {
  fillStyle: string;
  calls: { method: string; args: unknown[] }[];
  buffer: Uint8ClampedArray;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  getImageData: (x: number, y: number, w: number, h: number) => ImageData;
  putImageData: (data: ImageData, x: number, y: number) => void;
  save: () => void;
  restore: () => void;
  translate: (x: number, y: number) => void;
};

function makeMockCtx(): MockCtxInternal {
  // Simulate a 120x120 RGBA pixel buffer
  const buffer = new Uint8ClampedArray(120 * 120 * 4);
  const ctx: MockCtxInternal = {
    fillStyle: '',
    calls: [],
    buffer,
    fillRect(x: number, y: number, w: number, h: number) {
      this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
      // Parse hex colour and paint pixels into buffer so getImageData returns real data
      const hex = this.fillStyle.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      for (let py = y; py < y + h && py < 120; py++) {
        for (let px = x; px < x + w && px < 120; px++) {
          const idx = (py * 120 + px) * 4;
          buffer[idx] = r;
          buffer[idx + 1] = g;
          buffer[idx + 2] = b;
          buffer[idx + 3] = 255;
        }
      }
    },
    getImageData(_x: number, _y: number, _w: number, _h: number): ImageData {
      return { data: new Uint8ClampedArray(buffer), width: 120, height: 120, colorSpace: 'srgb' } as ImageData;
    },
    putImageData(data: ImageData, _x: number, _y: number) {
      this.calls.push({ method: 'putImageData', args: [data] });
      buffer.set(data.data);
    },
    // Transformation stubs — mock does not implement a transform matrix; these are
    // no-ops sufficient for unit tests that verify pixel data correctness/determinism.
    save() { this.calls.push({ method: 'save', args: [] }); },
    restore() { this.calls.push({ method: 'restore', args: [] }); },
    translate(x: number, y: number) { this.calls.push({ method: 'translate', args: [x, y] }); },
  };
  return ctx;
}

function makeMockCanvas(): { canvas: HTMLCanvasElement; ctx: MockCtxInternal } {
  const ctx = makeMockCtx();
  const canvas = {
    width: 120,
    height: 120,
    getContext: (_type: string) => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

// Minimal PlayerState factory
function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'test-player-001',
    teamId: 'team-a' as PlayerState['teamId'],
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    attributes: {} as PlayerState['attributes'],
    personality: {} as PlayerState['personality'],
    fatigue: 0,
    role: 'CM',
    duty: 'support' as PlayerState['duty'],
    formationAnchor: { x: 0, y: 0 },
    nationality: 'GB',
    ...overrides,
  };
}

// --- Tests ---

describe('palettes', () => {
  it('Test 3: getPalette("GB") returns a palette with skin and hair arrays; getPalette("NG") returns a different palette', () => {
    const gb = getPalette('GB');
    const ng = getPalette('NG');

    expect(gb.skin).toBeDefined();
    expect(gb.hair).toBeDefined();
    expect(gb.skin.length).toBeGreaterThan(0);
    expect(gb.hair.length).toBeGreaterThan(0);

    expect(ng.skin).toBeDefined();
    expect(ng.hair).toBeDefined();

    // NG should have different (darker) skin values than GB
    expect(gb.skin[0]).not.toBe(ng.skin[0]);
  });

  it('Test 4: getPalette(undefined) returns the FALLBACK_PALETTE without throwing', () => {
    expect(() => getPalette(undefined)).not.toThrow();
    const result = getPalette(undefined);
    expect(result).toBe(FALLBACK_PALETTE);
    expect(result.skin.length).toBeGreaterThan(0);
    expect(result.hair.length).toBeGreaterThan(0);
  });

  it('covers all 10 nationality codes', () => {
    const codes = ['GB', 'ES', 'FR', 'DE', 'BR', 'IT', 'PT', 'NL', 'AR', 'NG'];
    for (const code of codes) {
      expect(NATIONALITY_PALETTES[code]).toBeDefined();
    }
  });
});

describe('generatePortrait', () => {
  it('Test 1: same player ID produces identical ImageData bytes', () => {
    const player = makePlayer({ id: 'player-determinism-test', nationality: 'ES' });

    const { canvas: canvas1, ctx: ctx1 } = makeMockCanvas();
    const { canvas: canvas2, ctx: ctx2 } = makeMockCanvas();

    generatePortrait(canvas1, player);
    generatePortrait(canvas2, player);

    const bytes1 = ctx1.getImageData(0, 0, 120, 120).data;
    const bytes2 = ctx2.getImageData(0, 0, 120, 120).data;

    expect(bytes1).toEqual(bytes2);
  });

  it('Test 2: different player IDs produce different ImageData bytes', () => {
    const player1 = makePlayer({ id: 'player-alpha', nationality: 'GB' });
    const player2 = makePlayer({ id: 'player-beta', nationality: 'GB' });

    const { canvas: canvas1, ctx: ctx1 } = makeMockCanvas();
    const { canvas: canvas2, ctx: ctx2 } = makeMockCanvas();

    generatePortrait(canvas1, player1);
    generatePortrait(canvas2, player2);

    const bytes1 = ctx1.getImageData(0, 0, 120, 120).data;
    const bytes2 = ctx2.getImageData(0, 0, 120, 120).data;

    // At least some pixels should differ
    const hasDifference = Array.from(bytes1).some((b, i) => b !== bytes2[i]);
    expect(hasDifference).toBe(true);
  });
});

describe('getOrGeneratePortrait (cache)', () => {
  beforeEach(() => {
    clearPortraitCache();
  });

  it('Test 5: returns cached data on second call (generatePortrait not called again)', () => {
    const player = makePlayer({ id: 'cached-player', nationality: 'FR' });
    const { canvas } = makeMockCanvas();

    const generateSpy = vi.spyOn(portraitGeneratorModule, 'generatePortrait');

    getOrGeneratePortrait(canvas, player);
    getOrGeneratePortrait(canvas, player);

    // generatePortrait should have been called exactly once
    expect(generateSpy).toHaveBeenCalledTimes(1);

    generateSpy.mockRestore();
  });
});
