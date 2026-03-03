---
phase: 01-engine-core
verified: 2026-03-03T08:25:00Z
status: gaps_found
score: 11/15 requirements verified
re_verification: false
gaps:
  - truth: "Tackle success resolved by comparing physical/technical attributes with positional geometry modifiers"
    status: failed
    reason: "contact.ts implements resolveTackle, isShielded, resolveAerialContest — but the engine (engine.ts) never imports or calls any of them. Contact resolution is entirely orphaned from the simulation tick pipeline."
    artifacts:
      - path: "src/simulation/physics/contact.ts"
        issue: "Exports resolveTackle, isShielded, resolveAerialContest but no production code imports this module. Only test files use it."
      - path: "src/simulation/engine.ts"
        issue: "Does not import from contact.ts. Possession changes occur only through ball pickup (CONTROL_RADIUS check), not through tackle contests."
    missing:
      - "Import resolveTackle, isShielded, resolveAerialContest from contact.ts in engine.ts"
      - "Call resolveTackle when a defending player presses and is within tackle range of the ball carrier"
      - "Apply isShielded check before allowing a PRESS action to succeed in dispossessing the carrier"
      - "Call resolveAerialContest when the ball is airborne (z > 0) and two opposing players are within AERIAL_CONTEST_RANGE"
  - truth: "Shielding modeled as spatial exclusion zone scaled by strength"
    status: failed
    reason: "isShielded exists in contact.ts but is never called from the engine. Players can always pick up the ball regardless of whether the carrier is shielding."
    artifacts:
      - path: "src/simulation/physics/contact.ts"
        issue: "isShielded is orphaned — never called in production code"
    missing:
      - "Wire isShielded into the ball-pickup step (10a) of engine.ts: if the nearest player attempting pickup is blocked by shielding, prevent pickup"
  - truth: "Aerial contests resolved by Z-intercept timing with contest window"
    status: failed
    reason: "resolveAerialContest exists in contact.ts but is never called from the engine. Aerial balls are treated identically to ground balls — any player within CONTROL_RADIUS picks them up regardless of Z height or aerial attribute."
    artifacts:
      - path: "src/simulation/physics/contact.ts"
        issue: "resolveAerialContest is orphaned — never called in production code"
      - path: "src/simulation/engine.ts"
        issue: "Ball pickup (step 10a) checks only 2D ground distance, not Z height, so no aerial contest logic fires"
    missing:
      - "When ball.z > 0 and multiple players are within AERIAL_CONTEST_RANGE, call resolveAerialContest to determine winner instead of closest-player pickup"
  - truth: "Score range audit after a full match shows no action dominating >40% of ticks"
    status: partial
    reason: "The audit infrastructure exists and is called correctly. However, the user-confirmed known issue of player oscillation/jitter (utility AI action scores flipping each tick) means MOVE_TO_POSITION likely dominates well above 40% since non-ball-carriers have their ball-possession hard-disqualifiers fire and fall through to positional movement. This is a calibration gap, not a structural missing piece. Accepted as known issue per human verification context."
    artifacts:
      - path: "src/simulation/ai/actions.ts"
        issue: "MOVE_TO_POSITION consideration has no hard disqualifier; scores non-zero for every player every tick. Combined with oscillation, this action likely dominates non-carrier ticks."
    missing:
      - "Calibration pass on action consideration weights to reduce oscillation and prevent MOVE_TO_POSITION dominance"
human_verification:
  - test: "Observe player movement variety"
    expected: "Players without the ball should mix between PRESS, MAKE_RUN, and MOVE_TO_POSITION across a 2-minute observation window, not flutter back and forth between the same two positions"
    why_human: "Oscillation/jitter is a visual phenomenon. The audit tool would catch >40% dominance but cannot observe the sub-second flipping between adjacent scores that causes jitter"
  - test: "Observe possession changes"
    expected: "After a player kicks the ball, another player from the same or opposing team should pick it up within 2-4 seconds in a natural-looking way. A strong defender should visibly contest a ball carrier more successfully than a weak one"
    why_human: "Contact resolution is NOT wired (see gaps). Currently possession changes only happen via ball pickup by nearest player in CONTROL_RADIUS — this needs human eyes to assess whether the 1.5m pickup radius produces plausible-looking possession changes or not"
  - test: "Observe second-half pacing vs first half"
    expected: "Players should visibly move slower and make more conservative decisions in the 80th-90th minute compared to the first 10 minutes"
    why_human: "Fatigue effect on movement speed and personality erosion is a gradual visual change requiring human observation over match duration"
---

# Phase 01: Engine Core Verification Report

**Phase Goal:** A single watchable match produces emergent football — goals, mistakes, possession changes, and realistic player movement arising from physics and agent decisions, never from scripted events
**Verified:** 2026-03-03T08:25:00Z
**Status:** gaps_found — 3 requirement gaps (ENG-08, ENG-09, ENG-10 subsystems built but not wired into engine), 1 calibration gap (ENG-05 oscillation, accepted as known issue)
**Re-verification:** No — initial verification

## Human Verification Context Applied

Per the provided context: user confirmed during plan 01-10 that the match renders, ball physics work, goals CAN occur, all 372 tests pass, and the build succeeds. The known player oscillation/jitter issue was acknowledged and accepted. UI controls (pause/reset/speed) were added post-checkpoint. This verification treats those confirmations as ground truth for visual/runtime behaviors and focuses on code-level verification of all 15 requirements.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ball moves in 2.5D with ground friction, gravity, and bounce | VERIFIED | `integrateBall` in ball.ts: GRAVITY=9.8, GROUND_FRICTION=0.985, BOUNCE_COEFFICIENT=0.55, SETTLE_THRESHOLD=0.1. All wired via engine.ts step 12. |
| 2 | Players move via steering behaviors with attribute caps | VERIFIED | seek, arrive, separation, pursuit in steering.ts. Engine uses seek/arrive/separation per action type. maxSpeed = pace * BASE_PLAYER_SPEED * (1 - fatigue * 0.5). |
| 3 | Each agent evaluates 8 actions per tick via utility AI | VERIFIED | ACTIONS array has 8 entries. selectAction in agent.ts iterates all, returns highest score. Called in engine.ts step 8 for every player every tick. |
| 4 | Personality vector (8 traits) weights every action score | VERIFIED | PERSONALITY_WEIGHTS matrix in personality.ts maps all 8 action types to trait weights. dotProduct called in evaluateAction. High-directness agents measurably prefer PASS_FORWARD. |
| 5 | Gaussian noise scaled by (1 - composure) adds decision variance | VERIFIED | gaussianNoise called in evaluateAction: `noise = gaussianNoise(0, (1-composure) * NOISE_SCALE, rng)`. NOISE_SCALE=0.12. Known issue: scores flip each tick (oscillation). Accepted per human confirmation. |
| 6 | Fatigue accumulates on glycogen-depletion curve | VERIFIED | accumulateFatigue in fatigue.ts: baseRate=0.004 for <60 min, 0.012 after. staminaMod and workRateMod applied. Called in engine.ts step 3 every tick. |
| 7 | Fatigue attenuates physical attributes and erodes personality | VERIFIED | applyFatigueToAttributes: physFactor=1-fatigue*0.5, techFactor=1-fatigue*0.2. applyFatigueToPersonality: lerp toward CONSERVATIVE_DEFAULTS with EROSION_FACTOR=0.6. Both called in engine.ts step 4. |
| 8 | Tackle resolution via attribute/geometry comparison | FAILED | resolveTackle exists in contact.ts (266 lines, substantive) but is NEVER imported or called from engine.ts. Possession changes only via CONTROL_RADIUS pickup. |
| 9 | Shielding as spatial exclusion zone scaled by strength | FAILED | isShielded exists in contact.ts with correct geometry (BASE_SHIELD_RADIUS * strength, dot-product check) but is NEVER imported or called from engine.ts. |
| 10 | Aerial contests resolved by Z-intercept timing | FAILED | resolveAerialContest exists in contact.ts with jump height and timing logic but is NEVER imported or called from engine.ts. Ball pickup ignores Z. |
| 11 | Goals detected when ball crosses goal line below crossbar | VERIFIED | checkGoal in state.ts: x<=0 or x>=PITCH_WIDTH, y in GOAL_MIN_Y..GOAL_MAX_Y, z < CROSSBAR_HEIGHT=2.44. Called in engine.ts step 13. applyGoal resets ball and increments score. |
| 12 | Match statistics accumulated from agent decisions | VERIFIED | StatsAccumulator in stats.ts tracks shots, passes, tackles, possession per tick. Wired in engine.ts steps 14. Debug overlay shows stats. auditScoreRanges wired in logFullTime in main.ts. |
| 13 | Match progresses through all 5 phases | VERIFIED | advancePhase in phases.ts: KICKOFF→FIRST_HALF→HALFTIME→SECOND_HALF→FULL_TIME with TICKS_PER_HALF=2700. Goal triggers KICKOFF restart. Wired in engine.ts step 1. 33 engine tests pass including halftime/fulltime transitions. |
| 14 | 2D Canvas rendering with Z conveyed via sprite scaling and shadow | VERIFIED | CanvasRenderer in canvas.ts: ballRadius scales with z, shadowAlpha fades with height, airborneOffsetY applied. drawPitch draws pitch lines and goal posts. Players colored by team with direction indicator. HUD, stats overlay, heatmap all implemented. |
| 15 | Simulation runs at 30+ ticks/sec separated from 60fps rendering | VERIFIED | gameLoop.ts: FIXED_DT_MS=1000/30, accumulator pattern, MAX_ACCUMULATED_MS=200 spiral-of-death guard. engine.tick called in accumulator loop, renderer.draw called per requestAnimationFrame. Build produces 41.94 kB bundle. |

**Score:** 11/15 truths verified (3 FAILED — all three contact resolution subsystems orphaned; 1 PARTIAL accepted as known issue)

---

## Required Artifacts

| Artifact | Exists | Lines | Level 1 | Level 2 | Level 3 (Wired) | Status |
|----------|--------|-------|---------|---------|-----------------|--------|
| `src/simulation/types.ts` | Yes | 135 | Pass | Pass — all 13 exports present | Imported by 8+ modules | VERIFIED |
| `src/simulation/math/vec2.ts` | Yes | ~80 | Pass | Pass | Imported throughout | VERIFIED |
| `src/simulation/math/random.ts` | Yes | ~50 | Pass | Pass — seedrandom dep, gaussianNoise | Used by agent.ts, engine.ts | VERIFIED |
| `src/simulation/math/curves.ts` | Yes | ~50 | Pass | Pass — linear, sigmoid, exponentialDecay, logarithmic, step | Imported by actions.ts | VERIFIED |
| `src/simulation/physics/ball.ts` | Yes | 161 | Pass | Pass — integrateBall, continuousCollisionCheck | integrateBall called in engine step 12 | VERIFIED |
| `src/simulation/physics/steering.ts` | Yes | 118 | Pass | Pass — seek, arrive, separation, pursuit, clampVelocity | seek/arrive/separation used in engine steps 10, 11 | VERIFIED |
| `src/simulation/physics/contact.ts` | Yes | 266 | Pass | Pass — resolveTackle, isShielded, resolveAerialContest | NOT imported in any non-test file | ORPHANED |
| `src/simulation/physics/spatial.ts` | Yes | 99 | Pass | Pass — SpatialGrid with insert/query/clear | Imported in engine.ts; insert/clear called each tick; query() NEVER called | PARTIAL |
| `src/simulation/match/phases.ts` | Yes | 93 | Pass | Pass — advancePhase, TICKS_PER_HALF, TOTAL_MATCH_TICKS | Called in engine step 1 | VERIFIED |
| `src/simulation/match/state.ts` | Yes | 172 | Pass | Pass — checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions | All called in engine | VERIFIED |
| `src/simulation/match/stats.ts` | Yes | 182 | Pass | Pass — StatsAccumulator class, accumulateStats | StatsAccumulator used in engine steps 14, 15 | VERIFIED |
| `src/simulation/ai/actions.ts` | Yes | 220 | Pass | Pass — 8 ACTIONS with consideration functions | ACTIONS imported in engine.ts, evaluateAction | VERIFIED |
| `src/simulation/ai/agent.ts` | Yes | 96 | Pass | Pass — evaluateAction, selectAction | selectAction called in engine step 8 for every player | VERIFIED |
| `src/simulation/ai/personality.ts` | Yes | 103 | Pass | Pass — PERSONALITY_WEIGHTS, personalityBonus, dotProduct, NOISE_SCALE | PERSONALITY_WEIGHTS imported in engine.ts and agent.ts | VERIFIED |
| `src/simulation/ai/fatigue.ts` | Yes | 164 | Pass | Pass — accumulateFatigue, applyFatigueToAttributes, applyFatigueToPersonality, CONSERVATIVE_DEFAULTS | All called in engine steps 3, 4 | VERIFIED |
| `src/simulation/ai/decisionLog.ts` | Yes | 201 | Pass | Pass — DecisionLog (ring buffer), auditScoreRanges, AgentDecisionEntry | DecisionLog used in engine; auditScoreRanges called in main.ts logFullTime | VERIFIED |
| `src/simulation/tactical/formation.ts` | Yes | 124 | Pass | Pass — computeFormationAnchors, Formation | Called in engine step 6 for both teams every tick | VERIFIED |
| `src/simulation/engine.ts` | Yes | 783 | Pass | Pass — SimulationEngine with 15-step tick, createTestRosters, createMatchRosters | Imported in main.ts, used in gameLoop | VERIFIED |
| `src/loop/gameLoop.ts` | Yes | 142 | Pass | Pass — startGameLoop, stopGameLoop, pause/speed controls | startGameLoop called in main.ts startMatch | VERIFIED |
| `src/renderer/canvas.ts` | Yes | 495 | Pass | Pass — CanvasRenderer with draw, stats, heatmap, pitchToCanvas | Instantiated in main.ts, draw called from gameLoop | VERIFIED |
| `src/renderer/pitch.ts` | Yes | ~80 | Pass | Pass — drawPitch | Called in canvas.ts draw step 2 | VERIFIED |
| `src/renderer/debug.ts` | Yes | 341 | Pass | Pass — DebugOverlay with click-to-inspect, panel, bars | Instantiated in main.ts, draw called when showDebug=true | VERIFIED |

---

## Key Link Verification

| From | To | Via | Status | Detail |
|------|----|-----|--------|--------|
| `engine.ts` | `ai/agent.ts` | selectAction per player per tick | WIRED | Line 436: `selectAction(ACTIONS, ctx, effectivePersonality[i]!, PERSONALITY_WEIGHTS, this.rng)` |
| `engine.ts` | `ai/fatigue.ts` | accumulateFatigue, applyFatigueToAttributes, applyFatigueToPersonality | WIRED | Steps 3, 4 — all three functions called per player per tick |
| `engine.ts` | `match/phases.ts` | advancePhase step 1 | WIRED | Line 288: `advancePhase(current.matchPhase, nextTick, false)` |
| `engine.ts` | `match/state.ts` | checkGoal, applyGoal step 13 | WIRED | Lines 709, 714 |
| `engine.ts` | `match/stats.ts` | StatsAccumulator steps 14, 15 | WIRED | recordPossession and recordIntent per tick |
| `engine.ts` | `physics/ball.ts` | integrateBall step 12 | WIRED | Line 683 |
| `engine.ts` | `physics/steering.ts` | seek, arrive, separation per action | WIRED | Used in all movement cases in step 10 |
| `engine.ts` | `tactical/formation.ts` | computeFormationAnchors step 6 | WIRED | Lines 358, 364 |
| `engine.ts` | `physics/spatial.ts` | SpatialGrid insert/clear step 5 | PARTIAL | Grid is populated but `query()` is never called — spatial acceleration is unused at runtime |
| `engine.ts` | `physics/contact.ts` | resolveTackle, isShielded, resolveAerialContest | NOT WIRED | contact.ts not imported in engine.ts at all |
| `loop/gameLoop.ts` | `engine.ts` | engine.tick(FIXED_DT_MS) | WIRED | Line 108: `currSnapshot = engine.tick(FIXED_DT_MS)` |
| `loop/gameLoop.ts` | `renderer/canvas.ts` | renderer.draw(prev, curr, alpha) | WIRED | Line 117: `renderer.draw(prevSnapshot, currSnapshot, alpha)` |
| `main.ts` | `loop/gameLoop.ts` | startGameLoop(engine, renderer) | WIRED | Line 88 in startMatch() |
| `main.ts` | `renderer/debug.ts` | DebugOverlay instantiated, draw called | WIRED | Lines 63, 74 |
| `renderer/debug.ts` | `ai/decisionLog.ts` | decisionLog.getLatest(agentId) | WIRED | Line 118 |
| `ai/agent.ts` | `ai/actions.ts` | ACTIONS array iterated | WIRED | Line 84: `for (const action of actions)` |
| `ai/agent.ts` | `ai/personality.ts` | PERSONALITY_WEIGHTS in evaluateAction | WIRED | Line 51: `dotProduct(weights[action.id], personality)` |
| `ai/agent.ts` | `math/random.ts` | gaussianNoise for composure noise | WIRED | Line 56: `gaussianNoise(0, (1 - personality.composure) * NOISE_SCALE, rng)` |
| `ai/actions.ts` | `math/curves.ts` | sigmoid, exponentialDecay, linear | WIRED | Line 3 import, used in all 8 action consideration functions |

---

## Requirements Coverage

| Requirement | Description | Plan | Status | Evidence |
|-------------|-------------|------|--------|----------|
| ENG-01 | Ball moves in 2.5D (X/Y ground + Z height via projectile motion) | 01-02 | SATISFIED | ball.ts: integrateBall with gravity, friction, bounce. Wired in engine step 12. |
| ENG-02 | Players move using steering behaviors with physical attribute caps | 01-03 | SATISFIED | steering.ts: seek, arrive, separation, pursuit, clampVelocity. Used throughout engine step 10. maxSpeed = pace * BASE_PLAYER_SPEED * (1 - fatigue * 0.5). |
| ENG-03 | Each player agent evaluates 7+ actions per tick via utility AI | 01-06 | SATISFIED | 8 actions evaluated per player per tick. selectAction iterates ACTIONS, returns highest score. |
| ENG-04 | Personality vector (8 traits) weights every action score | 01-06 | SATISFIED | PERSONALITY_WEIGHTS matrix with action-specific trait contributions. dotProduct applied in evaluateAction. |
| ENG-05 | Gaussian noise added to utility scores, scaled by (1 - composure) | 01-06 | SATISFIED (with caveat) | gaussianNoise(0, (1-composure)*0.12, rng) in evaluateAction. Known oscillation issue accepted by user. |
| ENG-06 | Fatigue accumulates on glycogen-depletion curve | 01-07 | SATISFIED | accumulateFatigue: baseRate 0.004 (<60min) / 0.012 (>60min), staminaMod, workRateMod. Wired per tick. |
| ENG-07 | Fatigue interpolates personality toward conservative defaults | 01-07 | SATISFIED | applyFatigueToPersonality: lerp toward CONSERVATIVE_DEFAULTS by (fatigue * EROSION_FACTOR=0.6). |
| ENG-08 | Tackle success resolved by comparing attributes with geometry modifiers | 01-08 | BLOCKED | resolveTackle exists and is correct (tackling, dribbling, angle, distance, strength) but is NEVER called from engine.ts. No tackle contests occur. |
| ENG-09 | Shielding modeled as spatial exclusion zone scaled by strength | 01-08 | BLOCKED | isShielded exists (BASE_SHIELD_RADIUS * strength, geometric dot-product check) but is NEVER called from engine.ts. |
| ENG-10 | Aerial contests resolved by Z-intercept timing with contest window | 01-08 | BLOCKED | resolveAerialContest exists (jump height, AERIAL_CONTEST_RANGE, aerial/strength weighting) but is NEVER called from engine.ts. |
| ENG-11 | Goals detected when ball crosses goal line below crossbar | 01-04 | SATISFIED | checkGoal: inGoalWidth && belowCrossbar && (x<=0 or x>=PITCH_WIDTH). Wired in engine step 13. |
| ENG-12 | Match statistics accumulated from agent decisions | 01-09 | SATISFIED | StatsAccumulator tracks shots, passes, tackles, possession per tick. Shown in stats overlay and logged at full-time with audit. |
| ENG-13 | Match progresses through 5 phases: kickoff, first half, halftime, second half, full-time | 01-04 | SATISFIED | advancePhase state machine. 5-phase transitions verified by 33 engine tests. |
| ENG-14 | 2D top-down Canvas rendering with ball Z via sprite scaling and shadow offset | 01-05 | SATISFIED | CanvasRenderer: ball radius scales +50% at 20m height, shadow alpha fades, airborneOffsetY applies. Pitch lines, goal posts, 22 players, HUD all rendered. |
| ENG-15 | Simulation runs at 30+ ticks/sec, separated from 60fps rendering | 01-01, 01-05 | SATISFIED | FIXED_DT_MS=33.33ms accumulator loop. Render via requestAnimationFrame separate from tick loop. MAX_ACCUMULATED_MS=200 guard. Build: 41.94 kB. |

**Satisfied:** 12/15
**Blocked:** 3/15 (ENG-08, ENG-09, ENG-10)
**Orphaned requirements:** None — all 15 ENG requirements appear in plan frontmatter and REQUIREMENTS.md traceability table.

---

## Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `src/simulation/physics/contact.ts` | Module exports resolveTackle, isShielded, resolveAerialContest — none imported in engine.ts | Blocker | ENG-08, ENG-09, ENG-10 requirements are untested at runtime. Possession changes happen only via CONTROL_RADIUS proximity, not tackle contests. Shielding has no effect on gameplay. |
| `src/simulation/physics/spatial.ts` | SpatialGrid.query() never called in engine.ts — grid is built but never queried | Warning | Performance optimization not utilized. Engine performs O(n) scans in agent context building instead of O(1) grid queries. Not a correctness issue at 22 players. |
| `src/simulation/physics/steering.ts` | `pursuit()` exported but never called in engine (seek is used instead for pressing) | Info | Minor — pressing players seek the ball position rather than pursuing its predicted position. Does not block any requirement. |

`return null` in state.ts (lines 42, 55) and `return []` in decisionLog.ts (line 86) are correct behavior returns, not stubs.

---

## Human Verification Required

### 1. Player Movement Variety

**Test:** Watch a 2-minute window with the stats overlay open. Observe off-ball players (players not holding the ball).
**Expected:** Off-ball players should cycle between PRESS (moving toward ball carrier), MAKE_RUN (moving toward opponent goal), and MOVE_TO_POSITION (drifting back to formation) in visible variety. No player should oscillate in a 1-2 meter jitter pattern for more than 3-4 seconds.
**Why human:** The known oscillation issue (utility AI scores flipping each tick) is a visual phenomenon. Automated grep cannot measure sub-second position oscillation magnitude.

### 2. Possession Change Plausibility

**Test:** Watch several ball-loose situations (after a kick, after a missed shot). Observe which player picks up the ball.
**Expected:** The nearest player within ~1.5 metres should pick up the ball. Because contact resolution is NOT wired, no tackle contests should visually occur — this is the gap. Verify whether the CONTROL_RADIUS (1.5m) pickup mechanic alone produces plausible-looking possession changes or if it is visually broken.
**Why human:** The gap is known — this check assesses whether the match is still watchable despite the gap, or whether the missing contact wiring is immediately obvious and immersion-breaking.

### 3. Fatigue Visibility in Second Half

**Test:** Watch the match at 2x speed. Compare player movement speed in the first 15 minutes versus the 75th-90th minute.
**Expected:** Second-half players (especially high-work_rate archetypes like the boxToBox midfielder) should visibly move slower and make more conservative decisions.
**Why human:** Fatigue is a gradual visual change requiring comparison across match duration. Cannot verify through static analysis.

---

## Gaps Summary

Three ENG requirements (ENG-08, ENG-09, ENG-10) share a single root cause: **the contact resolution module (contact.ts) was built and tested in isolation but never integrated into the engine tick pipeline.** The engine.ts does not import contact.ts at all.

This means:
- **Tackle contests never happen.** Possession changes are decided purely by which player reaches within 1.5 metres of a loose ball first — not by tackling attributes.
- **Shielding has no effect.** A weak player can always take the ball from a strong player if they are close enough.
- **Aerial contests use ground-distance pickup logic.** High aerial-attribute players gain no advantage on airborne balls.

The contact module itself (266 lines) is substantive and correct — it passed its test suite. The fix is an integration task: import the module in engine.ts and call its functions in the appropriate steps of the tick pipeline (ball pickup step 10a for shielding/tackle, and a new aerial contest check when ball.z > 0).

The spatial grid (spatial.ts) is a secondary issue: the grid is populated each tick but `query()` is never called. The engine instead iterates all players directly in agent context construction. This is a performance concern, not a correctness gap, at the current 22-player scale.

The player oscillation/jitter is a calibration issue (acknowledged by user) and does not block goal achievement structurally — goals can and do occur.

---

_Verified: 2026-03-03T08:25:00Z_
_Verifier: Claude (gsd-verifier)_
