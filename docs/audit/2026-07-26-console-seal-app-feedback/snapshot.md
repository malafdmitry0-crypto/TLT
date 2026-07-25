# Console seal — Ant App-bound feedback

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** shared  
**Production commit:** (see git log `appFeedback`)  

## Problem

Static `message.*` / `Modal.confirm` from `antd` cannot consume ConfigProvider
theme context → browser console:  
`[antd: message] Static function can not consume context…` (console seal FAIL).

## Fix

| Piece | Role |
|---|---|
| `frontend/src/feedback/appFeedback.tsx` | `AntdAppShell` + `appMessage` / `appModal` bound via `App.useApp()` |
| `App.tsx` | wraps routes with `AntdAppShell` (keeps `main.tsx` import cap) |
| feature call sites | import `appMessage as message` / `appModal` instead of static antd |

Hooks that already use `message.useMessage()` / `Modal.useModal()` (e.g.
`useElectricalAssignmentController`) left on native antd hooks.

## Proof

```bash
cd frontend && npm run test:agent-gates   # PASS
# focused message mocks
npx vitest run src/__tests__/unit/pages/electrical/useElecCalc*.test.tsx \
  src/__tests__/unit/pages/electrical/useElectricalBatchJobTracker.test.tsx --project unit
# 34/34 PASS

# live stack console seal (guest routes)
# / /workspace /workspace/heat-calc /ui-kit → antd_static=0 warn_err=0
```

## Agent rule

Documented in `frontend/AGENTS.md` + ui-kit README: use `@/feedback/appFeedback`.

## Residual

- Optional: migrate remaining rare static paths if any reappear in new code
  (architecture note only; prefer lint later).
