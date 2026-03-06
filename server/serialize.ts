/**
 * SeasonState JSON serialization with tagged Map support.
 *
 * JSON.stringify silently drops Map contents (serializes as {}).
 * This module uses a replacer/reviver pair with a sentinel tag
 * to preserve Map instances through the JSON round-trip.
 */

import type { SeasonState } from '../src/season/season.ts';

// --- Types ---

export interface SaveEnvelope {
  version: number;
  savedAt: string;
  state: SeasonState;
}

// --- Tagged Map pattern ---

const MAP_TAG = '__MAP__' as const;

interface TaggedMap {
  [MAP_TAG]: true;
  entries: [unknown, unknown][];
}

function isTaggedMap(value: unknown): value is TaggedMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    MAP_TAG in value &&
    (value as TaggedMap)[MAP_TAG] === true
  );
}

/**
 * JSON.stringify replacer that converts Map instances to tagged objects.
 */
function mapReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      [MAP_TAG]: true,
      entries: Array.from(value.entries()),
    } satisfies TaggedMap;
  }
  return value;
}

/**
 * JSON.parse reviver that reconstructs Map instances from tagged objects.
 */
function mapReviver(_key: string, value: unknown): unknown {
  if (isTaggedMap(value)) {
    return new Map(value.entries);
  }
  return value;
}

// --- Public API ---

/**
 * Serialize a SeasonState into a JSON string wrapped in a SaveEnvelope.
 * Maps are tagged so they survive the round-trip.
 */
export function serializeState(state: SeasonState, version: number = 1): string {
  const envelope: SaveEnvelope = {
    version,
    savedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(envelope, mapReplacer);
}

/**
 * Deserialize a JSON string back into a SaveEnvelope with reconstructed Maps.
 */
export function deserializeState(json: string): SaveEnvelope {
  return JSON.parse(json, mapReviver) as SaveEnvelope;
}
