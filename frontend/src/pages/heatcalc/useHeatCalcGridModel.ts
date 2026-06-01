import {
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  getHeatCalcFieldDefinition,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type {
  ObjectQueryFieldCapability,
  ProjectObject,
} from '@/types/project';
import {
  buildExcelTableErrorItems,
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  isExcelNewRowId,
  type ExcelErrorFieldInfo,
} from '@/utils/heatCalcExcelMode';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  buildDraftDisplayRecord,
  getDraftRowValidationErrors,
  getInlineCellFormValue,
  getInlineEditFieldConfig,
  type DraftRowsById,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';
import type {
  HeatCalcColumnKey,
  HeatCalcObjectType,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  INAPPLICABLE_TABLE_VALUE,
  draftErrorMessages,
  filterKindForColumn,
  heatLossCalcStatus,
  heatLossErrorText,
  isColumnApplicableToObjectType,
  normalizeGlideCellAlign,
  uniqueErrorMessages,
} from '@/pages/heatcalc/heatCalcPageUtils';

interface UseHeatCalcGridModelOptions {
  activeTableObjectType: HeatCalcObjectType;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  draftRowsById: DraftRowsById;
  editableExcelColumnKeys: string[];
  excelModeEnabled: boolean;
  fieldInputSettings: HeatCalcFieldInputSettings;
  isAllObjectScope: boolean;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  tableFindabilityEnabled: boolean;
  tableCellEditingEnabled: boolean;
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  visibleSourceIndexById: Map<string, number>;
  wizardBaseObject: ProjectObject | null;
  wizardFormObject: ProjectObject | null;
}

export function useHeatCalcGridModel({
  activeTableObjectType,
  sourceColumnMetas,
  fieldCapabilityByKey,
  enumOptionsByColumn,
  columnRenderers,
  draftRowsById,
  editableExcelColumnKeys,
  excelModeEnabled,
  fieldInputSettings,
  isAllObjectScope,
  isSavableDraftRow,
  tableFindabilityEnabled,
  tableCellEditingEnabled,
  visibleTableRows,
  visibleSourceIndexById,
  wizardBaseObject,
  wizardFormObject,
}: UseHeatCalcGridModelOptions) {
  const draftRowsByIdRef = useRef(draftRowsById);
  draftRowsByIdRef.current = draftRowsById;

  const excelFieldInfoById = useMemo<Record<string, ExcelErrorFieldInfo>>(() => {
    const result: Record<string, ExcelErrorFieldInfo> = {};
    if (isAllObjectScope) return result;
    sourceColumnMetas.forEach((meta) => {
      const config = getInlineEditFieldConfig(activeTableObjectType, meta.key);
      if (!config) return;
      result[config.fieldId] = {
        fieldId: config.fieldId,
        columnKey: meta.key,
        label: config.field.label,
      };
    });
    getHeatCalcFormFieldIds(activeTableObjectType).forEach((fieldId) => {
      if (result[fieldId]) return;
      const field = getHeatCalcFieldDefinition(fieldId, activeTableObjectType);
      const columnKey = field?.tableColumnKeys[activeTableObjectType];
      result[fieldId] = {
        fieldId,
        columnKey: columnKey && editableExcelColumnKeys.includes(columnKey) ? columnKey : undefined,
        label: getHeatCalcFieldLabel(fieldId, {
          context: 'settings',
          objectType: activeTableObjectType,
          tableKey: columnKey,
          variant: 'full',
        }),
      };
    });
    return result;
  }, [activeTableObjectType, editableExcelColumnKeys, isAllObjectScope, sourceColumnMetas]);

  const excelTableErrors = useMemo(
    () => (excelModeEnabled
      ? buildExcelTableErrorItems(
        visibleTableRows.map(({ record }, rowIndex) => ({
          rowId: record.id,
          rowIndex,
          objectName: typeof record.params?.name === 'string' ? record.params.name : undefined,
          draftRow: draftRowsById[record.id],
          backendError: draftRowsById[record.id] || isExcelNewRowId(record.id) || !record.validation_errors
            ? null
            : heatLossErrorText(record),
          backendValidationErrors: draftRowsById[record.id] || isExcelNewRowId(record.id)
            ? null
            : record.validation_errors,
          templateRow: isExcelNewRowId(record.id),
        })),
        excelFieldInfoById,
      )
      : []),
    [draftRowsById, excelFieldInfoById, excelModeEnabled, visibleTableRows],
  );

  const selectedRowErrorMessages = useMemo(() => {
    if (!wizardFormObject) return [];
    if (wizardBaseObject) {
      const draftRow = draftRowsById[wizardBaseObject.id];
      if (draftRow) {
        return uniqueErrorMessages(draftErrorMessages(
          draftRow.objectType,
          getDraftRowValidationErrors(draftRow, { enforceRequired: true }),
        ));
      }
    }
    if (excelModeEnabled) {
      const selectedError = excelTableErrors.find((item) => item.rowId === wizardFormObject.id);
      return uniqueErrorMessages(selectedError?.messages.map((message) => message.text) ?? []);
    }
    const hasBackendValidationErrors = !!wizardFormObject.validation_errors
      && Object.keys(wizardFormObject.validation_errors).length > 0;
    const message = heatLossCalcStatus(wizardFormObject) === 'error' || hasBackendValidationErrors
      ? heatLossErrorText(wizardFormObject)
      : '';
    return uniqueErrorMessages([message]);
  }, [draftRowsById, excelModeEnabled, excelTableErrors, wizardBaseObject, wizardFormObject]);

  const excelCellDisplayValue = useCallback((
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => {
    if (record.object_type !== 'pipe' && record.object_type !== 'tank') return '';
    const config = getInlineEditFieldConfig(record.object_type, columnKey);
    if (!config) return '';
    if (isExcelNewRowId(record.id)) return formatExcelDraftCellDisplay(config, draftRow);
    return formatExcelCellDisplay(config, getInlineCellFormValue(record, columnKey, draftRow));
  }, []);

  const glideGridColumns = useMemo<HeatCalcGlideGridColumn[]>(
    () => sourceColumnMetas.map((meta) => {
      const capability = fieldCapabilityByKey.get(meta.key);
      const filterEnabled = tableFindabilityEnabled
        && !excelModeEnabled
        && meta.filterable !== false
        && (isAllObjectScope || (capability?.filter.enabled ?? true));
      const sortEnabled = tableFindabilityEnabled
        && !excelModeEnabled
        && meta.sortable !== false
        && (isAllObjectScope || (capability?.sort.enabled ?? true));
      return {
        key: meta.key,
        title: meta.title,
        label: meta.label,
        width: meta.width,
        minWidthPx: meta.minWidthPx,
        resizable: meta.resizable,
        align: normalizeGlideCellAlign(columnRenderers[meta.key]?.align),
        sortable: sortEnabled,
        filterable: filterEnabled,
        filterKind: filterKindForColumn(meta.key, capability),
        enumOptions: enumOptionsByColumn[meta.key] ?? [],
      };
    }),
    [
      columnRenderers,
      enumOptionsByColumn,
      excelModeEnabled,
      fieldCapabilityByKey,
      isAllObjectScope,
      sourceColumnMetas,
      tableFindabilityEnabled,
    ],
  );

  const getGlideGridCellState = useCallback((
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const draftRow = draftRowsById[record.id];
    const renderer = columnRenderers[columnKey];
    const rendererAlign = normalizeGlideCellAlign(renderer?.align);
    if (isAllObjectScope && !isColumnApplicableToObjectType(columnKey, record.object_type)) {
      return {
        displayValue: INAPPLICABLE_TABLE_VALUE,
        editable: false,
        align: rendererAlign,
      };
    }

    const config = !isAllObjectScope
      && tableCellEditingEnabled
      && (record.object_type === 'pipe' || record.object_type === 'tank')
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (config) {
      return {
        displayValue: excelCellDisplayValue(record, columnKey, draftRow),
        editable: true,
        dirty: isSavableDraftRow(draftRow)
          && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId),
        error: draftRow?.errors[config.fieldId],
        align: config.field.editor === 'number' ? 'right' : rendererAlign,
        editor: config.field.editor,
        options: config.field.options,
        step: resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings) ?? config.field.step,
      };
    }

    const displayRecord = buildDraftDisplayRecord(draftRow, record);
    const displayValue = renderer?.copyValue(displayRecord, rowIndex) ?? '';
    return {
      displayValue: String(displayValue),
      editable: false,
      align: rendererAlign,
    };
  }, [
    columnRenderers,
    draftRowsById,
    excelCellDisplayValue,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableCellEditingEnabled,
  ]);

  const getNormalGlideGridCellState = useCallback((
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const draftRow = draftRowsByIdRef.current[record.id];
    const renderer = columnRenderers[columnKey];
    const rendererAlign = normalizeGlideCellAlign(renderer?.align);
    if (isAllObjectScope && !isColumnApplicableToObjectType(columnKey, record.object_type)) {
      return {
        displayValue: INAPPLICABLE_TABLE_VALUE,
        editable: false,
        align: rendererAlign,
      };
    }

    const config = tableCellEditingEnabled && (record.object_type === 'pipe' || record.object_type === 'tank')
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (config) {
      return {
        displayValue: excelCellDisplayValue(record, columnKey, draftRow),
        editable: true,
        dirty: isSavableDraftRow(draftRow)
          && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId),
        error: draftRow?.errors[config.fieldId],
        align: config.field.editor === 'number' ? 'right' : rendererAlign,
        editor: config.field.editor,
        options: config.field.options,
        step: resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings) ?? config.field.step,
      };
    }

    const displayRecord = buildDraftDisplayRecord(draftRow, record);
    const sourceIndex = visibleSourceIndexById.get(record.id) ?? rowIndex;
    return {
      displayValue: String(renderer?.copyValue(displayRecord, sourceIndex) ?? ''),
      editable: false,
      dirty: isSavableDraftRow(draftRow),
      align: rendererAlign,
    };
  }, [
    columnRenderers,
    excelCellDisplayValue,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    tableCellEditingEnabled,
    visibleSourceIndexById,
  ]);

  return {
    excelFieldInfoById,
    excelTableErrors,
    selectedRowErrorMessages,
    excelCellDisplayValue,
    glideGridColumns,
    getGlideGridCellState,
    getNormalGlideGridCellState,
  };
}
