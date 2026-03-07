# Architecture Patterns

**Domain:** v1.2 Player Development — pixel art portraits, drill scheduling, training ground sandbox
**Researched:** 2026-03-07
**Confidence:** HIGH — working codebase thoroughly analysed, all integration points identified from source

---

## Existing Architecture (v1.1 baseline)

Understanding what exists is prerequisite to knowing what to add.

```
[Browser]
  main.ts (~1200+ lines, monolithic coordinator)
    |-- SimulationEngine (30 ticks/sec, 22 agents, headless-capable)
    |-- CanvasRenderer (60fps, pitch + players + ball)
    |-- GameLoop (accumulator-based fixed timestep)
    |-- SeasonState (module-level variable, the single source of truth)
    |-- UI Screens: Hub, Squad, Fixtures, Table, Stats, Login,
    |               PlayerProfile, Transfer, Inbox
    |-- Auto-saves to backend after matchday complete

[Express + SQLite backend (VPS)]
  /api/auth/*     -- session auth (cookie, not JWT)
  /api/games/*    -- save/load blob (SeasonState as JSON)
  /api/health
  Single `saves` table with game_state TEXT column (~50-80KB JSON blob)

[SeasonState shape — the critical data structure]
  SeasonState {
    seasonNumber, playerTeamId, seed
    teams: SeasonTeam[]          -- 20 teams, each with squad: PlayerState[25]
    fixtures: Fixture[]          -- 38 matchdays x 10 fixtures
    table: TeamRecord[]
    currentMatchday: number
    fatigueMap: Map<playerId, 0..1>
    squadSelectionMap: Map<playerId, SquadSlot>
    playerSeasonStats: Map<playerId, PlayerSeasonStats>
    transferMarket: TransferMarketState
    inbox: InboxState
  }

[PlayerState — immutable per simulation tick]
  id, teamId, position, velocity
  attributes: PlayerAttributes   -- 20 floats (pace, shooting, etc.)
  personality: PersonalityVector -- 8 floats (directness, composure, etc.)
  fatigue: 0..1
  role, duty, formationAnchor
  name?, age?, height?, shirtNumber?, nationality?, yellowCards?
```

Key constraint: `PlayerState` is **readonly** (simulation immutable). Season-level mutations happen via `SeasonState` updates, not in-place PlayerState mutation.

---

## New Feature Integration Points

### Feature 1: Pixel Art Player Portraits

**What it is:** A procedurally generated pixel art portrait per player, seeded from player ID + nationality + physical attributes. Generated once, cached, rendered in UI screens. No external API. No runtime generation during simulation.

**Where it touches existing code:**

| Touch Point | What Changes | Type |
|-------------|-------------|------|
| `PlayerState` | Add optional `portraitSeed?: string` field | Extend existing type |
| `PlayerProfileScreen` | Replace initials placeholder with portrait canvas | Modify existing |
| `SquadScreen` | Add small portrait thumbnail per row | Modify existing |
| `TransferScreen` | Add portrait thumbnail to player cards | Modify existing |
| `SeasonState` serialization | `portraitSeed` is a plain string, serializes trivially | No change needed |

**New component:** `src/ui/portrait/portraitGen.ts`

Responsible for:
- Generating an OffscreenCanvas (or regular Canvas) from a seed string
- Deterministic pixel art: skin tone layer, hair layer, shirt color layer, eyes
- Nationality maps to skin tone range; player ID seed determines hair/eyes/features
- Returns ImageBitmap or canvas for rendering elsewhere

**What does NOT change:**
- `SimulationEngine` — portraits are UI-only, invisible to simulation
- `SeasonState` structure — `portraitSeed` lives on `PlayerState`, which is already serialized
- Backend — no new endpoints, no database changes
- `quickSim` — headless simulation never touches portraits

**Data flow:**
```
PlayerState.id + PlayerState.nationality + PlayerState.shirtNumber
    -> portraitGen.generateSeed(player)   -> deterministic string
    -> portraitGen.render(seed, size)     -> OffscreenCanvas
    -> drawn into PlayerProfileScreen / SquadScreen via ctx.drawImage()
```

**Caching strategy:** Generate on demand, cache in a `Map<playerId, ImageBitmap>` module-level in `portraitGen.ts`. Portraits survive for a session. On page reload they regenerate (deterministic, so identical output). No backend persistence needed.

---

### Feature 2: Drill Scheduling

**What it is:** Between matchdays, training days pass (~3 per week). Each training day the manager picks one squad-wide drill. Drills improve player attributes based on `drill_type × talent × age`. Personality vector gets slight bounded nudges.

**Where it touches existing code:**

| Touch Point | What Changes | Type |
|-------------|-------------|------|
| `SeasonState` | Add `trainingState: TrainingState` field | Extend existing type |
| `season.ts: finalizeMatchday()` | Call `applyTrainingWeek()` before advancing matchday | Modify existing function |
| `PlayerState` | Attributes are `readonly` in the type — mutation happens at season level by rebuilding PlayerState objects | Pattern already used |
| `serialize.ts` | `TrainingState` serializes as plain JSON (no Maps) | Verify, likely no change |
| `main.ts` | Add `TrainingScreen` navigation + drill selection flow | Modify existing |
| `HubScreen` | Show "Training Day" button between matchdays | Modify existing |

**New components:**

`src/season/training.ts` — Core training logic (pure functions, no I/O):
```typescript
interface DrillType {
  id: string;                        // 'fitness', 'passing', 'shooting', etc.
  label: string;
  attributeTargets: (keyof PlayerAttributes)[];  // which attrs improve
  personalityNudge?: Partial<PersonalityVector>; // small shifts
}

interface TrainingDay {
  matchday: number;                  // which matchday week this belongs to
  drillId: string;                   // which drill was run
  completedAt: number;               // day number within the week
}

interface TrainingState {
  trainingDaysThisWeek: number;      // 0..3, resets each matchday
  history: TrainingDay[];            // log of past drills
  pendingDrill: string | null;       // drill chosen, not yet applied
}

// Pure function: apply one drill session to a player squad
function applyDrill(
  squad: PlayerState[],
  drill: DrillType,
  matchday: number,
  seed: string,
): PlayerState[]
```

`src/ui/screens/trainingScreen.ts` — Drill picker UI:
- List of available drills with descriptions
- "Run Drill" button
- Progress indicator (X of 3 training days used this week)

**Training day timing model:**

The simplest model that works: training days happen between matchdays. After the player's match resolves (before calling `finalizeMatchday()`), the hub shows a "Training" button that can be clicked up to 3 times. Each click opens `TrainingScreen`, player picks a drill, it applies, and the day is consumed. `finalizeMatchday()` resets the counter.

This avoids introducing a separate calendar/time system. Training is gated by matchdays, not real calendar days.

**Attribute improvement formula:**

```typescript
function attributeGain(
  currentValue: number,
  talentMultiplier: number,  // derived from player's peak potential (hidden stat or approximation)
  age: number,
  drillEfficiency: number,   // 0..1, drill-specific
): number {
  const ageFactor = age <= 23 ? 1.0 : Math.max(0.2, 1.0 - (age - 23) * 0.05);
  const headroom = 1.0 - currentValue;              // less gain as you approach ceiling
  const gain = drillEfficiency * talentMultiplier * ageFactor * headroom * 0.01;
  return Math.min(currentValue + gain, 1.0);
}
```

**Personality nudge (bounded):**
```typescript
function nudgePersonality(
  personality: PersonalityVector,
  drill: DrillType,
  strength: number = 0.002,  // very small per session
): PersonalityVector {
  // clamp each trait to [0.1, 0.9] — traits cannot be trained to extremes
}
```

**SeasonState integration:**

```typescript
// Extended SeasonState — add one field
interface SeasonState {
  // ... existing fields ...
  trainingState: TrainingState;   // NEW
}

// finalizeMatchday() extension
function finalizeMatchday(state: SeasonState): SeasonState {
  // ... existing fatigue recovery, transfers ...
  const updated = { ...state, trainingState: resetTrainingWeek(state.trainingState) };
  return { ...updated, currentMatchday: updated.currentMatchday + 1 };
}
```

**What does NOT change:**
- `SimulationEngine` — training stat changes are persistent season-level changes, not tick-level
- The simulation receives updated `PlayerState[]` at match kickoff (already how it works)
- `quickSim` — AI teams do not use the training system (they get static squads regenerated each season)
- Backend schema — `TrainingState` serializes into the existing `game_state` JSON blob, no new tables

---

### Feature 3: Training Ground Sandbox

**What it is:** A free-play mode where the manager sets up custom scenarios (teams, formations, maybe specific player builds) and watches the simulation engine run them. No stat changes. Observation only. Essentially a "match viewer" with configurable inputs.

**Where it touches existing code:**

| Touch Point | What Changes | Type |
|-------------|-------------|------|
| `SimulationEngine` | Zero changes — sandbox runs the existing engine | None |
| `CanvasRenderer` | Zero changes — same renderer | None |
| `GameLoop` | Reused as-is — sandbox uses the same loop | None |
| `main.ts` | Add sandbox entry point + new screen navigation | Modify existing |
| `HubScreen` | Add "Training Ground" navigation link | Modify existing |
| `quickSim.ts` | Conceptual model reused — sandbox is an interactive quickSim | Reference pattern |

**New component:** `src/ui/screens/sandboxScreen.ts`

The sandbox screen is a configuration UI that:
1. Lets the manager configure two teams (select from existing squads, or use custom builds)
2. Sets formation for each team
3. Shows a "Run Simulation" button
4. Kicks off a match using the existing engine + renderer — but in "sandbox mode" where `finalizeMatchday` is NOT called, so no persistent state changes occur

**Architecture pattern — sandbox vs live match:**

The existing live match flow in `main.ts`:
```
kickoff() -> SimulationEngine(config) -> GameLoop -> CanvasRenderer
          -> on FULL_TIME: recordPlayerResult() -> simOneAIFixture() -> finalizeMatchday()
```

The sandbox flow:
```
sandboxKickoff(config) -> SimulationEngine(config) -> GameLoop -> CanvasRenderer
                       -> on FULL_TIME: show results, NO season state mutation
```

The key difference is what happens at FULL_TIME. The simulation, game loop, and renderer are identical. Only the post-match callback differs.

**Implementation pattern:**

```typescript
// In main.ts — new sandbox mode flag
let isSandboxMode = false;

// Existing full-time handler (simplified):
function onFullTime(snap: SimSnapshot): void {
  if (isSandboxMode) {
    showSandboxResultsOverlay(snap);   // show score, no season mutations
    return;
  }
  // ... existing recordPlayerResult etc.
}
```

This is the minimum-viable integration: one boolean flag and one branch at FULL_TIME.

**Sandbox configuration state:**

No persistence needed. Sandbox config is ephemeral — the manager sets it up, watches the match, and it's gone. No changes to `SeasonState`, `serialize.ts`, or the backend.

**Scenario builder — what the UI exposes:**

| Control | Source | Notes |
|---------|--------|-------|
| Team A squad | Select from `season.teams` | Player team or any AI team |
| Team B squad | Select from `season.teams` | Or randomly generated scratch team |
| Formation A | Existing `FormationId` picker | Reuse TacticsBoard |
| Formation B | Existing `FormationId` picker | |
| Match seed | Random or custom string | For reproducibility |
| Speed | 1x / 2x / 4x | Existing speed controls |

A minimal MVP exposes just Team A / Team B selection and formation. The scenario builder can grow later.

---

## System Overview — v1.2 Components Added

```
[Browser — existing + new]
  main.ts
    |-- [EXISTING] SimulationEngine, CanvasRenderer, GameLoop
    |-- [EXISTING] SeasonState (now includes trainingState field)
    |-- [EXISTING] UI: Hub, Squad, Fixtures, Table, Stats, Profile, Transfer, Inbox
    |-- [NEW] TrainingScreen     -- drill picker, week progress display
    |-- [NEW] SandboxScreen      -- scenario config, launches sandbox match
    |-- [NEW] portraitGen.ts     -- deterministic pixel art generation + session cache
    |-- [MODIFIED] PlayerProfileScreen -- renders portrait instead of initials
    |-- [MODIFIED] SquadScreen         -- thumbnail portrait per row
    |-- [MODIFIED] HubScreen           -- "Training" + "Training Ground" nav buttons
    |-- [MODIFIED] finalizeMatchday()  -- resets training state
    |-- [MODIFIED] PlayerState type    -- add portraitSeed field

  src/season/training.ts         [NEW]
    |-- DrillType definitions
    |-- applyDrill() pure function
    |-- nudgePersonality() bounded nudge
    |-- resetTrainingWeek()
    |-- TrainingState interface

  src/ui/portrait/portraitGen.ts [NEW]
    |-- generatePortraitSeed(player: PlayerState): string
    |-- render(seed: string, size: number): OffscreenCanvas
    |-- portrait cache: Map<playerId, ImageBitmap>

  src/ui/screens/trainingScreen.ts [NEW]
    |-- Drill picker UI
    |-- Training day counter
    |-- Calls training.ts, updates SeasonState

  src/ui/screens/sandboxScreen.ts [NEW]
    |-- Team/formation config UI
    |-- Triggers sandbox match (isSandboxMode = true)
    |-- Result overlay on FULL_TIME (no season mutations)

[Express + SQLite backend — NO CHANGES]
  All new features serialize into the existing game_state blob.
  No new endpoints. No schema changes.
  TrainingState is plain JSON (no Maps), serializes trivially.
  Portrait seeds are strings, survive JSON round-trip.
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `portraitGen.ts` | Generate deterministic pixel art from seed | UI screens (SquadScreen, PlayerProfileScreen, TransferScreen) |
| `training.ts` | Pure training logic — drill application, personality nudges | `season.ts: finalizeMatchday()`, `trainingScreen.ts` |
| `trainingScreen.ts` | Training week UI, drill selection | `training.ts`, `SeasonState` via main.ts callbacks |
| `sandboxScreen.ts` | Sandbox scenario config UI | `main.ts` (triggers match via existing engine) |
| `main.ts` (modified) | Add sandbox mode flag, training nav, sandbox FULL_TIME handler | All new + existing components |
| `SimulationEngine` | Match simulation — UNCHANGED | Sandbox and live match use identically |

---

## Data Flow Changes

### Portrait Generation Flow

```
SquadScreen / PlayerProfileScreen needs portrait
    -> portraitGen.getPortrait(player.id)
    -> if cached: return ImageBitmap from Map
    -> if not: generateSeed(player) -> deterministic string from id+nationality+shirtNumber
            -> render(seed, size)  -> draw pixel art layers to OffscreenCanvas
            -> createImageBitmap() -> store in cache Map
    -> draw to screen via ctx.drawImage(portrait, x, y)
```

### Training Day Flow

```
[After matchday, before finalizeMatchday]
Manager clicks "Training" (up to 3 times)
    -> TrainingScreen opens
    -> Manager selects DrillType
    -> "Run Drill" clicked
    -> training.applyDrill(playerTeam.squad, drill, matchday, seed)
         -> rebuilds PlayerState[] with updated attribute values
    -> training.nudgePersonality(squad, drill)
         -> rebuilds PlayerState[] with bounded personality shifts
    -> SeasonState.teams[playerTeamIndex].squad updated via main.ts
    -> TrainingState.trainingDaysThisWeek incremented
    -> SeasonState auto-saved (existing auto-save hook)

Manager clicks "Play Match" (or 3 training days used)
    -> finalizeMatchday() called
    -> TrainingState.trainingDaysThisWeek reset to 0
    -> matchday advances
```

### Sandbox Match Flow

```
Manager clicks "Training Ground" in Hub
    -> SandboxScreen opens
    -> Manager configures Team A, Team B, formations
    -> "Run Simulation" clicked
        -> isSandboxMode = true
        -> Build MatchConfig from sandbox config (same shape as live match)
        -> new SimulationEngine(matchConfig)
        -> startGameLoop(engine, renderer) -- identical to live match
        -> Canvas shows sandbox match at normal speed
    -> FULL_TIME event fires
        -> isSandboxMode check: true
        -> showSandboxResultsOverlay(snap)  -- score, stats, no season state write
        -> isSandboxMode = false
        -> Return to SandboxScreen (or Hub)
```

### Modified SeasonState Serialization Flow

```
SeasonState now includes trainingState: TrainingState
  TrainingState {
    trainingDaysThisWeek: number,     // 0..3
    history: TrainingDay[],           // array of plain objects
    pendingDrill: string | null
  }
  -> No Maps in TrainingState -> no serialize.ts changes needed
  -> Existing mapReplacer/mapReviver handles SeasonState.fatigueMap etc.
  -> Blob size increase: minimal (~1-2KB for history array)
```

---

## New vs Modified Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/ui/portrait/portraitGen.ts` | Deterministic pixel art generator + session cache |
| `src/season/training.ts` | Pure training logic — drills, attribute gain, personality nudge |
| `src/ui/screens/trainingScreen.ts` | Training week UI — drill picker, day counter |
| `src/ui/screens/sandboxScreen.ts` | Sandbox config UI — team/formation picker |

### Modified Files

| File | Change | Scale |
|------|--------|-------|
| `src/simulation/types.ts` | Add `portraitSeed?: string` to `PlayerState` | 1 line |
| `src/season/season.ts` | Add `trainingState: TrainingState` to `SeasonState`, extend `createSeason()` and `finalizeMatchday()` | ~30 lines |
| `src/ui/screens/playerProfileScreen.ts` | Replace initials avatar with `portraitGen` output | ~20 lines |
| `src/ui/screens/squadScreen.ts` | Add portrait thumbnail to player row | ~15 lines |
| `src/ui/screens/hubScreen.ts` | Add "Training" + "Training Ground" nav buttons | ~20 lines |
| `src/main.ts` | Add `isSandboxMode` flag, sandbox FULL_TIME handler, new screen routing | ~60 lines |

### Unchanged Files

| Component | Why Unchanged |
|-----------|--------------|
| `src/simulation/engine.ts` | Portraits and training are season-level, invisible to tick simulation |
| `src/season/quickSim.ts` | AI matches don't use training; sandbox uses engine directly |
| `server/` (all files) | All new data fits in existing JSON blob, no new endpoints needed |
| `server/db.ts` | No schema changes |
| `src/api/client.ts` | No new API calls |
| `src/loop/gameLoop.ts` | Sandbox reuses existing game loop |
| `src/renderer/canvas.ts` | Portraits are UI-only, not rendered on the pitch canvas |

---

## Suggested Build Order

Dependencies determine order. Each step is independently testable.

### Step 1: Pixel Art Portrait Generator

**Why first:** Self-contained, no dependencies on other new features. Provides immediate visible value. Can be tested in isolation by rendering portraits to a debug page.

**What to build:**
- `src/ui/portrait/portraitGen.ts` — pure rendering function
- Deterministic seeding: `hash(player.id + nationality + shirtNumber)`
- Layered pixel art: base face shape, skin tone (nationality-derived), hair (seeded), shirt color (team color passed in), eyes
- Test by rendering 25 portraits for a squad, verify determinism (same seed = same output)

**Integration:** Wire into `PlayerProfileScreen` first (one portrait, large). Then `SquadScreen` thumbnails.

**Risk:** Canvas API pixel manipulation is straightforward. Main risk is visual quality — iterate on the art generation algorithm. No architectural risk.

---

### Step 2: Training State + Drill Logic (no UI yet)

**Why second:** Pure logic, easy to unit test before building UI.

**What to build:**
- `src/season/training.ts` — `DrillType` definitions, `applyDrill()`, `nudgePersonality()`, `resetTrainingWeek()`
- Extend `SeasonState` with `trainingState`
- Extend `createSeason()` to initialise `trainingState`
- Extend `finalizeMatchday()` to reset training week counter
- Unit tests: apply drill → verify attributes increased, verify personality nudge bounded, verify reset

**No UI yet.** Training logic works independently and is verified by tests.

**Risk:** Attribute gain tuning will need iteration. The formula is correct architecturally; the numeric constants need playtesting. This is expected — build first, tune later.

---

### Step 3: Training Screen UI

**Why third:** Depends on Step 2 training logic existing.

**What to build:**
- `src/ui/screens/trainingScreen.ts` — drill list, day counter, "Run Drill" button
- Wire into `main.ts`: add TrainingScreen, add navigation from HubScreen
- Update `HubScreen` to show training day count and "Training" button (only shown between matchdays)

**Integration test:** Pick 3 drills in a week, verify attributes change, verify counter resets after matchday.

---

### Step 4: Sandbox Screen + Mode

**Why fourth:** Last because it's self-contained relative to the training feature, and sandbox mode only requires adding a flag to `main.ts` and a configuration UI.

**What to build:**
- `src/ui/screens/sandboxScreen.ts` — team/formation picker
- Add `isSandboxMode` flag to `main.ts`
- Add sandbox FULL_TIME handler (show results overlay, no season mutations)
- Add "Training Ground" button to HubScreen

**Integration test:** Run sandbox match, verify league table not changed, verify player stats not changed, verify portraits appear in team displays.

---

## Patterns to Follow

### Pattern 1: Immutable PlayerState Rebuilt at Season Level

**What:** `PlayerState` is readonly in the simulation type. Training attribute changes are applied by rebuilding the entire `PlayerState` object, not mutating it in place.

**When to use:** Whenever training modifies player attributes.

**Example:**
```typescript
// training.ts
function applyDrillToPlayer(player: PlayerState, gain: Partial<PlayerAttributes>): PlayerState {
  return {
    ...player,
    attributes: {
      ...player.attributes,
      ...Object.fromEntries(
        Object.entries(gain).map(([k, v]) => [k, Math.min(1, player.attributes[k as keyof PlayerAttributes] + v)])
      ),
    },
  };
}
```

This is consistent with how the rest of the codebase handles PlayerState (transfer market, fatigue application).

---

### Pattern 2: Deterministic Seeding for Portrait Generation

**What:** All visual randomness in portrait generation flows from a deterministic seed derived from stable player data. Same player always gets same portrait.

**When to use:** Portrait generation and any future procedural visual content.

**Example:**
```typescript
// portraitGen.ts
function generatePortraitSeed(player: PlayerState): string {
  // Stable fields: id never changes, nationality never changes, shirtNumber rarely changes
  return `portrait:${player.id}:${player.nationality ?? 'XX'}:${player.shirtNumber ?? 0}`;
}

function seededRng(seed: string): () => number {
  // Use seedrandom (already a project dependency)
  return seedrandom(seed);
}
```

---

### Pattern 3: Sandbox Mode as a Post-Match Callback Switch

**What:** Sandbox mode is implemented by changing what happens at FULL_TIME, not by building a separate rendering or simulation pipeline.

**When to use:** The sandbox match itself. Do not build a parallel game loop or renderer.

**Example:**
```typescript
// main.ts — minimal sandbox integration
let isSandboxMode = false;

function onMatchFullTime(snap: SimSnapshot): void {
  if (isSandboxMode) {
    stopGameLoop();
    isSandboxMode = false;
    showSandboxResultsOverlay(snap);
    return;
  }
  // ... existing live match handling
}
```

---

### Pattern 4: Training as a Pure Function with Season-Level Application

**What:** Training logic (`applyDrill`, `nudgePersonality`) is a pure function: takes state, returns new state, no side effects. Application happens in `main.ts` where it updates `SeasonState`.

**When to use:** All training logic. Enables unit testing without UI setup.

**Example:**
```typescript
// In trainingScreen.ts event handler (wired via main.ts):
function onDrillSelected(drill: DrillType): void {
  const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
  const updatedSquad = applyDrill(playerTeam.squad, drill, seasonState.currentMatchday, seasonState.seed);
  const updatedTeams = seasonState.teams.map(t =>
    t.isPlayerTeam ? { ...t, squad: updatedSquad } : t
  );
  const updatedTraining = incrementTrainingDay(seasonState.trainingState, drill.id);
  seasonState = { ...seasonState, teams: updatedTeams, trainingState: updatedTraining };
  autoSave();  // existing auto-save hook
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Generating Portraits Inside the Simulation Loop

**What people do:** Call `portraitGen.render()` inside the Canvas render callback or on every frame.

**Why it's wrong:** Portrait generation involves pixel-level Canvas operations and seeded RNG. Even cached, checking the cache on every frame per player adds overhead. The render loop runs at 60fps for 22 players — this is 1320 calls per second.

**Do this instead:** Generate and cache on first access per session. The `Map<playerId, ImageBitmap>` cache in `portraitGen.ts` means generation happens once. The renderer draws from the cache.

---

### Anti-Pattern 2: Modifying PlayerState Directly in the Simulation Engine

**What people do:** Try to apply training gains inside `SimulationEngine` by modifying agent attributes mid-match.

**Why it's wrong:** Training happens between matches at the season level. The engine treats `PlayerState` as immutable input per match. Mixing training state into the simulation creates an impossible-to-reason-about state machine.

**Do this instead:** Training changes `SeasonState.teams[i].squad[j]` attributes. The next kickoff passes the updated `PlayerState[]` to the engine. Clean separation: engine receives final attributes, simulation runs.

---

### Anti-Pattern 3: Persisting Portraits to the Backend

**What people do:** Serialize portrait pixel data (as base64 or arrays) into `SeasonState` to avoid regeneration.

**Why it's wrong:** A 48x48 pixel portrait as base64 is ~3KB. 500 players (20 teams x 25) is 1.5MB added to the save blob. The backend has a 1MB request limit. Generation is deterministic — there is no information to persist.

**Do this instead:** Session cache in `portraitGen.ts`. Portraits regenerate on page load (fast) and are cached for the session (no repeated generation).

---

### Anti-Pattern 4: Per-Player Drill Assignment in the First Pass

**What people do:** Build granular per-player training where each player gets a different drill.

**Why it's wrong:** The scope explicitly defers this: "Per-player drill assignment — squad-level training first, granularity later if needed." Per-player assignment requires a more complex UI (25 individual pickers), more complex application logic, and more complex SeasonState (a Map<playerId, drillId> per day).

**Do this instead:** One drill per day, squad-wide. The `DrillType.attributeTargets` list applies to all players, with individual variation handled by player age and current attribute values.

---

### Anti-Pattern 5: Building a Separate Sandbox Renderer or Engine

**What people do:** Create `SandboxEngine` or `SandboxRenderer` that duplicates the existing simulation and rendering infrastructure.

**Why it's wrong:** The existing engine already runs headlessly and is configured per match via `MatchConfig`. The renderer already renders any `SimSnapshot`. There is nothing simulation-specific about "sandbox" — it's just a match that doesn't write results back to the season.

**Do this instead:** One boolean flag in `main.ts`. The sandbox reuses 100% of the existing simulation and rendering code.

---

## Integration Points Summary

| New Feature | Reads From | Writes To | API Calls |
|-------------|------------|-----------|-----------|
| Portrait gen | `PlayerState.id`, `.nationality`, `.shirtNumber` | Session cache Map | None |
| Training logic | `PlayerState.attributes`, `.personality`, `.age` | Rebuilt `PlayerState[]` in SeasonState | None |
| Training state | `SeasonState.trainingState` | `SeasonState.trainingState`, `.teams` | None (auto-save reuses existing) |
| Sandbox mode | `SeasonState.teams` (read config) | Nothing (read-only) | None |

All three features are **purely additive** to the existing data model. No existing interfaces break. No backend changes. The auto-save mechanism persists all new state automatically through the existing JSON blob.

---

## Sources

- Codebase analysis (all files read): `src/simulation/types.ts`, `src/season/season.ts`, `src/season/teamGen.ts`, `src/season/quickSim.ts`, `src/main.ts`, `src/loop/gameLoop.ts`, `src/renderer/canvas.ts`, `src/api/client.ts`, `src/ui/screens/playerProfileScreen.ts`, `src/ui/screens/squadScreen.ts`, `src/ui/screens/hubScreen.ts`, `server/db.ts`, `server/index.ts`, `server/serialize.ts`
- Integration constraints identified from actual type definitions and function signatures in the codebase
- Build order derived from dependency analysis (portrait has no deps; training logic before training UI; sandbox last as self-contained)

---
*Architecture research for: v1.2 Player Development (portraits, training, sandbox)*
*Researched: 2026-03-07*
