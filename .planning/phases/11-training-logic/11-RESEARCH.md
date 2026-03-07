# Phase 11: Training Logic - Research

**Researched:** 2026-03-07
**Domain:** Pure-function attribute growth system — age curve, personality trait, drill-type mapping, headless economy simulation
**Confidence:** HIGH (codebase patterns, existing types, math design); MEDIUM (tuning constants — must be validated by headless sim)

---

## Summary

Phase 11 is a pure computation layer with zero UI. The goal is a `applyDrill(players, drillType) → PlayerState[]` function (and supporting types) that improves player attributes in a way that is age-gated, personality-driven, and economically sound. All five success criteria are verified by Vitest unit tests, including a headless 5-season simulation that confirms no attribute exceeds ~0.95 for a player starting below 0.70.

The codebase already has the complete type vocabulary needed: `PlayerAttributes` (20 attributes, all `0..1`), `PersonalityVector` (8 traits including the `work_rate` trait that doubles as the "training" personality trait — see design note below), `PlayerState` (includes `age?: number`), and `PlayerState` is readonly/immutable everywhere. The fatigue system in `src/simulation/ai/fatigue.ts` is the closest architectural analog: it also maps from base attributes to modified attributes as a pure function and was built with immutability as a first-class constraint.

The key design insight is that no new field is needed on `PlayerState` for training to work. The "training" personality trait maps cleanly to `work_rate` — a player with high `work_rate` works harder in sessions, absorbs more coaching. Age is already on `PlayerState` as `age?: number`. The only structural addition is adding `training` as a new trait to `PersonalityVector` — which is a **breaking change** to the type that must be handled carefully (see Pitfall 2). The alternative (using `work_rate` as a proxy) avoids the breaking change entirely and is simpler. The planner must decide; both options are documented.

The economy risk (noted as CRITICAL in STATE.md) is real: an uncapped growth function with a fixed multiplier applied every training session will compound quickly. The correct pattern is a **diminishing returns curve**: gain = `baseDelta × ageFactor(age) × trainingFactor(personality.work_rate) × (1 - currentValue)`. The `(1 - currentValue)` term is the key — it makes growth asymptotically approach 1.0 without ever hitting it, and it automatically slows near the ceiling. This is standard logistic-growth math used in sports simulation. The headless sim is the only reliable way to validate the tuning constants.

**Primary recommendation:** Implement training logic as a single new file `src/season/training.ts` exporting pure functions. Use `work_rate` personality trait as the training multiplier (no new trait needed, no type breaking change). The `(1 - currentValue)` diminishing-returns term satisfies TRAIN-06's "no hidden ceiling" requirement while preventing economy collapse. Validate all tuning constants against headless 5-season simulation before the phase is considered complete.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRAIN-04 | Player attributes improve after training based on drill type, age, and a "training" personality trait | `applyDrill(players, drillType): PlayerState[]` pure function. Drill type maps to a subset of `PlayerAttributes` to improve. Age factor from age curve. Personality factor from `work_rate` (or new `training` trait). All computable from existing `PlayerState` fields. |
| TRAIN-06 | Improvement rate is uncapped — no hidden potential ceiling — but naturally slows with age and varies by personality | Logistic growth: `gain = baseDelta × ageFactor(age) × personalityFactor × (1 - currentValue)`. The `(1 - currentValue)` term produces asymptotic approach to 1.0 with no ceiling — a player can always improve, but gains near 0.95+ become negligible. Validated by headless 5-season sim. |

</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (project) | ~5.9.3 | Pure function implementation | Already in project, no additions needed |
| Vitest | ^3.2.3 | Unit tests including headless sim test | Already configured, `npm test` works |
| seedrandom | ^3.0.5 | Deterministic RNG for headless simulation | Already in project dependencies |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No new dependencies required |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure TypeScript math | A "stats engine" library | Overkill — the formula is ~20 lines; no library adds value |
| `work_rate` as training proxy | New `training` trait on PersonalityVector | New trait is more semantically correct but breaks all existing type consumers and tests; `work_rate` already captures "effort in sessions" |

**Installation:**
```bash
# No new packages required
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/season/
├── training.ts          # New file — pure training logic (applyDrill, DrillType, etc.)
├── training.test.ts     # New file — unit tests + headless 5-season sim
├── season.ts            # Existing — no changes in Phase 11 (Phase 12 will integrate)
├── teamGen.ts           # Existing — generatePersonality() already produces work_rate
└── playerAnalysis.ts    # Existing — ageCurveMultiplier() may be reused
```

### Pattern 1: Pure Function, Immutable Output

**What:** `applyDrill` takes `PlayerState[]` and `DrillType` and returns a new `PlayerState[]`. No mutation. This is identical to how `applyFatigueToAttributes` works in `src/simulation/ai/fatigue.ts`.

**When to use:** Always — this phase explicitly requires "pure function, testable without UI."

**Example:**
```typescript
// src/season/training.ts
export type DrillType = 'fitness' | 'passing' | 'shooting' | 'defending' | 'set_pieces' | 'tactics' | 'dribbling' | 'aerial';

export function applyDrill(players: PlayerState[], drill: DrillType): PlayerState[] {
  return players.map(p => applyDrillToPlayer(p, drill));
}

function applyDrillToPlayer(player: PlayerState, drill: DrillType): PlayerState {
  const age = player.age ?? 25;
  const trainingFactor = getTrainingFactor(player.personality);
  const ageFactor = getAgeFactor(age);
  const targets = DRILL_ATTRIBUTE_MAP[drill];

  const newAttrs = { ...player.attributes };
  for (const attr of targets) {
    const current = newAttrs[attr];
    const gain = BASE_DELTA * ageFactor * trainingFactor * (1 - current);
    newAttrs[attr] = Math.min(1, current + gain);
  }

  return { ...player, attributes: newAttrs as PlayerAttributes };
}
```

### Pattern 2: Age Factor Curve

**What:** A multiplier (0..1) that is highest for young players and decays with age. The existing `ageCurveMultiplier` in `playerAnalysis.ts` is a value multiplier for rating/valuation — it peaks at age 29 (1.20). For training, we want the inverse shape: highest gain at 17, decaying through career.

**Key distinction:** `playerAnalysis.ageCurveMultiplier` serves market value (peak-age players worth more). Training age factor must be inverted: young players gain most, old players gain least. Do NOT reuse `ageCurveMultiplier` directly.

**Design:**
```typescript
// Training-specific age factor — NOT the same as playerAnalysis.ageCurveMultiplier
function getAgeFactor(age: number): number {
  // Young players absorb coaching faster
  if (age <= 20) return 1.0;
  if (age <= 25) return 1.0 - (age - 20) * 0.04;  // 1.0..0.80
  if (age <= 30) return 0.80 - (age - 25) * 0.06; // 0.80..0.50
  if (age <= 35) return 0.50 - (age - 30) * 0.06; // 0.50..0.20
  return 0.15; // veterans still improve, just barely
}
// Satisfies TRAIN-06: growth "naturally slows with age" but never hits zero
```

### Pattern 3: Diminishing Returns (No Hidden Ceiling)

**What:** The `(1 - currentValue)` term in the gain formula. This is the mathematical key to satisfying TRAIN-06 simultaneously with the economy constraint.

**Why it works:**
- At `currentValue = 0.50`: gain is proportional to 0.50 — full rate
- At `currentValue = 0.80`: gain is proportional to 0.20 — reduced
- At `currentValue = 0.95`: gain is proportional to 0.05 — negligible
- At `currentValue = 1.00`: gain is 0 — but you can never quite reach 1.0

**This is not a cap** — the player can always improve. It is natural decay. TRAIN-06 is satisfied.

```typescript
const gain = BASE_DELTA * ageFactor * trainingFactor * (1 - current);
// BASE_DELTA must be tuned by headless sim — starting estimate: 0.004 per session
```

### Pattern 4: Drill → Attribute Mapping

**What:** Each drill type targets a specific subset of `PlayerAttributes`. The success criteria require that the drill produce "measurably higher relevant attributes" — so the mapping must be specific, not broad.

**Design (6-8 drill types, matching TRAIN-03 which Phase 12 will surface in UI):**
```typescript
const DRILL_ATTRIBUTE_MAP: Record<DrillType, Array<keyof PlayerAttributes>> = {
  fitness:     ['pace', 'stamina', 'strength', 'acceleration', 'agility'],
  passing:     ['passing', 'vision', 'crossing', 'distribution'],
  shooting:    ['shooting', 'finishing', 'composure'],  // note: composure is on PersonalityVector not attributes
  defending:   ['tackling', 'positioning', 'heading', 'concentration'],
  set_pieces:  ['crossing', 'finishing', 'heading', 'aerial'],
  tactics:     ['positioning', 'vision', 'concentration', 'anticipation'],
  dribbling:   ['dribbling', 'agility', 'acceleration', 'pace'],
  aerial:      ['aerial', 'heading', 'strength', 'jumping'],  // heading + aerial
};
// Note: 'composure' is on PersonalityVector (TRAIN-F01 territory, out of scope for phase 11)
// Only PlayerAttributes keys are valid targets
```

### Pattern 5: Headless 5-Season Simulation Test

**What:** A Vitest test that generates a player squad, runs 5 seasons of training (one drill per training day, ~3 days/week, ~38 weeks/season = ~570 sessions), and asserts no attribute exceeds 0.95 for players starting below 0.70.

**Why this approach:** The headless sim is deterministic (seedrandom), runs in < 5 seconds in Node, and is the only reliable way to validate tuning constants. This pattern mirrors `quickSimMatch` in `src/season/quickSim.ts` — headless engine use is already established.

```typescript
// src/season/training.test.ts
it('5-season headless sim: no player starting below 0.70 exceeds 0.95', () => {
  const rng = seedrandom('economy-test');
  // Generate a squad with attributes starting at 0.50-0.69
  // Apply 570 drill sessions across all drill types
  // Assert: max(relevantAttrs) <= 0.95 for those players
});
```

### Anti-Patterns to Avoid

- **Fixed potential ceiling:** Never add a `potential` field that caps growth. TRAIN-06 explicitly forbids hidden ceilings. The `(1 - currentValue)` curve IS the ceiling mechanism.
- **Mutable PlayerState:** Never modify `player.attributes` in place. Always return a new object. PlayerState is `readonly` throughout the codebase.
- **Reusing `playerAnalysis.ageCurveMultiplier` for training:** That curve peaks at age 29 (market value logic). Training needs the inverse — highest for young players. Using it would make 29-year-olds gain the most.
- **Applying drill gains to personality traits:** Phase 11 only touches `PlayerAttributes`. TRAIN-F01 (personality vector nudges) is explicitly deferred to future requirements. Do not conflate them.
- **Missing fallback for absent `age`:** `PlayerState.age` is `number | undefined`. Any training function must handle the missing case with a sensible default (suggest age 25 = flat factor).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diminishing returns curve | Custom sigmoidal function | `(1 - currentValue)` term | Already mathematically correct, simple, and auditable |
| Seeded RNG for tests | Custom pseudo-random | `seedrandom` (already in deps) | Deterministic test reproducibility |
| Age lookup table | Hardcoded table for each age 17-35 | Piecewise linear function | 4-line function handles all ages continuously |

**Key insight:** The math for logistic growth (diminishing returns) is well-understood. The danger is in tuning constants, not architecture — invest time in the headless simulation test, not in complex formulas.

---

## Common Pitfalls

### Pitfall 1: BASE_DELTA Too High — Economy Collapse
**What goes wrong:** A player starting at 0.55 reaches 0.93 in one season instead of five. The game becomes trivially easy within one or two seasons.
**Why it happens:** The `(1 - currentValue)` term reduces gains over time, but if `BASE_DELTA` starts too high, early-career gains are enormous.
**How to avoid:** Start with `BASE_DELTA = 0.003` per session and run the headless 5-season sim immediately. If any attribute exceeds 0.85 at season end, halve it.
**Warning signs:** Headless sim shows any attribute exceeding 0.80 after 2 seasons for a player starting at 0.55.

### Pitfall 2: Breaking PersonalityVector by Adding `training` Trait
**What goes wrong:** Adding `training: number` to `PersonalityVector` breaks every file that constructs the type. Search reveals: `teamGen.ts` (generatePersonality), `season.test.ts` (makePlayer helper), `agent.test.ts`, `fatigue.test.ts`, and any saved game states in the DB.
**Why it happens:** `PersonalityVector` is a `readonly` interface with 8 named traits — adding a 9th requires updating every literal construction site.
**How to avoid:** Use `work_rate` as the training personality proxy. It semantically maps to "effort in sessions," which is what "training" trait means. Document the mapping in a comment. No interface change, no breaking change.
**Alternative if trait is desired:** If a distinct `training` trait is wanted, the planner must include a task to update all PersonalityVector construction sites (at minimum: `teamGen.ts`, all test makePlayer helpers, `CONSERVATIVE_DEFAULTS` in `fatigue.ts`). Saved game backward compatibility needs a migration fallback (deserialize old saves missing the field and default it to 0.5).
**Warning signs:** TypeScript compiler errors on `PersonalityVector` literal objects after adding the trait.

### Pitfall 3: Missing `age` Field on Saved Players
**What goes wrong:** Existing saves may have players without an `age` field (it is `optional` on PlayerState). Training function panics or produces `NaN` gains.
**Why it happens:** `PlayerState.age` is typed as `number | undefined`. Players generated by older code paths may lack it.
**How to avoid:** Always use `const age = player.age ?? 25;` as the fallback. Age 25 gives a factor of ~0.80 (adult but still improving), which is a safe default.
**Warning signs:** `NaN` in attribute values after training, or TypeScript `possibly undefined` errors.

### Pitfall 4: Drill Targets Non-Existent Attribute Keys
**What goes wrong:** `DRILL_ATTRIBUTE_MAP` references an attribute name (e.g. `'jumping'`, `'composure'`) that does not exist on `PlayerAttributes`. Results in `undefined` gain — silently does nothing.
**Why it happens:** `PlayerAttributes` has 20 keys; it's easy to confuse with `PersonalityVector` traits (composure, flair) or imagine keys that don't exist.
**How to avoid:** Type the map values as `Array<keyof PlayerAttributes>` — TypeScript will reject invalid keys at compile time. Verify: `composure` is on `PersonalityVector` not `PlayerAttributes`. `jumping` does not exist — use `aerial` and `heading`.
**Warning signs:** Attributes not changing after drill application. Compile error if typed correctly.

### Pitfall 5: Test Covers Personality Factor But Not Age Factor
**What goes wrong:** Tests verify that `work_rate = 1.0` gives more gain than `work_rate = 0.0`, but never test that a 34-year-old gains less than a 19-year-old from the same drill.
**Why it happens:** The age path is easy to forget when writing tests around the personality axis.
**How to avoid:** Success criterion 2 explicitly requires this comparison — write the test first, before implementation.
**Warning signs:** CI is green but criterion 2 is never verified.

---

## Code Examples

Verified patterns from codebase:

### Existing Immutable Attribute Transform (fatigue analog)
```typescript
// Source: src/simulation/ai/fatigue.ts — applyFatigueToAttributes
// This is the exact pattern to follow for applyDrillToPlayer
export function applyFatigueToAttributes(
  base: PlayerAttributes,
  fatigue: number
): PlayerAttributes {
  const physFactor = 1 - fatigue * ATTENUATION_FACTOR;
  return {
    pace: base.pace * physFactor,
    strength: base.strength * physFactor,
    // ... all 20 keys listed explicitly
  };
}
```

Training analog:
```typescript
// src/season/training.ts
function applyDrillToPlayer(player: PlayerState, drill: DrillType): PlayerState {
  const age = player.age ?? 25;
  const ageFactor = getAgeFactor(age);
  const trainingFactor = getTrainingFactor(player.personality);
  const targets = DRILL_ATTRIBUTE_MAP[drill];

  const attrs = { ...player.attributes };
  for (const attr of targets) {
    const current = attrs[attr];
    attrs[attr] = Math.min(1, current + BASE_DELTA * ageFactor * trainingFactor * (1 - current));
  }

  return { ...player, attributes: attrs as PlayerAttributes };
}
```

### Existing PersonalityVector Usage (training factor reference)
```typescript
// Source: src/simulation/ai/fatigue.ts — applyFatigueToPersonality
// work_rate is already used as the "effort" proxy trait in fatigue context
const workRateMod = 0.8 + workRate * 0.4;
// Training analog: trainingFactor = 0.6 + player.personality.work_rate * 0.8
// → low work_rate (0.0): factor = 0.60 (still trains, just less efficiently)
// → mid work_rate (0.5): factor = 1.00 (baseline)
// → high work_rate (1.0): factor = 1.40 (dedicated trainer)
```

### Headless Simulation Test Pattern
```typescript
// Source: src/season/quickSim.ts — pattern for headless iteration
// Training analog:
it('5-season sim: starting-below-0.70 player never exceeds 0.95', () => {
  const rng = seedrandom('train-economy-seed');
  let players = createAITeam('weak', 'test', 'Test', rng); // weak tier: base 0.45 + spread 0.20
  const drillTypes: DrillType[] = ['fitness', 'passing', 'shooting', 'defending', 'set_pieces', 'tactics', 'dribbling', 'aerial'];

  const SESSIONS_PER_SEASON = 38 * 3; // 3 training days per matchweek
  for (let season = 0; season < 5; season++) {
    for (let session = 0; session < SESSIONS_PER_SEASON; session++) {
      const drill = drillTypes[session % drillTypes.length]!;
      players = applyDrill(players, drill);
    }
  }

  for (const player of players) {
    // Only test players that started below 0.70 on all relevant attributes
    const maxAttr = Math.max(...Object.values(player.attributes));
    expect(maxAttr).toBeLessThanOrEqual(0.95);
  }
});
```

### TypeScript Const Pattern (project convention)
```typescript
// Source: src/simulation/types.ts — ActionType, MatchPhase, etc.
// All enum-like values use const object pattern for erasableSyntaxOnly compatibility
export const DrillType = {
  FITNESS: 'fitness',
  PASSING: 'passing',
  // ...
} as const;
export type DrillType = (typeof DrillType)[keyof typeof DrillType];
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded potential ceiling (e.g. FM-style 0-200 with capped potential) | Logistic growth: `gain × (1 - currentValue)` | Design decision (TRAIN-06) | Satisfies "no hidden ceiling" while achieving economy safety |
| Separate `potential` float on player | No potential field — age curve + personality trait does the work | State.md decision: "No hidden potential ceiling — growth driven by age curve + training personality trait" | Simpler type, no migration needed for existing saves |

**Deprecated/outdated:**
- `potential` field: The STATE.md note reads "Existing saves have no `potential` field on players — need derivation fallback." This suggests a `potential` field was considered and rejected. Phase 11 MUST NOT introduce a `potential` field — the design decision is against it.

---

## Open Questions

1. **`work_rate` as training proxy vs. new `training` trait**
   - What we know: `PersonalityVector` currently has 8 traits. `work_rate` semantically maps to training effort. Adding a 9th trait breaks all construction sites.
   - What's unclear: Whether the planner/user wants a semantically distinct `training` trait, or accepts `work_rate` as the proxy.
   - Recommendation: Use `work_rate` in Phase 11. If a distinct `training` trait is desired, scope it as a separate task with a migration checklist.

2. **Exact `BASE_DELTA` tuning constant**
   - What we know: Must be validated by headless sim. Economy constraint: no attribute from below 0.70 should exceed 0.95 after 5 seasons.
   - What's unclear: The right starting value (estimate: 0.003-0.005 per session).
   - Recommendation: Start at 0.004, run headless sim, adjust. This is the primary tuning task of the phase.

3. **Which attributes can training improve for each drill?**
   - What we know: The 20 `PlayerAttributes` keys are well-defined. Drill types align with TRAIN-03 (6-8 categories).
   - What's unclear: Whether GK-specific attributes (reflexes, handling, oneOnOnes, distribution) should only be trained for GKs, or for all squad members.
   - Recommendation: Apply drill gains to all squad members for all attributes (simpler, consistent). The role-specific attribute boosts in `teamGen.ts` already set GK specialists higher — they'll improve on the same curve.

4. **Session count per matchweek**
   - What we know: The headless sim must use realistic session counts. TRAIN-03 (Phase 12) defines the UI — "days until next match."
   - What's unclear: The exact training schedule — 38 matchweeks × ~3 days = ~114 sessions/season, or a higher count.
   - Recommendation: Use 38 × 3 = 114 sessions/season in the headless sim. Phase 12 will define the actual scheduler; Phase 11 only needs a realistic session count for the economic validation test.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `src/simulation/types.ts` — `PlayerAttributes` (20 keys), `PersonalityVector` (8 traits), `PlayerState` (age optional)
- Codebase: `src/simulation/ai/fatigue.ts` — Pure function pattern for attribute transformation; `work_rate` usage as effort proxy
- Codebase: `src/season/teamGen.ts` — `generatePersonality()` constructs all 8 PersonalityVector traits; age range 17-34; `TIER_CONFIGS` shows attribute base ranges (weak: 0.45 base)
- Codebase: `src/season/playerAnalysis.ts` — `ageCurveMultiplier()` exists but serves market value (NOT training) — peaks at age 29; training needs inverse curve
- Codebase: `src/season/quickSim.ts` — Headless simulation pattern for engine-driven testing
- STATE.md: "No hidden potential ceiling — growth driven by age curve + training personality trait (no potential float cap)"
- STATE.md: "[Phase 11 - CRITICAL]: Training economy balance must be verified headlessly before any UI is built"
- STATE.md: "[Phase 11 - WATCH]: Existing saves have no `potential` field on players — need derivation fallback"
- REQUIREMENTS.md: TRAIN-04, TRAIN-06 descriptions confirmed
- `vitest.config.ts`: Confirms `globals: true`, `environment: node` — headless sim tests are straightforward

### Secondary (MEDIUM confidence)

- Logistic growth / diminishing returns pattern for sports simulation — widely used approach; `(1 - current_value)` term is standard in game design for uncapped growth systems (Football Manager, etc. use similar mechanics)

### Tertiary (LOW confidence)

- Session count estimate (38 × 3 = 114/season) — derived from TRAIN-01/TRAIN-03 context ("days until next match," training scheduler). Phase 12 defines the actual schedule.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing tooling confirmed
- Architecture: HIGH — pure function pattern is identical to existing fatigue system; PlayerState types confirmed
- Pitfalls: HIGH — type breaking change identified from codebase scan; `age` optionality confirmed in types.ts; `potential` field explicitly rejected in STATE.md
- Tuning constants: MEDIUM — `BASE_DELTA` starting estimate needs headless sim validation

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain — math and types don't change)
