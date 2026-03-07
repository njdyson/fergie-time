# Phase 12: Training Scheduler - Research

**Researched:** 2026-03-07
**Domain:** Training scheduler UI on hub screen + attribute delta display on player profile screen
**Confidence:** HIGH (codebase patterns verified directly; all integration points confirmed)

---

## Summary

Phase 12 is a UI integration phase. The hard computation work is done — `applyDrill` in `src/season/training.ts` is the pure function that Phase 11 built and verified. Phase 12's job is to give the user control over when and how it runs, and to show the results afterward on the player profile.

The phase has two integration surfaces. First, the hub screen (`src/ui/screens/hubScreen.ts`) needs a training scheduler block inserted into its existing card layout. The scheduler must show how many days remain until the next match, render each day as a clickable drill-or-rest toggle, and provide a drill type selector. Second, the player profile screen (`src/ui/screens/playerProfileScreen.ts`) needs a training deltas panel that shows attribute changes from the last training block (e.g., "+0.02 Pace"). Both screens are class-based, DOM-driven, and follow a consistent dark-theme HTML-string rendering pattern already well established in the codebase.

The critical architectural decision is where training state lives. Training involves two new kinds of data: (1) the per-day training schedule (drill type or rest, per matchday gap) and (2) the post-block attribute deltas for each player. Both must survive save/load. The existing `SeasonState` in `src/season/season.ts` is the correct place to add these fields — it is already serialized via `server/serialize.ts` and persisted through `saveGame`. The serializer uses a Map-aware replacer/reviver and will handle new primitive/array/object fields automatically with no serializer changes needed. The migration concern is straightforward: deserializing old saves that lack the new fields will produce `undefined`, so defaults must be applied at read time (`trainingSchedule ?? {}` or equivalent).

**Primary recommendation:** Add `trainingSchedule` and `trainingDeltas` to `SeasonState`, integrate `applyDrill` into the matchday flow, render scheduler UI in `HubScreen.update()`, and add a deltas panel to `PlayerProfileScreen.render()`. No new libraries needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRAIN-01 | User can see a training scheduler on the hub showing days until the next match | Hub screen already knows the next fixture matchday from `state.fixtures`. Days until next match can be derived from `currentMatchday` and fixture matchday. Render scheduler as a new card inside the existing `HubScreen.update()` HTML grid. |
| TRAIN-02 | User can assign each day before the next match as either a drill or rest | Each pre-match day is a clickable toggle. State stored in a new `trainingSchedule` field on `SeasonState` (Map or record keyed by matchday gap slot). Hub screen emits callbacks; main.ts applies schedule and saves. |
| TRAIN-03 | User can select a squad-wide drill type for each training day from a menu of 6-8 drill categories, each showing which attributes it targets | 8 drill types already defined in `src/season/training.ts` as `DrillType` and `DRILL_ATTRIBUTE_MAP`. UI shows a `<select>` or button group per day with label + targeted attributes. Import directly from training.ts. |
| TRAIN-05 | User can see stat improvement deltas on the player profile after training | Player profile screen receives deltas as a new optional prop. Store deltas on `SeasonState` after training block runs. Profile screen renders a "Training Gains" panel showing `+0.02 Pace` style entries. |

</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (project) | ~5.9.3 | All new code | Already in project |
| Vitest | ^3.2.3 | Unit tests for training integration logic | Already configured, `npm test` works |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No new dependencies required |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending SeasonState | Separate localStorage key | SeasonState is already serialized and persisted — a separate key would require its own save/load path and could get out of sync |
| Per-day drill select dropdown | Button-group chip UI | Both work; select is simpler and matches mobile constraints better |

**Installation:**
```bash
# No new packages required
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── season/
│   ├── training.ts          # EXISTS (Phase 11) — applyDrill, DrillType, DRILL_ATTRIBUTE_MAP
│   ├── training.test.ts     # EXISTS (Phase 11) — extend with integration helpers if needed
│   └── season.ts            # MODIFY — add TrainingSchedule, TrainingDeltas types + SeasonState fields
├── ui/screens/
│   ├── hubScreen.ts         # MODIFY — add scheduler card with day-by-day UI
│   └── playerProfileScreen.ts  # MODIFY — add Training Gains deltas panel
└── main.ts                  # MODIFY — wire scheduler callbacks, apply training on kickoff
```

### Pattern 1: SeasonState Extension — Training Schedule

**What:** Add two new optional fields to `SeasonState`. Optional so old saves deserialize cleanly without migration.

**New types in `season.ts`:**
```typescript
/** Per-matchday training slot: the drill type assigned, or 'rest'. */
export type TrainingDayPlan = DrillType | 'rest';

/**
 * Training schedule for the block between two matchdays.
 * Key: day index within the block (0-based, 0 = first day after last match).
 * Value: 'rest' or a DrillType string.
 */
export type TrainingSchedule = Record<number, TrainingDayPlan>;

/**
 * Attribute deltas accumulated during the last completed training block.
 * Key: playerId. Value: partial record of attribute name → delta gained.
 * Cleared at the start of each new training block.
 */
export type TrainingDeltas = Map<string, Partial<Record<keyof PlayerAttributes, number>>>;
```

**On `SeasonState`:**
```typescript
export interface SeasonState {
  // ... existing fields ...
  trainingSchedule?: TrainingSchedule;   // current block plan — keyed by day slot
  trainingDeltas?: TrainingDeltas;       // last block's per-player attribute gains
}
```

**Why optional:** Existing saves lacking these fields deserialize with `undefined`. Hub screen and profile screen treat `undefined` as "no training planned yet" — safe default.

### Pattern 2: Deriving Days Until Next Match

**What:** The hub screen already finds `nextFixture` from `state.fixtures`. The number of training days before it is derived from the matchday gap.

**Approximation pattern (matches season model):**
```typescript
// In HubScreen.update() or a helper in season.ts
function getTrainingDaysUntilNextMatch(state: SeasonState): number {
  const nextFixture = state.fixtures.find(
    f => !f.result && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
  );
  if (!nextFixture) return 0;
  // Season uses 38 matchdays with ~7 days between each.
  // Treat each matchday gap as a fixed number of training slots (e.g. 3 days).
  // This is the same assumption used in the Phase 11 headless sim (38 × 3 = 114/season).
  return 3; // configurable constant — TRAINING_DAYS_PER_MATCHDAY
}
```

**Note:** The game does not have a real calendar — matchdays are abstract. "Days until next match" in TRAIN-01 means "training slots available before the next kick-off button press." A fixed 3 slots per matchday is consistent with how the economy was tuned in Phase 11.

**Alternative:** Show `Matchday X → Y` gap rather than days if a real day count feels misleading. The success criterion says "showing how many days remain until the next match" so a count like "3 training days until Matchday 15" satisfies it.

### Pattern 3: Scheduler Card in HubScreen

**What:** A new card below the existing cards in `HubScreen.update()`. Renders one row per training slot showing: day label, drill/rest toggle, and (if drill) a drill type selector.

**Implementation approach:**
```typescript
// Inside HubScreen.update() — append to the card grid
const schedule = state.trainingSchedule ?? {};
const TRAINING_DAYS = 3; // constant — matches Phase 11 economy assumption

let schedulerHtml = `<div style="${cardStyle}">`;
schedulerHtml += `<div style="${labelStyle}">Training Schedule — Next ${TRAINING_DAYS} Days</div>`;

for (let day = 0; day < TRAINING_DAYS; day++) {
  const plan = schedule[day] ?? 'rest';
  const isDrill = plan !== 'rest';
  // Render toggle + drill type selector per day
  schedulerHtml += renderTrainingDay(day, plan, isDrill);
}
schedulerHtml += `</div>`;
```

**Event wiring:** Hub screen exposes `onScheduleChange(cb)` callback. Main.ts handles it, updates `seasonState.trainingSchedule`, and calls `saveGame`.

### Pattern 4: Applying Training on Kickoff

**What:** When the user presses "Kick Off", training is applied for the current block before the match starts. The existing kickoff flow in `main.ts` calls `recordPlayerResult` → `simOneAIFixture` → `finalizeMatchday`. Training application inserts before `recordPlayerResult`.

**Integration point in main.ts:**
```typescript
// Existing kickoff handler (simplified):
hubScreenView.onKickoff(() => {
  // NEW: Apply training block before match
  const schedule = seasonState.trainingSchedule ?? {};
  const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
  const { updatedSquad, deltas } = applyTrainingBlock(playerTeam.squad, schedule);

  seasonState = {
    ...seasonState,
    teams: seasonState.teams.map(t =>
      t.isPlayerTeam ? { ...t, squad: updatedSquad } : t
    ),
    trainingDeltas: deltas,
    trainingSchedule: {},  // Reset for next block
  };
  // ... then proceed to match as before
});
```

**New helper `applyTrainingBlock` in `season/training.ts`:**
```typescript
/** Apply all scheduled drills for the training block. Returns updated squad and per-player deltas. */
export function applyTrainingBlock(
  players: PlayerState[],
  schedule: TrainingSchedule,
): { updatedSquad: PlayerState[]; deltas: TrainingDeltas } {
  const deltas: TrainingDeltas = new Map();
  let current = players;

  // Initialize delta tracking
  for (const player of players) {
    deltas.set(player.id, {});
  }

  for (const [_dayStr, plan] of Object.entries(schedule)) {
    if (plan === 'rest') continue;
    const drill = plan as DrillType;
    const before = current;
    current = applyDrill(current, drill);

    // Accumulate deltas
    for (let i = 0; i < current.length; i++) {
      const prev = before[i]!;
      const next = current[i]!;
      const playerDeltas = deltas.get(prev.id) ?? {};
      for (const attr of DRILL_ATTRIBUTE_MAP[drill]) {
        const gain = next.attributes[attr] - prev.attributes[attr];
        if (gain > 0) {
          playerDeltas[attr] = (playerDeltas[attr] ?? 0) + gain;
        }
      }
      deltas.set(prev.id, playerDeltas);
    }
  }

  return { updatedSquad: current, deltas };
}
```

### Pattern 5: Attribute Deltas Panel in PlayerProfileScreen

**What:** A new "Training Gains" panel at the bottom of the player profile, showing deltas from the last completed block. Only shown if deltas exist and are non-zero for this player.

**Signature change:** The `update()` method receives `trainingDeltas?: TrainingDeltas` as a new optional parameter, or the deltas are passed in via the existing update call from `main.ts`.

**Existing pattern to follow:**
```typescript
// In PlayerProfileScreen.render() — after the Season Stats panel:
if (trainingDeltas) {
  const playerDeltas = trainingDeltas.get(player.id);
  const nonZero = playerDeltas
    ? Object.entries(playerDeltas).filter(([, v]) => v > 0.0005)
    : [];

  if (nonZero.length > 0) {
    html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px; margin-bottom:20px;">`;
    html += `<div style="color:${GREEN}; font-size:12px; font-weight:bold; margin-bottom:12px; ...">Training Gains</div>`;
    html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px;">`;
    for (const [attr, delta] of nonZero) {
      html += `<div style="text-align:center; background:#0f172a; border-radius:6px; padding:8px;">
        <div style="color:${GREEN}; font-size:14px; font-weight:bold;">+${(delta * 100).toFixed(2)}</div>
        <div style="color:${TEXT}; font-size:10px;">${attr}</div>
      </div>`;
    }
    html += `</div></div>`;
  }
}
```

**Display format:** `+0.02` not `+2%` — stays consistent with the 0..1 attribute scale used everywhere else in the profile (all bars show 0..100 as integer percentage, so `+0.02` displayed as `+2` on the delta chip is also reasonable and avoids confusion with the bar values).

### Anti-Patterns to Avoid

- **Storing training state outside SeasonState:** Do not use `localStorage` directly or a module-level variable. `SeasonState` is the single source of truth; anything outside it is lost on save/load.
- **Mutating PlayerState in the scheduler:** The hub screen should only write to `seasonState.trainingSchedule` (the plan). The actual `applyDrill` calls happen at kickoff time only.
- **Applying training multiple times:** Guard against re-applying if the user closes and reopens the hub screen. The training block should be applied exactly once per kickoff. Resetting `trainingSchedule` to `{}` after application prevents re-application.
- **Showing deltas from a previous training block on the wrong screen visit:** `trainingDeltas` should be cleared at the start of each new training block (when kickoff is pressed again), not when the profile is viewed.
- **Hardcoding attribute display names:** The `DRILL_ATTRIBUTE_MAP` keys are camelCase (`oneOnOnes`, `stamina`). The profile screen already has a human-readable label mapping pattern (e.g., `extAttrs` array). Reuse that convention.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Training computation | Custom gain formula | `applyDrill` from `src/season/training.ts` | Already implemented, tested, and economy-verified in Phase 11 |
| Drill label display | Hardcoded label string per drill | Derive from `DrillType` const values + a label map | Single source of truth; changes to DrillType propagate automatically |
| State persistence | Custom serialization for training fields | Existing `serializeState` / `deserializeState` in `server/serialize.ts` | Already handles Maps and object fields; new fields serialize automatically |
| Attribute name display | Inline string formatting per attribute | Shared label lookup object (e.g., `ATTR_LABELS` record) | Keeps hub and profile consistent; avoids diverging naming |

**Key insight:** Phase 11 did all the hard math work. Phase 12 is a wiring and UI phase. The risk is in state management (where does the schedule live? when is training applied?) not in computation.

---

## Common Pitfalls

### Pitfall 1: Training Applied More Than Once Per Matchday
**What goes wrong:** User visits hub screen, training is applied. User navigates away and back. Training is applied again. Players gain double attributes for the same matchday.
**Why it happens:** If training is applied in `HubScreen.update()` or on every render rather than on kickoff, it runs repeatedly.
**How to avoid:** Apply training ONLY in the kickoff handler, not in any render path. Reset `trainingSchedule` to `{}` immediately after application.
**Warning signs:** Players gain attributes without pressing Kick Off.

### Pitfall 2: TrainingDeltas Lost on Save/Load Because Map Not Serialized
**What goes wrong:** User completes a training block, sees deltas on player profile. Saves and reloads. Deltas are gone.
**Why it happens:** `SeasonState.trainingDeltas` is a `Map<string, ...>`. The serializer in `server/serialize.ts` uses `mapReplacer`/`mapReviver` which handle `Map` instances correctly — but only if `trainingDeltas` is an actual `Map`, not a plain object.
**How to avoid:** Declare `TrainingDeltas` as `Map<string, ...>` (not a plain object) and ensure `createSeason`/`startNewSeason` initialize it as `new Map()` or `undefined`. The existing Map serialization will handle it.
**Warning signs:** Deltas display after training but disappear after page reload.

### Pitfall 3: Old Saves Missing trainingSchedule/trainingDeltas Fields
**What goes wrong:** Existing saved games load without the new fields. `state.trainingSchedule` is `undefined`. Code that does `Object.entries(state.trainingSchedule)` throws.
**Why it happens:** SeasonState is serialized as JSON; new fields don't exist in old saves.
**How to avoid:** Mark both fields as optional (`trainingSchedule?: TrainingSchedule`). Use nullish coalescing everywhere: `state.trainingSchedule ?? {}`. Never assume the fields exist.
**Warning signs:** TypeError on load for existing saves.

### Pitfall 4: Drill Type Label Mismatch Between Hub and Profile
**What goes wrong:** Hub shows "Set Pieces" as a drill option; profile delta shows "set_pieces". User confused by inconsistency.
**Why it happens:** `DrillType` values are snake_case strings. Without a shared label map, each screen formats them independently.
**How to avoid:** Define a `DRILL_LABELS: Record<DrillType, string>` object in `training.ts` (or a shared UI helper). Both hub scheduler and profile deltas import from it.
**Warning signs:** Different capitalization or formatting in different parts of the UI.

### Pitfall 5: Training Days Count Mismatch with Economy Tuning
**What goes wrong:** Phase 11 tuned `BASE_DELTA=0.004` assuming 3 training sessions per matchday. If Phase 12 allows more sessions (e.g., 5 days), the economy assumptions break and players over-grow.
**Why it happens:** The training scheduler could allow any number of days. TRAIN-01 says "days remaining until next match" — if interpreted broadly, a manager could assign 7+ days of drills.
**How to avoid:** Fix `TRAINING_DAYS_PER_MATCHDAY = 3` as a constant in both the hub scheduler and the economy tuning comment in `training.ts`. Document that changing this constant requires re-running the headless sim and potentially re-tuning `BASE_DELTA`.
**Warning signs:** Players exceed attribute 0.95 thresholds that the Phase 11 headless sim verified.

### Pitfall 6: PlayerProfileScreen Signature Change Breaking main.ts
**What goes wrong:** Adding a new parameter to `PlayerProfileScreen.update()` breaks the existing call site in `main.ts` where the profile is rendered.
**Why it happens:** TypeScript will flag it at compile time, but if using optional parameter it might silently not show deltas.
**How to avoid:** Use an optional parameter or update the call site in `main.ts` simultaneously. Pass `seasonState.trainingDeltas` from the main.ts profile rendering block (which already has access to `seasonState`).
**Warning signs:** TypeScript compiler error, or deltas panel never appears.

---

## Code Examples

Verified patterns from codebase:

### HubScreen Card Pattern (existing style to follow)
```typescript
// Source: src/ui/screens/hubScreen.ts — existing card rendering
const cardStyle = `background: linear-gradient(135deg, ${PANEL_BG} 0%, #151d2e 100%);
  border-radius: 12px; padding: 20px 24px;
  border: 1px solid rgba(255,255,255,0.05);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);`;
const labelStyle = `color: ${TEXT}; font-size: 11px; text-transform: uppercase;
  letter-spacing: 1.5px; margin-bottom: 10px; font-weight: 600;`;

// Training scheduler card (new):
html += `<div style="${cardStyle}">
  <div style="${labelStyle}">Training — 3 Days Until Matchday ${nextFixture.matchday}</div>
  <!-- day rows here -->
</div>`;
```

### HubScreen Callback Pattern (existing style)
```typescript
// Source: src/ui/screens/hubScreen.ts — onKickoff pattern
onKickoff(cb: () => void): void {
  this.kickoffCallbacks.push(cb);
}

// Training analog:
onScheduleChange(cb: (schedule: TrainingSchedule) => void): void {
  this.scheduleChangeCallbacks.push(cb);
}
```

### SeasonState Extension Pattern (how other optional fields are added)
```typescript
// Source: src/season/season.ts — squadSelectionMap optional field
squadSelectionMap?: Map<string, SquadSlot>;  // existing pattern

// Training analog:
trainingSchedule?: TrainingSchedule;   // plan: slot → DrillType | 'rest'
trainingDeltas?: TrainingDeltas;       // last block results: playerId → attr deltas
```

### PlayerProfileScreen Panel Pattern (existing style)
```typescript
// Source: src/ui/screens/playerProfileScreen.ts — Season Stats panel structure
html += `<div style="background:${PANEL_BG}; border-radius:8px; padding:14px; margin-bottom:20px;">`;
html += `<div style="color:${GREEN}; font-size:12px; font-weight:bold; margin-bottom:12px;
  text-transform:uppercase; letter-spacing:0.05em;">Season ${seasonNumber} Stats</div>`;
// ... content ...
html += `</div>`;
```

### TrainingDeltas Map (serialization-safe)
```typescript
// Maps serialize correctly via existing server/serialize.ts mapReplacer/mapReviver.
// Use Map<string, Partial<Record<keyof PlayerAttributes, number>>> — confirmed safe.
// Plain objects also serialize safely. Map preferred for O(1) lookup by playerId.

// Initialize in createSeason:
return {
  // ... existing fields ...
  trainingSchedule: undefined,   // no schedule until user sets one
  trainingDeltas: undefined,     // no deltas until first training block
};
```

---

## Integration Map: What Touches What

| File | Change | Scope |
|------|--------|-------|
| `src/season/training.ts` | Add `applyTrainingBlock()`, `DRILL_LABELS` | New exported functions |
| `src/season/season.ts` | Add `TrainingSchedule`, `TrainingDayPlan`, `TrainingDeltas` types; add optional fields to `SeasonState` | Type additions + optional fields |
| `src/ui/screens/hubScreen.ts` | Add scheduler card; expose `onScheduleChange` callback | New UI section |
| `src/ui/screens/playerProfileScreen.ts` | Add optional `trainingDeltas` param to `update()`; render Training Gains panel | New UI section |
| `src/main.ts` | Wire `onScheduleChange`; apply `applyTrainingBlock` on kickoff; pass `trainingDeltas` to profile screen | Callback wiring |
| `server/serialize.ts` | No changes needed | N/A — Map serialization already works |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Training computation not yet integrated | `applyDrill` pure function available (Phase 11) | 2026-03-07 | Phase 12 is purely integration — no computation to build |
| No training state in SeasonState | Add `trainingSchedule` and `trainingDeltas` as optional fields | Phase 12 | Requires save format to gain two new optional fields; old saves remain compatible |

**Deprecated/outdated:**
- None. Phase 11 made no UI or state decisions that Phase 12 must reverse.

---

## Open Questions

1. **Exact "days until next match" semantics**
   - What we know: The game uses abstract matchdays, not a real calendar. Phase 11 headless sim assumes 3 sessions per matchday gap.
   - What's unclear: Should the hub say "3 training days" (fixed) or "Matchday 14 → 15: 3 days"? Both satisfy TRAIN-01.
   - Recommendation: Show "3 training days before Matchday X" — honest about the abstraction, satisfies the requirement.

2. **Drill type selector UX — dropdown vs button chips**
   - What we know: Each training day needs a drill type selection. Dropdown (`<select>`) is simpler. Button chips look better.
   - What's unclear: Whether the attribute targets should be visible inline or in a tooltip.
   - Recommendation: Use `<select>` with option text like "Fitness (Pace, Stamina, Strength...)" — simple, accessible, no tooltip complexity needed.

3. **When to clear trainingDeltas**
   - What we know: Deltas from block N should show until the user presses Kick Off for match N+1.
   - What's unclear: Should deltas persist across multiple matchdays (accumulate) or reset each kickoff?
   - Recommendation: Clear (overwrite) `trainingDeltas` at each kickoff after applying the new block. Profile shows deltas from the most recent completed block only.

4. **Training gains display format — absolute vs percentage**
   - What we know: Attributes are 0..1. The profile bars show `Math.round(value * 100)` as a 0-100 integer. TRAIN-05 says `+0.02 Pace` as an example.
   - What's unclear: Whether to show `+0.02` or `+2` (the same value on the profile bar scale).
   - Recommendation: Show `+X` where X is the bar-scale delta (e.g., `+2` means the bar moved from 64 to 66). This matches what the user sees on the profile bar and is more intuitive than the raw 0-1 value.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `src/season/training.ts` — DrillType, DRILL_ATTRIBUTE_MAP, applyDrill, ALL_DRILL_TYPES; confirmed exports from Phase 11
- Codebase: `src/ui/screens/hubScreen.ts` — Class structure, card pattern, callback pattern, color palette; all directly read
- Codebase: `src/ui/screens/playerProfileScreen.ts` — Class structure, renderBar, update() signature, panel HTML patterns; all directly read
- Codebase: `src/season/season.ts` — SeasonState interface, optional field pattern (`squadSelectionMap?`), createSeason/startNewSeason functions; all directly read
- Codebase: `server/serialize.ts` — Map serialization via mapReplacer/mapReviver; confirmed handles Map fields automatically
- Codebase: `src/main.ts` — Screen routing, kickoff handler location, updateCurrentScreen(), profile rendering with SeasonState access; confirmed integration points
- STATE.md: "Training scheduler on hub page only, showing days until next match (not in season calendar)" — locked design decision
- STATE.md: "Each training day is squad-wide drill or rest — no per-player assignment" — locked design decision
- REQUIREMENTS.md: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-05 descriptions confirmed

### Secondary (MEDIUM confidence)

- Phase 11 headless sim: 3 training sessions per matchday gap, `BASE_DELTA=0.004` — established assumption for economy balance; Phase 12 must not change session count without re-tuning

### Tertiary (LOW confidence)

- UX convention for delta display format (`+2` vs `+0.02`) — no authoritative source; derived from existing profile bar convention

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all integration points confirmed by direct code reads
- Architecture: HIGH — SeasonState extension pattern confirmed; serializer Map support confirmed; HubScreen and PlayerProfileScreen patterns confirmed
- State integration: HIGH — kickoff handler location in main.ts confirmed; profile rendering block confirmed
- Pitfalls: HIGH — Map serialization pitfall confirmed by serialize.ts read; old-save migration pattern confirmed by existing optional field usage (`squadSelectionMap?`)
- UX/display format: MEDIUM — display format is a design choice, not a technical constraint

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable codebase — no external dependencies)
