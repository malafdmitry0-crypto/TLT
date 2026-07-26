# P-TEST-08 — inline-form-dependencies journey split

**Status:** **PASS** (list proof)  
**UTC:** 2026-07-26  
**Owner:** qa  
**Production/test commit:** `8560d79`  

## LOC

| File | LOC |
|---|---:|
| monolit (removed) | 643 |
| `helpers/inline-form-dependencies.ts` | 236 |
| `…save-stays-open.spec.ts` | 41 |
| `…pipe-matrix.spec.ts` | 154 |
| `…insulation-layers.spec.ts` | 101 |
| `…tank-payload.spec.ts` | 113 |
| `…climate-create.spec.ts` | 79 |

**tests:** 11/11 titles listed via `playwright test inline-form-dependencies --list`

## Proof

```bash
cd e2e && npx playwright test inline-form-dependencies --list
# Total: 11 tests in 5 files
```
