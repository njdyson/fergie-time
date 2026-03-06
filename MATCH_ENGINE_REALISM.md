# Match Engine Realism Assessment & Proposals

A detailed analysis of the current Fergie Time match engine with targeted proposals for improving realism — keeping complexity lean and performance overhead negligible.

---

## Table of Contents

1. [Current System Summary](#1-current-system-summary)
2. [Realism Gaps](#2-realism-gaps)
3. [Proposed Player Attributes](#3-proposed-player-attributes)
4. [Goalkeeper Specialisation](#4-goalkeeper-specialisation)
5. [Tactical Screen Additions](#5-tactical-screen-additions)
6. [Engine Enhancements](#6-engine-enhancements)
7. [Performance Impact Analysis](#7-performance-impact-analysis)
8. [Priority Matrix](#8-priority-matrix)

---

## 1. Current System Summary

### What already works well

The engine is already considerably deep for a browser-based football sim:

| System | Details |
|--------|---------|
| **Tick pipeline** | 15-step per-frame loop: phase advance → fatigue → effective attributes → spatial grid → formation anchors → transition detection → offside → defensive line blending → AI decisions → pass/shot resolution → tackle/aerial contests → physics → goal check → stats → snapshot |
| **Player attributes** | 10 attributes on 0..1 scale: `pace`, `strength`, `stamina`, `dribbling`, `passing`, `shooting`, `tackling`, `aerial`, `positioning`, `vision` |
| **Personality** | 8 traits on 0..1 scale: `directness`, `risk_appetite`, `composure`, `creativity`, `work_rate`, `aggression`, `anticipation`, `flair` |
| **Utility AI** | 10 action types evaluated per tick per player via consideration-product pipeline with compensation factor, personality dot product, Gaussian noise, and hysteresis |
| **Tactical system** | 4 phases (in possession / out of possession / defensive transition / attacking transition), 7 per-player multipliers, 5 team controls, press config, transition config |
| **Fatigue** | Glycogen-depletion curve with stamina/work-rate modifiers; physical attribute attenuation (50% at exhaustion) and personality erosion toward conservative defaults (60% shift) |
| **Physics** | Tackle resolution (distance + angle + strength + tackling vs dribbling), aerial contests (jump height + strength + proximity), ball physics with ground friction and air drag, shielding |
| **Dead balls** | Throw-ins, corners, goal kicks, free kicks, kickoffs with repositioning ticks |
| **Discipline** | Yellow/red cards, foul detection based on tackle angle and skill, personality dampening after cautions |
| **Vision** | Perception radius scaled by vision attribute and anticipation, blind spots, refresh intervals |
| **Off-ball AI** | CSP (Candidate Space Points) system sampling 3 distance rings × 4 angles, scoring by seam-finding, defender avoidance, forward progress, and passing lane clearance |

### What's missing

Despite the depth, the engine currently treats all outfield players as essentially the same physical template with different numbers dialled in. Real football has specialist roles that go beyond attribute tuning — a towering centre-back wins headers differently from a diminutive winger who gets past his man with a drop of the shoulder. The sections below identify specific gaps and propose lightweight solutions.

---

## 2. Realism Gaps

### 2.1 Player Differentiation

| Gap | Current State | Impact |
|-----|--------------|--------|
| **No acceleration vs top speed** | Single `pace` attribute governs all movement | A quick winger and a pacey centre-back feel identical; no meaningful burst-vs-sustain distinction |
| **No crossing ability** | Wing play uses generic `passing` | Crossing from wide areas should be harder — a great crosser with average passing is a real archetype |
| **No finishing vs long-range shooting** | Single `shooting` for all shot types | A poacher with finishing=0.9 should convert 1v1s but miss 30-yarders; the reverse for a long-range specialist |
| **Aerial = jumping + heading combined** | `aerial` attribute conflates jump height with heading accuracy | A tall player who jumps well but can't direct headers is indistinguishable from one who can |
| **No balance/agility** | Not modelled | Mazy dribblers should resist shoulder charges and turn sharply; currently only `dribbling` and `strength` matter |
| **No concentration** | Not modelled | Players make the same quality of decisions in minute 89 as minute 5 (fatigue only erodes physical/personality) |

### 2.2 Goalkeeper Model

The GK currently uses the same 10 attributes as outfield players. `positioning` determines where they stand and `aerial` how high they jump. There are no specialist attributes for:

- **Reflexes** — reaction saves, close-range shot-stopping
- **Handling** — catching vs parrying (parries create second balls, catches don't)
- **1v1 ability** — rushing out, spreading, narrowing angles
- **Distribution** — kick/throw accuracy for launching counter-attacks

This means all goalkeepers feel essentially the same — a positioning+aerial number.

### 2.3 Set Pieces

Dead balls restart play but lack tactical routines:
- **Corners**: Always go to the nearest outfield player; no near-post, far-post, or short-corner options
- **Free kicks**: No direct shot vs cross decision; no wall positioning
- **Throw-ins**: Always to nearest; no long throw specialist

### 2.4 Match Events & Dynamics

| Gap | Notes |
|-----|-------|
| **No injuries** | Players can't get injured; no risk management for aggressive play |
| **No momentum/confidence** | Scoring a goal doesn't affect team behaviour; a side 3-0 up plays identically to one 3-0 down |
| **No referee personality** | All fouls judged by the same thresholds; no lenient or strict refs |
| **No weather/pitch conditions** | Passing accuracy and ball physics are constant; no rain/wind/heavy pitch |

### 2.5 Tactical Gaps

| Gap | Notes |
|-----|-------|
| **No mentality preset** | No single "ultra defensive → ultra attacking" dial that shifts the team shape as a whole |
| **No marking assignments** | Can't man-mark a specific opponent |
| **No offside trap** | Can't instruct the defensive line to step up aggressively |
| **No attack channel preference** | Can't instruct the team to play through the wings or centrally |
| **No time-wasting** | Can't slow the game down when protecting a lead |
| **No target man** | Can't route long balls to a specific player |

---

## 3. Proposed Player Attributes

These additions maximise realism per line of code. Each is a single `number` (0..1) added to `PlayerAttributes`.

### 3.1 `acceleration` — Burst Speed

**Why**: Separates explosive first-yard quickness from sustained top speed. A winger burns past a full-back in the first 5m; a centre-back with high pace can recover over 30m.

**Where it plugs in**:
- `steering.ts` → movement calculations: multiply initial velocity ramp by `acceleration`, sustained speed by `pace`
- `actions.ts` → `DRIBBLE` consideration: blend `acceleration * 0.4 + pace * 0.6` instead of just `pace`
- `actions.ts` → `MAKE_RUN` consideration: use `acceleration` for the space-creation score
- `contact.ts` → `resolveTackle`: factor in acceleration difference for "getting away" from challenges

**Runtime cost**: Zero — one extra float read per relevant calculation.

**Generation hint**: Wingers and strikers should have high acceleration (0.7–0.9), centre-backs moderate (0.4–0.6), goalkeepers low (0.3–0.5).

### 3.2 `crossing` — Delivery Quality

**Why**: Wing play is central to real football. Currently a winger with `passing: 0.5` delivers poor crosses, even if they're a specialist crosser.

**Where it plugs in**:
- `engine.ts` → pass resolution: when the passer is wide (|y| near touchline) and targeting the box, use `crossing` instead of `passing` for accuracy
- `actions.ts` → `PASS_FORWARD` consideration: when in wide areas and teammates are in the box, boost score by `crossing * 0.3`

**Runtime cost**: One conditional branch per pass attempt (negligible).

**Generation hint**: Full-backs and wingers: 0.5–0.9. Central midfielders: 0.3–0.6. Centre-backs/strikers: 0.2–0.5.

### 3.3 `finishing` — Close-Range Conversion

**Why**: The current `shooting` attribute governs both 6-yard tap-ins and 30-yard screamers equally. A poacher should convert 1v1s reliably but miss from range; a long-range specialist is the opposite.

**Where it plugs in**:
- `actions.ts` → `SHOOT` consideration: blend `finishing * f + shooting * (1-f)` where `f = max(0, 1 - distanceToGoal / 25)` — so inside the box it's mostly `finishing`, outside it's `shooting`
- `engine.ts` → shot resolution: same blend for actual success probability

**Runtime cost**: One lerp per shot (negligible).

**Generation hint**: Strikers/poachers: finishing 0.7–0.95, shooting 0.4–0.7. Midfielders: finishing 0.3–0.6, shooting 0.5–0.8.

### 3.4 `agility` — Turning & Evasion

**Why**: A nimble dribbler can beat a defender by changing direction, not just raw speed. Currently there's no distinction between a strong, direct runner and a quick, twisty dribbler.

**Where it plugs in**:
- `contact.ts` → `resolveTackle`: add `agility * 0.15` to the attacker's side of the equation (represents evasion)
- `actions.ts` → `DRIBBLE` consideration: blend `dribbling * 0.6 + agility * 0.4` for the skill score
- `steering.ts` → turning: allow sharper direction changes scaled by `agility`

**Runtime cost**: One extra multiply in tackle resolution and dribble evaluation.

**Generation hint**: Wingers/playmakers: 0.6–0.9. Strikers: 0.4–0.8. Centre-backs: 0.3–0.5.

### 3.5 `heading` — Header Accuracy

**Why**: The current `aerial` attribute conflates jump height with heading ability. A tall player who wins every aerial duel shouldn't automatically direct it perfectly.

**Where it plugs in**:
- `contact.ts` → `resolveAerialContest`: keep `aerial` for jump height and contest-winning probability; use `heading` for the quality of the resulting header (direction accuracy, power toward goal)
- `engine.ts` → post-aerial resolution: if header is directed at goal, success probability uses `heading` blend; if clearing, use `heading` for distance/accuracy
- `actions.ts` → shooting considerations when ball.z > 0: factor `heading` into score

**Runtime cost**: One extra read during aerial contest resolution.

**Generation hint**: Centre-backs: heading 0.5–0.8, aerial 0.6–0.9. Target strikers: heading 0.7–0.9, aerial 0.7–0.9. Wingers: heading 0.3–0.5, aerial 0.4–0.6.

### 3.6 `concentration` — Decision Consistency

**Why**: Fatigue erodes personality, but it doesn't model mental lapses — a centre-back switching off in minute 87 to let a runner go, or a midfielder misplacing a simple pass after 80 minutes of flawless play.

**Where it plugs in**:
- `agent.ts` → `evaluateAction`: scale the Gaussian noise by `(1 - composure) * (1 + (1 - concentration) * fatigue * 0.5)` — low concentration + high fatigue = noisier decisions late in the game
- This is purely an amplifier on existing noise; no new computation path

**Runtime cost**: One multiply per action evaluation (negligible; already doing noise calculation).

**Generation hint**: Experienced defenders: 0.7–0.9. Young attackers: 0.4–0.6. Midfield metronomes: 0.8–0.95.

### Summary of attribute additions

```typescript
export interface PlayerAttributes {
  // Existing (unchanged)
  readonly pace: number;
  readonly strength: number;
  readonly stamina: number;
  readonly dribbling: number;
  readonly passing: number;
  readonly shooting: number;
  readonly tackling: number;
  readonly aerial: number;
  readonly positioning: number;
  readonly vision: number;
  // New
  readonly acceleration: number;   // burst speed (0..1)
  readonly crossing: number;       // delivery from wide (0..1)
  readonly finishing: number;      // close-range conversion (0..1)
  readonly agility: number;        // turning, evasion (0..1)
  readonly heading: number;        // header accuracy (0..1)
  readonly concentration: number;  // decision consistency under fatigue (0..1)
}
```

Total: 16 attributes (up from 10). All 0..1, all used in existing calculation paths with minimal branching.

---

## 4. Goalkeeper Specialisation

Rather than a separate `GKAttributes` interface (which would complicate the type system), add 4 attributes to `PlayerAttributes` that are only meaningful for GKs. Outfield players can have these set to 0.3–0.5 as defaults; they'll never be read in outfield paths.

### 4.1 `reflexes` — Reaction Saves

**Currently**: Shot-stopping uses `positioning` to determine if the GK is near enough and `aerial` to determine if they can reach it.

**Proposal**: When resolving shots, blend `reflexes` into the save probability:
```
saveProbability = positioningFactor * (reflexes * 0.6 + aerial * 0.4) * distanceFactor
```
- `reflexes` dominates for close-range shots (< 12m)
- `aerial` dominates for high shots and crosses
- `positioning` determines baseline (are they in the right place?)

**Runtime cost**: Replaces one attribute read with a blend — zero additional computation.

### 4.2 `handling` — Catch vs Parry

**Currently**: No distinction — saves just kill the ball or redirect it.

**Proposal**: On a successful save, roll `handling` to determine outcome:
- `rng() < handling * 0.8` → **catch** (ball dead, GK possession)
- Otherwise → **parry** (ball deflected to a random nearby position, creating a second ball scenario)

This creates tactical depth: teams with a low-handling GK should expect more rebounds and position accordingly.

**Runtime cost**: One extra RNG roll per save (saves are rare events — negligible).

### 4.3 `oneOnOnes` — 1v1 Situations

**Currently**: 1v1s are just a normal shot with the GK's `positioning` + `aerial`.

**Proposal**: When the shot is from < 15m and no defenders are within 5m of the shooter:
```
saveBonus = oneOnOnes * 0.25  // up to +25% save chance in 1v1 scenarios
```
This models the GK's ability to spread, narrow the angle, and time their rush.

**Runtime cost**: One conditional check per close-range shot.

### 4.4 `distribution` — Building From the Back

**Currently**: GK passes use generic `passing` attribute.

**Proposal**: When the GK has the ball:
- Use `distribution` instead of `passing` for accuracy calculations
- High `distribution` → more accurate goal kicks and throws → enables counter-attacks
- Low `distribution` → wayward clearances → opposition regain possession more often
- Add a consideration modifier: GKs with high `distribution` slightly prefer `PASS_FORWARD` over `PASS_SAFE`

**Runtime cost**: One conditional branch when GK is the ball carrier (rare event per tick).

### GK Attributes Summary

```typescript
// Added to PlayerAttributes (meaningful for GKs only)
readonly reflexes: number;      // 0..1 — shot-stopping reactions
readonly handling: number;      // 0..1 — catch vs parry
readonly oneOnOnes: number;     // 0..1 — 1v1 save ability
readonly distribution: number;  // 0..1 — goal kick/throw accuracy
```

**Total PlayerAttributes after all additions: 20** (10 existing + 6 outfield + 4 GK). This is comparable to mainstream football management games (FM uses ~38, FIFA uses ~29) while being much leaner.

---

## 5. Tactical Screen Additions

These proposals add meaningful tactical choices to the existing UI without overwhelming the player. Each maps cleanly onto existing systems.

### 5.1 Mentality Preset (Team Panel)

**What**: A single 5-position selector: `Ultra Defensive` / `Defensive` / `Balanced` / `Attacking` / `Ultra Attacking`

**How it works**: Applies a global offset to several existing controls simultaneously:

| Mentality | lineHeight | width | tempo | restDefence | press intensity |
|-----------|-----------|-------|-------|------------|-----------------|
| Ultra Def | -0.15 | -0.10 | -0.10 | +1 (cap 4) | -0.10 |
| Defensive | -0.08 | -0.05 | -0.05 | +0 | -0.05 |
| Balanced | 0 | 0 | 0 | 0 | 0 |
| Attacking | +0.08 | +0.05 | +0.05 | -1 (min 2) | +0.05 |
| Ultra Att | +0.15 | +0.10 | +0.15 | -1 (min 2) | +0.10 |

**UI**: 5 buttons above the existing controls in `TeamPanel`. Individual sliders still work as fine-tuning on top of the preset.

**Implementation**: Purely additive modifiers applied in `getTacticalConfig()` before passing to the engine. No engine changes needed.

### 5.2 Attack Channel Preference (Team Panel)

**What**: 3-way toggle: `Left Wing` / `Central` / `Right Wing` / `Mixed`

**How it works**: When the ball carrier is deciding between `PASS_FORWARD` targets:
- Add a lateral bias to pass target selection: prefer teammates in the chosen channel
- `Left Wing`: +0.15 bonus to targets with y < 22m (left third)
- `Right Wing`: +0.15 bonus to targets with y > 46m (right third)
- `Central`: +0.15 bonus to targets with 22m < y < 46m (central corridor)
- `Mixed`: No bias (current behaviour)

**UI**: 4 small buttons in `TeamPanel`, below formation presets. Visual indicator on the tactics board showing the preferred channel highlighted.

**Implementation**: One check in the pass target selection logic in the engine. Minimal cost.

### 5.3 Offside Trap Toggle (Team Panel — Out of Possession)

**What**: On/Off toggle available in the "Out of Possession" phase.

**How it works**: When enabled:
- Defensive line blending (engine step 6d) becomes more aggressive: tolerance reduced from 1.1/1.8m to 0.3/0.5m
- Defenders actively step up when they detect an opponent about to receive a pass
- Risk: if `concentration` is low or `pace` is low, defenders may not step up in time → through balls succeed more often

**UI**: Single toggle button in the Out of Possession section of `TeamPanel`.

**Implementation**: Modify the tolerance values in the defensive line blending step based on a boolean flag. One conditional per defender per tick.

### 5.4 Time Wasting (Team Panel)

**What**: On/Off toggle, typically used when protecting a lead in the final minutes.

**How it works**: When enabled:
- `tempo` is forced to 0.0 (most patient)
- `holdUp` multiplier gets +0.3 boost for all outfield players
- GK `distribution` speed is reduced (longer delay before goal kicks)
- Dead ball pause ticks are increased by 50%
- `PASS_SAFE` gets a flat +0.15 bonus; `PASS_FORWARD` gets a -0.10 penalty

**UI**: Toggle button in `TeamPanel`, only available when the team is winning. Auto-disables when scores are level.

**Implementation**: Modifier layer applied in the overlay before sending config to engine. No engine changes.

### 5.5 Target Man Designation (Player Panel)

**What**: A toggle on any single outfield player marking them as the "target man".

**How it works**: When a target man is designated:
- Long passes (distance > 30m) get a +0.20 bonus when the target man is the intended receiver
- The target man's `HOLD_SHIELD` action gets a +0.10 bonus (they expect to receive the ball and lay it off)
- Other forwards' `MAKE_RUN` around the target man gets a small boost

**UI**: Checkbox/toggle in `PlayerPanel` for one player at a time. Only one target man allowed.

**Implementation**: One additional check in pass target selection and one modifier in action scoring. Minimal.

### 5.6 Man-Marking Assignment (Player Panel)

**What**: Assign a specific defender to mark a specific opponent.

**How it works**: When assigned:
- The marker's `MOVE_TO_POSITION` target blends 60% formation anchor + 40% marked opponent's position
- The marker's `PRESS` action gets a +0.15 bonus when near their assigned player
- If the marked opponent has the ball, the marker's tackle distance penalty is reduced (they're tracking closely)

**UI**: In `PlayerPanel`, a dropdown showing opposition players. Only available for defensive/midfield roles. Max 2 man-marking assignments per team to avoid UI complexity.

**Implementation**: Requires a small mapping structure (`Map<playerIdx, opponentId>`) in `TacticalConfig`. Anchor blending is a lerp — trivial cost.

### Tactics Screen Summary

| Addition | Location | Complexity | Engine Change? |
|----------|----------|-----------|---------------|
| Mentality preset | TeamPanel | Low | No — modifier layer |
| Attack channel | TeamPanel | Low | One pass-target check |
| Offside trap | TeamPanel (OOP) | Low | One tolerance change |
| Time wasting | TeamPanel | Low | No — modifier layer |
| Target man | PlayerPanel | Medium | Pass target + action bonus |
| Man-marking | PlayerPanel | Medium | Anchor blend + press bonus |

---

## 6. Engine Enhancements

### 6.1 Momentum System

**What**: A per-team `momentum` float (0..1, starting at 0.5) that shifts after significant events.

**Triggers**:
| Event | Shift |
|-------|-------|
| Goal scored | +0.15 (scorer), -0.15 (conceder) |
| Shot on target | +0.03 |
| Shot off target | -0.01 |
| Successful tackle | +0.02 |
| Foul conceded | -0.02 |
| Goal disallowed (offside) | -0.05 |
| Red card received | -0.20 |

**Decay**: Momentum decays toward 0.5 at a rate of 0.002 per tick (~6% per match-minute), so events matter most in the 2-3 minutes after they happen.

**Effect**: Momentum modifies the noise scale in `evaluateAction`:
```
effectiveNoise = baseNoise * (1.2 - momentum * 0.4)
```
- High momentum (0.8) → noise × 0.88 → more consistent, confident decisions
- Low momentum (0.2) → noise × 1.12 → more erratic, panicky play

**Implementation**: One float per team, updated on events, decayed each tick. No new data structures.

**Runtime cost**: Two float operations per tick (decay) + one multiply per action evaluation.

### 6.2 Referee Personality

**What**: A `RefConfig` object generated at match start with 3 parameters:

```typescript
interface RefConfig {
  readonly strictness: number;   // 0..1 — foul threshold modifier
  readonly cardThreshold: number; // 0..1 — how easily cards are shown
  readonly advantageLength: number; // ticks — how long advantage is played
}
```

**How it works**:
- `strictness` modifies the foul probability from `computeFoulProbability`: multiply the base foul rate by `0.7 + strictness * 0.6` (lenient ref = 70% of base rate, strict = 130%)
- `cardThreshold` affects whether a foul results in a card: yellow if `foulSeverity > (1 - cardThreshold) * 0.7`
- `advantageLength` determines how many ticks the engine waits before blowing for a foul when the fouled team retains possession

**Generated per match**: Random within sensible ranges, or configurable as a team instruction ("play aggressively" makes more sense when you know the ref).

**Runtime cost**: Two multiplies per foul event (rare). Zero per normal tick.

### 6.3 Injury Risk

**What**: Low-probability injury events correlated with fatigue, aggression, and tackle severity.

**When checked**: After every tackle attempt and every sprint (speed > 90% of max for > 3 consecutive seconds).

**Probability**:
```
tackleInjuryChance = 0.002 * (1 + fatigue) * (1 + oppAggression * 0.5)
sprintInjuryChance = 0.0005 * fatigue * (1 - stamina * 0.5) * (age > 30 ? 1.5 : 1.0)
```

**Severity**: If injury occurs, roll for type:
- 70%: **Minor** — player continues but with -0.15 pace and -0.10 to all physical attributes for the remainder
- 30%: **Forced substitution** — player must be replaced (auto-sub if bench available, otherwise play with 10)

**UI**: Injury icon on the player, notification in match events.

**Runtime cost**: One RNG roll per tackle (~5-10 per minute), one conditional check per sprinting player per tick (< 22 checks per tick, cheap).

### 6.4 Set Piece Routines

**What**: Configurable corner kick and free kick routines.

**Corner options** (3 presets):
1. **Near post** — delivery aimed at the near post area; tall players converge there
2. **Far post** — delivery aimed at the far post; second header opportunity
3. **Short corner** — ball played short to a nearby teammate for a cutback/cross

**Free kick options** (within shooting range, ~30m):
1. **Direct shot** — shoot at goal (uses `shooting` attribute)
2. **Whipped cross** — cross into the box (uses `crossing` attribute)
3. **Short pass** — play a quick free kick (uses `passing` attribute)

**Implementation**:
- Add a `setPieceConfig` to `TacticalConfig` with corner/free-kick presets
- During dead ball resolution, use the preset to determine ball trajectory and target zone
- Player anchors during dead balls are adjusted based on the routine (near post → 3 players at near post area, etc.)

**Runtime cost**: Only applies during dead ball ticks (rare). Zero impact on open play.

### 6.5 Second Ball Recovery

**What**: After tackles, aerial contests, and GK parries, the ball should sometimes bounce loose rather than cleanly transferring possession.

**Currently**: Tackle success = ball teleports to defender. Aerial winner = ball goes where they want.

**Proposal**:
- After a tackle, if `rng() > 0.6 + tacklingAttribute * 0.2`: ball becomes loose (no carrier) with a random velocity in a 3m radius
- After an aerial contest, header accuracy (`heading` attribute) determines whether the ball goes to the intended target or deflects
- After a GK parry (see handling proposal): ball velocity is `parryDirection * (1 - handling * 0.3)` — low handling = further, less controlled parry

**Impact**: Creates natural scrambles in the box, rebounds from corners, and contested second balls — hugely realistic for minimal code.

**Runtime cost**: One extra RNG roll per tackle and aerial (events that already use RNG).

### 6.6 GK Distribution Patterns

**What**: GKs currently just use the standard pass/kick logic. Dedicated distribution adds tactical depth.

**Options** (configurable per-team):
1. **Play short** — GK looks for short pass to a centre-back or full-back (uses `distribution` attribute)
2. **Go long** — GK launches a long ball to a target man or winger (distance 40-60m, accuracy = `distribution`)
3. **Quick throw** — GK throws to a nearby player to start a quick counter (only available after a catch, not a goal kick)

**Implementation**: A `gkDistribution` field in `TeamControls`: `'short' | 'long' | 'mixed'`. Modifies the GK's `PASS_FORWARD` / `PASS_SAFE` scoring and pass target selection.

**Runtime cost**: One conditional per GK ball-carrier tick (max one GK has the ball at a time).

---

## 7. Performance Impact Analysis

A critical constraint: the engine runs at 30 ticks/second in-browser with 22 players. Every proposal must fit within the existing tick budget.

### Attribute Additions (6 outfield + 4 GK)

| Impact Area | Cost |
|-------------|------|
| Memory | +10 floats per `PlayerState` × 22 players = 220 floats (~880 bytes). Negligible. |
| Per-tick reads | Each new attribute is read in 1-2 consideration functions. The existing pipeline already reads 10 attributes per action × 10 actions × 22 players = 2,200 reads/tick. Adding 6 attributes adds < 200 reads/tick in targeted paths. Negligible. |
| Fatigue system | `applyFatigueToAttributes` grows by 6 lines (4 new physical attenuations + 2 new technical). Same loop, just more assignments. |
| Player generation | Roster generation adds 10 more `Math.random()` calls per player. One-time cost at match start. |

**Verdict**: Zero measurable performance impact.

### Tactical Additions

| Feature | Per-Tick Cost |
|---------|--------------|
| Mentality | 0 — applied once when config changes, not per tick |
| Attack channel | 1 conditional per pass attempt (~5-10/tick) |
| Offside trap | 1 tolerance comparison per defender (4-5/tick) |
| Time wasting | 0 — modifier layer |
| Target man | 1 check per pass target evaluation (~5-10/tick) |
| Man-marking | 1 lerp per marked player per tick (max 2) |

**Verdict**: < 30 extra operations per tick. Completely negligible.

### Engine Enhancements

| Feature | Per-Tick Cost |
|---------|--------------|
| Momentum | 2 floats decayed + 1 multiply per action eval (22 × 10 = 220 extra multiplies) |
| Referee | 0 per tick (only on foul events) |
| Injury risk | 1 conditional per sprinting player (< 22/tick) + 1 per tackle (rare) |
| Set pieces | 0 during open play; small cost during dead balls only |
| Second ball | 1 RNG roll per tackle/aerial (already in RNG-heavy paths) |
| GK distribution | 1 conditional per tick (only when GK has ball) |

**Verdict**: ~250 extra lightweight operations per tick at worst. Current tick pipeline does thousands of vector operations, grid lookups, and score evaluations. This is < 5% overhead.

### Total Performance Budget

```
Current per-tick cost estimate:  ~15,000 operations (vector math, grid, AI scoring)
Proposed additions:              ~500 operations (attributes + tactics + enhancements)
Overhead:                        ~3.3%
```

**Well within budget. No frame-rate impact expected.**

---

## 8. Priority Matrix

Proposals ranked by **realism impact** vs **implementation effort** to guide development order.

### Tier 1 — High Impact, Low Effort (Implement First)

| Proposal | Impact | Effort | Notes |
|----------|--------|--------|-------|
| `finishing` attribute | High | Very Low | One lerp in shot resolution. Immediately differentiates strikers. |
| `acceleration` attribute | High | Low | Separates burst from top speed. Affects dribbling and runs. |
| Momentum system | High | Low | One float per team. Makes matches feel dynamic and alive. |
| Second ball recovery | High | Very Low | One RNG roll per tackle. Creates realistic scrambles. |
| Mentality preset | High | Very Low | Pure UI/modifier layer. No engine changes. |
| `concentration` attribute | Medium | Very Low | One multiply amplifier on existing noise. Late-game realism. |

### Tier 2 — High Impact, Medium Effort

| Proposal | Impact | Effort | Notes |
|----------|--------|--------|-------|
| GK `reflexes` + `handling` | High | Medium | Requires shot resolution rework, but scoped to GK paths only. |
| `heading` attribute | Medium | Medium | Needs aerial contest resolution update + header direction logic. |
| Set piece routines | High | Medium | Dead ball positioning + trajectory patterns. Scoped to dead ball ticks. |
| Attack channel preference | Medium | Low | One pass-target bias. Simple but meaningful. |
| Time wasting | Medium | Very Low | Modifier layer only. Big tactical value for close games. |

### Tier 3 — Medium Impact, Medium Effort

| Proposal | Impact | Effort | Notes |
|----------|--------|--------|-------|
| `agility` attribute | Medium | Low | Enhances dribbling distinctiveness. Plugs into existing tackle formula. |
| `crossing` attribute | Medium | Low | Zone-based pass accuracy switch. Enables wing play archetype. |
| GK `oneOnOnes` + `distribution` | Medium | Medium | Two specialist GK paths. Worth it alongside reflexes/handling. |
| Man-marking | Medium | Medium | Anchor blending + press modifier. Requires UI dropdown. |
| Offside trap | Medium | Low | One tolerance change. High-risk/high-reward tactical option. |
| Referee personality | Medium | Low | Per-match config. Variety without complexity. |
| GK distribution patterns | Medium | Low | One conditional per GK possession. Adds build-up variety. |

### Tier 4 — Lower Priority (Nice to Have)

| Proposal | Impact | Effort | Notes |
|----------|--------|--------|-------|
| Target man designation | Low-Med | Low | Niche tactical option. Mostly a pass-target bias. |
| Injury risk | Low-Med | Medium | Adds drama but requires sub-management and UI work. |

---

## Appendix: What NOT to Add

To keep the engine lean, these features were considered and **rejected** as too complex for too little gain:

| Feature | Reason to Skip |
|---------|---------------|
| **Weather system** | Requires modifying ball physics, passing accuracy, and movement for every tick. Heavy for cosmetic benefit. Could revisit later as a simple global friction modifier if desired. |
| **Individual player morale** | Overlaps with momentum system. Per-player morale tracking adds 22 floats + complex trigger logic for minimal visible difference. |
| **Detailed ball spin physics** | Swerving free kicks and curling crosses look great but require 3D vector math per tick. The current 2D+z model is sufficient. |
| **Multiple set piece routines per match** | One routine per type is enough. Allowing 3+ saved routines per corner/FK adds UI complexity without proportional tactical depth. |
| **Opposition instructions per player** | "Close down always", "show onto left foot", etc. — too granular. Man-marking covers the most impactful case; the rest is noise. |
| **Detailed fatigue model (muscle groups)** | Over-engineering. The current glycogen curve with stamina/work-rate modifiers is realistic enough. |
| **Pitch zones / heat maps** | Useful as a stats overlay but doesn't affect simulation realism. Add as a UI-only feature separately. |
