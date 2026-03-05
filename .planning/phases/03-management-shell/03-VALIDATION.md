---
phase: 3
slug: management-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.3 |
| **Config file** | `vite.config.ts` (root) |
| **Quick run command** | `npx vitest run src/season/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/season/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | SQD-06 | unit | `npx vitest run src/season/nameGen` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | SQD-03 | unit | `npx vitest run src/season/fixtures` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 0 | SQD-04 | unit | `npx vitest run src/season/leagueTable` | ❌ W0 | ⬜ pending |
| 3-01-04 | 01 | 0 | SQD-05 | unit | `npx vitest run src/season/season` | ❌ W0 | ⬜ pending |
| 3-01-05 | 01 | 0 | SQD-02 | unit | `npx vitest run src/season/` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | SQD-06 | unit | `npx vitest run src/season/nameGen` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | SQD-03 | unit | `npx vitest run src/season/fixtures` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | SQD-04 | unit | `npx vitest run src/season/leagueTable` | ❌ W0 | ⬜ pending |
| 3-02-04 | 02 | 1 | SQD-05 | unit | `npx vitest run src/season/season` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | SQD-01 | unit | `npx vitest run src/ui/panels/squadPanel` | ✅ | ⬜ pending |
| 3-03-02 | 03 | 2 | SQD-02 | unit | `npx vitest run src/season/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/season/fixtures.test.ts` — stubs for SQD-03 (round-robin generation, 38 matchdays)
- [ ] `src/season/leagueTable.test.ts` — stubs for SQD-04 (points, GD, sort order)
- [ ] `src/season/season.test.ts` — stubs for SQD-05 (season end, champion detection, season 2 reset)
- [ ] `src/season/nameGen.test.ts` — stubs for SQD-06 (first+last name from nationality pools)
- [ ] `src/season/teamGen.test.ts` — attribute ranges per tier (strong/mid/weak)
- [ ] Squad validation unit test in `src/season/season.test.ts` — covers SQD-02 (11 starters, 1 GK, 5 bench)
- [ ] Quick-sim performance test — one engine run to FULL_TIME < 500ms (risk mitigation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Squad screen visually shows player attributes and personality traits | SQD-01 | UI rendering, canvas layout not unit-testable | Open squad panel, verify all 25 players show name, position, age, fitness, key attribute |
| Fixture list readable in UI | SQD-03 | HTML/canvas rendering | Navigate to fixtures screen, confirm upcoming/past matchdays visible with home/away teams |
| League table renders in correct order | SQD-04 | Canvas rendering | After simulating matches, verify table rows sorted by pts, then GD, then GF |
| Season end champion declaration overlay | SQD-05 | Visual overlay | Play to season end, verify champion name displayed on full-time overlay |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
