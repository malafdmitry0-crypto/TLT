# Prompt: Inline Table Validation Before Save

## Goal

Add immediate validation feedback for inline editing in the heat-calculation table.

If the user enters an invalid value in an editable table cell, the table must show the invalid cell in red before saving. Invalid rows must not be sent to the backend until the user fixes the values.

## Context

- Main page: `frontend/src/pages/HeatCalcPage.tsx`
- Inline editor component: `frontend/src/components/heatcalc/EditableTableCell.tsx`
- Shared inline validation:
  - `frontend/src/domain/heatCalcFieldRules.ts`
  - `frontend/src/utils/heatCalcInlineEdit.ts`
- Editable fields:
  - `frontend/src/domain/heatCalcFields.ts`
- Table styles: `frontend/src/styles.css`
- Related prompts:
  - `table-inline-editing-prompt.md`
  - `table-editable-field-highlighting-prompt.md`

## Hard Requirements

1. Validate inline table edits immediately on cell commit:
   - `Enter`
   - blur
   - select option commit
   - any existing table-cell commit path

2. Use only shared field validation logic.
   - Do not duplicate validation rules in `HeatCalcPage.tsx`.
   - Do not create table-only validation ranges.
   - Reuse `validateHeatCalcField(...)` / `applyInlineCellDraft(...)` or the existing shared helper path.

3. Invalid values must be visible before save:
   - the invalid cell must be highlighted red;
   - the invalid row may also have a subtle invalid marker, but the cell-level red state is required;
   - red invalid state must persist while the invalid draft value exists;
   - the state must clear immediately after the value becomes valid or the user discards the draft.

4. Invalid rows must not be saved:
   - clicking `Сохранить` must not send backend update requests for rows with validation errors;
   - if selected rows contain invalid rows, those invalid rows stay dirty and are not sent;
   - valid rows in the same save batch may be saved if this matches the current save-batch behavior;
   - show a compact user message, for example `Исправьте ошибки в таблице`, when save is blocked or partially skipped by validation.

5. Electrical calculation remains out of scope:
   - do not run, enqueue, invalidate, or indirectly trigger electrical calculation;
   - electrical calculation still starts only from the explicit calculation button on the `Электротехнический расчёт` page.

## UX Requirements

### Normal Inline Editing

- Valid editable cells keep the grey editable-cell marker from `table-editable-field-highlighting-prompt.md`.
- Dirty valid cells/rows keep the yellow unsaved state.
- In yellow changed rows, cells that were actually changed must be visually darker than the row background.
- Invalid cells use red styling even before save.

### Dirty Cell Styling

When a row has unsaved changes:

- the whole dirty row stays light yellow;
- only cells with changed draft fields use a darker yellow background;
- unchanged cells in the same dirty row must remain lighter yellow;
- the darker changed-cell marker must be visible without selecting the row;
- invalid red still wins over the darker dirty-cell yellow.

### Invalid Cell Styling

Use a restrained but unmistakable red state:

- background: `#fff1f0` or existing error token;
- border/inset border: `#d9363e`;
- optional small error text only when the cell is active or focused.

Do not add heavy per-cell `Tooltip` components across the table. If an error explanation is needed outside active edit mode, prefer one lightweight existing DOM element or accessible title/aria text on the cell display button.

### State Priority

Visual priority must be:

1. Active editor/focus state with validation error.
2. Invalid cell state.
3. Dirty cell/dirty row state.
4. Selected row state.
5. Hover state.
6. Grey editable-cell marker.
7. Normal table state.

This means:

- invalid red wins over dirty yellow;
- invalid red wins over darker changed-cell yellow;
- changed dirty cells are darker than the dirty row background;
- invalid red wins over selected-row blue;
- hover must not hide invalid red;
- active editor must show a red border/message when the current value is invalid.

## Data Model Requirements

Use the existing draft row state error map:

```ts
type DraftRowState = {
  objectId: string;
  objectType: 'pipe' | 'tank';
  baseFormValues: Record<string, unknown>;
  draftFormValues: Record<string, unknown>;
  dirtyFields: Record<string, unknown>;
  errors: Record<string, string>;
  saving: boolean;
};
```

Rules:

- store validation errors by field id, not by table column title;
- keep the invalid draft value so the user sees and can fix what they typed;
- do not silently replace invalid values with old backend values;
- discard/reset must remove both dirty values and errors;
- after successful valid save, remove draft and errors for that row.

## Interaction Requirements

When a user enters an invalid value:

- the editor should show the validation error immediately;
- the cell/row draft state should remember the invalid value and error;
- the table should make the cell red before any save request;
- the user can fix the value in the same cell;
- `Esc` cancels the active edit session, but must not accidentally clear an already committed invalid draft unless the current discard/reset action is explicit.

When the user clicks `Сохранить`:

- validate all targeted dirty rows again through shared rules;
- do not send invalid rows;
- keep invalid rows dirty and red;
- show a clear compact error message;
- clear successful valid rows normally.

## Implementation Constraints

- Do not introduce backend calls during cell editing.
- Do not render inputs/selects in every table cell.
- Do not add a second validation model separate from `DraftRowState.errors`.
- Keep styles scoped to `.calc-spreadsheet`.
- Keep the existing editor overflow fix.
- Keep the single `Сохранить` button behavior.

## Testing Requirements

Add focused tests.

Required unit tests:

1. Shared utility validation:
   - invalid inline value creates `DraftRowState.errors[fieldId]`;
   - fixed valid value clears the error;
   - invalid dependency-excluded fields remain non-editable.

2. `EditableTableCell`:
   - inactive invalid cell gets `error` class and red styling;
   - invalid red styling wins over dirty yellow;
   - active editor shows error class/message.

3. `HeatCalcPage`:
   - enable inline editing;
   - enter invalid value into an editable cell;
   - verify the cell is red/error-marked before clicking `Сохранить`;
   - click `Сохранить`;
   - verify `updateObject` was not called for that invalid row;
   - fix the value;
   - verify error state clears and save succeeds.

Recommended checks:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- src/__tests__/unit/components/EditableTableCell.test.tsx src/__tests__/unit/pages/HeatCalcPage.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx src/__tests__/unit/utils/heatCalcInlineEdit.test.ts
npm --prefix frontend run lint
git diff --check
```

## Acceptance Criteria

- Invalid inline table values are highlighted red before save.
- Red invalid state has higher visual priority than yellow dirty state.
- In dirty yellow rows, changed cells are highlighted with a darker yellow shade than unchanged cells.
- Invalid rows are not sent to the backend.
- Fixing the value clears the red state without reload.
- Discard/reset clears invalid state.
- No electrical calculation is triggered.
- Typecheck, focused tests, lint, and whitespace check pass.
