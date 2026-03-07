# Feature Research

**Domain:** Player Development — Procedural pixel art portraits, drill scheduling, training ground sandbox for browser-based football management game (v1.2 milestone)
**Researched:** 2026-03-07
**Confidence:** MEDIUM

**Scope note:** This research covers ONLY the v1.2 Player Development milestone. The match engine, tactical system, squad management, persistence, and transfer market are already built. v1.1 feature research is preserved at prior revision. Existing infrastructure (TypeScript + Canvas + SQLite + Express) is given.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must ship to make the milestone feel complete. Missing any of these = product feels like a tech demo, not a feature update.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Player portrait displayed on squad screen | A portrait next to each player name is the minimum visual identity — players feel anonymous without it | MEDIUM | Render as small icon (e.g. 16x16 or 24x24 pixels, scaled up) next to player row. Must exist on squad screen and player profile. |
| Portrait persists across sessions | Portrait must be the same every login — a player who looks different each load feels broken | LOW | Deterministic: seed from player ID or UUID. Same seed = same portrait always. No storage needed if fully seeded. |
| Nationality visible on portrait | Players from different countries should look visibly different — this is the data the game already has | MEDIUM | Map nationality to skin tone palette + hair colour probability weights. GB → fair skin range, BR → wider range, NG → dark skin range, etc. Seeded RNG picks within the nationality band. |
| Training available between matches | Core management loop: if you can't improve your squad, training feels missing | MEDIUM | Training days scheduled automatically in the season calendar between match weeks (~2-3 days/week). Manager picks a squad-wide drill type from a defined list. |
| Visible stat improvement feedback | Players must feel like training actually does something — invisible improvement is demotivating | LOW | Show stat delta on player profile (e.g. "+1 Passing" after a training block). Could be a history log or a visual diff. |
| Drill categories map to specific attributes | "Passing drill" should improve passing stats — opaque or random attribution breaks trust | LOW | Each drill type maps to a named attribute group (see drill list below). Relationships must be legible to the player. |
| Training ground sandbox is accessible | The sandbox is listed as a milestone deliverable — it must be reachable from the game UI | HIGH | Entry point from hub screen or training screen. Launches a configurable engine run on a visible Canvas. |
| Sandbox runs the real match engine | Observation value comes from watching the actual autonomous agents — a fake simulation defeats the purpose | HIGH | Reuse `SimulationEngine` and Canvas renderer directly. No new simulation code needed — this is a re-entry point with custom initial state. |
| Sandbox is observation-only | No stat changes from sandbox runs — it is a testing/viewing tool not a training tool | LOW | Flag on sandbox-spawned engine instance. Suppress any training gain calls. |

### Differentiators (Competitive Advantage)

Features that set this project apart. Not required for the milestone to land, but high value relative to effort.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Portrait reflects player attributes (not just nationality) | A giant forward looks different from a nimble winger — visual identity tied to actual stats creates recognition | HIGH | Map physical attributes to body proportions or face features. E.g. high `strength` → broader jaw/face layer. Requires designing attribute-to-visual mappings. |
| Personality vector nudges from training | Repeated drill choices slowly shape who the player IS (not just what they can do) — ties training to the game's core philosophy | MEDIUM | Small bounded float shifts on personality vector (e.g. 5 sessions of "direct play" drills → slight +0.01 to `directness`). Cap total drift per season. This is unique to Fergie Time's architecture. |
| Drill intensity vs injury risk tradeoff | Manager must decide: push hard for faster gains or train light to preserve fitness — real tactical tension | MEDIUM | Intensity slider (light/standard/hard). Hard = faster improvement + small injury probability. Light = slower improvement, no risk. Ties into existing fatigue system. |
| Youth graduate visual continuity | Youth graduates appear with a portrait that matches the team's generation age — cohort feels like a class | LOW | Apply youth generation year as a seed modifier. Same generation year → similar portrait age markers (less variation in face marks etc). |
| Sandbox scenario presets | "Counter-attacking setup", "High press vs low block" — named starting configurations speed up experimentation | LOW | JSON preset file with formation, player stat distributions, starting positions. Manager loads preset, watches engine run. Very low code cost if scenario format is simple. |
| Training history log per player | See what a player has trained over last N weeks — builds a narrative of development | LOW | Store last 10 drill assignments per player in DB. Display on player profile. Small schema addition. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-player drill assignment | "Personalised training like FM" | PROJECT.md explicitly defers this ("Per-player drill assignment — squad-level training first"). Managing 25 individual drill schedules is a UI and logic burden for a solo project. Creates decision fatigue without proven value at this stage. | Squad-wide drill with intensity modifier per player group (e.g. youth vs senior). Add individual if squad-level proves too blunt. |
| AI-generated portraits (API-based) | "Better quality" | PROJECT.md explicitly excludes "AI image generation for portraits." External dependency, API costs, latency, inconsistent style. | Procedural generation from defined pixel art layer assets — consistent style, zero cost, no external dependency. |
| Animated portraits | "More lively" | Canvas rendering of animated pixel sprites during squad screen would add frame management, sprite sheet storage, and animation state for 25+ players simultaneously. High cost, low gameplay value. | Static portrait, animated only during match for player dot. |
| Real-time training (watch drills live) | "Immersive" | Training is an abstraction over a week — rendering it as a live simulation would require a new mini-engine or a severely simplified one. The sandbox already satisfies the "watch them play" desire. | Sandbox for live observation. Training output shown as stat diff on profile. |
| Complex injury system in v1.2 | "Realistic" | Injury system is listed in PROJECT.md active list for v1.2, but it interacts with training in ways that need careful scoping. If training triggers injuries, the injury recovery system must also exist to handle them. | Basic injury probability from high-intensity training only. Full injury system with recovery timelines can be its own sub-phase. |
| Multiple simultaneous drill types per training day | "More realistic" | Combinatorial complexity in improvement calculations. Unclear UI for multi-drill scheduling. Hard to communicate to the player what improved and why. | One drill type per training day. Simple, legible, fast to implement. |
| International breaks / squad callups | "Realism" | Multiplies fixture and calendar complexity. Out of scope per PROJECT.md. | Ignore international calendar for v1. |

---

## Drill Taxonomy (Core Design Decision)

Drill types are the vocabulary of the training system. This is the most important design decision in the milestone — everything else follows from it.

### Recommended Drill List

| Drill Name | Primary Attributes Improved | Secondary Effect | Notes |
|------------|---------------------------|-----------------|-------|
| Passing & Possession | `passing`, `vision` | Slight `composure` nudge | Squad-wide. High ball-contact sessions. |
| Finishing & Movement | `shooting`, `positioning` | None | Forward-weighted sessions. All players do it, forwards benefit more. |
| Defensive Shape | `tackling`, `positioning`, `marking` | Slight `work_rate` nudge | Reinforces positional discipline. |
| Set Pieces | `set_pieces` (new or existing) | `positioning` | Low frequency. Pre-match use only. |
| Physical Conditioning | `pace`, `stamina`, `strength` | Reduces fatigue baseline | Recovery from heavy training weeks. |
| Ball Control & Dribbling | `dribbling`, `agility` | Slight `flair` nudge | Benefits creative players most. |
| Aerial Work | `heading`, `jumping` | None | GK + tall outfield players benefit most. |
| Tactical Walkthrough | No direct stat gain | `composure`, `work_rate` nudge | Formation practice. Personality vector only. |

**Implementation note:** Improvement magnitude should follow: `gain = base_rate × (potential - current) × age_factor × drill_relevance_for_position`. Young players below their potential improve faster. This mirrors FM's hidden potential system but exposed simply through age and current-vs-potential gap.

---

## Portrait Generation Design (Core Technical Decision)

The procedural portrait is built from a layered composition of pixel art sprite parts ("paper doll" approach). This is the standard technique for this class of problem.

### Layer Stack (top to bottom render order)

```
[Hair/Hat layer]         ← seeded from nationality + player ID
[Face marks layer]       ← optional (stubble, scar) — seeded from ID
[Eye colour layer]       ← seeded from nationality palette
[Skin base layer]        ← seeded from nationality skin tone band
[Base face silhouette]   ← fixed template (or 2-3 variants for face shape)
```

### Seed Strategy

- Seed = hash(playerId) — deterministic, no storage required
- Nationality lookup maps to palette constraints: `{ skinToneRange: [lo, hi], hairColourWeights: [...], eyeColourWeights: [...] }`
- Seeded PRNG (mulberry32 or similar — no external dep) draws from those ranges

### Physical Attribute Mapping (Differentiator)

Optional extension: map `strength` → face width variant, `pace` → leaner face variant. Only if 2-3 face shape templates are authored. Low implementation cost if templates exist, zero value if templates not made.

### Rendering

- Portraits generated once per player using OffscreenCanvas, cached in memory
- CSS `image-rendering: pixelated` for sharp upscaling
- 16x16 or 24x24 source pixels, displayed at 48x48 or 64x64 on screen
- On page load: generate all 25 portraits for the player's squad in a single initialisation pass (~25ms estimated)

---

## Training Ground Sandbox Design

The sandbox is a re-entry point to the existing match engine with a custom initial state. It is NOT a new simulation.

### What Users Expect From a Sandbox

Based on football management game conventions and the project brief:

1. **Configure a scenario** — pick two teams (or use custom player stat distributions), set formation, set starting positions
2. **Press play** — engine runs visibly on the Canvas, same as a real match
3. **Observe emergent behavior** — watch how formations interact, how personality vectors manifest, how press vs possession plays out
4. **No consequences** — stats unchanged, no match result recorded to season

### Minimum Viable Sandbox

- Team picker: player's squad vs an AI squad (simplest) OR two AI squads
- Formation picker: reuse existing drag-and-drop tactics board OR load a preset
- "Run simulation" button: launches existing `SimulationEngine` with configured state, renders on Canvas
- Speed controls: normal speed / fast-forward (already exists in match engine via tick rate)
- "Stop / Reset" button

### Sandbox Presets (Differentiator if time allows)

```json
{
  "name": "High Press vs Low Block",
  "homeFormation": "4-3-3",
  "awayFormation": "4-5-1",
  "homePersonalityBias": { "work_rate": 0.9, "directness": 0.8 },
  "awayPersonalityBias": { "work_rate": 0.4, "composure": 0.9 }
}
```

Preset system is just a JSON array loaded on sandbox screen init. Very low implementation cost.

---

## Feature Dependencies

```
[Procedural Portrait Generation]
    |
    +--requires--> [Nationality field on PlayerState] (already in v1.1 differentiators — may exist)
    |
    +--requires--> [Seeded PRNG utility function] (new small utility — mulberry32 ~10 lines)
    |
    +--requires--> [Pixel art layer assets] (authored up-front — the one-time art cost)
    |
    +--enables---> [Portrait on squad screen]
    |
    +--enables---> [Portrait on player profile]
    |
    +--enhanced-by--> [Attribute-to-visual mapping] (differentiator, optional)

[Drill Scheduling]
    |
    +--requires--> [Training calendar integrated into season loop] (new — season.ts change)
    |
    +--requires--> [Drill-to-attribute gain formula] (new — training.ts or similar)
    |
    +--requires--> [Player potential values] (may need adding — currently may be implicit)
    |
    +--enables---> [Stat improvement feedback on player profile]
    |
    +--enhanced-by--> [Personality vector nudges] (ties training to core system — medium effort)
    |
    +--enhanced-by--> [Training history log] (DB schema addition — low effort)
    |
    +--conflicts-with--> [Per-player drill assignment] (explicitly deferred — do not build)

[Training Ground Sandbox]
    |
    +--requires--> [SimulationEngine accessible from sandbox screen] (already exists headlessly)
    |
    +--requires--> [Canvas renderer mountable outside match flow] (may need small refactor)
    |
    +--requires--> [Team/formation configuration UI] (reuse or simplify existing tactics board)
    |
    +--enhanced-by--> [Sandbox scenario presets] (JSON config — low effort differentiator)
    |
    +--must-NOT-affect--> [Season state / player stats] (flag: sandbox mode = no writes)

[Drill Scheduling] ──enhances──> [Training Ground Sandbox]
    (Sandbox lets you verify that trained attributes produce expected emergent behavior)

[Portrait Generation] ──independent-of──> [Drill Scheduling]
    (Can be built and shipped in any order — no shared dependencies)
```

### Dependency Notes

- **Nationality on PlayerState:** v1.1 research listed this as a differentiator. If it shipped in v1.1, portrait generation inherits it for free. If not, it must be added as the first step of portrait work.
- **Player potential values:** The FM-style growth formula requires a "potential" ceiling per player. This may not exist in the current model (which uses flat attributes). Must decide: hidden potential float per player generated at creation time, or derive potential from a formula (e.g. age-capped maximum). Generating potential at player creation time is the clean approach.
- **Canvas renderer mounting:** If the renderer currently assumes a specific DOM element ID hardcoded in `main.ts`, sandbox will need it parametric. Check `renderer.ts` or equivalent for the canvas target.
- **Training calendar in season loop:** `season.ts` currently drives the fixture schedule. Adding training days means interleaving training events between fixture matchdays. Must not break existing fixture ordering.

---

## Existing Code Touchpoints

| Feature | Files to Change | Nature of Change |
|---------|----------------|-----------------|
| Portrait generation | New `portraitGen.ts`, `squadScreen.ts`, `playerProfile.ts` | New generator + render calls on existing screens |
| Seeded PRNG | New `utils/prng.ts` | Tiny utility (~10 lines, mulberry32) |
| Nationality on PlayerState | `types.ts`, `teamGen.ts`, `playerGen.ts` | Add `nationality` field if not already added in v1.1 |
| Player potential | `types.ts`, `teamGen.ts` | Add `potential: number` (0-100) generated at creation |
| Training calendar | `season.ts` | Interleave training days in fixture schedule |
| Drill system | New `training.ts` | Drill definitions, gain formula, stat mutation |
| Drill UI | New `ui/screens/trainingScreen.ts` | Week-view calendar, drill picker, intensity toggle |
| Training stat feedback | `playerProfile.ts` | Show last training gain delta per attribute |
| Personality vector nudges | `training.ts`, `types.ts` (PersonalityVector) | Bounded mutation of personality floats post-drill |
| Training history log | `training.ts`, server `routes.ts`, DB schema | Store last N drill records per player |
| Sandbox screen | New `ui/screens/sandboxScreen.ts` | Scenario config, engine launch, canvas mount |
| Canvas renderer parametric | `renderer.ts` (or equivalent) | Accept canvas element param instead of hardcoded ID |
| Engine sandbox flag | `engine.ts` or `SimulationEngine` | `sandboxMode: boolean` — suppress stat write calls |

---

## MVP Definition

### Launch With (v1.2 Core)

These are the minimum features for the milestone to land as described in PROJECT.md.

- [ ] Seeded PRNG utility — foundation for deterministic portraits
- [ ] Pixel art layer assets authored (face base, skin tones, 3+ hair types, 2+ eye colours) — the one creative bottleneck
- [ ] `portraitGen.ts` — generates portrait from player ID + nationality seed, returns ImageData or canvas
- [ ] Portraits rendered on squad screen and player profile
- [ ] `player.potential` field added to all players (generated at creation, range 40-99)
- [ ] Nationality on PlayerState (add if not in v1.1)
- [ ] Training calendar integrated into season loop (~2-3 training days per match week)
- [ ] Drill definitions (~6 drill types) with attribute-to-gain mapping
- [ ] Drill gain formula: `gain = base × (potential - current) / 100 × age_factor`
- [ ] Training screen UI: calendar view, drill picker, confirm
- [ ] Stat improvement delta shown on player profile after training block
- [ ] Training ground sandbox screen accessible from hub
- [ ] Sandbox runs real engine with configurable team (own squad vs AI)
- [ ] Sandbox is observation-only (no season state writes)

### Add After Validation (v1.2.x)

Features to add once core is working and feeling right.

- [ ] Personality vector nudges from drill type (small bounded shifts) — ties training to core architecture
- [ ] Drill intensity toggle (light/standard/hard) with injury risk on hard — tactical tension
- [ ] Training history log per player in DB — builds narrative of development
- [ ] Sandbox scenario presets — named starting configurations for quick experimentation
- [ ] Portrait attribute mapping — body/face shape variant from `strength` or `pace`
- [ ] Stat improvement notification in season feed (e.g. "Martinez +1 Passing")

### Future Consideration (v2+)

- [ ] Per-player drill assignment — explicitly deferred per PROJECT.md
- [ ] Youth graduate visual cohort markers
- [ ] Season/career training stat summaries
- [ ] Sandbox recording/replay (save engine tick log for playback)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Procedural portrait on squad screen | HIGH | MEDIUM | P1 |
| Deterministic seeded portraits (persistent) | HIGH | LOW | P1 |
| Nationality-mapped skin/hair | MEDIUM | LOW | P1 |
| Training calendar in season loop | HIGH | MEDIUM | P1 |
| Drill type definitions + gain formula | HIGH | MEDIUM | P1 |
| Training screen UI | HIGH | MEDIUM | P1 |
| Stat delta feedback on profile | HIGH | LOW | P1 |
| Player potential field | HIGH | LOW | P1 |
| Sandbox screen (basic) | HIGH | MEDIUM | P1 |
| Sandbox observation-only flag | HIGH | LOW | P1 |
| Canvas renderer parametric | MEDIUM | LOW | P1 |
| Personality vector nudges from drills | HIGH | MEDIUM | P2 |
| Drill intensity + injury risk | MEDIUM | MEDIUM | P2 |
| Sandbox scenario presets | MEDIUM | LOW | P2 |
| Training history log | MEDIUM | LOW | P2 |
| Portrait attribute mapping (face shape) | LOW | HIGH | P3 |
| Stat improvement season feed | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v1.2 to ship
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Football Manager | PIX Football Manager (pixel art) | Pixel Manager Football | Our Approach |
|---------|-----------------|----------------------------------|------------------------|--------------|
| Player portraits | Licensed real photos | Pixel art avatar, manually set | Customisable "millions of combinations" — manual | Procedurally generated from player ID + nationality seed — zero manual work |
| Portrait persistence | Photo is tied to player ID | Saved character slot | Saved character slot | Deterministic from seed — no storage needed |
| Training drill types | 9 categories, deep sub-options, per-player | Not publicly documented | Not documented | ~6-8 squad-level drill types, legible attribute mapping |
| Training frequency | Weekly schedule with daily sessions | Not documented | Not documented | 2-3 training days per match week in season calendar |
| Stat growth model | Hidden CA/PA system, complex hidden attributes | Not documented | Not documented | Explicit `potential` float, legible formula |
| Training observation | None (training is fully abstract) | None found | None found | Sandbox: watch real engine run with any configuration |
| Personality from training | None (FM separates attributes from personality) | Not applicable | Not applicable | Personality vector nudges — unique to this architecture |

---

## Sources

- **PROJECT.md (HIGH confidence):** Explicit milestone targets, out-of-scope list, existing features baseline
- **Football Manager 2024 training guide (MEDIUM confidence):** https://www.footballmanagerblog.org/2024/09/football-manager-training-guide.html — drill categories, frequency patterns, intensity/workload model
- **FM Scout FM26 training schedules (MEDIUM confidence):** https://www.fmscout.com/c-fm26-training.html — weekly structure, session types
- **paperdoll (fralonra) pixel art composition system (MEDIUM confidence):** https://github.com/fralonra/paperdoll — slot/fragment layering architecture, Rust implementation shows the pattern clearly
- **Runtime procedural character generation article (MEDIUM confidence):** https://dev.to/goals/runtime-procedural-character-generation-161d — seed-based determinism, 64-bit seed = 18 quintillion unique characters, runtime generation
- **Pixel Manager Football (LOW confidence):** https://pixelmanagerfootball.com/ — manual customisation, millions of combinations via layering (confirms the paper doll approach for portrait variety)
- **Universal LPC Spritesheet Character Generator (LOW confidence):** https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/ — reference implementation of browser-side paper doll character generation
- **MDN — Crisp pixel art with image-rendering (HIGH confidence):** https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look — `image-rendering: pixelated` for canvas upscaling
- **MFL player development system (LOW confidence):** https://whitepaper.playmfl.com/game-mechanics/player-management/player-development — potential-based growth with age factor design pattern

---

*Feature research for: Fergie Time v1.2 Player Development*
*Researched: 2026-03-07*
