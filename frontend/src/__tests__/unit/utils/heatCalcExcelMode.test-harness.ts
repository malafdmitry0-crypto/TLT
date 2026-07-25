/**
 * Shared helpers for heatCalcExcelMode scenario tests.
 */
import type { InlineEditFieldConfig } from '@/utils/heatCalcInlineEdit';
import type { DraftRowState } from '@/utils/heatCalcInlineEdit';

export function fieldConfig(editor: InlineEditFieldConfig['editor']): InlineEditFieldConfig {
  return {
    columnKey: 'x',
    objectType: 'pipe',
    fieldId: 'x',
    editor,
    field: {
      id: 'x',
      objectTypes: ['pipe'],
      tableColumnKeys: { pipe: 'x' },
      label: 'X',
      editor,
      options: editor === 'select'
        ? [
          { label: 'Открыто', value: 'outdoor' },
          { label: 'Подземно', value: 'underground' },
        ]
        : undefined,
    },
  };
}

export function numberFieldConfig(displayDigits = 0): InlineEditFieldConfig {
  const config = fieldConfig('number');
  return {
    ...config,
    field: {
      ...config.field,
      displayDigits,
    },
  };
}

export function draftRow(overrides: Partial<DraftRowState>): DraftRowState {
  return {
    objectId: 'new:pipe:1',
    objectType: 'pipe',
    baseVersion: 0,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: {},
    errors: {},
    saving: false,
    sourceParams: {},
    ...overrides,
  };
}
