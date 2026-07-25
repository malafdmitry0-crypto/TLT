# Agent scope resolver + composition shells + DoD profile

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** tooling / ui  

## Deliverables

### 1. `npm run agent:scope -- <path>`

Script: `scripts/agent-scope.mjs`

Output contract: `owner`, `zone`, `public_entrypoint`, `state_owner`,
`focused_tests`, `architecture_gates`, `full_dod_required`, `browser_profiles`,
`source_rules`.

```bash
npm run agent:scope -- src/components/ui-kit/UiPrimitives.tsx
node scripts/agent-scope.mjs --self-test   # 10 fixtures PASS
node scripts/agent-scope.mjs --coverage    # 0 unowned production files
```

### 2. Composition Storybook shells

`frontend/src/components/ui-kit/PageChrome.stories.tsx`  
Title: `UI Kit/Composition/PageChrome`

- Empty workspace  
- Loading workspace  
- Error workspace  

No feature/domain imports. Orphan vs barrel coverage is intentional.

### 3. DoD wall profiler

```bash
npm run agent:dod:profile
# optional: --out=docs/audit/.../dod-profile.json
```

Runs dual-safe concurrent DoD and prints wall + bottleneck guidance.
Aspirational target **≤120s** remains open (integration long pole); script is
observational only.

## Proof

- agent-scope self-test + coverage: PASS  
- storybook:coverage:strict: 13/13 public components  
- test:agent-gates: PASS  

## Residual

- Wire `agent:scope` into human/agent runbooks when starting a slice.
- Run `agent:dod:profile` on a quiet machine and attach JSON when chasing ≤120s.
