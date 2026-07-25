# TLT UI component library

This directory is the public, feature-agnostic UI layer. This README is the
source of truth for the current runtime API, Storybook setup, tokens and usage
examples. Architectural boundaries and the form-layout contract live in
[`docs/frontend/ui-kit.md`](../../../../docs/frontend/ui-kit.md).

The `/ui-kit` page uses this library as the reference showcase. The HeatCalc
wide dual-form (`HeatCalcObjectFieldsPanel`) currently renders its three slots
through `CompactFieldGrid` + `antFormAdapter`.

## Storybook

Каталог public primitives без feature/API:

```bash
cd frontend
npm run storybook          # http://127.0.0.1:6006
npm run build-storybook    # static → storybook-static/
npm run storybook:coverage # barrel exports vs CSF (add :strict to fail on gaps)
```

Preview mirrors app runtime: `tokens.css` + `StyleProvider hashPriority="low"` +
`ConfigProvider`/`appTheme`. Stories live in `*.stories.tsx` next to kit
components (including form-control façades re-exported from this barrel).

**MCP / agent contract:** every public component export must have its own
`UI Kit/<Name>` story file so Storybook MCP lists a first-class component ID
(e.g. `ui-kit-tltselect`). Nested-only usage inside another story is not enough.
Coverage gate: `npm run storybook:coverage:strict`.

Composition shells (empty / loading / error chrome, no domain) live under
`UI Kit/Composition/*` (e.g. `PageChrome.stories.tsx`) — optional for agents
assembling page regions; they do not count as barrel component IDs.

**Feedback API:** use `appMessage` / `appModal` from `@/feedback/appFeedback`
(not static `message` / `Modal.confirm` from `antd`) so console seal stays green.

## Public API

Import components only from the barrel:

```tsx
import {
  CompactField,
  CompactFieldGrid,
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltNumberField,
  TltSelect,
  TltTable,
  TltTabs,
  TltTextField,
} from '@/components/ui-kit';
```

Базовые CSS-first примитивы: `TltButton`, `TltBadge`, `TltCard`, `TltAlert`,
`TltTabs`, `TltTable`, `TltEmptyState` и `TltSkeleton`. Они не знают о
расчётах, запросах или сторах и принимают только данные/колбэки представления.

```tsx
<TltCard title="Объекты" actions={<TltBadge tone="success">Готово</TltBadge>}>
  <TltButton variant="primary">Сохранить</TltButton>
</TltCard>
```

Visual contract = HeatCalc dual-form (SC-03):

| Token | Value |
|---|---|
| control height | `--tlt-field-control-height` → 26px |
| label / control / select font | 8.5 / 12 / 9 px |
| label track | `--tlt-field-label-width` → 98px |
| num / name / climate / tm | 4rem / 7.5rem / 8.75rem / 8rem |
| radius | 2px |
| column reflow | max 5 fields, then next column |

```tsx
<CompactFieldGrid columns={3} density="compact" flow="columns" maxRowsPerColumn={5}>
  <CompactField label="Температура" required controlWidth="var(--tlt-field-ctrl-num)" hint="-60...600 °C">
    <TltNumberField aria-label="Температура" unit="°C" />
  </CompactField>
</CompactFieldGrid>
```

The `antFormAdapter` prop normalizes existing Ant `Form.Item` markup without
moving domain state or validation rules into the UI library.

## Boundaries

- No API calls, stores, calculation rules or feature-specific state.
- No imports from HeatCalc, electrical, reports or wizard modules.
  (The `/ui-kit` *page* is exempt: as the showcase it composes the real
  wizard pieces — `ReferencePicker`, `CableAlgorithmPanel`, the
  `insulation-layers-table` CSS island and HeatCalc toolbar classes — so the
  reference stays pixel-identical to the live dual-form.)
- Visual values come from shared `--tlt-field-*` tokens.
- New reusable controls are exported from `index.ts`; demo-only UI Kit helpers
  stay outside the public API.
- Form placement, field order and conditional visibility remain feature-owned;
  see the architectural policy for the full layout contract.
