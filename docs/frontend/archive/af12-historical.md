# AF12 — historical summary

**Статус:** HISTORICAL — не очередь и не норматив  
**Период:** 2026-07-25  
**Program audits (representative):**  
- [af12-final](../../audit/2026-07-25-af12-final/snapshot.md)  
- [af12-uikit-agent-friendly](../../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md)  
- [af12-browser-matrix](../../audit/2026-07-25-af12-browser-matrix/snapshot.md)  
- [af12-dod-repeatability](../../audit/2026-07-25-af12-dod-repeatability/snapshot.md)  
- [af12-uikit-desktop-contract](../../audit/2026-07-25-af12-uikit-desktop-contract/snapshot.md)  
- [af12-uikit-responsive-owner](../../audit/2026-07-25-af12-uikit-responsive-owner/snapshot.md)  
- [af12-css-owner-map](../../audit/2026-07-25-af12-css-owner-map/snapshot.md)

Full prompt dump `af12-agent-friendliness-residual-prompts.md` (~1.1k LOC)
removed from the working tree. Recover via git history if a historical prompt
text is needed.

## What closed (production / process)

- Heat insulation geometry, range Form.useForm, NumberField unit chrome,
  Select popup classNames.
- CSS owner map; UI Kit desktop product contract **≥1000 px**.
- UI Kit responsive ownership split (page-shell / foundation / data / primitives
  / heatcalc); mixed `ui-kit.css` retired as owners landed.
- UI Kit `@media (max-width: 768px)` removal program; browser runner + matrix
  shell evidence.
- Scenario re-split pilot; P5–P9 context/test/owner extract queue closed in
  backlog Done index.

## Optional residuals (NOT pending unless user reopens queue)

These remain honest residual risk, not a second ACTIVE queue:

1. Dual-concurrent `test:agent-dod` under load (contention / flaky finds).
2. DoD wall median ≤120 s (observed ~150 s class).
3. Deep non–UI-Kit browser states beyond shell matrix (if full AF11 seal required).
4. Further large-test splits (e.g. ObjectWizard monolit) — optional qa slice.

Current `pending`: only [refactor-backlog.md](../refactor-backlog.md) (EMPTY
unless user adds a slice).

## What is NOT here

- no live scorecards
- no executable multi-prompt dump
- no authority to mark COMPLETE while backlog has pending
