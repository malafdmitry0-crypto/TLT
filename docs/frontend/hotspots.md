# Самые проблемные места фронта

**Срез:** 2026-07-23 (LOC ориентировочные)

## P0 — god-shells

| Место | ~LOC | Почему |
|---|---:|---|
| `pages/ElecCalcPage.tsx` | 1879 | ЭР UUID, assignments, batch, candidates, tables, modals |
| `pages/HeatCalcPage.tsx` | 993 | table + Excel + wizard + drafts + prefs |
| `pages/SpecificationPage.tsx` | 1005 | flat, мало extract namespace |
| `components/heatcalc/HeatCalcNormalGlideGrid.tsx` | 1191 | grid god-component |

## P0 — CSS

| Место | ~LOC | Почему |
|---|---:|---|
| `styles.css` | ~7189 | глобальный dump; layout-регрессии |
| Wizard dual-form | islands | хрупкий контракт; kit ещё не runtime SoT |

## P1 — домены и связи

| Место | Почему |
|---|---|
| `pages/electrical/*` (~77 files) | хорошая декомпозиция, но inverted deps |
| `components/electrical/*` → `pages/electrical/*` | UI зависит от page-layer |
| UUID ЭР / assignment / batch | бизнес + races |
| Heat Excel / inline draft | много state machines |
| `utils/objectWizardUtils.ts` (~757) | mm↔m; ошибки = wrong calc |

### Inverted imports (на срез)

```text
components/electrical/ElectricalCandidateFieldRenderer.tsx → pages/electrical/*Model
components/electrical/ElectricalColumnFilterDropdown.tsx → pages/electrical/*
components/layout/Sidebar.tsx → pages/electrical/useLegacyElectricalVariantContext
```

## P1 — таблицы / колонки

- `utils/heatCalcTableColumns.ts`, `hooks/useHeatCalcTableColumns.tsx`
- `utils/electricalTableColumns.ts`, candidate columns
- Column settings modals (heat/elec ~600–700 LOC)

Логика размазана utils / hooks / pages / components.

## P2 — структура

| Место | Проблема |
|---|---|
| `utils/` flat | префиксы вместо ownership |
| hooks в 2–3 местах | `hooks/` + pages/*/use* |
| ui-kit vs form-controls | два пути; kit re-export |
| Admin Formulas/Database | god-pages, реже трогают |

## Топ-5 по ROI

1. ElecCalcPage shell  
2. styles.css / dual-form discipline  
3. HeatCalcPage + Glide  
4. SpecificationPage namespace  
5. inverted components→pages  

## Что относительно здорово

- pure `elecCalc*Model.ts`
- wizard isolation tests
- UI kit + e2e parity
- namespaces `pages/heatcalc`, `pages/electrical`
