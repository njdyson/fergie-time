# Fergie Time — How the Match Engine Works

A plain-English guide to every moving part in the simulation, written for anyone who wants to understand what's happening under the hood without reading the source code.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Game Clock](#2-the-game-clock)
3. [The Pitch](#3-the-pitch)
4. [What a Player Looks Like (Data)](#4-what-a-player-looks-like)
5. [What the Ball Looks Like (Data)](#5-what-the-ball-looks-like)
6. [The Tick — One Step of the Simulation](#6-the-tick)
7. [Formations and Tactical Shape](#7-formations-and-tactical-shape)
8. [How a Player Decides What to Do (The AI Brain)](#8-how-a-player-decides-what-to-do)
9. [The Eight Actions](#9-the-eight-actions)
10. [How Actions Get Executed](#10-how-actions-get-executed)
11. [Ball Physics](#11-ball-physics)
12. [Tackling and Physical Contests](#12-tackling-and-physical-contests)
13. [Goals and Scoring](#13-goals-and-scoring)
14. [Dead Balls (Throw-ins, Corners, Goal Kicks)](#14-dead-balls)
15. [Fatigue](#15-fatigue)
16. [Personality — Why Two Strikers Play Differently](#16-personality)
17. [Tactical Instructions — Per-Player Sliders](#17-tactical-instructions)
18. [Role and Duty — Positional Identity](#18-role-and-duty)
19. [Match Flow (Kickoff → Halftime → Full Time)](#19-match-flow)
20. [Statistics, Commentary, and Game Log](#20-statistics-and-commentary)
21. [Tuning Knobs — The Master Control Panel](#21-tuning-knobs)
22. [Rendering — How It All Gets Drawn](#22-rendering)

---

## 1. The Big Picture

The match engine is a real-time football simulation. It places 22 AI-controlled players on a pitch, gives each of them a brain that can evaluate eight possible actions, and lets them play a full 90-minute match (compressed into about 3 minutes of real time at 1x speed).

Every 33 milliseconds (30 times per second), the engine runs one **tick**. A tick is a single step of the simulation. During that tick:

1. Every player looks at the world around them.
2. Every player scores each of their eight possible actions.
3. Every player picks the highest-scoring action.
4. The engine moves players, moves the ball, resolves tackles, and checks for goals.
5. A new snapshot of the world is produced.

The renderer then draws that snapshot to a canvas element in the browser. Because the screen refreshes at 60fps but the simulation only ticks at 30fps, the renderer smoothly blends between the previous and current snapshot to keep movement fluid.

---

## 2. The Game Clock

- The simulation runs at **30 ticks per second** (one tick every ~33ms).
- A half lasts **2,700 ticks** (90 seconds of real time at 1x speed).
- A full match is **5,400 ticks** (3 minutes real time at 1x).
- 5,400 ticks maps to **90 simulated minutes** — so 60 ticks = 1 match minute.
- Speed can be set to 1x, 2x, or 4x. At 4x, a full match takes about 45 real seconds.

There's a safety valve: if the browser tab freezes or the computer lags, the engine caps the accumulated time at 200ms so it doesn't try to run hundreds of ticks in one burst (the "spiral of death" guard).

---

## 3. The Pitch

The pitch is a flat rectangle:

- **105 metres wide** (left to right, the x-axis)
- **68 metres tall** (top to bottom, the y-axis)
- The **home team** defends the left goal (x = 0) and attacks right.
- The **away team** defends the right goal (x = 105) and attacks left.
- Each goal is **7.32m wide** (centred on the pitch's y-midpoint at y = 34) and **2.44m tall** (the crossbar height matters because the ball has a vertical z-axis).

---

## 4. What a Player Looks Like

Every player is a data object with these properties:

### Position and Movement
- **position** — where they are on the pitch (x, y in metres)
- **velocity** — how fast and in what direction they're currently moving
- **formationAnchor** — their "home" position in the team's current formation

### Physical/Technical Attributes (all rated 0 to 1)
| Attribute | What It Does |
|-----------|-------------|
| **pace** | Top running speed. A pace-1.0 player sprints at 8 m/s. |
| **strength** | Wins physical duels, shielding radius, tackle contests. |
| **stamina** | How slowly fatigue accumulates. |
| **dribbling** | Ability to keep the ball when tackled. Affects dribble action score. |
| **passing** | Pass accuracy and the AI's willingness to attempt passes. |
| **shooting** | Shot quality and the AI's eagerness to shoot. |
| **tackling** | Success rate of tackles and reduces foul probability. |
| **aerial** | Jump height for headers. Jump = 2.5m × aerial attribute. |
| **positioning** | How strongly the player is drawn back to their formation position. |

### Personality Traits (all rated 0 to 1)
| Trait | What It Does |
|-------|-------------|
| **directness** | Prefers forward passes and runs over safe recycling. |
| **risk_appetite** | Willing to try ambitious actions (through balls, long shots). |
| **composure** | Reduces randomness in decision-making. |
| **creativity** | Favours unexpected, inventive actions. |
| **work_rate** | Runs more, tracks back more — also burns stamina faster. |
| **aggression** | More eager to press and tackle. |
| **anticipation** | Better at reading the game — boosts pressing and interceptions. |
| **flair** | Prefers dribbling and showboating. |

### Other Data
- **role** — positional role: GK, CB, LB, RB, CDM, CM, CAM, LW, RW, or ST
- **duty** — DEFEND, SUPPORT, or ATTACK (modifies action preferences)
- **fatigue** — 0 (fresh) to 1 (exhausted), accumulates over the match
- **teamId** — "home" or "away"

---

## 5. What the Ball Looks Like

The ball has:

- **position** — x, y on the ground plane
- **velocity** — speed and direction along the ground
- **z** — height above the ground (0 = on the ground)
- **vz** — vertical speed (positive = going up)
- **carrierId** — the ID of the player holding the ball, or `null` if the ball is loose

When a player has the ball (`carrierId` is not null), the ball moves with them. When it's loose, the physics engine takes over.

---

## 6. The Tick — One Step of the Simulation

Every tick runs this 15-step pipeline, in order:

| Step | What Happens |
|------|-------------|
| 1 | **Advance the clock** — check if we should move to halftime or full time. |
| 2 | **Break ticks** — if it's halftime or full time, skip physics and return early. If a dead ball is in progress (throw-in, corner, etc.), run the dead-ball routine instead. |
| 3 | **Accumulate fatigue** — every player gets slightly more tired. |
| 4 | **Apply fatigue effects** — reduce attributes and shift personality toward conservative play. |
| 5 | **Rebuild the spatial grid** — divide the pitch into 10m×10m cells and place each player in a cell. This lets us quickly find "who is near whom" without checking all 22 players against each other every tick. |
| 6 | **Compute formation anchors** — calculate where each player's "home position" should be right now, given the current formation, team shape settings, ball position, and who has possession. |
| 7 | **Build each player's world view** — create an "agent context" for each of the 22 players: who their teammates are, who the opponents are, where the ball is, how far they are from goal, how close the nearest defender is, etc. |
| 8 | **Every player picks an action** — the AI brain evaluates all 8 actions and selects the best one. |
| 9 | **Log decisions** — record what every player chose (used for the debug overlay and post-match audit). |
| 10 | **Execute actions** — move players, kick the ball, attempt tackles. This is the big step (see [Section 10](#10-how-actions-get-executed)). |
| 11 | **Separation forces** — push apart any players who are overlapping. |
| 12 | **Integrate ball physics** — if the ball is loose, apply gravity, friction, and bouncing. |
| 13 | **Check for goals** — did the ball cross the goal line between the posts and under the crossbar? Also check for out-of-play (throw-ins, corners, goal kicks). |
| 14 | **Record possession stats** — credit the team that currently has the ball. |
| 15 | **Build and return the new snapshot** — package up all the new positions, scores, and events into an immutable snapshot. |

---

## 7. Formations and Tactical Shape

### Base Formations

Five formations are available: 4-4-2, 4-3-3, 4-5-1, 3-5-2, and 4-2-3-1. Each defines 11 base positions on the pitch (the goalkeeper plus 10 outfield players).

For example, in a 4-4-2:
- GK at (5, 34) — 5m from the goal line, centred
- The back four at x ≈ 25 (spread across the width)
- The midfield four at x ≈ 45
- The two strikers at x ≈ 65

The away team's positions are mirrored (their x-coordinates are flipped: away_x = 105 - home_x).

### Live Adjustments

Every tick, the base positions are adjusted by several factors:

1. **Line Height** — slides the whole team forward or backward (up to ±15m). A "high line" pushes defenders up; a "deep block" pulls everyone back.

2. **Compactness** — squeezes or stretches the team toward its centre. High compactness = tight shape, low = spread out.

3. **Width** — stretches or narrows the team sideways. High = wide, low = narrow.

4. **Ball Influence** — everyone's position shifts 15% toward the ball's current x-position. This means the shape naturally slides left/right to follow play.

5. **Possession Shift** — when your team has the ball, everyone moves 10m forward. When defending, 5m backward.

6. **Rest Defence** — a configurable number of defenders (2, 3, or 4) are pinned behind the ball line even when attacking, to prevent leaving the back door open.

### Smooth Transitions

When the team switches between in-possession and out-of-possession shapes, the anchors don't jump instantly. They smoothly blend from old to new positions over about 4 seconds (120 ticks). This prevents players from teleporting when possession changes.

---

## 8. How a Player Decides What to Do

The AI uses a system called **Utility AI**. It's not a scripted state machine ("if X then do Y"). Instead, every tick, every player scores all eight possible actions on a 0-to-1 scale and picks the highest.

### The Scoring Process

For each action, there are several **consideration functions**. Each one looks at one aspect of the world and returns a score between 0 and 1:

- **0** means "this makes no sense" (hard disqualifier)
- **1** means "perfect conditions for this action"

The scores from all considerations are **multiplied together**. This means if ANY single consideration returns 0, the whole action scores 0. For example, "SHOOT" has a consideration "do I have the ball?" — if you don't, it returns 0 and SHOOT is immediately ruled out.

### Compensation Factor

Multiplying many numbers between 0 and 1 tends to produce very small results. To counteract this, a compensation formula is applied (from a 2015 Game Developers Conference talk on Utility AI):

```
final = product + (1 - product) × (1 - 1/N) × product
```

where N is the number of considerations. This lifts the scores back into a usable range.

### Bonuses Stacked On Top

After the base score is calculated, several bonuses are added:

1. **Personality bonus** — each action has personality weights. A player with high `directness` gets a bonus to PASS_FORWARD. A player with high `aggression` gets a bonus to PRESS.

2. **Noise** — a small random wobble is added, scaled by `(1 - composure)`. A composed player makes consistent decisions; an erratic one is unpredictable.

3. **Hysteresis bonus** — the action the player chose *last tick* gets a +0.36 bonus. This prevents jittery flip-flopping between two similarly-scored actions. Players commit to decisions for a while.

4. **Pass bias** — a flat +0.15 bonus to both pass actions. Without this, the AI tends to dribble too much.

5. **Goal urgency** — when near the opponent's goal, SHOOT and DRIBBLE get a bonus (up to +0.35 right at the goal line). This makes attackers more direct in the final third.

6. **Role/duty modifier** — a striker on ATTACK duty gets bonuses to SHOOT, DRIBBLE, and MAKE_RUN. A centre-back on DEFEND duty gets bonuses to PRESS and MOVE_TO_POSITION. These are small additive nudges (typically ±0.08 to ±0.12).

7. **Tactical multiplier bonus** — the per-player tactical sliders (risk, directness, press, etc.) add further nudges.

The action with the highest total score wins.

---

## 9. The Eight Actions

### On-the-Ball Actions (only available when you have the ball)

#### SHOOT — Strike at Goal
**Considerations:**
- Must have the ball (0 if not).
- Distance to goal — uses a steep curve: very high score inside the box, drops off sharply beyond about 25% of the pitch length.
- Player's shooting attribute.
- Are defenders nearby? Penalised, BUT the penalty is reduced when close to goal (a striker through on goal should still shoot even with a trailing defender).
- Is the goalkeeper off their line? If so, shooting becomes more attractive (chip opportunity).

#### PASS_FORWARD — Progressive Pass
**Considerations:**
- Must have the ball.
- Favours players in the middle third and beyond (the further from goal you are, the less urgent a forward pass feels).
- Player's passing attribute.
- How close is the nearest teammate? (Can't pass to nobody.)

#### PASS_SAFE — Sideways or Backward Pass
**Considerations:**
- Must have the ball.
- Higher score when a defender is very close (pressure = play it safe).
- Player's passing attribute.
- Nearest teammate distance.

#### DRIBBLE — Carry the Ball Forward
**Considerations:**
- Must have the ball.
- More attractive when a defender is nearby but not ON you (there's someone to beat).
- Player's dribbling attribute.
- More attractive the closer you are to goal.

#### HOLD_SHIELD — Protect the Ball, Wait for Support
**Considerations:**
- Must have the ball.
- Very high when a defender is right on you.
- Player's strength attribute.
- Nearest teammate (shielding buys time for support to arrive).
- Discouraged in the defensive third (don't just hold the ball in front of your own goal).

### Off-the-Ball Actions (when you don't have the ball)

#### MOVE_TO_POSITION — Return to Formation Position
**Considerations:**
- How far away from the formation anchor? The further, the stronger the pull.
- If you have the ball, this score drops to 10% (ball carriers shouldn't just stand in position).
- Player's positioning attribute.

#### PRESS — Chase the Ball / Pressure the Carrier
**Considerations:**
- Only when the OTHER team has the ball (0 if your team has it).
- Distance to ball — exponential decay (much stronger when close). When the ball is loose (no one has it), the "reach" of pressing is boosted by 2.6x.
- Field position — more pressing in the opponent's half.
- Player's tackling attribute.
- **Press rank** — if teammates are already closer to the ball, your press score is heavily penalised. This prevents the whole team chasing the ball. The penalty multiplies by 0.3 for each closer teammate (so the 3rd-closest player's score is only 0.3 × 0.3 = 9% of the closest player's score).
- Goalkeepers are penalised for pressing beyond their penalty area.

#### MAKE_RUN — Sprint Into Space
**Considerations:**
- Must NOT have the ball (runners are off-ball).
- Much higher when your team has possession (making yourself available). Very low (0.1) when defending.
- More attractive the closer you are to the opponent's goal.
- Player's pace attribute (fast players should run more).

---

## 10. How Actions Get Executed

Once every player has chosen an action, the engine processes them:

### Ball Pickup
If the ball is loose (no carrier) and on the ground (z < 2m), the closest player within **2.5 metres** (the `controlRadius`) picks it up — provided no cooldown is active. When a player picks up the ball, their action is overridden to HOLD_SHIELD (they stop and secure it before deciding what to do next tick).

### MOVE_TO_POSITION
The player steers toward their formation anchor using an "arrive" behaviour — they accelerate toward the target but decelerate as they get close, so they don't overshoot and jitter.

If the ball is loose and they're the closest teammate to it, they steer toward the ball instead (to contest it). If their team has the ball, they pull slightly toward the ball carrier (25% strength) to offer support.

### PRESS
The player runs full speed toward the ball. If the ball has a carrier, they chase the carrier. If the ball is loose, they chase the ball itself. Goalkeepers are clamped to stay inside their penalty area even when pressing.

### MAKE_RUN
The player sprints forward and diagonally (toward the centre of the goal) to find space ahead of the ball. The diagonal angle varies by how far they are from the goal line.

### PASS_FORWARD
1. **Find a target** — scan all teammates and score them by: how much forward progress the pass gains, how far the pass would be, and how clear the passing lane is. Only considers teammates who are within 10m behind the passer (no sending it to someone who'd have to run back for it). If no clear forward option exists, falls back to the nearest teammate with a clear lane.
2. **Check the passing lane** — for every potential target, check if any opponent is standing in the path. If an opponent is close to the passing line (within 5m), the lane is partially or fully blocked.
3. **Kick the ball** — set ball velocity to the pass direction × 24 m/s. Ball is released (carrierId becomes null).
4. **Long pass loft** — passes longer than 20m get a vertical kick (the ball is lofted into the air), so it arcs over defenders. The loft increases with distance.
5. **Target leading** — for long passes (>15m) to a teammate who is already running (speed > 2m/s), the pass is aimed slightly ahead of the teammate's current position (35% of the estimated travel time, up to 6m ahead).
6. **Avoidance tweak** — if a defender is near the passing lane, the direction is rotated about 15° away from the obstruction.

### PASS_SAFE
Same mechanics as PASS_FORWARD, but the target selection favours the nearest teammate weighted by lane clarity rather than forward progress.

### SHOOT
1. **Aim at goal** — target the centre of the opponent's goal with ±2m random scatter on the y-axis.
2. **Kick the ball** at 22 m/s with some vertical loft (vz = 2 + random × 3).
3. **Chip the keeper** — if the goalkeeper is more than 5m off their line and in the path of the shot, extra loft is added to chip over them.

### DRIBBLE
1. The carrier runs toward the opponent's goal at 70% of their max speed (dribbling is slower than sprinting).
2. **Evasion** — if a defender is within 8m, the dribble direction is blended with a perpendicular evasion vector (dodge sideways away from the defender). The closer the defender, the more evasion is applied (up to 60% evasion at point-blank range).
3. The ball stays glued to a point slightly ahead of the dribbler.

### HOLD_SHIELD
The player simply stops moving (velocity set to zero). They keep the ball. The engine's shielding system protects them from tackles as long as they're facing the right way (see [Tackling](#12-tackling-and-physical-contests)).

### After All Actions
- **Ball-carrier sync** — if a player has the ball and isn't dribbling, the ball position snaps to the player's position.
- **Tackle resolution** — any player doing PRESS within 4m of the ball carrier gets a tackle attempt (see next section).
- **Separation** — all 22 players are pushed apart if they overlap (within 2.8m), so they don't pile up on the same spot.

---

## 11. Ball Physics

The ball exists in **2.5D** — it moves across the pitch (x, y) and also has a height (z). This means you get lofted passes, bouncing balls, and chip shots.

### On the Ground (z = 0)
- **Rolling friction** — each tick, the ball's ground speed is multiplied by 0.985. So the ball gradually slows down. A pass at 24 m/s drops to about 18 m/s after 1 second, 14 m/s after 2 seconds.
- No vertical force applied — the ball stays on the ground.

### In the Air (z > 0)
- **Gravity** — pulls the ball down at 9.8 m/s² (real-world gravity).
- **Air drag** — ground speed is multiplied by 0.994 each tick (slightly less friction than rolling).

### Bouncing
When the ball hits the ground (z drops to 0):
- Its vertical speed is reversed and multiplied by 0.55 (the bounce coefficient). So it bounces back up but with only 55% of the energy.
- If the resulting bounce speed would be very small (below 0.1 m/s), the ball just stops bouncing and settles on the ground.

### Fast Ball Safety Check
Because the simulation ticks at 30 times per second, a ball moving at 24 m/s travels 0.8m per tick. That's usually fine, but occasionally the ball could "tunnel through" a player between ticks. To prevent this, a **continuous collision check** traces the ball's path and detects if it passed through any player's body during the tick.

---

## 12. Tackling and Physical Contests

### Tackle Attempts

When a pressing player is within **4m** of the ball carrier, a tackle is attempted (with a per-player cooldown of about 1 second between attempts).

**Shield check first** — if the carrier is performing HOLD_SHIELD, the engine checks if they're shielding the ball:
- The shield radius is 1.5m × the carrier's strength (so a strong player shields a wider area).
- The carrier must be positioned between the ball and the tackler (geometrically — the ball is behind the carrier relative to the challenger).
- If shielded: tackle automatically fails.

**If not shielded, calculate success probability:**

```
base = (tackler's tackling - carrier's dribbling + 1) / 2
```

This maps the attribute difference to a 0–1 range. Equal tackling and dribbling gives 0.5 (50/50). A big tackling advantage pushes it toward 0.8+.

Then multiply by an **angle modifier**:
- Tackling from the front: ×1.0 (clean)
- From the side: ×0.8
- From behind: ×0.5 (much harder)

Subtract a **distance penalty** — beyond 1m, the probability drops off with distance (using an inverse-quadratic curve). At 2m it's already noticeably harder; at 4m it's very unlikely.

Add a **strength modifier** — if the tackler is stronger than the carrier, up to +0.1 bonus; if weaker, up to -0.1.

Roll a random number. If it's below the probability: **tackle succeeds**.

**On success:**
- The ball is knocked loose at 6–10 m/s in the tackle direction.
- The carrier is pushed away at 3 m/s.
- Both players have brief cooldowns before they can interact with the ball again.

**Fouls:**
Checked independently from success. A foul is more likely when:
- Tackling from behind (~35% base chance) vs. the front (~5%).
- The tackler has low tackling skill (bad tacklers are clumsy).

On a foul, the ball is placed at the carrier's position with zero velocity (a simplified free kick).

### Aerial Contests

When the ball is in the air and two players are nearby:
- Each player's jump height = 2.5m × their aerial attribute.
- Both must be within 3m of the ball's ground position.
- If only one can reach the ball's height: they win automatically.
- If both can reach: score = (aerial × 0.6) + (strength × 0.3) + (random × 0.1). Highest score wins.

---

## 13. Goals and Scoring

After the ball physics are integrated, the engine checks: **has the ball crossed either goal line?**

A goal is scored if:
1. The ball's x-position is ≤ 0 (home goal) or ≥ 105 (away goal).
2. The ball's y-position is between 30.34 and 37.66 (inside the posts — the goal is 7.32m wide, centred at y = 34).
3. The ball's z-position is below 2.44 (under the crossbar).

If all three conditions are met: the score is updated, the ball is reset to the centre, and a kickoff dead ball begins for the team that conceded.

If the ball crosses the goal line but misses the goal (outside the posts or over the bar): it's a **goal kick** if the attacking team touched it last, or a **corner kick** if the defending team touched it last.

If the ball crosses the sideline (y < 0 or y > 68): it's a **throw-in** for the team that didn't touch it last.

---

## 14. Dead Balls

When the ball goes out of play (or a goal is scored), the engine enters a **dead ball state**. During this pause:

1. The ball is frozen at the restart position.
2. All players steer back toward their formation anchors (they reset their shape).
3. The designated taker moves to the restart spot.
4. After a set number of ticks (the pause duration), the taker receives the ball and play resumes.

| Restart Type | Pause Duration |
|-------------|---------------|
| Kickoff | ~1.5 seconds |
| Throw-in | ~0.8 seconds |
| Corner kick | ~1.2 seconds |
| Goal kick | ~0.8 seconds |

The taker is automatically chosen:
- **Goal kicks** — always the goalkeeper.
- **Throw-ins, corners, kickoffs** — the nearest outfield player to the restart position.

---

## 15. Fatigue

Every player gets tired over the course of the match.

### How It Accumulates

- **Before the 60th minute**: fatigue increases at 0.004 per minute (very slow).
- **After the 60th minute**: it jumps to 0.012 per minute (3× faster — the last 30 minutes hurt).
- **Stamina** adjusts this: a player with stamina = 1.0 accumulates fatigue at half the rate. A player with stamina = 0.3 accumulates it at 1.2× the rate.
- **Work rate** also matters: a tireless runner (work_rate = 1.0) uses 1.2× the energy. A lazy player (0.0) uses 0.8×.

### What Fatigue Does

As fatigue rises from 0 to 1:

**Physical attributes** (pace, strength, stamina) lose up to **50%** of their value at maximum fatigue. So a sprinter with pace = 0.9 at full fatigue effectively has pace = 0.45 — noticeably slower.

**Technical attributes** (dribbling, passing, shooting, tackling, aerial, positioning) lose up to **20%** at maximum fatigue. Skill degrades less than physicality.

**Personality shifts toward conservative play.** As fatigue rises, every personality trait blends toward a "tired default" (low directness, low risk, low aggression). An exhausted player plays safe, stays in position, and avoids ambitious actions.

### Substitutions

Substitutions are the remedy. A fresh substitute enters with fatigue = 0, full attributes, and their natural personality. Each team can make up to 3 substitutions, typically at halftime.

---

## 16. Personality — Why Two Strikers Play Differently

Even with identical attributes, two players can behave very differently because of personality.

Each action type has **personality weights** — a mapping from personality traits to bonus values. When the AI evaluates an action, it calculates a dot product between the action's weights and the player's personality vector. For example:

- **SHOOT** is weighted toward: risk_appetite, composure, directness.
- **DRIBBLE** is weighted toward: flair, creativity, risk_appetite.
- **PASS_SAFE** is weighted toward: composure (positive) and risk_appetite (negative).
- **PRESS** is weighted toward: aggression, work_rate, anticipation.

So a player with high `flair` and high `risk_appetite` will dribble more often. A player with high `composure` and low `risk_appetite` will pass safely. A player with high `aggression` and high `work_rate` will press relentlessly.

The personality bonus is additive — it's added on top of the base consideration score. It's typically a small nudge (0.02–0.10), but over many decisions it creates clear behavioural patterns.

---

## 17. Tactical Instructions — Per-Player Sliders

Each player has 7 tactical slider values (all 0 to 1, where 0.5 is neutral):

| Slider | Low (0) | High (1) | What It Changes |
|--------|---------|----------|----------------|
| **Risk** | Safe play | Ambitious play | Boosts SHOOT, PASS_FORWARD, DRIBBLE; penalises PASS_SAFE |
| **Directness** | Recycle possession | Push forward | Boosts PASS_FORWARD, MAKE_RUN; penalises PASS_SAFE |
| **Press** | Sit off | Press hard | Boosts PRESS (up to +0.25) |
| **Hold Up** | Release quickly | Shield and wait | Boosts HOLD_SHIELD (up to +0.20) |
| **Dribble** | Pass-first | Carry the ball | Boosts DRIBBLE; penalises both pass types |
| **Freedom** | Stay in position | Roam freely | Penalises MOVE_TO_POSITION; boosts MAKE_RUN |
| **Decision Window** | Patient decisions | Snap decisions | Affects how sticky the previous decision is (hysteresis) |

Each slider generates a bonus of up to ±0.2 per action type. These stack with role/duty modifiers and personality.

---

## 18. Role and Duty — Positional Identity

### 10 Roles

Each of the 11 players is assigned one of 10 positional roles:

**GK** (Goalkeeper), **CB** (Centre-Back), **LB** (Left-Back), **RB** (Right-Back), **CDM** (Central Defensive Midfielder), **CM** (Central Midfielder), **CAM** (Central Attacking Midfielder), **LW** (Left Winger), **RW** (Right Winger), **ST** (Striker)

The role is auto-assigned based on where the player's formation anchor sits on the pitch.

### 3 Duties

Each role can be set to one of three duties:

- **DEFEND** — prioritises PRESS, MOVE_TO_POSITION; penalises MAKE_RUN.
- **SUPPORT** — balanced.
- **ATTACK** — prioritises SHOOT, DRIBBLE, MAKE_RUN; penalises defensive actions.

The combination of role + duty creates specific behaviour profiles. For example:

- **ST on ATTACK**: gets bonuses to SHOOT (+0.12), DRIBBLE (+0.08), MAKE_RUN (+0.10). Plays like a poacher.
- **CB on DEFEND**: gets bonuses to PRESS (+0.10), MOVE_TO_POSITION (+0.08), minus on MAKE_RUN (-0.08). Stays put and tackles.
- **CAM on ATTACK**: gets bonuses to PASS_FORWARD (+0.10), DRIBBLE (+0.08). Creative playmaker.
- **LW on ATTACK**: gets bonuses to DRIBBLE (+0.10), MAKE_RUN (+0.08). Runs at defenders and makes overlapping runs.

---

## 19. Match Flow

### Pre-Match
The engine creates two squads of 16 players (11 starters + 5 bench). The game loop starts paused. The user sees the pitch with players in their starting positions.

### Kickoff
The user clicks "Kick Off" (or presses Space). The engine enters a KICKOFF dead ball: players move to their kickoff positions (one team in each half), the ball is placed at the centre spot. After ~1.5 seconds, the designated taker receives the ball and play begins.

### First Half
2,700 ticks of live play. The clock ticks up from minute 0 to minute 45.

### Halftime
At tick 2,700, the engine enters HALFTIME and latches there. The game pauses automatically. The user can:
- View match stats.
- Make up to 3 substitutions per team using the bench panel.
- Adjust tactics and formations.
- Click "Start 2nd Half" to resume.

### Second Half
Another 2,700 ticks. Teams swap attacking directions (the engine mirrors formation anchors). Fatigue from the first half carries over. Clock runs from minute 45 to minute 90.

### Full Time
At tick 5,400, the match ends. Final stats are displayed. A post-match audit checks the decision log for degenerate behaviour (e.g., if one action was selected more than 40% of the time across the whole match).

---

## 20. Statistics and Commentary

### Match Statistics
The engine tracks, per team:
- **Possession** (% of ticks each team had the ball)
- **Shots** (number of SHOOT actions executed)
- **Passes** (number of passes completed)
- **Tackles** (number of tackle attempts)
- **Corners, throw-ins, goal kicks** (counted from dead ball events)

These are displayed in an overlay on the pitch (toggle with the S key).

### Game Log
Every notable event is recorded with its tick number, match minute, the player involved, their role, and their position on the pitch:
- Passes (with distance, type, origin and destination)
- Shots (with distance to goal)
- Goals (with score at time of goal)
- Tackles (success/fail)
- Possession changes
- Set pieces (corners, throw-ins, goal kicks)
- Phase transitions (kickoff, halftime, full time)

### Commentary
The game log entries are converted to plain-English commentary lines, polled every 250ms and displayed in a scrolling panel:

- *"Home 7 CM plays a long ball to 9 ST (32m)"*
- *"Away 3 CB lays it off to 4 CB"*
- *"Home 10 ST shoots from inside the box!"*
- *"GOAL! Home 10 ST scores! (1-0)"*
- *"Home 5 RB wins the ball from 9 ST"*
- *"Corner kick Home — 7 CM to take"*

### Post-Match Summary
The game log can export a full JSON report including: all events, pass/shot totals, average distances, pass type breakdowns (forward/safe, short/medium/long), passes by role, shots by role, and a snapshot of all tuning values at the time.

---

## 21. Tuning Knobs — The Master Control Panel

All of the key numbers that control the simulation can be adjusted in real time via sliders. They're grouped into categories:

### Agent Decision Tuning
| Knob | Default | What It Does |
|------|---------|-------------|
| Hysteresis Bonus | 0.36 | How strongly players stick to their current action. Higher = less flip-flopping. |
| Pass Bias | 0.15 | Flat bonus to all pass actions. Higher = more passing, less dribbling. |
| Goal Urgency | 0.35 | How much being near goal boosts shooting and dribbling. |
| Noise Scale | 0.06 | How much randomness affects decisions. Scaled by (1 - composure). |

### Move-to-Position Tuning
| Knob | Default | What It Does |
|------|---------|-------------|
| Intercept | 0.04 | The baseline "stay in position" score when already at the anchor. |
| Slope | 0.65 | How urgently players return to position as they drift away. |

### Press Tuning
| Knob | Default | What It Does |
|------|---------|-------------|
| Decay K | 2.1 | How sharply pressing falls off with distance. Higher = only close pressing. |
| Norm | 25 | Distance (metres) that normalises the press curve. Higher = longer-range pressing. |
| Rank Decay | 0.3 | How much each closer teammate reduces your press score. Lower = fewer simultaneous pressers. |
| Loose Ball Boost | 2.6 | How much further players chase a loose ball vs. a held ball. |

### Ball Control
| Knob | Default | What It Does |
|------|---------|-------------|
| Control Radius | 2.5m | How close you must be to pick up a loose ball. |
| Kick Lockout | 15 ticks | How long after receiving the ball before you can pass/shoot again. |
| Pass Speed | 24 m/s | How fast passes travel. |
| Shoot Speed | 22 m/s | How fast shots travel. |

### Movement
| Knob | Default | What It Does |
|------|---------|-------------|
| Separation Radius | 2.8m | How close players can be before being pushed apart. |
| Separation Scale | 2.2 | How strong the push-apart force is. |
| Player Base Speed | 8.0 m/s | Sprint speed for a player with pace = 1.0. |
| Dribble Speed Ratio | 0.7 | Dribbling speed as a fraction of sprint speed. |
| Support Pull | 0.25 | How strongly off-ball teammates drift toward the ball carrier. |

### Dead Ball Pauses
| Knob | Default | What It Does |
|------|---------|-------------|
| Kickoff Pause | 45 ticks (~1.5s) | How long players reposition before kickoff. |
| Throw-in Pause | 25 ticks (~0.8s) | Repositioning time for throw-ins. |
| Corner Pause | 35 ticks (~1.2s) | Repositioning time for corners. |
| Goal Kick Pause | 25 ticks (~0.8s) | Repositioning time for goal kicks. |

---

## 22. Rendering — How It All Gets Drawn

The simulation produces data (positions, velocities, states). The renderer turns that data into pixels.

### Coordinate Mapping
The 105×68m pitch is scaled to fit the browser canvas with 20px padding. All simulation coordinates (in metres) are converted to pixel positions.

### Interpolation
The simulation ticks at 30fps but the screen draws at 60fps. To keep movement smooth, the renderer keeps the **previous** and **current** snapshots and blends between them. If we're 70% of the way between two ticks, each player is drawn at 70% of the way between their old and new positions.

### What Gets Drawn (in order)
1. **The pitch** — green grass, white lines, circles, penalty areas.
2. **Heatmap** (optional) — coloured density map showing where each team's players have been.
3. **Team labels** — "HOME →" and "← AWAY" showing which direction each team attacks.
4. **Players** — coloured circles (blue for home, red for away, green/yellow for goalkeepers). Each has a shirt number and role label. A small line shows their movement direction.
5. **Ghost anchors** (optional) — faint dashed circles showing where each home player's formation position is. Useful for seeing the tactical shape.
6. **Ball shadow** — an ellipse on the ground that fades as the ball gets higher.
7. **Ball** — a circle that gets larger and shifts upward as the ball gains height.
8. **Stats overlay** (optional) — a translucent panel showing live possession, shots, passes, and tackles.
9. **Tactical overlay** (when paused with tactics board open) — shows solid circles at formation positions, structural lines connecting defensive/midfield/forward lines, freedom radius circles, and arrows showing where positions will shift.

---

## Summary

The match engine is a continuous loop of **perceive → decide → act → physics → repeat**. Each player is an independent agent scoring 8 actions through multiple considerations, modified by their attributes, personality, role, duty, tactical instructions, and fatigue. The ball follows 2.5D physics with friction, gravity, and bouncing. Tackles are probabilistic contests between tackling skill and dribbling skill, modified by angle and distance. Goals are checked geometrically. Dead balls pause play and let players reset. Commentary narrates the key events. Everything runs at 30 ticks per second with smooth 60fps rendering.
