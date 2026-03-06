---
phase: 7
slug: squads-names
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.3 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/season/ -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/season/ -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SQD2-01 | unit | `npx vitest run src/season/teamGen.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SQD2-02 | unit | `npx vitest run src/season/season.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | SQD2-03 | unit | `npx vitest run src/season/teamGen.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | SQD2-04 | manual | Manual verification (DOM rendering) | N/A | ⬜ pending |
| 07-02-01 | 02 | 1 | NAME-01 | unit | `npx vitest run src/season/nameService.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 1 | NAME-02 | unit | `npx vitest run src/season/nameService.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 1 | NAME-03 | unit | `npx vitest run src/season/nameService.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/season/nameService.test.ts` — stubs for NAME-01, NAME-02, NAME-03
- [ ] Update `src/season/teamGen.test.ts` — update assertions from 16 to 25 players, add shirtNumber tests (SQD2-01, SQD2-03)
- [ ] Update `src/season/season.test.ts` — update bench validation from 5 to 7 (SQD2-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Squad screen renders 25 rows with selection toggles | SQD2-04 | DOM rendering in terminal UI, no jsdom | Load game, navigate to squad screen, verify 25 players visible with correct positions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
