# Wizard dual-form islands (React + CSS)

Цель: **ноль back-side effects** между тремя блоками dual-form.
Если AI/разработчик ломает границу — падают architecture tests с `WizardIsolationError` и полем **FIX**.

## Islands

| Island id | React root | CSS root | CSS file | Protected |
|-----------|------------|----------|----------|-----------|
| `heat-object-fields` | `HeatCalcObjectFieldsPanel` | `.heat-object-fields` | `heat-object-fields.css` | ✅ |
| `cable-algorithm` | `CableAlgorithmPanel` | `.object-wizard-cable-panel` | `cable-algorithm-panel.css` | — |
| `insulation-layers-table` | `InsulationLayersTable` | `.insulation-layers-table` | `insulation-layers-table.css` | ✅ hard |

Registry: `isolation/wizardIslands.ts`

## Composition (shell only)

```
ObjectWizard
├── dual-forms__heat
│   └── ObjectWizardWidePanel (shell)
│         ├── WizardZoneBoundary[heat-object-fields]
│         │     └── HeatCalcObjectFieldsPanel
│         └── WizardZoneBoundary[insulation-layers-table]
│               └── InsulationLayersTable
└── WizardZoneBoundary[cable-algorithm]
      └── CableAlgorithmPanel
```

Shell **composes** islands. Islands **do not import** each other.

## Rules (enforced)

1. **CSS** — every selector in an island CSS file includes that island’s root class.
2. **No CSS cross-import** between islands.
3. **No React import** between island components (forbidden edges in registry).
4. **Shell `styles.css`** — layout/chrome only; no global `.object-wizard-wide-panel .ant-form-item` without island scope.
5. **Protected table** — edit `InsulationLayersTable` / its CSS **only** on explicit user request.
6. **DOM** — `WizardZoneBoundary` dev-guard: zone must not contain a foreign island root.

## Errors for AI

```text
[WizardIsolationError:CODE] what broke
FIX: how to fix
ISLAND: which island
```

Run:

```bash
# unit architecture gate
npx vitest run src/__tests__/unit/wizard/wizardIsolation.architecture.test.ts

# or via package script
npm run test:wizard-isolation
```

## Where to edit

| Change | Touch |
|--------|--------|
| Heat field layout/typography | `HeatCalcObjectFieldsPanel.tsx` + `heat-object-fields.css` |
| Cable algorithm UI | `CableAlgorithmPanel.tsx` + `cable-algorithm-panel.css` |
| Layers table | **only on direct request** → `InsulationLayersTable.tsx` + `insulation-layers-table.css` |
| Dual-form grid shell | `ObjectWizard.tsx` / `ObjectWizardWidePanel.tsx` + shell rules in `styles.css` |
| Isolation rules | `isolation/wizardIslands.ts` + architecture test |

## Do not

- Style form controls via `.object-wizard-wide-panel .ant-form-item`
- Nest islands inside each other
- “Densify” dual-form by editing the layers table “заодно”
- Share one CSS file between heat and table
