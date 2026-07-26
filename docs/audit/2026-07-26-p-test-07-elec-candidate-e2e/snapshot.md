# P-TEST-07 — electrical-candidate-selection journey split

**Status:** **PASS** (list proof)  
**UTC:** 2026-07-26  
**Owner:** qa  
**Production/test commit:** `97c6d96`  

## LOC

| File | LOC |
|---|---:|
| monolit (removed) | 667 |
| `helpers/electrical-candidate-selection.ts` | 276 |
| `…mark-folder.spec.ts` | 135 |
| `…auto-dedupe.spec.ts` | 86 |
| `…param-change.spec.ts` | 133 |
| `…uniqueness.spec.ts` | 121 |

**tests:** 10/10 titles listed via `playwright test electrical-candidate-selection --list`

## Proof

```bash
cd e2e && npx playwright test electrical-candidate-selection --list
# Total: 10 tests in 4 files
```
