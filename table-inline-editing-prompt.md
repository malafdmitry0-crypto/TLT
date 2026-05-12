# Prompt: Inline Editing In Heat Calculation Table

## Goal

Implement inline editing for editable source-data cells in the heat calculation table.

The user edits simple object parameters directly in the table without opening `ObjectWizard`. `ObjectWizard` remains the full editor for complex edits, dependency-driving fields, and advanced fields.

The central requirement is **single source of truth**: inline editing must reuse the same field metadata, dependency rules, normalization, unit conversion, and validation as `ObjectWizard`. Do not copy business rules into table-specific code.

## Current Context

- Main page: `frontend/src/pages/HeatCalcPage.tsx`
- Table column registry: `frontend/src/config/heatcalc-table-columns.default.json`
- Column metadata utilities: `frontend/src/utils/heatCalcTableColumns.ts`
- Existing form conversion and unit handling:
  - `pipeApiParamsToForm`
  - `tankApiParamsToForm`
  - `pipeFormToApiParams`
  - `tankFormToApiParams`
  - in `frontend/src/utils/objectWizardUtils.ts`
- Object save mutation is already available through `useHeatCalcMutations`.
- The table is paginated server-side; do not introduce rendering that mounts inputs/selects/tooltips in every visible cell.

## UX Requirements

1. Add an inline-editing toggle to existing table settings:
   - add a checkbox in `Настройки таблицы` with label `Редактировать ячейки в таблице`;
   - store the value in the same settings model/storage as the heat calculation table settings under key `inlineEditingEnabled`;
   - default value is `false`;
   - when `inlineEditingEnabled === false`, table behavior must match current behavior: no editable-cell hover affordance, no cell editor, no draft toolbar controls, row click opens `ObjectWizard`;
   - when `inlineEditingEnabled === true`, enable inline editing according to this prompt;
   - switching from enabled to disabled closes the active editor;
   - switching from enabled to disabled with no dirty rows applies immediately;
   - switching from enabled to disabled with dirty rows shows a confirmation modal with three actions: `Save`, `Discard`, `Cancel`;
   - `Save` saves all valid dirty rows; after full success it disables inline editing, after validation or backend failure it keeps inline editing enabled and keeps failed rows dirty;
   - `Discard` drops all dirty rows and disables inline editing;
   - `Cancel` closes the modal and keeps inline editing enabled.

2. Editable cells must show a subtle affordance on hover only when `inlineEditingEnabled === true`:
   - cursor `text` for text/number fields;
   - cursor `pointer` for enum fields;
   - light editable-cell background or border only on hover/focus.

3. Enter edit mode only for the active cell:
   - do not render `Input`, `InputNumber`, or `Select` in every row by default;
   - render the control only for the currently edited cell.

4. Interaction:
   - single click on an editable cell starts cell editing;
   - click on non-editable cells keeps current behavior: select/open object form;
   - while starting cell edit, stop row click propagation so `ObjectWizard` does not open accidentally;
   - `Enter` applies the cell value to a local draft, but does not send a backend request;
   - `Esc` cancels;
   - for Phase 1, `Tab`/`Shift+Tab` uses normal browser focus behavior. Do not implement spreadsheet navigation in this task;
   - spreadsheet `Tab`/`Shift+Tab` navigation is Phase 3;
   - blur applies the value to a local draft if the value is valid; invalid value keeps the editor open;
   - for `Select`, do not apply on blur while dropdown interaction is in progress. Apply on option select, `Enter`, or explicit close with valid value.

5. Draft and saving:
   - inline cell edits update local draft state only;
   - do not call backend on each cell commit;
   - allow several unsaved rows at the same time;
   - rows with unsaved draft changes must be highlighted with a yellow background;
   - save draft changes only by clicking an explicit Save button;
   - add a Discard button in the table toolbar for unsaved draft changes;
   - while saving, show compact pending state on affected rows and on the Save button, not global page loading;
   - on backend error, keep failed rows dirty, show row/cell error state, and show `antdMessage.error`.

6. The existing full form remains:
   - row click still opens `ObjectWizard`;
   - `+` still opens new-object form;
   - inline table edit must not automatically open or close `ObjectWizard`.
   - if a row has unsaved inline draft changes and the user clicks that row to open `ObjectWizard`, show a confirmation modal with three actions: `Save`, `Discard`, `Cancel`;
   - `Save` saves that dirty row first, then opens `ObjectWizard` using the backend response;
   - `Discard` drops that row draft, then opens `ObjectWizard` using current backend data;
   - `Cancel` closes the modal and keeps the table unchanged;
   - do not automatically open `ObjectWizard` while unresolved draft changes exist for the clicked row.

7. Electrical calculation is explicitly out of scope for this stage:
   - do not run electrical calculation after inline table save;
   - do not enqueue electrical batch jobs;
   - do not auto-select or recalculate cables;
   - do not update electrical calculation rows from this feature;
   - inline editing must invalidate only heat-object query/summary and must not invalidate electrical queries/jobs. Any electrical recalculation must remain a separate user action on the electrical calculation step.

## Implementation Strategy

Use a staged rollout. The first implementation must include only the fields listed in **Phase 1 Enabled Scope** and must prove the shared-rule architecture before enabling dependent fields.

### Phase 1: Safe MVP

Implement inline editing only for the exact pipe and tank columns listed in **Phase 1 Enabled Scope**.

Do not edit dependency-driving fields through the table in this stage:

- `placement`
- `shape`
- `insulation_material`

In Phase 1 these fields must remain editable only through `ObjectWizard`.

### Select Field Scope Rule

`Select` fields may be edited inline only when the selected value is a simple scalar choice with no dependent field graph.

Allowed inline `Select` fields must satisfy all conditions:

- changing the option updates one field only;
- changing the option does not show, hide, require, clear, or recalculate other source-data fields;
- changing the option does not change object geometry, placement mode, layer structure, or material-specific required values;
- all options and labels come from the same shared metadata used by `ObjectWizard`;
- validation and conversion use the same shared rule path as text/number inline fields.

Examples:

- `supply_voltage` is allowed because it is a simple fixed choice (`220` / `380`) with no linked source-data selection.
- `placement` / `Размещение трубопровода` is not allowed at this stage because it changes the field graph: underground placement affects underground-only fields and requiredness.
- `shape` is not allowed at this stage because it changes tank geometry fields.
- `insulation_material` is not allowed at this stage because material `other` requires lambda input and layer-specific dependent fields.

### Phase 2: Dependent Fields

Enable fields whose editability depends on other values:

- `pipe_lambda_mode`
- `pipe_material`
- `pipe_lambda`
- underground-only pipe fields;
- second/third insulation layer fields;
- layer lambda fields visible only for material `other`.

### Future Work: Spreadsheet Ergonomics

This is not part of this task. Implement these capabilities only in a future task after Phase 1-2 are stable:

- `Tab`/`Shift+Tab` navigation across editable cells;
- paste from clipboard into multiple cells;
- fill-down/bulk edit.

## Draft Editing Model

Inline table editing is draft-based.

Do not send a network request when the user edits a single cell. A cell commit only updates local draft state. The backend update runs only when the user clicks the explicit Save button.

Draft state must support multiple dirty rows:

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

type DraftRowsById = Record<string, DraftRowState>;
```

Rules:

- identify dirty rows by object id;
- preserve the original `baseFormValues` for rollback/discard;
- store drafts in form-values, not backend params. This avoids `mm ↔ m` drift while editing table values;
- build backend params only at Save time through the shared conversion helpers;
- store field-level validation errors;
- a row is dirty when at least one applied draft field differs from `baseFormValues` after shared normalization;
- yellow row highlight indicates unsaved draft changes;
- invalid draft cells must show a stronger warning state and block saving that row;
- changing pages, filters, sorting, or object type keeps drafts by object id and does not silently drop dirty drafts;
- switching project, navigating away from the workspace, or logout must show an in-app save/discard/cancel guard when dirty rows exist;
- browser tab close or browser reload must use the native `beforeunload` warning when dirty rows exist. Do not attempt to show a custom modal for browser close/reload.

Required controls:

- show Save, Discard, and dirty counter only when `inlineEditingEnabled === true` or dirty rows exist;
- keep one toolbar Save button with the label `Сохранить`;
- Save button: if selected dirty rows exist, saves only selected dirty rows; otherwise saves all valid dirty rows;
- Save target count must be reflected through the dirty counter, tooltip, disabled/loading state, and deterministic behavior, not by adding a second save button;
- Discard button: if selected dirty rows exist, discards only selected dirty rows; otherwise discards all dirty rows;
- Discard button label must reflect the target set: `Сбросить выбранные (N)` or `Сбросить все (N)`;
- dirty counter near the table toolbar with the label format `Несохранено: N`.

Save behavior:

- validate all dirty rows before sending requests;
- do not send rows that have validation errors;
- send one update request per dirty row;
- on success, replace the row with the backend response object and clear that row from draft state;
- on partial failure, clear only successful rows; keep failed rows dirty with error state;
- invalidate objects query/summary after the save batch completes, not after every row request.

## Phase 1 Enabled Scope

Implement only this scope first. Do not enable fields outside Phase 1 until their shared rules are extracted and covered by tests.

### Phase 1 Pipe Columns

- `name`
- `pipe_outer_diameter`
- `pipe_length`
- `pipe_wall_thickness`
- `insulation_thickness`
- `ambient_temperature`
- `process_temperature`
- `min_switch_temperature`
- `supply_voltage`
- `safety_factor`

### Phase 1 Tank Columns

- `name`
- `diameter`
- `height`
- `length`
- `width`
- `wall_thickness`
- `wall_lambda`
- `insulation_thickness`
- `ambient_temperature`
- `process_temperature`
- `q_additional`

## Final Target Editable Scope

This is the intended final direction, not the first implementation scope.

### Final Pipe Editable Columns

- `name`
- `pipe_outer_diameter`
- `pipe_length`
- `pipe_wall_thickness`
- `pipe_material`
- `pipe_lambda_mode`
- `pipe_lambda`
- `placement`
- `insulation_layer_count`
- `insulation_thickness`
- `insulation_material`
- `first_insulation_lambda`
- `second_insulation_thickness`
- `second_insulation_material`
- `second_insulation_lambda`
- `third_insulation_thickness`
- `third_insulation_material`
- `third_insulation_lambda`
- `ambient_temperature`
- `process_temperature`
- `wind_speed`
- `alpha_vnesh`
- `max_ambient_temperature`
- `max_process_temperature`
- `environment`
- `zone_classification`
- `temperature_group`
- `min_switch_temperature`
- `supply_voltage`
- `safety_factor`
- `steam_tracing`
- `valve_count`
- `flange_count`
- `support_count`
- `local_element_equiv_length`

### Final Tank Editable Columns

- `name`
- `shape`
- `diameter`
- `height`
- `length`
- `width`
- `wall_thickness`
- `wall_lambda`
- `placement`
- `insulation_layer_count`
- `insulation_thickness`
- `insulation_material`
- `first_insulation_lambda`
- `second_insulation_thickness`
- `second_insulation_material`
- `second_insulation_lambda`
- `third_insulation_thickness`
- `third_insulation_material`
- `third_insulation_lambda`
- `ambient_temperature`
- `process_temperature`
- `wind_speed`
- `alpha_vnesh`
- `max_ambient_temperature`
- `max_process_temperature`
- `environment`
- `zone_classification`
- `temperature_group`
- `min_switch_temperature`
- `supply_voltage`
- `safety_factor`
- `steam_tracing`
- `q_additional`

### Readonly Columns

Keep these readonly:

- `index`
- `type`
- `pipe_dn`
- `placement` in Phase 1;
- `shape` in Phase 1;
- `insulation_material` in Phase 1;
- computed result columns;
- any field absent from the object type;
- any field hidden by dependency rules.

`pipe_dn` is derived from outer diameter. After saving `pipe_outer_diameter` and refetching the row, the displayed DN must come from the backend response/refetched data.

## Architecture

Add a shared field-definition layer first. Then make both `ObjectWizard` and inline table editing consume that layer.

Do not embed edit rules directly inside table renderers.

Required files:

- `frontend/src/domain/heatCalcFields.ts`
- `frontend/src/domain/heatCalcFieldRules.ts`
- `frontend/src/utils/heatCalcInlineEdit.ts`
- `frontend/src/components/heatcalc/EditableTableCell.tsx`

Update the existing table settings component/storage instead of creating a separate inline-editing settings surface.

### Best-Practice Direction

The table and the wizard must depend on the same domain definitions for all Phase 1 fields:

```text
heatCalcFields.ts
  -> field ids, labels, editor type, units, ranges, enum options

heatCalcFieldRules.ts
  -> visibility, requiredness, validation, normalization, dependency behavior

ObjectWizard.tsx
  -> for Phase 1 fields, renders form using shared definitions

HeatCalcPage.tsx inline table edit
  -> renders active cell editor using the same definitions
```

Migration order:

1. Extract the metadata/rules needed for Phase 1 fields.
2. Update `ObjectWizard` to consume these extracted rules for those fields.
3. Add inline editing for the same Phase 1 fields.
4. Expand extraction field-by-field.

Do not create a second complete validation system just for the table.

### `heatCalcFields.ts`

Create domain-level field definitions independent from AntD components.

Required TypeScript shape:

```ts
type HeatCalcObjectType = 'pipe' | 'tank';
type HeatCalcFieldId = string;
type HeatCalcEditorKind = 'text' | 'number' | 'select';

interface HeatCalcFieldDefinition {
  id: HeatCalcFieldId;
  objectTypes: HeatCalcObjectType[];
  tableColumnKeys: Partial<Record<HeatCalcObjectType, string>>;
  label: string;
  editor: HeatCalcEditorKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  maxLength?: number;
  options?: Array<{ label: string; value: string | number }>;
  inputUnit?: 'mm' | 'm' | 'raw';
}
```

Rules:

- field ids must be form-field ids, not backend param ids;
- table column keys map to field ids;
- unit conversion belongs to shared conversion helpers, not table cells;
- enum options for Phase 1 fields must be defined once and reused by wizard/table.

### `heatCalcFieldRules.ts`

Extract shared rule functions:

```ts
interface HeatCalcFieldContext {
  objectType: HeatCalcObjectType;
  values: Record<string, unknown>;
}

function isHeatCalcFieldVisible(fieldId: string, context: HeatCalcFieldContext): boolean;
function isHeatCalcFieldRequired(fieldId: string, context: HeatCalcFieldContext): boolean;
function normalizeHeatCalcFieldValue(fieldId: string, value: unknown, context: HeatCalcFieldContext): unknown;
function validateHeatCalcField(fieldId: string, value: unknown, context: HeatCalcFieldContext): string | null;
function applyHeatCalcFieldValue(
  fieldId: string,
  value: unknown,
  context: HeatCalcFieldContext,
): Record<string, unknown>;
```

`applyHeatCalcFieldValue` must handle dependency side effects. Required rules:

- when `pipe_lambda_mode` changes to `manual`, preserve `pipe_material` in `draftFormValues`; backend conversion must prefer `pipe_lambda`;
- when `pipe_lambda_mode` changes to `reference`, preserve `pipe_lambda` in `draftFormValues`; backend conversion must prefer `pipe_material`;
- when `insulation_layer_count` decreases, delete second/third layer values only when the shared field rule explicitly clears them;
- when `placement` changes from `underground`, do not write invalid underground-only fields into backend payload.

The exact side-effect behavior must match `ObjectWizard` and existing conversion helpers.

### ObjectWizard Refactor Requirement

Before or during inline-edit implementation, remove duplicated rules from `ObjectWizard` only for fields included in the current rollout phase.

Do not rewrite the entire `ObjectWizard` in this task. Extract the smallest shared rule surface needed for Phase 1, wire Phase 1 wizard fields to it, and leave unrelated advanced fields untouched until later phases.

For Phase 1 fields:

- use shared min/max/required rules;
- use shared enum options;
- use shared visibility checks for conditional fields included in that phase;
- keep AntD-specific rendering in `ObjectWizard`, but keep business rules in shared utilities.

If a field still has rules only inside `ObjectWizard`, do not enable that field for inline editing yet.

### `heatCalcInlineEdit.ts`

Create a typed table-to-field adapter:

```ts
type InlineEditorKind = 'text' | 'number' | 'select';

interface InlineEditFieldConfig {
  columnKey: string;
  objectType: 'pipe' | 'tank';
  fieldId: string;
  editor: InlineEditorKind;
}
```

This adapter must only connect table column keys to shared field definitions. It must not own validation, min/max ranges, enum options, or dependency visibility.

The mapping must point to form field ids, not directly to raw API params. Reason: some displayed values are in millimetres while backend params are in metres.

Use existing conversions:

1. Convert row params to form values:
   - pipe: `pipeApiParamsToForm(record.params)`
   - tank: `tankApiParamsToForm(record.params)`
2. Apply edited form field.
3. Convert full form values back to API params:
   - pipe: `pipeFormToApiParams(nextFormValues)`
   - tank: `tankFormToApiParams(nextFormValues)`
4. Preserve unknown existing params that are not represented in form values:

```ts
const nextParams = {
  ...record.params,
  ...convertedParams,
};
```

This avoids deleting fields such as climate metadata or fields not present in the inline editor.

### Dependency Rules

Implement dependency rules once in `heatCalcFieldRules.ts` and reuse them in both `ObjectWizard` and inline edit.

- `pipe_lambda` editable only when `pipe_lambda_mode === 'manual'`;
- `pipe_material` editable only when `pipe_lambda_mode !== 'manual'`;
- underground-only pipe fields editable only when `placement === 'underground'`;
- second layer fields editable only when `insulation_layer_count >= 2`;
- third layer fields editable only when `insulation_layer_count >= 3`;
- layer lambda editable only when that layer material is `other`.

If a cell is not currently editable because shared dependency rules hide it, render it as readonly.

## Validation

Use the same ranges/messages as `ObjectWizard` by moving those rules into `heatCalcFieldRules.ts`.

Minimum required validation:

- `name`: required, max 200 chars;
- diameters/thicknesses/lengths: positive numbers, same min/max as form;
- `insulation_layer_count`: only `1`, `2`, `3`;
- temperatures: same ranges as form;
- `safety_factor`: same range as form;
- fitting counts: integer, min 0, max 100;
- enum values must be one of known options.

Do not save invalid values. Show validation inline in the active cell and keep editor open.

Rule: if a validation rule is needed by both wizard and table, it must live in the shared rule layer.

## Performance Constraints

This is important because previous bottlenecks were in frontend rendering.

- When `inlineEditingEnabled === false`, do not attach editable cell handlers and do not compute editor configs for normal table cells.
- Do not mount edit controls for all rows.
- Do not put `Tooltip`, `Select`, or `InputNumber` into every normal cell.
- Keep one active editor state:

```ts
type ActiveCell = {
  objectId: string;
  columnKey: string;
} | null;
```

- Memoize column definitions and the column-key-to-field adapter.
- Avoid invalidating the whole project cache on every keystroke.
- Apply cell edits to local draft only on cell commit, not on every character.
- Save draft rows only when the user clicks the explicit Save button.
- After successful row save, replace the row with the backend response and invalidate the current objects query/summary narrowly once per save batch.
- In DOM, there must be at most one active `.editable-cell-editor`.
- Do not make the normal table cell renderer instantiate `InputNumber`, `Select`, or validation objects for every visible cell. Derive editor config only when the cell becomes active.

## Table Behavior

Add inline-edit `onCell` only when `inlineEditingEnabled === true` and only for editable columns:

```ts
onCell: (record) => ({
  record,
  columnKey: meta.key,
  editable: isInlineEditable(record, meta.key),
  active: activeCell?.objectId === record.id && activeCell.columnKey === meta.key,
  onStartEdit: ...
})
```

`EditableTableCell` must wrap display content and editor content. It must preserve normal AntD table layout and not break column resize, sort, filter, row selection, copy, or keyboard selection.

## Draft Apply And Saving Contract

Create separate helpers for cell draft application and save-time payload building.

Cell commit helper:

```ts
function applyInlineCellDraft(
  draftRow: DraftRowState | null,
  record: ProjectObject,
  columnKey: string,
  value: unknown,
): DraftRowState
```

It must:

- detect object type;
- convert `record.params` to `baseFormValues` only when creating the draft row;
- resolve `columnKey -> fieldId`;
- check shared visibility/editability;
- normalize and validate through shared field rules;
- apply edited value to `draftFormValues` through shared field rules;
- recompute `dirtyFields` by comparing `draftFormValues` with `baseFormValues` after shared normalization;
- store validation errors in `errors`;
- never call backend;
- never build backend params.

Save-time helper:

```ts
function buildDraftRowParams(
  draftRow: DraftRowState,
): Record<string, unknown>
```

It must:

- detect object type;
- validate the full `draftFormValues`;
- convert back to API params;
- merge with existing backend params from the current row;
- return final params for `updateObject(projectId, record.id, params)`.

Create a dedicated hook for draft saves:

```ts
function useInlineObjectDraftSave(projectId: string | undefined) { ... }
```

Do not reuse the wizard `edit` mutation directly. Inline draft saving has different UX: multiple dirty rows, partial failure, row-level `saving` state, no wizard success flow, and no automatic `ObjectWizard` state changes.

### Cache, Draft, And Concurrency Contract

Use a draft-first update model:

- on cell commit: update only local draft state, not React Query cache and not backend;
- while a row is dirty, render displayed cell values from draft values over the backend row;
- on Save click: validate dirty rows, then send update requests for valid dirty rows;
- on save mutate: set `saving=true` for affected dirty rows and disable repeated save/discard for those rows until the request settles;
- on row success: `queryClient.setQueryData` for the exact current objects query key used by `queryObjects` and replace only the saved row with the backend response;
- create or reuse a single object-query-key helper before optimistic update/invalidation code is added. Optimistic update and invalidation must call that helper.
- on row success: clear that row's draft state;
- after the whole save batch settles: invalidate only:
  - `['project', projectId, 'objects', 'query']`
  - `['project', projectId, 'objects', 'summary']`
- on row error: keep that row dirty, attach error state, and show `antdMessage.error`;
- after save/refetch, current sort/filter rules determine row position and visibility. Do not force the edited row to remain on the current page.

Concurrency:

- only one active cell editor at a time;
- multiple dirty rows are supported at the same time;
- only one pending save per dirty row at a time;
- if a row refetches while its cell is being edited, keep the user's draft until commit/cancel;
- if backend returns 404 or object is no longer visible, close editor and show a compact error;
- sorting, filtering, paging, and object-type switching keep drafts by object id;
- project switch, workspace navigation, and logout must trigger the in-app dirty-draft guard;
- browser tab close and browser reload must trigger native `beforeunload` warning.

## Tests

Add focused tests.

### Unit Tests

Create tests for shared rules, `applyInlineCellDraft`, and `buildDraftRowParams`:

- shared field definitions map expected table columns to field ids;
- `ObjectWizard` and inline edit use the same min/max/required rule for Phase 1 fields;
- `applyInlineCellDraft` stores pipe diameter `108` as form value `108` and does not build backend params;
- `buildDraftRowParams` converts pipe diameter `108` mm to `outer_diameter: 0.108`;
- `buildDraftRowParams` converts insulation thickness `50` mm to `insulation_thickness: 0.05` and first layer thickness;
- `buildDraftRowParams` converts wall thickness mm to metres;
- `pipe_lambda_mode` switch hides/preserves correct material/lambda behavior;
- layer count controls visibility of second/third layer fields;
- unknown params are preserved.

### Page Tests

Extend `HeatCalcPage.test.tsx`:

- table settings contain checkbox `Редактировать ячейки в таблице`;
- checkbox default state is unchecked;
- checkbox state persists through the existing table settings storage under `inlineEditingEnabled`;
- when checkbox is unchecked, clicking an otherwise editable cell opens `ObjectWizard` and does not start inline editing;
- when checkbox is checked, clicking an editable cell starts editor and does not open `ObjectWizard`;
- unchecking the checkbox with no dirty rows disables inline editing immediately;
- unchecking the checkbox with dirty rows shows `Save` / `Discard` / `Cancel` guard;
- `Cancel` in the disable guard keeps inline editing enabled and preserves dirty rows;
- `Discard` in the disable guard clears dirty rows and disables inline editing;
- `Save` in the disable guard saves valid dirty rows before disabling inline editing;
- `Enter` applies value to local draft and does not call update mutation;
- `Esc` cancels without calling update;
- invalid value shows inline error and does not save;
- dirty rows are highlighted yellow;
- several rows can remain dirty at the same time;
- dirty counter shows the number of unsaved rows;
- Save button saves selected dirty rows when selected dirty rows exist; otherwise saves all valid dirty rows;
- Save remains the single toolbar button labelled `Сохранить`; target count is reflected by dirty counter/tooltip/behavior;
- Discard button resets selected dirty rows when selected dirty rows exist; otherwise resets all dirty rows;
- Discard button label shows the exact target count;
- partial save failure keeps failed rows dirty and clears successful rows;
- clicking a dirty row to open `ObjectWizard` shows `Save` / `Discard` / `Cancel` guard;
- sorting/filtering/paging/object-type switch preserves dirty drafts by object id;
- project switch/workspace navigation/logout triggers the in-app dirty-draft guard;
- browser reload/close registers native `beforeunload` warning;
- clicking readonly cell/row still opens `ObjectWizard`;
- only one active editor exists at a time;
- table sorting/filtering still works after edit.
- DOM contains no more than one active editor while editing.

## Acceptance Criteria

- `Настройки таблицы` contains checkbox `Редактировать ячейки в таблице`.
- Inline editing is disabled by default.
- With inline editing disabled, table row/cell clicks keep existing `ObjectWizard` behavior and no editor controls are mounted.
- With inline editing enabled, editable cells can be edited directly in the table.
- Disabling inline editing with dirty rows requires explicit `Save`, `Discard`, or `Cancel`.
- Cell edits are local drafts until the explicit Save button is clicked.
- Multiple rows can be dirty at once.
- Dirty rows are highlighted yellow.
- Discard/reset clears unsaved draft changes.
- Draft state is stored in form values, not backend params.
- Save/Discard target selection is deterministic; Discard reflects the target in its label, while the single Save button stays labelled `Сохранить` and exposes target details through counter/tooltip/behavior.
- Dirty-draft guard protects row form opening, project switching, in-app navigation, and logout.
- Browser reload/close uses native `beforeunload` protection.
- Row click and `+` still open full form.
- No mass mounting of controls in all rows.
- No duplicated field business rules between `ObjectWizard` and inline edit for enabled fields.
- Phase 1 is implemented first; dependent Phase 2 fields are enabled only after their shared rules are extracted.
- Existing unit/integration tests pass.
- Add new tests for inline editing.
- Run:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:run -- src/__tests__/unit/pages/HeatCalcPage.test.tsx
npm --prefix frontend run test:run
npm --prefix frontend run build
git diff --check
```

## Non-Goals

- Do not implement bulk paste in this task.
- Do not implement Excel-like multi-cell selection in this task.
- Do not remove `ObjectWizard`.
- Do not autosave on every keystroke.
- Do not add new backend endpoints in this task.
- Do not run or enqueue electrical calculations from inline table editing.
