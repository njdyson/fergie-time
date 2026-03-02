# Feature Landscape

**Domain:** Browser-based emergent football management/simulation game
**Researched:** 2026-03-02
**Confidence:** MEDIUM (training data on FM series, Championship Manager, Hattrick, FIFA Manager, Sociable Soccer, and indie alternatives — no live web verification due to tool restrictions)

---

## Table Stakes

Features users expect from any football management/simulation game. Missing = product feels broken or incomplete.

### Match Engine

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Match plays out with visible events (goals, shots, fouls) | Core product promise — "watching" a match | Low (text) → Very High (3D) | For this project: 2D canvas top-down. Already scoped. |
| Goals scored by appropriate players (strikers score more) | Basic simulation validity | Medium | Fails if random; personality/attributes must matter |
| Match result influenced by team quality differential | Users test immediately — if a 5-star team can't beat pub minnows it feels broken | Medium | Agent attributes must differentiate quality |
| Home/away asymmetry (home advantage) | Every football fan expects this | Low | A morale/atmosphere modifier suffices |
| Halftime and full-time state | Natural breaks players use for tactical adjustments | Low | State machine milestone in match lifecycle |
| Match statistics (shots, possession, passes) | Immediate feedback on tactical effectiveness | Low | Accumulate from agent decisions already being made |
| Score display and scoreline updates in real time | Absolute minimum UI during a match | Very Low | — |

### Tactical System

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Formations (4-4-2, 4-3-3, 3-5-2 etc.) | The foundational vocabulary of football tactics | Medium | Formation anchors define positional pull |
| Ability to set formation before match | Every football game since CM94 has this | Low | Drag-and-drop already scoped |
| Defensive / attacking mentality slider | Broad tactical intent control; expected by any fan | Low | Maps to positional anchor offsets + press trigger thresholds |
| Role assignment per player (striker, CM, LB etc.) | Roles shape what actions the agent weights highly | Medium | Implemented via personality weight modifiers per role |
| Tactical adjustments at halftime | The "manager intervention" moment every user looks for | Low | UI hook into formation/instructions state |
| Substitutions during a match | Standard management expectation | Medium | Requires bench management + in-game swap logic |

### Squad Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Squad list with player names and positions | The "roster screen" — players need to feel real | Low | Name generation already scoped |
| Player attributes visible to manager | Without attributes you cannot make decisions | Low | Attribute display on squad screen already scoped |
| Fitness / fatigue tracking | Rotation decisions require fitness data | Low | Fatigue system already scoped |
| Match day squad selection (starting 11 + bench) | The single most played manager interaction in any football game | Low | — |
| Squad size constraint (not unlimited players) | Creates resource pressure and decision-making | Low | ~25-man squad realistic for v1 |

### Season Structure

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| League table tracking points, GD, position | Football's primary status indicator | Low | Accumulate results per team |
| Full fixture list for the season | Players plan ahead, rotate, set targets | Low | Generate round-robin schedule at season start |
| Win/draw/loss/goal tracking per team | Table fundamentals | Very Low | — |
| End of season resolution (champion, relegation placeholder) | Sense of narrative closure | Low | Even if only one league exists, a winner matters |
| Season-to-season continuity (carry squad forward) | Core of a "management" game | Medium | Persist state across season boundary |

### Player Attributes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Differentiated physical attributes (pace, strength, stamina) | Without this all players feel identical | Low | Already in design brief |
| Differentiated technical attributes (passing, shooting, dribbling) | Technical quality must matter | Low | Already in design brief |
| Player positions / preferred roles | Foundation of squad building | Low | — |
| Age displayed (younger vs older players) | Feeds development and retirement logic | Very Low | — |

---

## Differentiators

Features that set this product apart. Not expected by genre fans, but valuable and distinctive.

### Match Engine Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Emergent goals — no scripted outcomes | Goals arise from agent decisions, not event tables | Very High | This IS the core value proposition. FM uses event tables. CM used lookup tables. True emergence is rare. |
| Visible agent decision-making (why did that pass happen?) | Transparency into simulation that FM never offers | Medium | Debug overlay showing utility scores — even as an optional dev mode |
| Tactical counters that mechanically work | A low block actually reduces space for tiki-taka | High | Requires spatial reasoning in agent AI — already designed |
| Personality archetypes from parameter space, not hardcoded | "Maverick" vs "metronome" emerges from vectors | High | Already designed; this is genuinely novel vs genre |
| Fatigue-driven behavioral drift | Tired players become cautious/error-prone (personality erosion) | Medium | Already scoped; FM models this coarsely |
| 2.5D physics (headers, crosses with Z-axis) | Aerial play emerges naturally, not scripted | High | Already scoped; differentiates from pure 2D sims |
| Observable training sessions (mini-sims) | Watch how your training shapes behavior | High | Already scoped; unique vs any commercial product |
| Composure-scaled Gaussian noise | Player errors are realistic, not random | Medium | Already designed; elegant and novel |

### Tactical Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Drag-and-drop formation as real mechanical input | Formation positions directly define agent anchor targets | Medium | Already scoped; more expressive than template selection |
| Per-player personality-aware instructions | "Tell this player to be more direct" shifts their personality weight, not a flag | High | More granular and emergent than FM's player instructions |
| Tactical counter-system with visible proof | Win the tactical battle and the engine shows you why you won | Very High | Requires match statistics that illuminate the mechanism |

### Player Development Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Training drills that shift personality vectors | Drills shape who the player IS, not just what they can do | High | Already scoped; genuinely novel concept |
| Observable personality drift over a career | See a young risk-taker become a cautious veteran | Medium | Requires logging personality snapshots over time |
| Youth graduates with procedurally generated personalities | Each intake is genuinely unpredictable | Medium | Already scoped via name generation + personality generation |
| Procedural pixel art portraits from trait combinations | Visual identity tied to personality data | High | Already scoped |

### Season/Management Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Headless match simulation (fast-forward full season) | Run a full season in seconds; separate sim from render | Medium | Already designed as architectural constraint |
| Replayable match from different camera views | Since sim state is deterministic (or seedable), replay is feasible | High | Valuable but deferred — post-engine-proof |

---

## Anti-Features

Features to explicitly NOT build for v1 (some permanently, some deferred).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Transfer market | Adds economic simulation complexity before engine is proven; whole separate design problem | Deferred to v2; design squad screen to accommodate it later |
| Multiple divisions / promotion-relegation | Requires multi-league simulation, scheduling complexity, AI managers for all leagues | Single 20-team league for v1; stub the architecture |
| 3D rendering | Massively increases complexity; browser 3D needs WebGL/Three.js | 2D canvas top-down; Z-axis conveyed via shadow + sprite scale |
| Scripted match events / event tables | Directly contradicts the core value proposition (emergence) | Agent decisions produce all events |
| Preset tactical templates ("short passing", "counter") | FM's approach; trades mechanical depth for accessibility | Real formation + role + instruction system |
| Morale/happiness management subsystem | Deep rabbit hole; FM's morale model is notoriously opaque | Personality composure covers some of this; no separate morale model in v1 |
| Injury system | Another complex subsystem; FM-style injuries require medical staff, return timelines | Fatigue covers performance degradation; no injury screen in v1 |
| Contract negotiations | Requires financial modeling, agent relationships | Deferred with transfer market |
| Press conferences / media relations | Narrative layer that adds no simulation depth | Not aligned with engine-first design philosophy |
| Scouting / unknown attributes | Fog-of-war attribute system requires separate scouting simulation | Deferred; manager sees all attributes in v1 |
| Board objectives / job security | Management pressure narrative layer | Out of scope for single-player passion project |
| International management | Multiplies fixture calendar and squad management complexity | Single club, single league |
| Multiplayer / leagues | Architecture complexity for personal project | Single-player only |
| Mobile UI | Different interaction model (tap vs drag); separate design problem | Desktop browser only |
| AI manager tactical decisions | All 19 other teams in the league need AI managers making sensible decisions | Stub AI managers with simple heuristics; don't build FM-level AI for opposition managers in v1 |

---

## Feature Dependencies

```
Physics engine (2.5D ball)
  └── Agent movement (steering behaviors need ball position)
        └── Utility AI action evaluation
              └── Personality vectors (weight every score)
                    └── Tactical system (role assignments modify weights)
                          └── Formation anchors (define positional pull targets)
                                └── Drag-and-drop tactics board (player sets anchors)

Attributes (physical + technical)
  └── Success probability calculations in utility scores
        └── Fatigue system (attribute degradation over match)
              └── Personality erosion (tired player becomes cautious)
                    └── Training drills (shift attributes + personality over weeks)
                          └── Observable training sessions (watch mini-sims)

Match simulation
  └── Statistics accumulation (shots, possession, passes)
        └── Squad screen fitness/form display
              └── Halftime / substitution decisions by manager

Season structure
  └── Fixture list (round-robin schedule)
        └── League table (accumulate match results)
              └── Season boundary (youth graduates, retirements)
                    └── Squad carry-forward (persist state)

Procedural generation
  └── Player name generation
        └── Player personality generation (fresh each season/youth intake)
              └── Pixel art portrait generation (from personality/trait data)
```

Key: the match engine must be proven working before any management layer has value. Season structure is inert without a working match engine.

---

## MVP Recommendation

### Phase 1: Engine Proof (must work before anything else)
Prioritize everything the engine needs to produce a single playable match with emergent behavior:
1. 2.5D physics (ball movement)
2. Steering behavior movement (all 22 players)
3. Utility AI with 7 core actions
4. Personality vectors influencing every score
5. Fatigue + personality erosion within a match
6. 2D canvas rendering (top-down view)
7. Basic contact resolution (tackles, challenges)
8. Goal detection and scoreline display
9. Match statistics (shots, possession)
10. Halftime / full-time state

Success gate: "I watched a full match and it felt like football."

### Phase 2: Tactical Layer
Once the engine works:
1. Formation anchors as positional pull targets
2. Drag-and-drop tactics board
3. Role assignments modifying agent behavior
4. Per-player instructions (basic)
5. Halftime tactical adjustments
6. Substitutions

Success gate: "Changing formation visibly changes how the team plays."

### Phase 3: Management Shell
Once tactics are meaningful:
1. Squad screen (attributes, personality, fitness)
2. Procedural player name generation
3. Match day squad selection (11 + bench)
4. Fixture list and league table (single league, 20 teams)
5. AI manager heuristics for 19 opposition teams
6. Season boundary (champion declared)

Success gate: "I can play a full season and care who wins the league."

### Phase 4: Development Systems
1. Training drills (attribute + personality shifts)
2. Observable training sessions
3. Youth graduates with procedural personalities
4. Retirements
5. Pixel art procedural portraits
6. Season-to-season continuity

Success gate: "My squad has a distinct character after 3 seasons of development."

### Defer Indefinitely (not v1)
- Transfer market
- Multiple divisions
- Injury system
- Scouting / fog-of-war
- Morale subsystem
- Contract negotiations
- Replayable match feature

---

## Reference Games — What Each Contributes to Understanding

| Game | Key Feature | What Fergie Time Takes | What It Rejects |
|------|-------------|------------------------|-----------------|
| Championship Manager 01/02 | Deep attribute system, addictive squad building | Attribute vocabulary (pace, stamina, passing etc.) | Lookup tables for match resolution |
| Football Manager (2015–2025) | 2D match engine with real-time agents, deep tactical presets | Match engine concept (2D spatial), statistics model | Event tables, scripted outcomes, morale complexity |
| Hattrick | Browser-based simplicity, season structure | Season/fixture simplicity, browser delivery | Text-only match, no simulation depth |
| FIFA Manager | Transfer market, financial simulation | None for v1 | Financial simulation (explicitly deferred) |
| Sociable Soccer | Fast arcade-adjacent browser football | N/A — different genre | — |
| New Star Manager | Mobile-first, narrative focus | Pixel art aesthetic direction | Mobile-first, narrative/morale focus |
| Dino Dini's football concept | Agent-based football theory | Validation of agent-based approach | — |
| Sensible World of Soccer | Formation simplicity, fun-first | Formation screen simplicity | Arcade physics |

---

## Sources

- Training data on Football Manager series (Sports Interactive, Sega, 2003–2025) — MEDIUM confidence
- Training data on Championship Manager series (Eidos, 1992–2007) — MEDIUM confidence
- Training data on Hattrick browser game (2003–present) — MEDIUM confidence
- Training data on utility AI in games (general game AI literature) — HIGH confidence
- Training data on steering behaviors (Reynolds 1987, widely implemented) — HIGH confidence
- Project design brief context from `.planning/PROJECT.md` — HIGH confidence (primary source)

NOTE: WebSearch and WebFetch tools were unavailable in this research session. Confidence levels reflect training data quality. Recommend verifying current Football Manager feature set (FM25) against Sports Interactive's official site if fresh competitive analysis is needed.
