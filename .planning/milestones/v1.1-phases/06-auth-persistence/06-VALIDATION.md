---
phase: 6
slug: auth-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x |
| **Config file** | vitest implicit via vite.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | AUTH-01 | unit | `npx vitest run server/routes/auth.test.ts -t "register"` | No - W0 | pending |
| 06-01-02 | 01 | 1 | AUTH-02 | unit | `npx vitest run server/routes/auth.test.ts -t "login"` | No - W0 | pending |
| 06-01-03 | 01 | 1 | AUTH-04 | unit | `npx vitest run server/routes/auth.test.ts -t "hash"` | No - W0 | pending |
| 06-02-01 | 02 | 1 | PERS-01 | integration | `npx vitest run server/routes/games.test.ts -t "save"` | No - W0 | pending |
| 06-02-02 | 02 | 1 | PERS-02 | integration | `npx vitest run server/routes/games.test.ts -t "load"` | No - W0 | pending |
| 06-03-01 | 03 | 2 | AUTH-03 | manual-only | Visual inspection | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `server/routes/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-04
- [ ] `server/routes/games.test.ts` — stubs for PERS-01, PERS-02
- [ ] `server/types.d.ts` — session type augmentation (prerequisite)

*Existing infrastructure covers test framework (Vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login screen shown on app load with New Game / Continue options | AUTH-03 | Visual UI gating — requires browser rendering | 1. Open app in browser 2. Verify login screen appears before hub 3. Verify "New Game" and "Continue" options visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
