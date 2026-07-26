# Frontend agent metrics — **CURRENT BINDING CARD**

**Status:** **BINDING** — единственная «текущая» оценка agent-friendliness  
**UTC:** 2026-07-26T15:17Z  
**Source HEAD:** `a9b4cb3` (`a9b4cb3d7a3eaeec0e78c3222f0976f21e871c80`)  
**Host:** local · Node **v23.5.0** (now inside `engines`)  
**Product viewport:** desktop `>=1000 px`; mobile out of scope  

**Supersedes:** [2026-07-26-agent-metrics-refresh](../2026-07-26-agent-metrics-refresh/snapshot.md)  
(that card was **8.1/10** at `452ec99` and must not be quoted as current).

Supporting evidence (not competing scores):

| Snapshot | Role |
|---|---|
| [open-six-close](../2026-07-26-open-six-close/snapshot.md) | dual-safe **143.68 s**, engines, bundle budget, LOC progress |
| [dod-wall-profile](../2026-07-26-dod-wall-profile/snapshot.md) | earlier dual-safe **147.34 s** |
| [U0 code seal](../..) `5cecc4b` | a11y/useForm/overflow **code** landed; **live browser re-seal NOT RUN** |

---

## 1. Weighted score (evidence-adjusted)

Same weights as the superseded refresh card. Scores updated only where later
commits + measured dual-safe / static recompute justify it. **Unrun browser
is not marked green.**

| Area | Weight | Score | Basis at `a9b4cb3` |
|---|---:|---:|---|
| Code and architecture | 20% | **9.2** | gates/ratchets; Ant import shrink-only baseline **139**; type-escape empty; Arch ESLint |
| Clarity and locality | 15% | **8.9** | prod TS/TSX **476** files; `>=400` **0**; max **397** (`useHeatCalcNormalGlideController`); `<=300` **90.1%** |
| Agent workflow and evidence | 15% | **8.5** | `agent:scope`, AGENTS, prompts (DoD wall, browser U0, LOC cap); lint Arch+`max-warnings 0` |
| Test/build reliability | 15% | **8.9** | lint **0 warnings** (`f9bcd28`); dual-safe DoD **PASS**; bundle budget gate present |
| Feedback speed | 10% | **7.6** | gates ~**8–12 s**; dual-safe **143.68 s** (was 214–255); target **≤120 still OPEN** |
| Browser/UI acceptance | 15% | **6.5** | U0 **code** in `5cecc4b`; **live re-seal BLOCKED/NOT RUN** after that HEAD → not 8+ |
| Reproducibility/toolchain | 10% | **8.2** | Node **23** in `engines`; lockfiles; `budget:bundle` |
| **Weighted agent-friendly** | **100%** | **8.3/10** | see formula note |

**Formula check:**  
`0.20×9.2 + 0.15×8.9 + 0.15×8.5 + 0.15×8.9 + 0.10×7.6 + 0.15×6.5 + 0.10×8.2`  
`= 1.84 + 1.335 + 1.275 + 1.335 + 0.76 + 0.975 + 0.82 =` **8.34 → report 8.3**

**Confusion (lower better):** **2.2/10** (was 2.5) — binding card + engines + lint clarity; still held up by dual score history and unsealed browser.

**Machine collector 8.34 at old HEAD:** obsolete as sole truth; browser/lint signals must stay human-adjusted until collector ingests them.

---

## 2. What changed since 8.1 (`452ec99` → `a9b4cb3`)

| Item | At 8.1 card | Now |
|---|---|---|
| Lint | 0 err / **5 warn** | **0 / 0**, `--max-warnings 0`, Arch ESLint |
| Dual-safe / full DoD wall | ~214–255 s | **143.68 s** dual-safe (≤120 open) |
| Node engines vs runtime 23.5 | mismatch | **`^23.0.0` included** |
| Browser a11y/console/overflow | **red measured** | code fix landed; **not re-measured** |
| Bundle | no budget gate | `budget:bundle` (ui-kit cap) |
| Ant direct imports | 139 (observation) | shrink-only **ratchet** baseline 139 |
| Prod `>=400` LOC | 0 | **0** (recomputed) |

---

## 3. Still open (do not claim closed)

1. **Browser U0 live re-seal** — prompt: [browser-u0-a11y-console-overflow.md](../../frontend/prompts/browser-u0-a11y-console-overflow.md)  
2. **DoD wall ≤120 s** — prompt: [dod-wall-under-120.md](../../frontend/prompts/dod-wall-under-120.md)  
3. Optional: LOC cap ≤350 on remaining heavy **test** contexts  

---

## 4. How agents must use metrics

```text
CURRENT score/card  →  this file only
Historical 8.1      →  docs/audit/2026-07-26-agent-metrics-refresh/ (provenance)
Do NOT               →  quote 8.1 as “now”
Do NOT               →  invent a second concurrent “current” score elsewhere
Next refresh         →  new dated audit folder + mark THIS file superseded
```

---

## 5. Proof commands used / cited

| Check | Result | Source |
|---|---|---|
| Static LOC recompute | 476 files; max 397; ≥400 = 0 | this snapshot host |
| dual-safe DoD | **PASS 143.68 s** | open-six-close |
| lint max-warnings 0 | **PASS** (landed `f9bcd28`) | gates on later HEADs |
| engines includes 23 | **PASS** | `frontend/package.json` |
| Browser matrix / axe | **NOT RUN** on binding HEAD | Docker/runtime blocked in open-six |

```bash
cd frontend
npm run test:agent-gates
npm run test:agent-dod:dual-safe   # last measured 143.68s @ open-six
# Browser seal when stack up — see browser-u0 prompt
```
