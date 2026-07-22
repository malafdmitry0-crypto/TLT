# Wizard CSS islands (no back-side effects)

> Full React + CSS isolation contract: **[WIZARD-ISLANDS.md](./WIZARD-ISLANDS.md)**  
> Architecture gate: `npm run test:wizard-isolation`

Three **isolated** style roots. Edit only the island you mean.

| Island | Root class | File | Component |
|--------|------------|------|-----------|
| Heat fields | `.heat-object-fields` | `heat-object-fields.css` | `HeatCalcObjectFieldsPanel.tsx` |
| Cable algorithm | `.object-wizard-cable-panel` | `cable-algorithm-panel.css` | `CableAlgorithmPanel.tsx` |
| Layers table | `.insulation-layers-table` | `insulation-layers-table.css` | `InsulationLayersTable.tsx` |

## Rules

1. **Selector root** — every rule in an island file must start with that island’s root class.
2. **No cross-imports** — do not `@import` one island into another.
3. **No broad parents** — never style form items via `.object-wizard-wide-panel .ant-form-item` alone (hits the table).
4. **Protected** — layers table: change only on explicit request.
5. **Shared tokens** — dual-form type scale is **duplicated** inside heat + cable roots (intentional isolation).

## Shell only (styles.css)

`styles.css` may own dual-form **layout shell** (grid heat|cable) and page chrome.
It must not restyle controls inside protected roots.
