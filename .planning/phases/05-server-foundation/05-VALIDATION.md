---
phase: 5
slug: server-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x |
| **Config file** | Implicit (vitest reads vite.config.ts) |
| **Quick run command** | `npx vitest run server/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | SERV-01 | integration | `npx vitest run server/health.test.ts -x` | No -- Wave 0 | pending |
| 5-01-02 | 01 | 1 | SERV-04 | unit | `npx vitest run server/middleware.test.ts -x` | No -- Wave 0 | pending |
| 5-02-01 | 02 | 1 | PERS-03 | unit | `npx vitest run server/serialize.test.ts -x` | No -- Wave 0 | pending |
| 5-02-02 | 02 | 1 | PERS-04 | unit | `npx vitest run server/serialize.test.ts -x` | No -- Wave 0 | pending |
| 5-03-01 | 03 | 2 | SERV-02 | manual | Start both servers, curl through Vite port | N/A -- manual | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `server/serialize.test.ts` -- stubs for PERS-03, PERS-04
- [ ] `server/health.test.ts` -- stubs for SERV-01 (supertest or direct fetch)
- [ ] `server/middleware.test.ts` -- stubs for SERV-04
- [ ] Vitest config may need extending to include `server/` directory

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vite proxy forwards /api/* to Express | SERV-02 | Requires both dev servers running simultaneously | 1. Start Express on :3001, 2. Start Vite on :5173, 3. `curl http://localhost:5173/api/health` returns Express response |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
