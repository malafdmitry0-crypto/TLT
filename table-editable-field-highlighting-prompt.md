# Prompt: Grey Highlight For Inline-Editable Table Cells

## Goal

In heat-calculation table inline-editing mode, visually mark cells that can be edited directly in the table.

The user must be able to distinguish editable cells from read-only/calculated cells before clicking. The marking must be subtle, neutral, and must not interfere with dirty-row, selected-row, hover, focus, validation, or active-editor states.

## Context

- Main page: `frontend/src/pages/HeatCalcPage.tsx`
- Inline editor component: `frontend/src/components/heatcalc/EditableTableCell.tsx`
- Inline field metadata:
  - `frontend/src/domain/heatCalcFields.ts`
  - `frontend/src/domain/heatCalcFieldRules.ts`
- Inline edit utilities: `frontend/src/utils/heatCalcInlineEdit.ts`
- Table settings:
  - `frontend/src/components/heatcalc/ColumnSettingsModal.tsx`
  - `frontend/src/utils/heatCalcTableViewSettings.ts`
- Existing prompt: `table-inline-editing-prompt.md`

## Scope

Apply this only to the heat-calculation table when table inline editing is enabled through the table settings checkbox.

Do not change:

- electrical calculation;
- `ObjectWizard` behavior;
- backend validation;
- save batching;
- table pagination/filter/sort behavior;
- editable-field scope from the current inline-edit implementation.

Hard invariant:

- electrical calculation must run only after an explicit user click on the calculation button on the `Электротехнический расчёт` page;
- inline table editing must not run, enqueue, invalidate, or indirectly trigger electrical calculation;
- saving from `ObjectWizard` must not run, enqueue, invalidate, or indirectly trigger electrical calculation;
- selecting rows, opening rows, changing object type, toggling inline editing, saving heat objects, or highlighting editable cells must not start electrical calculation.

## Functional Requirements

1. When `inlineEditingEnabled === false`:
   - table visuals stay exactly as they are now;
   - no grey editable-cell highlighting is shown;
   - row click / object form behavior stays unchanged.

2. When `inlineEditingEnabled === true`:
   - every table cell that can be edited inline must have a subtle grey visual marker in its normal, non-editing state;
   - cells that cannot be edited inline must remain visually normal;
   - the grey marker must be based on the same inline field config used for editing, for example `getInlineEditFieldConfig(activeObjectType, columnKey)`;
   - do not create a separate hardcoded list only for styling.

3. Highlight only fields that are actually editable at the current stage.
   - For Phase 1, highlight only Phase 1-enabled fields from `table-inline-editing-prompt.md`.
   - Do not highlight dependency-driving fields that are intentionally not editable in the table:
     - `placement`
     - `shape`
     - `insulation_material`
   - Do not highlight calculated/result columns.
   - Do not highlight row number, checkbox, object type, action, or technical columns.

4. If the active object type changes, the highlighted cells must follow the correct pipe/tank inline-edit rules.

## UX Requirements

- Use a neutral grey background for editable cells, not blue, yellow, green, or red.
- Suggested base style:
  - cell/display background: `#f3f4f6` or an existing neutral token close to it;
  - optional inset border: `1px solid rgba(15, 23, 42, 0.08)`;
  - text color must remain unchanged and readable.
- Keep the marker subtle enough that the table still looks like a dense spreadsheet.
- On hover, editable cells may become slightly stronger grey or show a restrained blue focus border.
- Cursor behavior:
  - `text` for text/number fields;
  - `pointer` for enum/select fields.
- Do not add per-cell `Tooltip`, icons, or controls just to explain editability. This would add DOM weight and visual noise.

## Style Precedence

The following states must win over the grey editable-cell marker, in this order:

1. Active editor/focus state.
2. Validation/error state.
3. Unsaved dirty cell or dirty row state.
4. Selected row state.
5. Hover state.
6. Grey editable-cell marker.
7. Normal table cell state.

Specific expectations:

- Dirty rows/cells stay yellow; grey must not mute or replace the unsaved-change indication.
- Invalid cells keep their error styling and error message behavior.
- The active editor should remain visually clear and must not inherit a grey background that makes the input look disabled.
- Selected row background must still be readable. If selected-row background hides the grey fill, use a subtle border or inset shadow so editable cells remain distinguishable without breaking selection styling.

## Implementation Constraints

- Do not mount `Input`, `InputNumber`, `Select`, `Tooltip`, or extra wrappers in every cell.
- Reuse the existing editable-cell host/cell-rendering path.
- Prefer adding or refining CSS classes over adding new React state.
- It is acceptable to use the existing `editable-cell-host` class if it is applied only to cells that are inline-editable while `inlineEditingEnabled === true`.
- If `editable-cell-host` is too broad, add a more explicit class such as `editable-cell-enabled`.
- Keep the styling under table-specific selectors, for example `.calc-spreadsheet`, so AntD tables elsewhere are not affected.
- Preserve the existing fix that prevents the inline editor from overflowing outside the table cell.

## Testing Requirements

Add focused tests for the behavior, not snapshots of the whole table.

Required checks:

1. With inline editing disabled:
   - editable-cell highlighting classes are not present.

2. With inline editing enabled:
   - a Phase 1 editable cell, for example `name` or `pipe_length`, receives the editable-cell marker class;
   - a non-editable cell, for example object type, row number, `pipe_dn`, `placement`, `shape`, or `insulation_material`, does not receive the editable-cell marker class.

3. Dirty-row behavior:
   - after an inline draft edit, the dirty row/cell state is still present and is not replaced by the grey marker.

4. Active editor:
   - clicking an editable grey cell opens only one inline editor;
   - the editor remains within cell bounds.

Recommended commands:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- src/__tests__/unit/pages/HeatCalcPage.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx src/__tests__/unit/components/EditableTableCell.test.tsx
npm --prefix frontend run lint
git diff --check
```

## Acceptance Criteria

- Table inline-editing toggle off: no grey editable-cell markers.
- Table inline-editing toggle on: only truly editable cells are grey-highlighted.
- Non-editable/dependency-driving fields remain visually normal.
- Dirty rows remain yellow and visually stronger than grey editable markers.
- Active inline editors do not overflow cell boundaries.
- `ObjectWizard` behavior does not change.
- Electrical calculation still starts only from the explicit calculation button on the `Электротехнический расчёт` page.
- Typecheck, focused tests, lint, and whitespace check pass.
