import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  type TableProps,
} from 'antd';
import {
  CheckCircleFilled,
  CheckOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterFilled,
  FolderOutlined,
  MinusCircleFilled,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';

import {
  applyElectricalCandidate,
  addElectricalCandidateToFolder,
  cancelCalcTask,
  copyElectricalVariant,
  createElectricalCandidate,
  createElectricalCandidateFolder,
  deleteElectricalCandidateFolder,
  enqueueElectricalBatchJob,
  listElectricalCandidateFolders,
  listElectricalCandidates,
  getElectricalQueryCapabilities,
  getCalcTask,
  listCables,
  queryElectrical,
  selectCableForVariants,
  removeElectricalCandidateFromFolder,
  updateElectricalCandidateFolder,
  updateElectricalCandidate,
  type CableSource,
  type CopyElectricalVariantResponse,
  type SelectionPolicy,
} from '@/api/calculations';
import type { ApiError } from '@/api/client';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getCablesTt, getResistiveCables } from '@/api/references';
import { useAuthStore } from '@/store/authStore';
import {
  CALCULATION_VARIANTS,
  normalizeCalculationVariant,
  useCalculationVariantStore,
  type CalculationVariant,
} from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { areCommercialFeaturesEnabled } from '@/config/featureFlags';
import { useElectricalStats } from '@/hooks/useElectricalStats';
import { useFocusableTableScrollRegions } from '@/hooks/useFocusableTableScrollRegions';
import {
  electricalCalcError,
  electricalCalcErrorCode,
  electricalCalcGuidanceContext,
  electricalCalcHint,
  electricalCalcSuggestedActions,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import { getCalcJobRefetchInterval, isActiveCalcJobStatus } from '@/utils/calcJobPolling';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import { getElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';
import { formatNumber, formatPower } from '@/utils/formatters';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import ElectricalCandidateColumnSettingsModal from '@/components/electrical/ElectricalCandidateColumnSettingsModal';
import ElectricalColumnSettingsModal from '@/components/electrical/ElectricalColumnSettingsModal';
import { ROUTES } from '@/routes/routes';
import type { ProjectObject, ProjectObjectsPageCursor } from '@/types/project';
import type {
  BatchElectricalResponse,
  ElectricalCandidate,
  ElectricalCandidateFolder,
  ElectricalCalcSummary,
  ElectricalQueryResponse,
  ElectricalQueryRequest,
} from '@/types/calculation';
import {
  ELECTRICAL_TABLE_COLUMN_PREF_KEY,
  clampElectricalTableColumnWidthPct,
  clearRegisteredElectricalTableColumnCache,
  createElectricalTableColumnSettingsPatch,
  electricalTableColumnWidthPxToPct,
  getAvailableElectricalTableColumnKeys,
  getDefaultElectricalTableColumnSettings,
  getVisibleElectricalTableColumnMetas,
  moveElectricalTableColumnToOrder,
  normalizeElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  readRegisteredElectricalTableColumnCache,
  reorderElectricalTableColumn,
  resetElectricalTableColumnSettings,
  resetElectricalTableColumnWidth,
  setElectricalTableColumnVisibility,
  setElectricalTableColumnWidthPct,
  writeGuestElectricalTableColumnSettings,
  writeRegisteredElectricalTableColumnCache,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
  clearRegisteredElectricalCandidateTableColumnCache,
  createElectricalCandidateTableColumnSettingsPatch,
  getAvailableElectricalCandidateTableColumnKeys,
  getDefaultElectricalCandidateTableColumnSettings,
  getVisibleElectricalCandidateTableColumnMetas,
  moveElectricalCandidateTableColumnToOrder,
  normalizeElectricalCandidateTableColumnSettings,
  readGuestElectricalCandidateTableColumnSettings,
  readRegisteredElectricalCandidateTableColumnCache,
  reorderElectricalCandidateTableColumn,
  resetElectricalCandidateTableColumnSettings,
  resetElectricalCandidateTableColumnWidth,
  setElectricalCandidateTableColumnVisibility,
  setElectricalCandidateTableColumnWidthPct,
  writeGuestElectricalCandidateTableColumnSettings,
  writeRegisteredElectricalCandidateTableColumnCache,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  ELECTRICAL_TABLE_VIEW_PREF_KEY,
  clearRegisteredElectricalTableViewCache,
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  readGuestElectricalTableViewSettings,
  readRegisteredElectricalTableViewCache,
  resolveElectricalTableFontSize,
  writeGuestElectricalTableViewSettings,
  writeRegisteredElectricalTableViewCache,
  type ElectricalCalculationCableSource,
  type ElectricalTableFontSize,
  type ElectricalTableLabelFormat,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';
import {
  resolveElectricalCandidateTableEngine,
  resolveElectricalTableEngine,
} from '@/utils/electricalTableEngine';
import {
  buildElectricalGlideColumns,
} from '@/utils/electricalGlideGrid';
import {
  buildElectricalCandidateGlideColumns,
} from '@/utils/electricalCandidateGlideGrid';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  externalLabelSourceForCableRow,
  type CableCatalogRow,
  visibleCableRowsForSource,
} from '@/utils/cableCatalogSourceLabels';
import {
  applyColumnFilters,
  applyTableSort,
  createEmptyTableViewState,
  hasActiveTableViewState,
  isColumnFilterActive,
  removeHiddenTableViewState,
  type HeatCalcColumnFilter,
  type HeatCalcColumnValueAccessors,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type {
  ObjectQueryFieldCapability,
  ObjectQueryFilter as BackendObjectQueryFilter,
} from '@/types/project';

const { Text } = Typography;
const ElectricalGlideGrid = lazy(() => import('@/components/electrical/ElectricalGlideGrid'));
const ElectricalCandidateGlideGrid = lazy(() => import('@/components/electrical/ElectricalCandidateGlideGrid'));

type CableTypeKey =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core'
  | 'mineral'
  | 'skin';

function isBatchElectricalResponse(result: unknown): result is BatchElectricalResponse {
  return typeof result === 'object' && result !== null && 'calculated' in result;
}

function isApiError(error: unknown): error is ApiError {
  return error instanceof Error;
}

function isTargetVariantNotEmptyError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 409 && error.code === 'target_not_empty';
}

const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
  mineral: 'С мин. изоляцией',
  skin: 'Скин-система',
};

const DEFAULT_CABLE_TYPE: CableTypeKey = 'self_regulating';
const MVP_CABLE_TYPES: readonly CableTypeKey[] = [DEFAULT_CABLE_TYPE];
const FULL_FEATURE_CABLE_TYPES: readonly CableTypeKey[] = [
  'self_regulating',
  'self_regulating_tt',
  'single_core',
  'three_core',
];
const SHOW_COMMERCIAL_CABLE_BASE_UI = false;
const SELECTION_POLICY_LABEL: Record<SelectionPolicy, string> = {
  technical_minimum: 'Технический',
  lowest_cost: 'Дешевле',
  fastest_delivery: 'Быстрее',
  in_stock: 'В наличии',
  preferred_supplier: 'Приоритет',
  balanced: 'Баланс',
};
const SELECTION_POLICY_OPTIONS = (Object.keys(SELECTION_POLICY_LABEL) as SelectionPolicy[]).map(
  (value) => ({
    value,
    label: SELECTION_POLICY_LABEL[value],
  }),
);
type CandidateFolderKey = 'all' | 'favorite' | `custom:${string}`;
type CandidateFolderModalMode = 'create' | 'rename';
const candidateCustomFolderKey = (folderId: string): CandidateFolderKey => `custom:${folderId}`;
const candidateCustomFolderId = (key: CandidateFolderKey): string | null =>
  key.startsWith('custom:') ? key.slice('custom:'.length) : null;
const isResistiveCableType = (type: CableTypeKey) => type === 'single_core' || type === 'three_core';
type CatalogStatusColor = 'default' | 'success' | 'warning' | 'error';
type CatalogStatus = { label: string; color: CatalogStatusColor };
type CableStatusRow = CableCatalogRow & {
  technical_data_complete?: boolean;
  price_per_meter?: number | null;
  stock_quantity_m?: number | null;
  stock_status?: string | null;
  lead_time_days?: number | null;
  supplier_priority?: number | null;
  is_preferred?: boolean;
};
type CableMarkSelectOption = {
  value: string;
  label: ReactNode;
  searchLabel: string;
  mark: string | null;
  optionSource: CableMarkOptionSource;
  cableSource?: CableSource;
  disabled?: boolean;
};
type CableMarkOptionSource = CableSource | 'project';

function hasCommercialData(row: CableStatusRow) {
  return row.price_per_meter != null
    || row.stock_quantity_m != null
    || (row.stock_status != null && row.stock_status !== 'unknown')
    || row.lead_time_days != null
    || row.supplier_priority != null
    || row.is_preferred === true;
}

function commercialStatus(rows: CableStatusRow[]): CatalogStatus {
  if (rows.length === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  const completeCount = rows.filter(hasCommercialData).length;
  if (completeCount === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  if (completeCount < rows.length) return { label: 'Коммерческие данные неполные', color: 'warning' };
  return { label: 'Коммерческие данные есть', color: 'success' };
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined;
}

function hasTechnicalData(type: CableTypeKey, row: CableStatusRow) {
  if (typeof row.technical_data_complete === 'boolean') return row.technical_data_complete;
  if (type === 'self_regulating') {
    return hasValue(row.power_per_meter)
      && hasValue(row.max_temperature)
      && hasValue(row.min_temperature);
  }
  if (type === 'self_regulating_tt') {
    return hasValue(row.q1)
      && hasValue(row.q2)
      && hasValue(row.max_product_temp)
      && hasValue(row.max_vapor_temp);
  }
  if (type === 'single_core' || type === 'three_core') {
    return hasValue(row.resistance_ohm_km)
      && (hasValue(row.conductor_section_mm2) || hasValue(row.conductor_cross_section));
  }
  return false;
}

function technicalStatus(type: CableTypeKey | null, rows: CableStatusRow[]): CatalogStatus {
  if (!type) return { label: 'Техданные: несколько типов', color: 'default' };
  if (rows.length === 0) return { label: 'Нет техданных', color: 'error' };
  const completeCount = rows.filter((row) => hasTechnicalData(type, row)).length;
  if (completeCount === rows.length) return { label: 'Техданные полные', color: 'success' };
  if (completeCount > 0) return { label: 'Техданные неполные', color: 'warning' };
  return { label: 'Нет техданных', color: 'error' };
}

const ELECTRICAL_TABLE_PAGE_SIZE = 50;
type ElectricalBatchScope = 'all' | 'selected';
type ElectricalBatchMutationArgs = {
  scope: ElectricalBatchScope;
  objectIds?: string[];
  skipManual?: boolean;
};
type CopyElectricalVariantMutationArgs = {
  targetVariant: number;
  overwrite?: boolean;
};
const EMPTY_OBJECTS: ProjectObject[] = [];
const EMPTY_ELECTRICAL_CALCS: ElectricalCalcSummary[] = [];

type CableMarkSource = 'auto' | 'manual';
type ThreadSource = 'auto' | 'manual' | 'default' | 'previous_result';

type ElectricalNavigationState = {
  activeJobId?: string;
} | null;

type ElectricalTableColumnPreferenceMutation = {
  settings: ElectricalTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

type ElectricalCandidateTableColumnPreferenceMutation = {
  settings: ElectricalCandidateTableColumnSettings;
  closeModal?: boolean;
  showMessage?: boolean;
};

const CANDIDATE_NUMERIC_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'supply_voltage',
  'winding_coefficient',
  'vapor_temperature',
  'maintain_temperature',
  'installed_cable_length',
  'order_cable_length',
  'total_power',
  'power_per_meter',
  'installed_power_per_meter',
  'current',
  'voltage',
  'price_per_meter',
  'required_order_length',
  'total_cost',
  'lead_time_days',
]);

const CANDIDATE_ENUM_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'mode',
  'cable_type',
  'connection_type',
  'selection_policy',
  'applied_selection_policy',
  'stock_status',
]);

const CANDIDATE_BOOLEAN_FILTER_KEYS = new Set<ElectricalCandidateColumnKey>([
  'marked',
  'aggressive_product',
]);

type ElectricalTableSettingsPreferenceMutation = {
  columnSettings: ElectricalTableColumnSettings;
  viewSettings: ElectricalTableViewSettings;
};

const AUTO_CABLE_MARK_VALUE = '__auto__';
const CABLE_MARK_OPTION_SEPARATOR = '::';

function calculationVariantLabel(variants: readonly number[]) {
  return variants.map((targetVariant) => `СО${targetVariant}`).join(', ');
}

function normalizeCalculationVariantList(values: readonly unknown[]): CalculationVariant[] {
  const selected = new Set(
    values
      .map(Number)
      .filter((value): value is CalculationVariant =>
        (CALCULATION_VARIANTS as readonly number[]).includes(value)),
  );
  return CALCULATION_VARIANTS.filter((targetVariant) => selected.has(targetVariant));
}

function normalizeCableSource(value: unknown): CableSource | null {
  return value === 'builtin'
    || value === 'commercial'
    || value === 'extended'
    || value === 'all'
    ? value
    : null;
}

function normalizeCableMarkOptionSource(value: unknown): CableMarkOptionSource {
  if (value === 'project') return 'project';
  return normalizeCableSource(value) ?? 'builtin';
}

function cableMarkOptionValue(source: CableMarkOptionSource, mark: string) {
  return `${source}${CABLE_MARK_OPTION_SEPARATOR}${encodeURIComponent(mark)}`;
}

function catalogSourceFromSnapshot(calc: ElectricalCalcSummary | undefined): CableSource | null {
  const snapshot = calc?.cable_snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return normalizeCableSource(snapshot.actual_catalog_source)
    ?? normalizeCableSource(snapshot.requested_catalog_source);
}

function externalCableOptionLabelSource(
  row: CableStatusRow,
  rows: CableStatusRow[],
  builtinRows: CableStatusRow[],
  source: CableSource,
): CableMarkOptionSource | null {
  return externalLabelSourceForCableRow(row, rows, builtinRows, source);
}

function getCableMark(calc: ElectricalCalcSummary | undefined) {
  const selectedCable = calc?.results?.selected_cable;
  return calc?.cable_mark ?? (typeof selectedCable === 'string' ? selectedCable : undefined);
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function candidateOrderCableLengthValue(candidate: ElectricalCandidate) {
  const explicitRaw = candidate.results?.order_cable_length;
  if (explicitRaw === null || explicitRaw === undefined || explicitRaw === '') return undefined;
  const explicitLength = Number(explicitRaw);
  return Number.isFinite(explicitLength) ? explicitLength : undefined;
}

function candidateCommercialValue(candidate: ElectricalCandidate, key: string) {
  const commercial = candidate.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

function candidatePowerPerMeterValue(candidate: ElectricalCandidate) {
  return finiteNumber(candidate.results?.power_per_meter);
}

function candidateInstalledPowerPerMeterValue(candidate: ElectricalCandidate) {
  return finiteNumber(candidate.results?.installed_power_per_meter);
}

function candidateThreadSource(candidate: ElectricalCandidate): ThreadSource | null {
  const value = candidate.results?.number_of_threads_source ?? candidate.params?.number_of_threads_source;
  return value === 'auto'
    || value === 'manual'
    || value === 'default'
    || value === 'previous_result'
    ? value
    : null;
}

function candidateElectricalFieldValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
  marked = false,
) {
  switch (key) {
    case 'marked':
      return marked;
    case 'mode':
      return candidate.mode === 'auto' ? 'Авто' : 'Ручной';
    case 'cable_type':
      return CABLE_TYPE_LABEL[candidate.cable_type as CableTypeKey] ?? candidate.cable_type;
    case 'cable_mark':
      return candidate.cable_mark;
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason':
      return candidate.reason_message ?? candidate.results?.selection_reason;
    case 'winding_pitch_mm':
      return candidate.results?.winding_pitch;
    case 'number_of_threads':
      return candidate.results?.num_circuits;
    case 'laying_step':
      return candidate.params?.laying_step;
    case 'heating_height':
      return candidate.params?.heating_height;
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CONNECTION_TYPE_LABEL[String(value)] ?? value;
    }
    case 'supply_voltage':
      return candidate.params?.supply_voltage;
    case 'winding_coefficient':
      return candidate.params?.winding_coefficient;
    case 'vapor_temperature':
      return candidate.params?.vapor_temperature;
    case 'maintain_temperature':
      return candidate.params?.maintain_temperature ?? candidate.params?.process_temperature;
    case 'aggressive_product':
      return typeof candidate.params?.aggressive_product === 'boolean'
        ? candidate.params.aggressive_product
        : undefined;
    case 'installed_cable_length':
      return candidate.results?.installed_cable_length;
    case 'order_cable_length':
      return candidateOrderCableLengthValue(candidate);
    case 'total_power':
      return candidate.results?.total_power;
    case 'power_per_meter':
      return candidatePowerPerMeterValue(candidate);
    case 'installed_power_per_meter':
      return candidateInstalledPowerPerMeterValue(candidate);
    case 'current':
      return candidate.results?.current;
    case 'voltage':
      return candidate.results?.voltage;
    case 'price_per_meter':
      return candidateCommercialValue(candidate, 'price_per_meter');
    case 'required_order_length':
      return candidateCommercialValue(candidate, 'required_order_length');
    case 'total_cost':
      return candidateCommercialValue(candidate, 'total_cost');
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : undefined;
    }
    case 'lead_time_days':
      return candidateCommercialValue(candidate, 'lead_time_days');
    default:
      return candidate.results?.[key] ?? candidate.params?.[key];
  }
}

const CANDIDATE_COMPARE_SERVICE_COLUMN_KEYS = new Set<ElectricalCandidateColumnKey>([
  'marked',
  'actions',
]);
const CANDIDATE_COMPARE_EMPTY_VALUE = '__empty__';

function isCandidateCompareColumn(key: ElectricalCandidateColumnKey) {
  return !CANDIDATE_COMPARE_SERVICE_COLUMN_KEYS.has(key);
}

function normalizeCandidateCompareText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') return CANDIDATE_COMPARE_EMPTY_VALUE;
  return trimmed.toLocaleLowerCase('ru');
}

function candidateCompareDisplayValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
) {
  switch (key) {
    case 'marked':
    case 'actions':
      return CANDIDATE_COMPARE_EMPTY_VALUE;
    case 'mode':
      return candidate.mode === 'auto' ? 'Авто' : 'Ручной';
    case 'cable_type':
      return CABLE_TYPE_LABEL[candidate.cable_type as CableTypeKey] ?? candidate.cable_type;
    case 'cable_mark':
      return valueText(candidate.cable_mark);
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason':
      return valueText(candidate.reason_message ?? candidate.results?.selection_reason);
    case 'winding_pitch_mm':
      return numberText(candidate.results?.winding_pitch, 0);
    case 'number_of_threads':
      return numberText(candidate.results?.num_circuits, 0);
    case 'laying_step':
      return numberText(candidate.params?.laying_step, 2);
    case 'heating_height':
      return numberText(candidate.params?.heating_height, 1);
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
    }
    case 'supply_voltage':
      return numberText(candidate.params?.supply_voltage, 0);
    case 'winding_coefficient':
      return numberText(candidate.params?.winding_coefficient, 2);
    case 'vapor_temperature':
      return numberText(candidate.params?.vapor_temperature, 1);
    case 'maintain_temperature':
      return numberText(candidate.params?.maintain_temperature ?? candidate.params?.process_temperature, 1);
    case 'aggressive_product':
      return valueText(candidate.params?.aggressive_product);
    case 'installed_cable_length':
      return numberText(candidate.results?.installed_cable_length, 1);
    case 'order_cable_length':
      return numberText(candidateOrderCableLengthValue(candidate), 1);
    case 'total_power':
      return powerText(candidate.results?.total_power);
    case 'power_per_meter':
      return numberText(candidatePowerPerMeterValue(candidate), 2);
    case 'installed_power_per_meter':
      return numberText(candidateInstalledPowerPerMeterValue(candidate), 2);
    case 'current':
      return numberText(candidate.results?.current, 2);
    case 'voltage':
      return numberText(candidate.results?.voltage, 0);
    case 'price_per_meter':
      return numberText(candidateCommercialValue(candidate, 'price_per_meter'), 2);
    case 'required_order_length':
      return numberText(candidateCommercialValue(candidate, 'required_order_length'), 1);
    case 'total_cost':
      return numberText(candidateCommercialValue(candidate, 'total_cost'), 2);
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
    }
    case 'lead_time_days':
      return numberText(candidateCommercialValue(candidate, 'lead_time_days'), 0);
    default:
      return valueText(candidate.results?.[key] ?? candidate.params?.[key]);
  }
}

function candidateCompareValue(
  key: ElectricalCandidateColumnKey,
  candidate: ElectricalCandidate,
) {
  return normalizeCandidateCompareText(candidateCompareDisplayValue(key, candidate));
}

function renderCandidateElectricalField(
  key: ElectricalColumnKey,
  candidate: ElectricalCandidate,
) {
  switch (key) {
    case 'cable_type':
      return CABLE_TYPE_LABEL[candidate.cable_type as CableTypeKey] ?? candidate.cable_type;
    case 'cable_mark':
      return (
        <Space size={4} wrap={false}>
          <Text strong={candidate.is_recommended} ellipsis style={{ maxWidth: 130 }}>
            {candidate.cable_mark ?? '—'}
          </Text>
          {candidate.is_recommended && <Tag color="blue" style={{ marginInlineEnd: 0 }}>приор.</Tag>}
          {candidate.is_pinned && <Tag color="purple" style={{ marginInlineEnd: 0 }}>избр.</Tag>}
        </Space>
      );
    case 'cable_snapshot_status':
      return candidate.cable_snapshot ? (
        <Tag color="success" style={{ marginInlineEnd: 0 }}>снимок</Tag>
      ) : '—';
    case 'selection_policy':
      return selectionPolicyText(candidate.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(candidate.results?.applied_selection_policy);
    case 'selection_reason': {
      const reason = candidate.reason_message ?? candidate.results?.selection_reason;
      return (
        <Tooltip title={valueText(reason)}>
          <Text
            className="electrical-selection-reason-cell"
            type={candidate.reason_message ? 'danger' : 'secondary'}
          >
            {valueText(reason)}
          </Text>
        </Tooltip>
      );
    }
    case 'winding_pitch_mm':
      return numberText(candidate.results?.winding_pitch, 0);
    case 'number_of_threads': {
      const sourceMeta = threadSourceTag(candidateThreadSource(candidate));
      return (
        <Space size={4} wrap={false}>
          <Text>{numberText(candidate.results?.num_circuits, 0)}</Text>
          {sourceMeta && (
            <Tooltip title={sourceMeta.tooltip}>
              <Tag
                color={sourceMeta.color}
                style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}
              >
                {sourceMeta.label}
              </Tag>
            </Tooltip>
          )}
        </Space>
      );
    }
    case 'laying_step':
      return numberText(candidate.params?.laying_step, 2);
    case 'heating_height':
      return numberText(candidate.params?.heating_height, 1);
    case 'connection_type': {
      const value = candidate.params?.connection_type;
      return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
    }
    case 'supply_voltage':
      return numberText(candidate.params?.supply_voltage, 0);
    case 'winding_coefficient':
      return numberText(candidate.params?.winding_coefficient, 2);
    case 'vapor_temperature':
      return numberText(candidate.params?.vapor_temperature, 1);
    case 'maintain_temperature':
      return numberText(candidate.params?.maintain_temperature ?? candidate.params?.process_temperature, 1);
    case 'aggressive_product':
      return valueText(candidate.params?.aggressive_product);
    case 'installed_cable_length':
      return numberText(candidate.results?.installed_cable_length, 1);
    case 'order_cable_length':
      return numberText(candidateOrderCableLengthValue(candidate), 1);
    case 'total_power':
      return powerText(candidate.results?.total_power);
    case 'power_per_meter':
      return numberText(candidatePowerPerMeterValue(candidate), 2);
    case 'installed_power_per_meter':
      return numberText(candidateInstalledPowerPerMeterValue(candidate), 2);
    case 'current':
      return numberText(candidate.results?.current, 2);
    case 'voltage':
      return numberText(candidate.results?.voltage, 0);
    case 'price_per_meter':
      return numberText(candidateCommercialValue(candidate, 'price_per_meter'), 2);
    case 'required_order_length':
      return numberText(candidateCommercialValue(candidate, 'required_order_length'), 1);
    case 'total_cost':
      return numberText(candidateCommercialValue(candidate, 'total_cost'), 2);
    case 'stock_status': {
      const value = candidateCommercialValue(candidate, 'stock_status');
      return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
    }
    case 'lead_time_days':
      return numberText(candidateCommercialValue(candidate, 'lead_time_days'), 0);
    default:
      return valueText(candidate.results?.[key] ?? candidate.params?.[key]);
  }
}

function currentElectricalCalc(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.results) return undefined;
  const results = calc.results as Record<string, unknown>;
  if (
    results.error_code
    || results.category
    || results.stale === true
    || results.stale === 'true'
  ) {
    return undefined;
  }
  return getCableMark(calc) ? calc : undefined;
}

function getCableMarkSource(calc: ElectricalCalcSummary | undefined): CableMarkSource {
  const value = calc?.cable_mark_source ?? calc?.params?.cable_mark_source;
  return value === 'manual' ? 'manual' : 'auto';
}

function cableSnapshotStatusTag(calc: ElectricalCalcSummary | undefined) {
  if (!calc) return null;
  const status = calc.cable_snapshot_status;
  if (!status) return null;
  const technicalStatus = status.technical_status;
  const commercialStatus = status.commercial_status;
  if (technicalStatus === 'missing' || commercialStatus === 'missing') {
    return {
      color: 'orange',
      label: 'нет в базе',
      tooltip: status.message || 'Кабель сохранён в проекте, но отсутствует в текущей базе.',
    };
  }
  if (technicalStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'red',
      label: 'техн. изм.',
      tooltip: `${status.message || 'Технические параметры кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (commercialStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'gold',
      label: 'комм. изм.',
      tooltip: `${status.message || 'Коммерческие данные кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (technicalStatus === 'unknown' || commercialStatus === 'unknown') {
    return {
      color: 'default',
      label: 'стар.',
      tooltip: status.message || 'Расчёт создан без сохранённого снимка кабеля.',
    };
  }
  return null;
}

function shouldShowProjectCableOption(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.cable_snapshot) return false;
  const technicalStatus = calc.cable_snapshot_status?.technical_status;
  return technicalStatus === 'missing' || technicalStatus === 'changed';
}

function getThreadSource(calc: ElectricalCalcSummary | undefined): ThreadSource | null {
  const value = calc?.results?.number_of_threads_source ?? calc?.params?.number_of_threads_source;
  return value === 'auto'
    || value === 'manual'
    || value === 'default'
    || value === 'previous_result'
    ? value
    : null;
}

function threadSourceTag(source: ThreadSource | null) {
  if (source === 'manual') {
    return { color: 'purple', label: 'ручн.', tooltip: 'Количество ниток задано вручную' };
  }
  if (source === 'auto') {
    return { color: 'blue', label: 'авто', tooltip: 'Количество ниток подобрано алгоритмом' };
  }
  if (source === 'previous_result') {
    return { color: 'gold', label: 'пред.', tooltip: 'Количество ниток взято из предыдущего результата' };
  }
  if (source === 'default') {
    return { color: 'default', label: 'по ум.', tooltip: 'Использовано значение по умолчанию' };
  }
  return null;
}

function calcLayoutValues(calc: ElectricalCalcSummary | undefined) {
  return {
    windingPitchMm: Number(calc?.results?.winding_pitch ?? 0),
    numberOfThreads: Number(calc?.results?.num_circuits ?? 1),
  };
}

const ELECTRICAL_LAYOUT_EDITABLE_COLUMNS = new Set(['winding_pitch_mm', 'number_of_threads']);

function parseElectricalLayoutNumber(value: unknown) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxThreadsForCableType(type: CableTypeKey) {
  return type === 'self_regulating' ? 3 : 100;
}

function pipeOuterDiameterMm(obj: ProjectObject) {
  if (obj.object_type !== 'pipe') return null;
  const raw = Number(obj.params?.outer_diameter);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : null;
}

function maxWindingCoefficientForDiameterMm(diameterMm: number) {
  if (diameterMm < 57) return 1.0;
  if (diameterMm === 57) return 1.1;
  if (diameterMm <= 75) return 1.2;
  if (diameterMm <= 89) return 1.3;
  if (diameterMm <= 108) return 1.4;
  return 1.5;
}

function windingCoefficientForPitch(diameterMm: number, pitchMm: number) {
  return Math.sqrt(1 + ((Math.PI * diameterMm) / pitchMm) ** 2);
}

type ElectricalColumnRenderSpec = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  render: (_: unknown, obj: ProjectObject, idx: number) => ReactNode;
};

const OBJECT_TYPE_LABEL: Record<string, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

const CONNECTION_TYPE_LABEL: Record<string, string> = {
  line_1ph: 'Линия',
  loop_1ph: 'Петля',
  star_3ph: 'Звезда',
  loop_2x3: 'Петля 2×3',
  loop_1x3: 'Петля 1×3',
  star_3x3: 'Звезда 3×3',
  star_1x3: 'Звезда 1×3',
};

const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: 'В наличии',
  limited: 'Ограничено',
  on_order: 'Под заказ',
  unknown: 'Неизвестно',
};

type ElectricalFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function objectDisplayName(obj: ProjectObject) {
  return String(obj.params?.name ?? `${obj.object_type} ${obj.id}`);
}

function numberText(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === '') return formatNumber(null, digits);
  return formatNumber(Number(value), digits);
}

function powerText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return formatPower(Number(value));
}

function resultNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(calc?.results?.[key], digits);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cableSnapshotRow(calc: ElectricalCalcSummary | undefined): CableStatusRow | null {
  const snapshot = calc?.cable_snapshot;
  if (!isRecord(snapshot)) return null;
  const technical = isRecord(snapshot.technical) ? snapshot.technical : {};
  const commercial = isRecord(snapshot.commercial) ? snapshot.commercial : {};
  const model = typeof snapshot.cable_mark === 'string' ? snapshot.cable_mark : technical.model;
  return {
    ...technical,
    ...commercial,
    model: typeof model === 'string' ? model : null,
    cable_type: typeof snapshot.cable_type === 'string' ? snapshot.cable_type : null,
    source: typeof snapshot.actual_catalog_source === 'string'
      ? snapshot.actual_catalog_source
      : typeof snapshot.requested_catalog_source === 'string'
        ? snapshot.requested_catalog_source
        : 'project',
  };
}

function cablePowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.power_per_meter);
}

function installedPowerPerMeterValue(calc: ElectricalCalcSummary | undefined) {
  return finiteNumber(calc?.results?.installed_power_per_meter);
}

function orderCableLengthValue(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.results) return undefined;
  const explicitRaw = calc.results.order_cable_length;
  if (explicitRaw !== null && explicitRaw !== undefined && explicitRaw !== '') {
    const explicitLength = Number(explicitRaw);
    if (Number.isFinite(explicitLength)) return explicitLength;
  }
  return undefined;
}

function commercialValue(calc: ElectricalCalcSummary | undefined, key: string) {
  const commercial = calc?.results?.commercial;
  if (typeof commercial !== 'object' || commercial === null || Array.isArray(commercial)) return undefined;
  return (commercial as Record<string, unknown>)[key];
}

function commercialNumber(calc: ElectricalCalcSummary | undefined, key: string, digits = 2) {
  return numberText(commercialValue(calc, key), digits);
}

function selectionPolicyText(value: unknown) {
  if (typeof value !== 'string') return '—';
  return SELECTION_POLICY_LABEL[value as SelectionPolicy] ?? (value === 'manual_selection' ? 'Ручной' : value);
}

function objectResultNumber(obj: ProjectObject, key: string, digits = 2) {
  return numberText(obj.results?.[key], digits);
}

function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function filterKindForElectricalColumn(
  key: ElectricalColumnKey,
  capability?: ObjectQueryFieldCapability,
): ElectricalFilterKind {
  if (capability?.filter.enabled) {
    if (capability.filter.ops.includes('range')) return 'numberRange';
    if (capability.filter.ops.includes('in')) return 'enum';
    if (capability.filter.ops.includes('equals') && capability.data_type === 'boolean') {
      return 'boolean';
    }
    return 'text';
  }
  if ([
    'installed_cable_length',
    'order_cable_length',
    'total_power',
    'power_per_meter',
    'installed_power_per_meter',
    'current',
    'voltage',
  ].includes(key)) {
    return 'numberRange';
  }
  if (['electrical_status', 'object_type', 'heat_loss_status', 'cable_type'].includes(key)) {
    return 'enum';
  }
  return 'text';
}

function filterKindForCandidateColumn(key: ElectricalCandidateColumnKey): ElectricalFilterKind {
  if (CANDIDATE_BOOLEAN_FILTER_KEYS.has(key)) return 'boolean';
  if (CANDIDATE_NUMERIC_FILTER_KEYS.has(key)) return 'numberRange';
  if (CANDIDATE_ENUM_FILTER_KEYS.has(key)) return 'enum';
  return 'text';
}

function backendFilterFromElectricalColumnFilter(
  key: ElectricalColumnKey,
  filter: HeatCalcColumnFilter,
  capability?: ObjectQueryFieldCapability,
): BackendObjectQueryFilter | null {
  if (!isColumnFilterActive(filter)) return null;
  const ops = capability?.filter.ops ?? [];
  if (filter.kind === 'text') {
    return { key, op: 'contains', value: filter.value };
  }
  if (filter.kind === 'numberRange') {
    return {
      key,
      op: 'range',
      min: Number.isFinite(filter.min) ? filter.min : undefined,
      max: Number.isFinite(filter.max) ? filter.max : undefined,
      include_empty: !!filter.includeEmpty,
    };
  }
  if (filter.kind === 'enum') {
    return {
      key,
      op: ops.includes('equals') && filter.values.length === 1 ? 'equals' : 'in',
      value: ops.includes('equals') && filter.values.length === 1 ? filter.values[0] : undefined,
      values: ops.includes('equals') && filter.values.length === 1 ? undefined : filter.values,
      include_empty: !!filter.includeEmpty,
    };
  }
  if (filter.kind === 'boolean') {
    return {
      key,
      op: 'equals',
      value: filter.value === 'empty' ? null : filter.value,
      include_empty: filter.value === 'empty',
    };
  }
  return null;
}

function buildElectricalQueryRequest(
  projectId: string,
  variant: number,
  cableSource: CableSource,
  state: HeatCalcTableViewState,
  page: number,
  pageSize: number,
  capabilities?: { fields: ObjectQueryFieldCapability[] },
  cursor?: ProjectObjectsPageCursor | null,
): ElectricalQueryRequest {
  const capabilityByKey = new Map(capabilities?.fields.map((field) => [field.key, field]) ?? []);
  const filters = Object.entries(state.filters)
    .map(([key, filter]) => filter
      ? backendFilterFromElectricalColumnFilter(key, filter, capabilityByKey.get(key))
      : null)
    .filter((filter): filter is BackendObjectQueryFilter => filter != null);
  const sortCapability = state.sort ? capabilityByKey.get(state.sort.columnKey) : undefined;
  return {
    project_id: projectId,
    variant_number: variant,
    cable_source: cableSource,
    page,
    page_size: pageSize,
    after_sort_order: cursor?.sort_order,
    after_id: cursor?.id,
    after_key: cursor?.key,
    after_value: cursor?.value,
    after_value_is_null: cursor?.value_is_null,
    filters,
    sort: state.sort && (sortCapability?.sort.enabled ?? true)
      ? { key: state.sort.columnKey, dir: state.sort.direction }
      : null,
  };
}

function projectObjectsPageCursorsEqual(
  left?: ProjectObjectsPageCursor | null,
  right?: ProjectObjectsPageCursor | null,
) {
  if (left == null || right == null) return left == null && right == null;
  return left.id === right.id
    && left.sort_order === right.sort_order
    && left.key === right.key
    && left.value === right.value
    && left.value_is_null === right.value_is_null;
}

function ColumnFilterDropdown({
  title,
  kind,
  filter,
  enumOptions,
  onApply,
  onReset,
  onClose,
}: {
  title: string;
  kind: ElectricalFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions?: Array<{ value: string; label: string }>;
  onApply: (filter: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [textValue, setTextValue] = useState(filter?.kind === 'text' ? filter.value : '');
  const [minValue, setMinValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null,
  );
  const [maxValue, setMaxValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null,
  );
  const [enumValues, setEnumValues] = useState<string[]>(
    filter?.kind === 'enum' ? filter.values.map(String) : [],
  );
  const [booleanValue, setBooleanValue] = useState<boolean | 'empty' | undefined>(
    filter?.kind === 'boolean' ? filter.value : undefined,
  );
  const [includeEmpty, setIncludeEmpty] = useState(
    (filter?.kind === 'numberRange' || filter?.kind === 'enum') && !!filter.includeEmpty,
  );
  const invalidRange = Number.isFinite(minValue)
    && Number.isFinite(maxValue)
    && Number(minValue) > Number(maxValue);

  const applyFilter = () => {
    if (kind === 'text') onApply({ kind: 'text', value: textValue });
    if (kind === 'numberRange') {
      onApply({
        kind: 'numberRange',
        min: minValue ?? undefined,
        max: maxValue ?? undefined,
        includeEmpty,
      });
    }
    if (kind === 'enum') onApply({ kind: 'enum', values: enumValues, includeEmpty });
    if (kind === 'boolean') onApply({ kind: 'boolean', value: booleanValue });
    onClose();
  };

  const resetFilter = () => {
    onReset();
    onClose();
  };

  return (
    <div className="table-filter-dropdown">
      <Text strong>{title}</Text>
      {kind === 'text' && (
        <Input
          size="small"
          aria-label={`Поиск: ${title}`}
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          onPressEnter={applyFilter}
          allowClear
        />
      )}
      {kind === 'numberRange' && (
        <Space size={6}>
          <InputNumber
            size="small"
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            value={minValue}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <InputNumber
            size="small"
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            value={maxValue}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
        </Space>
      )}
      {kind === 'enum' && (
        <Select
          mode="multiple"
          size="small"
          aria-label={`Значения: ${title}`}
          value={enumValues}
          options={enumOptions}
          onChange={setEnumValues}
          style={{ minWidth: 220 }}
          maxTagCount="responsive"
        />
      )}
      {kind === 'boolean' && (
        <Select
          size="small"
          aria-label={`Значение: ${title}`}
          allowClear
          value={booleanValue}
          options={[
            { value: true, label: 'Да' },
            { value: false, label: 'Нет' },
            { value: 'empty', label: 'Пустые' },
          ]}
          onChange={setBooleanValue}
          style={{ minWidth: 160 }}
        />
      )}
      {(kind === 'numberRange' || kind === 'enum') && (
        <Checkbox checked={includeEmpty} onChange={(event) => setIncludeEmpty(event.target.checked)}>
          Пустые
        </Checkbox>
      )}
      <div className="table-filter-actions">
        <Button size="small" onClick={resetFilter}>
          Сбросить
        </Button>
        <Button size="small" type="primary" disabled={invalidRange} onClick={applyFilter}>
          Применить
        </Button>
      </div>
    </div>
  );
}

function ResizableColumnTitle({
  title,
  label,
  onResizeStart,
}: {
  title: string;
  label: string;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <span className="resizable-column-title">
      <span className="resizable-column-title-text">{title}</span>
      <button
        type="button"
        className="column-resize-handle"
        aria-label={`Изменить ширину: ${label}`}
        tabIndex={-1}
        onPointerDown={onResizeStart}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </span>
  );
}

export default function ElecCalcPage() {
  const project = useProjectStore((s) => s.currentProject);
  const role = useAuthStore((s) => s.role);
  const registeredUserId = useAuthStore((s) => s.user?.id ?? null);
  const isEmployee = role === 'employee' || role === 'admin';
  const isRegisteredUser = isEmployee;
  const commercialFeaturesAvailable = areCommercialFeaturesEnabled();
  const availableCableTypeKeys = useMemo(
    () => commercialFeaturesAvailable ? FULL_FEATURE_CABLE_TYPES : MVP_CABLE_TYPES,
    [commercialFeaturesAvailable],
  );
  const availableCableTypes = useMemo(
    () => new Set<CableTypeKey>(availableCableTypeKeys),
    [availableCableTypeKeys],
  );
  const normalizeAvailableCableType = useCallback(
    (type: CableTypeKey | null | undefined): CableTypeKey =>
      type && availableCableTypes.has(type) ? type : DEFAULT_CABLE_TYPE,
    [availableCableTypes],
  );
  const location = useLocation();
  const electricalTableEngine = useMemo(
    () => resolveElectricalTableEngine({ search: location.search }),
    [location.search],
  );
  const electricalCandidateTableEngine = useMemo(
    () => resolveElectricalCandidateTableEngine({
      search: location.search,
      fallback: electricalTableEngine,
    }),
    [electricalTableEngine, location.search],
  );
  const electricalGlideEnabled = electricalTableEngine === 'glide';
  const electricalCandidateGlideEnabled = electricalCandidateTableEngine === 'glide';
  const navigationActiveJobId =
    (location.state as ElectricalNavigationState)?.activeJobId ?? null;
  const storedVariant = useCalculationVariantStore((s) =>
    project?.id ? s.variantByProject[project.id] : undefined
  );
  const saveVariant = useCalculationVariantStore((s) => s.setVariant);
  const variant = normalizeCalculationVariant(storedVariant);
  const setVariant = useCallback(
    (nextVariant: number) => {
      if (project?.id) saveVariant(project.id, nextVariant);
    },
    [project?.id, saveVariant],
  );

  const [selectionPolicy, setSelectionPolicy] = useState<SelectionPolicy>('technical_minimum');
  const [defaultCableType, setDefaultCableType] =
    useState<CableTypeKey>(DEFAULT_CABLE_TYPE);
  const [cableTypeDraftByObjectId, setCableTypeDraftByObjectId] =
    useState<Record<string, CableTypeKey>>({});
  const [supplyVoltage, setSupplyVoltage] = useState<number | null>(220);
  const [connectionType, setConnectionType] = useState<string>('line_1ph');
  const [windingCoefficient, setWindingCoefficient] = useState<number | null>(1);
  const [heatingHeight, setHeatingHeight] = useState<number | null>(null);
  const [layingStep, setLayingStep] = useState<number | null>(0.1);
  const [maintainTemperature, setMaintainTemperature] = useState<number | null>(null);
  const [vaporTemperature, setVaporTemperature] = useState<number | null>(null);
  const [aggressiveProduct, setAggressiveProduct] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(ELECTRICAL_TABLE_PAGE_SIZE);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [cableMarkModalObjectId, setCableMarkModalObjectId] = useState<string | null>(null);
  const [cableMarkModalCableType, setCableMarkModalCableType] = useState<CableTypeKey | null>(null);
  const [cableMarkModalValue, setCableMarkModalValue] = useState<string | null>(null);
  const [cableMarkModalTargetVariants, setCableMarkModalTargetVariants] =
    useState<CalculationVariant[]>([]);
  const [cableSizingModalObjectId, setCableSizingModalObjectId] = useState<string | null>(null);
  const [cableSizingMode, setCableSizingMode] = useState<'auto' | 'manual'>('auto');
  const [cableSizingCableType, setCableSizingCableType] = useState<CableTypeKey>(DEFAULT_CABLE_TYPE);
  const [cableSizingManualMark, setCableSizingManualMark] = useState<string | null>(null);
  const [markedCableSizingCandidateIds, setMarkedCableSizingCandidateIds] = useState<string[]>([]);
  const [activeCandidateFolderKey, setActiveCandidateFolderKey] =
    useState<CandidateFolderKey>('all');
  const previousActiveCandidateFolderKeyRef = useRef<CandidateFolderKey>('all');
  const [candidateFolderModalMode, setCandidateFolderModalMode] =
    useState<CandidateFolderModalMode>('create');
  const [candidateFolderModalOpen, setCandidateFolderModalOpen] = useState(false);
  const [candidateFolderName, setCandidateFolderName] = useState('');
  const [editingCandidateFolder, setEditingCandidateFolder] =
    useState<ElectricalCandidateFolder | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [tableColumnSettings, setTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalTableColumnCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalTableColumnSettings();
      }
      return readGuestElectricalTableColumnSettings();
    });
  const [candidateTableColumnSettings, setCandidateTableColumnSettings] =
    useState<ElectricalCandidateTableColumnSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalCandidateTableColumnCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalCandidateTableColumnSettings();
      }
      return readGuestElectricalCandidateTableColumnSettings();
    });
  const [tableViewSettings, setTableViewSettings] =
    useState<ElectricalTableViewSettings>(() => {
      const auth = useAuthStore.getState();
      const cached = readRegisteredElectricalTableViewCache(auth.user?.id ?? null);
      if (auth.role === 'employee' || auth.role === 'admin') {
        return cached ?? getDefaultElectricalTableViewSettings();
      }
      return readGuestElectricalTableViewSettings();
    });
  const cableSource: CableSource = isEmployee
    ? tableViewSettings.calculationCableSource
    : 'builtin';
  const effectiveSource: CableSource = commercialFeaturesAvailable ? cableSource : 'builtin';
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [candidateColumnSettingsOpen, setCandidateColumnSettingsOpen] = useState(false);
  const [draftTableColumnSettings, setDraftTableColumnSettings] =
    useState<ElectricalTableColumnSettings>(() => tableColumnSettings);
  const [draftCandidateTableColumnSettings, setDraftCandidateTableColumnSettings] =
    useState<ElectricalCandidateTableColumnSettings>(() => candidateTableColumnSettings);
  const [draftTableViewSettings, setDraftTableViewSettings] =
    useState<ElectricalTableViewSettings>(() => tableViewSettings);
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const candidateTableColumnSettingsRef = useRef(candidateTableColumnSettings);
  const tableViewSettingsRef = useRef(tableViewSettings);
  const [tableViewState, setTableViewState] =
    useState<HeatCalcTableViewState>(() => createEmptyTableViewState());
  const [candidateTableViewState, setCandidateTableViewState] =
    useState<HeatCalcTableViewState>(() => createEmptyTableViewState());
  const [electricalPageCursors, setElectricalPageCursors] =
    useState<Record<number, ProjectObjectsPageCursor | null>>({ 1: null });
  const [electricalInfinitePages, setElectricalInfinitePages] =
    useState<Record<number, ElectricalQueryResponse>>({});
  const [activeJobId, setActiveJobId] = useState<string | null>(
    () => navigationActiveJobId,
  );
  const [activeBatchScope, setActiveBatchScope] = useState<ElectricalBatchScope | null>(null);
  const [overwriteManualChoices, setOverwriteManualChoices] = useState(false);
  const activeBatchObjectIdsRef = useRef<string[] | null>(null);
  const pageScopeRef = useRef<{ projectId?: string; variant: number } | null>(null);
  const tableScrollRegionsRef = useRef<HTMLDivElement | null>(null);
  useFocusableTableScrollRegions(
    tableScrollRegionsRef,
    'Таблица электротехнического расчёта',
    Boolean(project),
  );

  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    setDefaultCableType((current) => normalizeAvailableCableType(current));
    setCableSizingCableType((current) => normalizeAvailableCableType(current));
    setCableMarkModalCableType((current) =>
      current == null ? null : normalizeAvailableCableType(current));
    setCableTypeDraftByObjectId((current) => {
      let changed = false;
      const next: Record<string, CableTypeKey> = {};
      for (const [objectId, cableType] of Object.entries(current)) {
        if (!availableCableTypes.has(cableType)) {
          changed = true;
          continue;
        }
        next[objectId] = cableType;
      }
      return changed ? next : current;
    });
  }, [availableCableTypes, normalizeAvailableCableType]);

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    candidateTableColumnSettingsRef.current = candidateTableColumnSettings;
  }, [candidateTableColumnSettings]);

  useEffect(() => {
    tableViewSettingsRef.current = tableViewSettings;
  }, [tableViewSettings]);

  useEffect(() => {
    setTablePage(1);
  }, [project?.id, variant]);

  useEffect(() => {
    setActiveRowId(null);
  }, [project?.id, variant, tablePage, tablePageSize]);

  useEffect(() => {
    setCandidateTableViewState(createEmptyTableViewState());
  }, [cableSizingModalObjectId]);

  useEffect(() => {
    setElectricalPageCursors({ 1: null });
    setElectricalInfinitePages({});
  }, [effectiveSource, project?.id, variant, tablePageSize, tableViewState]);

  useEffect(() => {
    setSelectedRowKeys([]);
    setCableTypeDraftByObjectId({});
  }, [project?.id, variant]);

  useEffect(() => {
    if (navigationActiveJobId) {
      setActiveJobId(navigationActiveJobId);
    }
  }, [navigationActiveJobId]);

  useEffect(() => {
    const currentScope = { projectId: project?.id, variant };
    const previousScope = pageScopeRef.current;
    pageScopeRef.current = currentScope;
    if (!previousScope) return;
    if (!previousScope.projectId && currentScope.projectId) return;
    if (
      previousScope.projectId !== currentScope.projectId ||
      previousScope.variant !== currentScope.variant
    ) {
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
  }, [project?.id, variant]);

  const { data: electricalQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query-capabilities', variant],
    queryFn: () => getElectricalQueryCapabilities(project!.id, variant),
    enabled: !!project,
    staleTime: 60_000,
  });
  const electricalPageCursor = electricalPageCursors[tablePage] ?? null;
  const electricalQueryRequest = useMemo(
    () => (project
      ? buildElectricalQueryRequest(
        project.id,
        variant,
        cableSource,
        tableViewState,
        tablePage,
        tablePageSize,
        electricalQueryCapabilities,
        electricalPageCursor,
      )
      : null),
    [
      electricalPageCursor,
      electricalQueryCapabilities,
      project,
      cableSource,
      tablePage,
      tablePageSize,
      tableViewState,
      variant,
    ],
  );
  const {
    data: electricalPage,
    isFetching: isElectricalPageFetching,
    isPlaceholderData: isElectricalPagePlaceholderData,
  } = useQuery({
    queryKey: ['project', project?.id, 'electrical-query', electricalQueryRequest],
    queryFn: () => queryElectrical(electricalQueryRequest!),
    enabled: !!project && electricalQueryRequest != null && !!electricalQueryCapabilities,
    placeholderData: (previous) => previous,
  });
  const pageSummary = electricalPage?.summary;
  const pageInfo = electricalPage?.page_info;
  const nextElectricalPageCursor = pageInfo?.next_cursor;
  useEffect(() => {
    if (!electricalGlideEnabled || isElectricalPageFetching || isElectricalPagePlaceholderData || !electricalPage) {
      return;
    }
    setElectricalInfinitePages((current) => {
      if (current[tablePage] === electricalPage) return current;
      if (tablePage === 1) return { 1: electricalPage };
      return { ...current, [tablePage]: electricalPage };
    });
  }, [
    electricalGlideEnabled,
    electricalPage,
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    tablePage,
  ]);
  const electricalLoadedPages = useMemo(() => {
    if (!electricalGlideEnabled) {
      return electricalPage ? [electricalPage] : [];
    }
    const pages: ElectricalQueryResponse[] = [];
    for (let page = 1; page <= tablePage; page += 1) {
      const loadedPage = electricalInfinitePages[page];
      if (loadedPage) pages.push(loadedPage);
    }
    if (pages.length === 0 && electricalPage && !isElectricalPagePlaceholderData) {
      return [electricalPage];
    }
    return pages;
  }, [
    electricalGlideEnabled,
    electricalInfinitePages,
    electricalPage,
    isElectricalPagePlaceholderData,
    tablePage,
  ]);
  const objects = useMemo(() => {
    if (!electricalGlideEnabled) return electricalPage?.items ?? EMPTY_OBJECTS;
    if (electricalLoadedPages.length === 0) return EMPTY_OBJECTS;
    const seen = new Set<string>();
    const rows: ProjectObject[] = [];
    electricalLoadedPages.forEach((page) => {
      page.items.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        rows.push(item);
      });
    });
    return rows;
  }, [electricalGlideEnabled, electricalLoadedPages, electricalPage?.items]);
  const elecCalcs = useMemo(() => {
    if (!electricalGlideEnabled) return electricalPage?.calculations ?? EMPTY_ELECTRICAL_CALCS;
    if (electricalLoadedPages.length === 0) return EMPTY_ELECTRICAL_CALCS;
    const seen = new Set<string>();
    const calculations: ElectricalCalcSummary[] = [];
    electricalLoadedPages.forEach((page) => {
      page.calculations.forEach((calc) => {
        if (seen.has(calc.object_id)) return;
        seen.add(calc.object_id);
        calculations.push(calc);
      });
    });
    return calculations;
  }, [electricalGlideEnabled, electricalLoadedPages, electricalPage?.calculations]);
  const electricalDisplayOffset = electricalGlideEnabled ? 0 : (pageInfo?.offset ?? 0);
  const stats = useElectricalStats(objects, elecCalcs);

  useEffect(() => {
    if (isElectricalPageFetching || isElectricalPagePlaceholderData) return;
    const nextCursor = nextElectricalPageCursor;
    if (!nextCursor) return;
    setElectricalPageCursors((current) => {
      const nextPage = tablePage + 1;
      const existing = current[nextPage];
      if (projectObjectsPageCursorsEqual(existing, nextCursor)) {
        return current;
      }
      return { ...current, [nextPage]: nextCursor };
    });
  }, [
    isElectricalPageFetching,
    isElectricalPagePlaceholderData,
    nextElectricalPageCursor,
    tablePage,
  ]);

  const getCalculatedCableTypeForObject = useCallback((objectId: string): CableTypeKey | null => {
    const savedType = stats.calcByObjectId[objectId]?.cable_type;
    return savedType && savedType in CABLE_TYPE_LABEL
      ? savedType as CableTypeKey
      : null;
  }, [stats.calcByObjectId]);
  const getSavedCableTypeForObject = useCallback(
    (objectId: string): CableTypeKey =>
      normalizeAvailableCableType(getCalculatedCableTypeForObject(objectId) ?? DEFAULT_CABLE_TYPE),
    [getCalculatedCableTypeForObject, normalizeAvailableCableType],
  );

  const getDraftCableTypeForObject = useCallback((objectId: string): CableTypeKey =>
    normalizeAvailableCableType(cableTypeDraftByObjectId[objectId] ?? getSavedCableTypeForObject(objectId)),
  [cableTypeDraftByObjectId, getSavedCableTypeForObject, normalizeAvailableCableType]);

  const selectedCableTypes = useMemo(
    () => selectedRowKeys.map((objectId) => getDraftCableTypeForObject(objectId)),
    [getDraftCableTypeForObject, selectedRowKeys],
  );
  const selectedCableType = useMemo<CableTypeKey | null>(() => {
    if (selectedCableTypes.length === 0) return null;
    const [firstType] = selectedCableTypes;
    return selectedCableTypes.every((type) => type === firstType) ? firstType : null;
  }, [selectedCableTypes]);
  const selectedCableTypesMixed = selectedCableTypes.length > 0 && selectedCableType == null;
  const cableTypeForRecalculation = selectedCableTypesMixed
    ? defaultCableType
    : selectedCableType ?? defaultCableType;
  const visibleCableTypeControl = selectedCableTypesMixed ? null : cableTypeForRecalculation;

  const objectOverridesForIds = useCallback((objectIds: string[]) =>
    objectIds
      .map((objectId) => {
        const draftType = cableTypeDraftByObjectId[objectId];
        const cableType = normalizeAvailableCableType(draftType);
        return draftType
          ? {
              object_id: objectId,
              cable_type: cableType,
            }
          : null;
      })
      .filter((item): item is { object_id: string; cable_type: CableTypeKey } => item != null),
  [cableTypeDraftByObjectId, normalizeAvailableCableType]);

  useEffect(() => {
    const visibleIds = new Set(objects.map((object) => object.id));
    setSelectedRowKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleIds.has(key));
      return nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])
        ? keys
        : nextKeys;
    });
  }, [objects]);

  const { data: activeJob } = useQuery({
    queryKey: ['calc-job', activeJobId],
    queryFn: () => getCalcTask(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return getCalcJobRefetchInterval(status);
    },
    refetchIntervalInBackground: true,
  });

  const { data: cables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables(effectiveSource, 'self_regulating'),
    queryFn: () => listCables(effectiveSource, 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: builtinCables = [] } = useQuery({
    queryKey: referenceQueryKeys.cables('builtin', 'self_regulating'),
    queryFn: () => listCables('builtin', 'self_regulating'),
    ...referenceQueryOptions,
  });
  const { data: ttCables = [] } = useQuery({
    queryKey: referenceQueryKeys.ttCables,
    queryFn: getCablesTt,
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: resistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables(effectiveSource),
    queryFn: () => getResistiveCables(effectiveSource),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });
  const { data: builtinResistiveCables } = useQuery({
    queryKey: referenceQueryKeys.resistiveCables('builtin'),
    queryFn: () => getResistiveCables('builtin'),
    enabled: !!project && commercialFeaturesAvailable,
    ...referenceQueryOptions,
  });

  const cableRowsForType = useCallback((type: CableTypeKey): CableStatusRow[] => {
    if (!availableCableTypes.has(type)) return [];
    if (type === 'self_regulating') {
      return visibleCableRowsForSource(cables, builtinCables, effectiveSource);
    }
    if (type === 'self_regulating_tt') return ttCables;
    if (type === 'single_core') {
      return visibleCableRowsForSource(
        resistiveCables?.single_core ?? [],
        builtinResistiveCables?.single_core ?? [],
        effectiveSource,
      );
    }
    if (type === 'three_core') {
      return visibleCableRowsForSource(
        resistiveCables?.three_core ?? [],
        builtinResistiveCables?.three_core ?? [],
        effectiveSource,
      );
    }
    return [];
  }, [
    availableCableTypes,
    builtinCables,
    builtinResistiveCables,
    cables,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);

  const visibleCableCatalog = useMemo<CableStatusRow[]>(() => {
    if (!visibleCableTypeControl) return [];
    return cableRowsForType(visibleCableTypeControl);
  }, [
    cableRowsForType,
    visibleCableTypeControl,
  ]);
  const commercialDataStatus = useMemo(
    () => commercialStatus(visibleCableCatalog),
    [visibleCableCatalog],
  );
  const technicalDataStatus = useMemo(
    () => technicalStatus(visibleCableTypeControl, visibleCableCatalog),
    [visibleCableCatalog, visibleCableTypeControl],
  );

  const { data: persistedTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableColumnSettings>(ELECTRICAL_TABLE_COLUMN_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedCandidateTableColumnPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
      ),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const { data: persistedTableViewPreference } = useQuery({
    queryKey: ['preference', ELECTRICAL_TABLE_VIEW_PREF_KEY],
    queryFn: () =>
      getUserPreference<ElectricalTableViewSettings>(ELECTRICAL_TABLE_VIEW_PREF_KEY),
    enabled: isRegisteredUser,
    staleTime: 30_000,
  });

  const updateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalTableColumnSettings(preference.value);
      setTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  const updateCandidateTableColumnPreference = useMutation({
    mutationFn: ({ settings }: ElectricalCandidateTableColumnPreferenceMutation) =>
      updateUserPreference<ElectricalCandidateTableColumnSettings>(
        ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalCandidateTableColumnSettings(settings),
      ),
    onSuccess: (preference, variables) => {
      const normalized = normalizeElectricalCandidateTableColumnSettings(preference.value);
      setCandidateTableColumnSettings(normalized);
      if (preference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(preference.user_id, normalized);
      }
      if (variables.closeModal) setCandidateColumnSettingsOpen(false);
      if (variables.showMessage !== false) message.success('Настройки таблицы подбора сохранены');
    },
    onError: (error) => {
      message.error(
        error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы подбора',
      );
    },
  });

  const updateTableSettingsPreference = useMutation({
    mutationFn: async ({ columnSettings, viewSettings }: ElectricalTableSettingsPreferenceMutation) => {
      const columnPreference = await updateUserPreference<ElectricalTableColumnSettings>(
        ELECTRICAL_TABLE_COLUMN_PREF_KEY,
        normalizeElectricalTableColumnSettings(columnSettings),
      );
      const viewPreference = await updateUserPreference<ElectricalTableViewSettings>(
        ELECTRICAL_TABLE_VIEW_PREF_KEY,
        normalizeElectricalTableViewSettings(viewSettings),
      );
      return { columnPreference, viewPreference };
    },
    onSuccess: ({ columnPreference, viewPreference }) => {
      const normalizedColumns = normalizeElectricalTableColumnSettings(columnPreference.value);
      const normalizedView = normalizeElectricalTableViewSettings(viewPreference.value);
      setTableColumnSettings(normalizedColumns);
      tableViewSettingsRef.current = normalizedView;
      setTableViewSettings(normalizedView);
      if (columnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(columnPreference.user_id, normalizedColumns);
      }
      if (viewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(viewPreference.user_id, normalizedView);
      }
      setColumnSettingsOpen(false);
      message.success('Настройки таблицы сохранены');
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки таблицы');
    },
  });

  useEffect(() => {
    if (isRegisteredUser) {
      const registeredViewSettings =
        readRegisteredElectricalTableViewCache(registeredUserId) ??
        getDefaultElectricalTableViewSettings();
      setTableColumnSettings(
        readRegisteredElectricalTableColumnCache(registeredUserId) ??
          getDefaultElectricalTableColumnSettings(),
      );
      setCandidateTableColumnSettings(
        readRegisteredElectricalCandidateTableColumnCache(registeredUserId) ??
          getDefaultElectricalCandidateTableColumnSettings(),
      );
      tableViewSettingsRef.current = registeredViewSettings;
      setTableViewSettings(registeredViewSettings);
      return;
    }
    setTableColumnSettings(readGuestElectricalTableColumnSettings());
    setCandidateTableColumnSettings(readGuestElectricalCandidateTableColumnSettings());
    const guestViewSettings = readGuestElectricalTableViewSettings();
    tableViewSettingsRef.current = guestViewSettings;
    setTableViewSettings(guestViewSettings);
  }, [isRegisteredUser, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableColumnPreference) return;
    if (persistedTableColumnPreference.value) {
      const normalized = normalizeElectricalTableColumnSettings(
        persistedTableColumnPreference.value,
      );
      setTableColumnSettings(normalized);
      if (persistedTableColumnPreference.user_id) {
        writeRegisteredElectricalTableColumnCache(
          persistedTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalTableColumnCache(
      registeredUserId ?? persistedTableColumnPreference.user_id,
    );
    setTableColumnSettings(getDefaultElectricalTableColumnSettings());
  }, [isRegisteredUser, persistedTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedCandidateTableColumnPreference) return;
    if (persistedCandidateTableColumnPreference.value) {
      const normalized = normalizeElectricalCandidateTableColumnSettings(
        persistedCandidateTableColumnPreference.value,
      );
      setCandidateTableColumnSettings(normalized);
      if (persistedCandidateTableColumnPreference.user_id) {
        writeRegisteredElectricalCandidateTableColumnCache(
          persistedCandidateTableColumnPreference.user_id,
          normalized,
        );
      }
      return;
    }
    clearRegisteredElectricalCandidateTableColumnCache(
      registeredUserId ?? persistedCandidateTableColumnPreference.user_id,
    );
    setCandidateTableColumnSettings(getDefaultElectricalCandidateTableColumnSettings());
  }, [isRegisteredUser, persistedCandidateTableColumnPreference, registeredUserId]);

  useEffect(() => {
    if (!isRegisteredUser || !persistedTableViewPreference) return;
    if (persistedTableViewPreference.value) {
      const normalized = normalizeElectricalTableViewSettings(persistedTableViewPreference.value);
      tableViewSettingsRef.current = normalized;
      setTableViewSettings(normalized);
      if (persistedTableViewPreference.user_id) {
        writeRegisteredElectricalTableViewCache(persistedTableViewPreference.user_id, normalized);
      }
      return;
    }
    clearRegisteredElectricalTableViewCache(
      registeredUserId ?? persistedTableViewPreference.user_id,
    );
    const defaults = getDefaultElectricalTableViewSettings();
    tableViewSettingsRef.current = defaults;
    setTableViewSettings(defaults);
  }, [isRegisteredUser, persistedTableViewPreference, registeredUserId]);

  const batchMut = useMutation({
    mutationFn: ({ scope, objectIds, skipManual = true }: ElectricalBatchMutationArgs) => {
      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = scope === 'selected'
        ? objectOverridesForIds(selectedObjectIds)
        : [];
      const fallbackCableType = scope === 'selected'
        ? selectedCableType ?? defaultCableType
        : cableTypeForRecalculation;
      const effectiveCableType = normalizeAvailableCableType(fallbackCableType);
      const selectionMode = isResistiveCableType(effectiveCableType) ? 'auto' : undefined;
      return enqueueElectricalBatchJob(
        project!.id,
        effectiveSource,
        variant,
        effectiveCableType,
        {
          supplyVoltage,
          selectionMode,
          selectionPolicy,
          connectionType,
          windingCoefficient,
          heatingHeight,
          layingStep,
          maintainTemperature,
          vaporTemperature,
          aggressiveProduct,
          skipManual,
          objectIds: scope === 'selected' ? selectedObjectIds : undefined,
          forceCableType: scope === 'all',
          objectOverrides: objectOverrides.length > 0 ? objectOverrides : undefined,
        },
      );
    },
    onSuccess: (task, variables) => {
      setActiveJobId(task.id);
      setActiveBatchScope(variables.scope);
      activeBatchObjectIdsRef.current = variables.scope === 'selected'
        ? variables.objectIds ?? []
        : null;
      message.info(
        variables.scope === 'selected'
          ? `СО${variant} · электрорасчёт выбранных объектов поставлен в очередь`
          : `СО${variant} · электрорасчёт всех объектов поставлен в очередь`,
      );
    },
    onError: (e: Error) => message.error(e.message),
  });

  const copyVariantMut = useMutation({
    mutationFn: ({ targetVariant, overwrite = false }: CopyElectricalVariantMutationArgs) =>
      copyElectricalVariant({
        project_id: project!.id,
        source_variant_number: variant,
        target_variant_number: targetVariant,
        overwrite,
        regenerate_specification: true,
      }),
    onSuccess: (res: CopyElectricalVariantResponse) => {
      setTablePage(1);
      setElectricalPageCursors({ 1: null });
      setSelectedRowKeys([]);
      setCableTypeDraftByObjectId({});
      setVariant(res.target_variant_number);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['spec', project?.id, res.target_variant_number] });
      qc.invalidateQueries({ queryKey: ['report-preview', project?.id, res.target_variant_number] });
      message.success(
        `СО${res.target_variant_number} создан на основании СО${res.source_variant_number}: ` +
        `скопировано ${res.copied_count}, успешно проверено ${res.validated_count ?? 0}`,
      );
      if ((res.validation_failed_count ?? 0) > 0) {
        message.warning(
          `В СО${res.target_variant_number} есть ошибки проверки скопированного выбора: ` +
          `${res.validation_failed_count}. Новый кабель автоматически не подбирался.`,
        );
      }
      if (res.copied_count < res.project_objects_count) {
        message.info(
          `В проекте объектов: ${res.project_objects_count}, скопировано расчётов: ${res.copied_count}. ` +
          `Остальные в СО${res.target_variant_number} не рассчитаны.`,
        );
      }
    },
    onError: (error: Error, variables) => {
      if (isTargetVariantNotEmptyError(error) && !variables.overwrite) {
        Modal.confirm({
          title: `СО${variables.targetVariant} уже содержит расчёты`,
          content: `Заменить СО${variables.targetVariant} копией СО${variant}? ` +
            `Все текущие расчёты СО${variables.targetVariant} будут удалены.`,
          okText: 'Заменить',
          okButtonProps: { danger: true },
          cancelText: 'Отмена',
          onOk: () => copyVariantMut.mutate({ ...variables, overwrite: true }),
        });
        return;
      }
      message.error(error.message);
    },
  });

  const cancelJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeJobId!),
    onSuccess: (task) => {
      setActiveJobId(task.id);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
      message.warning('Электрорасчёт остановлен');
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'succeeded') {
      const res = isBatchElectricalResponse(activeJob.result) ? activeJob.result : null;
      const resultScope = res?.scope ?? activeBatchScope ?? 'all';
      const scopeLabel = resultScope === 'selected' ? 'выбранных объектов' : 'всех объектов';
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      if (res && res.calculated === 0 && res.heat_loss_failed > 0) {
        message.warning(
          `СО${variant} · электрорасчёт не выполнен: у выбранных объектов не рассчитаны теплопотери (${res.heat_loss_failed}).`,
        );
      } else if (res && (res.skipped > 0 || res.heat_loss_failed > 0)) {
        message.warning(
          `СО${variant} · рассчитано для ${scopeLabel}: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else if (res) {
        message.success(
          `СО${variant} — расчёт выполнен для ${scopeLabel}: ${res.calculated}` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      } else {
        message.success(`СО${variant} — расчёт выполнен`);
      }
      setCableTypeDraftByObjectId((prev) => {
        if (resultScope === 'all') return {};
        const affectedIds = activeBatchObjectIdsRef.current;
        if (!affectedIds || affectedIds.length === 0) return prev;
        const next = { ...prev };
        for (const objectId of affectedIds) {
          delete next[objectId];
        }
        return next;
      });
      activeBatchObjectIdsRef.current = null;
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
    if (activeJob.status === 'failed') {
      message.error(activeJob.error_message || 'Электрорасчёт завершился ошибкой');
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
    if (activeJob.status === 'cancelled') {
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
  }, [activeBatchScope, activeJob, project?.id, qc, variant]);

  const optionWithSourceLabel = useCallback((label: string, source?: CableMarkOptionSource | null) => {
    if (source !== 'extended' && source !== 'project') return label;
    const tag = source === 'extended'
      ? { color: 'blue', label: 'внеш.' }
      : { color: 'green', label: 'проект' };
    return (
      <Space size={6}>
        <span>{label}</span>
        <Tag color={tag.color} style={{ marginInlineEnd: 0 }}>{tag.label}</Tag>
      </Space>
    );
  }, []);
  const cableMarkOption = useCallback((
    mark: string,
    text: string,
    source?: string | null,
    disabled?: boolean,
    cableSource?: CableSource | null,
    displaySource?: CableMarkOptionSource | null,
  ): CableMarkSelectOption => ({
    value: cableMarkOptionValue(normalizeCableMarkOptionSource(source), mark),
    label: optionWithSourceLabel(
      text,
      displaySource === undefined ? normalizeCableMarkOptionSource(source) : displaySource,
    ),
    searchLabel: text,
    mark,
    optionSource: normalizeCableMarkOptionSource(source),
    cableSource: cableSource ?? normalizeCableSource(source) ?? undefined,
    disabled,
  }), [optionWithSourceLabel]);
  const autoCableMarkOption = useCallback((): CableMarkSelectOption => ({
    value: AUTO_CABLE_MARK_VALUE,
    label: 'Авто',
    searchLabel: 'Авто',
    mark: null,
    optionSource: 'builtin',
  }), []);
  const cableOptions = useMemo(
    () => visibleCableRowsForSource(cables, builtinCables, effectiveSource).map((c) => {
      const label = `${c.model} · ${c.power_per_meter ?? '—'} Вт/м`;
      return cableMarkOption(
        c.model ?? label,
        label,
        c.source,
        false,
        normalizeCableSource(c.source) ?? undefined,
        externalCableOptionLabelSource(c, cables, builtinCables, effectiveSource),
      );
    }),
    [builtinCables, cableMarkOption, cables, effectiveSource],
  );
  const manualCableOptionsForType = useCallback((type: CableTypeKey): CableMarkSelectOption[] => {
    if (!availableCableTypes.has(type)) return [];
    if (type === 'self_regulating') return cableOptions;
    if (type === 'self_regulating_tt') {
      const suffix = aggressiveProduct ? 'СТ' : 'СР';
      return ttCables.map((c) => {
        const value = `${c.model}-${suffix}`;
        return cableMarkOption(
          value,
          `${value} · ${c.series} · ${c.nominal_power} Вт/м`,
          (c as { source?: string | null }).source,
        );
      });
    }
    if (type === 'single_core') {
      const rows = resistiveCables?.single_core ?? [];
      const builtinRows = builtinResistiveCables?.single_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    if (type === 'three_core') {
      const rows = resistiveCables?.three_core ?? [];
      const builtinRows = builtinResistiveCables?.three_core ?? [];
      return visibleCableRowsForSource(rows, builtinRows, effectiveSource)
        .filter((c) => typeof c.model === 'string')
        .map((c) => {
          const row = c as CableStatusRow & { model: string };
          return cableMarkOption(
            row.model,
            `${row.model} · ${row.resistance_ohm_km ?? '—'} Ом/км · ${row.nominal_size_mm ?? '—'}`,
            row.source,
            false,
            normalizeCableSource(row.source) ?? undefined,
            externalCableOptionLabelSource(
              row,
              rows,
              builtinRows,
              effectiveSource,
            ),
          );
        });
    }
    return [];
  }, [
    aggressiveProduct,
    availableCableTypes,
    builtinResistiveCables,
    cableMarkOption,
    cableOptions,
    effectiveSource,
    resistiveCables,
    ttCables,
  ]);
  const cableMarkOptionsFor = useCallback((
    type: CableTypeKey,
    mark?: string,
    calc?: ElectricalCalcSummary,
  ) => {
    const manualOptions = manualCableOptionsForType(type);
    const savedSource = catalogSourceFromSnapshot(calc);
    const matchingCatalogOption = mark
      ? manualOptions.find((option) =>
          option.mark === mark && (!savedSource || option.cableSource === savedSource))
        ?? manualOptions.find((option) => option.mark === mark)
      : undefined;
    const projectOption = mark && shouldShowProjectCableOption(calc)
      ? cableMarkOption(
          mark,
          `${mark} · сохранён в проекте`,
          'project',
          false,
          savedSource ?? matchingCatalogOption?.cableSource ?? effectiveSource,
        )
      : null;
    return [
      autoCableMarkOption(),
      ...(projectOption ? [projectOption] : []),
      ...manualOptions,
    ];
  }, [autoCableMarkOption, cableMarkOption, effectiveSource, manualCableOptionsForType]);
  const cableSizingEffectiveCableType = normalizeAvailableCableType(cableSizingCableType);
  const cableSizingManualOptions = useMemo(
    () => manualCableOptionsForType(cableSizingEffectiveCableType),
    [cableSizingEffectiveCableType, manualCableOptionsForType],
  );
  const cableSizingCandidateParams = useMemo(() => ({
    supply_voltage: supplyVoltage,
    selection_mode: isResistiveCableType(cableSizingEffectiveCableType) ? 'auto' : undefined,
    selection_policy: selectionPolicy,
    connection_type: connectionType,
    winding_coefficient: windingCoefficient,
    heating_height: heatingHeight,
    laying_step: layingStep,
    maintain_temperature: maintainTemperature,
    vapor_temperature: vaporTemperature,
    aggressive_product: aggressiveProduct,
  }), [
    aggressiveProduct,
    cableSizingEffectiveCableType,
    connectionType,
    heatingHeight,
    layingStep,
    maintainTemperature,
    selectionPolicy,
    supplyVoltage,
    vaporTemperature,
    windingCoefficient,
  ]);
  const cableSizingCandidatesQueryKey = useMemo(() => [
    'project',
    project?.id,
    'electrical-candidates',
    cableSizingModalObjectId,
    variant,
  ] as const, [cableSizingModalObjectId, project?.id, variant]);
  const cableSizingCandidateFoldersQueryKey = useMemo(() => [
    'project',
    project?.id,
    'electrical-candidate-folders',
    cableSizingModalObjectId,
    variant,
  ] as const, [cableSizingModalObjectId, project?.id, variant]);
  const setCableSizingCandidateApplied = useCallback((
    candidateId: string | null,
    appliedCandidate?: ElectricalCandidate,
  ) => {
    qc.setQueryData<ElectricalCandidate[]>(
      cableSizingCandidatesQueryKey,
      (current) => {
        const next = current?.map((candidate) => {
          const isApplied = candidateId !== null && candidate.id === candidateId;
          return {
            ...candidate,
            ...(isApplied && appliedCandidate ? appliedCandidate : {}),
            is_applied: isApplied,
          };
        });
        if (!next || !appliedCandidate || next.some((candidate) => candidate.id === appliedCandidate.id)) {
          return next;
        }
        return [{ ...appliedCandidate, is_applied: true }, ...next];
      },
    );
  }, [cableSizingCandidatesQueryKey, qc]);
  const setElectricalQueryCalculation = useCallback((calculation: ElectricalCalcSummary) => {
    if (!project?.id) return;
    qc.setQueriesData<ElectricalQueryResponse>(
      { queryKey: ['project', project.id, 'electrical-query'] },
      (current) => {
        if (!current) return current;
        const replaced = current.calculations.some((calc) =>
          calc.object_id === calculation.object_id &&
          calc.variant_number === calculation.variant_number,
        );
        const calculations = replaced
          ? current.calculations.map((calc) =>
              calc.object_id === calculation.object_id &&
              calc.variant_number === calculation.variant_number
                ? calculation
                : calc)
          : [...current.calculations, calculation];
        return { ...current, calculations };
      },
    );
  }, [project?.id, qc]);
  const invalidateCableSizingCandidates = useCallback(() => {
    qc.invalidateQueries({
      queryKey: ['project', project?.id, 'electrical-candidates', cableSizingModalObjectId],
    });
  }, [cableSizingModalObjectId, project?.id, qc]);
  const invalidateCableSizingCandidateFolders = useCallback(() => {
    qc.invalidateQueries({
      queryKey: cableSizingCandidateFoldersQueryKey,
    });
  }, [cableSizingCandidateFoldersQueryKey, qc]);
  const createCandidateMut = useMutation({
    mutationFn: ({ mode, mark }: { mode: 'auto' | 'manual'; mark?: string | null }) =>
      createElectricalCandidate({
        project_id: project!.id,
        object_id: cableSizingModalObjectId!,
        variant_number: variant,
        cable_type: cableSizingEffectiveCableType,
        cable_source: effectiveSource,
        mode,
        cable_mark: mode === 'manual' ? mark ?? null : null,
        electrical_params: cableSizingCandidateParams,
      }),
    onSuccess: ({ candidate, action }) => {
      invalidateCableSizingCandidates();
      const statusMessage = candidate.status === 'applicable'
        ? action === 'updated'
          ? 'Вариант обновлён'
          : 'Вариант добавлен'
        : candidate.reason_message || 'Вариант подбора сохранён с диагностикой';
      message[candidate.status === 'applicable' ? 'success' : 'warning'](statusMessage);
    },
    onError: (error: Error) => message.error(error.message),
  });
  const updateCandidateMut = useMutation({
    mutationFn: ({
      candidateId,
      patch,
    }: {
      candidateId: string;
      patch: Partial<Pick<
        ElectricalCandidate,
        'priority' | 'is_recommended' | 'is_pinned' | 'status' | 'engineer_comment'
      >>;
    }) => updateElectricalCandidate(candidateId, patch),
    onSuccess: invalidateCableSizingCandidates,
    onError: (error: Error) => message.error(error.message),
  });
  const createCandidateFolderMut = useMutation({
    mutationFn: () => createElectricalCandidateFolder({
      project_id: project!.id,
      object_id: cableSizingModalObjectId!,
      variant_number: variant,
      name: candidateFolderName.trim(),
    }),
    onSuccess: (folder) => {
      invalidateCableSizingCandidateFolders();
      setActiveCandidateFolderKey(candidateCustomFolderKey(folder.id));
      setCandidateFolderModalOpen(false);
      setCandidateFolderName('');
      message.success('Папка создана');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const updateCandidateFolderMut = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      updateElectricalCandidateFolder(folderId, { name }),
    onSuccess: () => {
      invalidateCableSizingCandidateFolders();
      setCandidateFolderModalOpen(false);
      setCandidateFolderName('');
      setEditingCandidateFolder(null);
      message.success('Папка переименована');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const deleteCandidateFolderMut = useMutation({
    mutationFn: deleteElectricalCandidateFolder,
    onSuccess: (_result, folderId) => {
      invalidateCableSizingCandidateFolders();
      if (activeCandidateFolderKey === candidateCustomFolderKey(folderId)) {
        setActiveCandidateFolderKey('all');
      }
      message.success('Папка удалена');
    },
    onError: (error: Error) => message.error(error.message),
  });
  const toggleCandidateFolderItemMut = useMutation({
    mutationFn: ({
      folderId,
      candidateId,
      checked,
    }: {
      folderId: string;
      candidateId: string;
      checked: boolean;
    }) => checked
      ? addElectricalCandidateToFolder(folderId, candidateId)
      : removeElectricalCandidateFromFolder(folderId, candidateId),
    onSuccess: invalidateCableSizingCandidateFolders,
    onError: (error: Error) => message.error(error.message),
  });
  const applyCandidateMut = useMutation({
    mutationFn: (candidateId: string) => applyElectricalCandidate(candidateId),
    onMutate: async (candidateId) => {
      await qc.cancelQueries({ queryKey: cableSizingCandidatesQueryKey });
      const previous = qc.getQueryData<ElectricalCandidate[]>(cableSizingCandidatesQueryKey);
      setCableSizingCandidateApplied(candidateId);
      return { previous };
    },
    onSuccess: ({ candidate, calculation }) => {
      setCableSizingCandidateApplied(String(candidate.id), candidate);
      setElectricalQueryCalculation(calculation);
      invalidateCableSizingCandidates();
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Кандидат применён в электрорасчёт');
    },
    onError: (error: Error, _candidateId, context) => {
      if (context?.previous) qc.setQueryData(cableSizingCandidatesQueryKey, context.previous);
      message.error(error.message);
    },
  });
  const manualCableMut = useMutation({
    mutationFn: async ({
      objectId,
      mark,
      cableType,
      cableSource,
      targetVariants,
    }: {
      objectId: string;
      mark: string;
      cableType: CableTypeKey;
      cableSource?: CableSource;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        mark,
        cableSource ?? effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy,
          connectionType,
          windingCoefficient,
          heatingHeight,
          layingStep,
          maintainTemperature,
          vaporTemperature,
          aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Кабель выбран, расчёт обновлён${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const autoCableMut = useMutation({
    mutationFn: async ({
      objectId,
      cableType,
      targetVariants,
    }: {
      objectId: string;
      cableType: CableTypeKey;
      targetVariants: CalculationVariant[];
    }) => {
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const effectiveCableType = normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        null,
        effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        {
          supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy,
          connectionType,
          windingCoefficient,
          heatingHeight,
          layingStep,
          maintainTemperature,
          vaporTemperature,
          aggressiveProduct,
        },
      );
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      const targetLabel = calculationVariantLabel(variables.targetVariants);
      message.success(`Автоподбор выполнен${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const electricalLayoutMut = useMutation({
    mutationFn: async ({
      objectId,
      cableMark,
      cableSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: {
      objectId: string;
      cableMark: string | null;
      cableSource: CableSource;
      cableType: CableTypeKey;
      windingPitchMm: number | null;
      numberOfThreads: number | null;
    }) => {
      const effectiveCableType = normalizeAvailableCableType(cableType);
      return selectCableForVariants(
        objectId,
        cableMark,
        cableSource,
        [variant],
        effectiveCableType,
        {
          supplyVoltage,
          selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' : undefined,
          selectionPolicy,
          connectionType,
          windingCoefficient,
          windingPitchMm,
          numberOfThreads,
          heatingHeight,
          layingStep,
          maintainTemperature,
          vaporTemperature,
          aggressiveProduct,
        },
      );
    },
    onSuccess: (calculations) => {
      calculations.forEach(setElectricalQueryCalculation);
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', project?.id, 'objects', 'summary'] });
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const manualCableMutate = manualCableMut.mutate;
  const autoCableMutate = autoCableMut.mutate;
  const electricalLayoutMutate = electricalLayoutMut.mutate;
  const isCableMarkPending = manualCableMut.isPending || autoCableMut.isPending || electricalLayoutMut.isPending;
  const cableMarkModalObject = cableMarkModalObjectId
    ? objects.find((object) => object.id === cableMarkModalObjectId) ?? null
    : null;
  const cableSizingModalObject = cableSizingModalObjectId
    ? objects.find((object) => object.id === cableSizingModalObjectId) ?? null
    : null;
  const cableSizingModalCalc = cableSizingModalObject
    ? currentElectricalCalc(stats.calcByObjectId[cableSizingModalObject.id])
    : undefined;
  const {
    data: cableSizingCandidates = [],
    isFetching: isCableSizingCandidatesFetching,
  } = useQuery({
    queryKey: cableSizingCandidatesQueryKey,
    queryFn: () =>
      listElectricalCandidates(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const { data: cableSizingCandidateFolders = [] } = useQuery({
    queryKey: cableSizingCandidateFoldersQueryKey,
    queryFn: () =>
      listElectricalCandidateFolders(project!.id, cableSizingModalObjectId!, variant),
    enabled: !!project && !!cableSizingModalObjectId,
  });
  const appliedCableSizingCandidate = useMemo(
    () => cableSizingCandidates.find((candidate) => candidate.is_applied) ?? null,
    [cableSizingCandidates],
  );
  const cableMarkModalCalc = cableMarkModalObject
    ? stats.calcByObjectId[cableMarkModalObject.id]
    : undefined;
  const cableMarkModalSavedType = cableMarkModalObject
    ? getSavedCableTypeForObject(cableMarkModalObject.id)
    : null;
  const cableMarkModalCurrentMark = cableMarkModalCableType === cableMarkModalSavedType
    ? getCableMark(cableMarkModalCalc)
    : undefined;
  const cableMarkModalOptions = useMemo(
    () => (
      cableMarkModalCableType
        ? cableMarkOptionsFor(cableMarkModalCableType, cableMarkModalCurrentMark, cableMarkModalCalc)
        : []
    ),
    [
      cableMarkModalCableType,
      cableMarkModalCalc,
      cableMarkModalCurrentMark,
      cableMarkOptionsFor,
    ],
  );
  const cableMarkModalOptionByValue = useMemo(
    () => new Map(cableMarkModalOptions.map((option) => [option.value, option])),
    [cableMarkModalOptions],
  );
  const cableMarkModalSelectedOption = cableMarkModalOptionByValue.get(
    cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE,
  );
  const cableMarkModalTargetVariantOptions = useMemo(
    () => CALCULATION_VARIANTS.map((targetVariant) => ({
      label: `СО${targetVariant}`,
      value: targetVariant,
    })),
    [],
  );

  const findCableRowForMark = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
    selectedSource?: CableSource | null,
  ): CableStatusRow | null => {
    if (!mark) return null;
    const snapshotRow = cableSnapshotRow(calc);
    const snapshotMatchesMark = snapshotRow?.model === mark;
    const rows = cableRowsForType(type);
    const matchesMark = (row: CableStatusRow) => {
      if (!row.model) return false;
      if (row.model === mark) return true;
      return type === 'self_regulating_tt' && mark.startsWith(`${row.model}-`);
    };
    const matchesSource = (row: CableStatusRow) =>
      !selectedSource || normalizeCableSource(row.source) === selectedSource;
    return rows.find((row) => matchesMark(row) && matchesSource(row))
      ?? rows.find(matchesMark)
      ?? (snapshotMatchesMark ? snapshotRow : null)
      ?? { model: mark, cable_type: type, source: selectedSource ?? 'project' };
  }, [cableRowsForType]);

  const cableMarkModalSelectedCable = useMemo<CableStatusRow | null>(() => {
    if (!cableMarkModalCableType || !cableMarkModalSelectedOption?.mark) return null;
    const snapshotRow = cableSnapshotRow(cableMarkModalCalc);
    if (cableMarkModalSelectedOption.optionSource === 'project') return snapshotRow;
    return findCableRowForMark(
      cableMarkModalCableType,
      cableMarkModalSelectedOption.mark,
      cableMarkModalCalc,
      cableMarkModalSelectedOption.cableSource,
    );
  }, [
    cableMarkModalCableType,
    cableMarkModalCalc,
    cableMarkModalSelectedOption,
    findCableRowForMark,
  ]);
  const cableSizingModalSelectedCable = useMemo<CableStatusRow | null>(() => (
    cableSizingEffectiveCableType
      ? findCableRowForMark(
          cableSizingEffectiveCableType,
          cableSizingManualMark ?? getCableMark(cableSizingModalCalc),
          cableSizingModalCalc,
          catalogSourceFromSnapshot(cableSizingModalCalc),
        )
      : null
  ), [
    cableSizingEffectiveCableType,
    cableSizingManualMark,
    cableSizingModalCalc,
    findCableRowForMark,
  ]);
  const cableMarkValueForCalc = useCallback((
    type: CableTypeKey,
    mark: string | undefined,
    calc: ElectricalCalcSummary | undefined,
  ) => {
    if (!mark) return AUTO_CABLE_MARK_VALUE;
    if (shouldShowProjectCableOption(calc)) return cableMarkOptionValue('project', mark);
    const savedSource = catalogSourceFromSnapshot(calc);
    const manualOptions = manualCableOptionsForType(type);
    const matchingOption = manualOptions.find((option) =>
      option.mark === mark && (!savedSource || option.cableSource === savedSource))
      ?? manualOptions.find((option) => option.mark === mark);
    return matchingOption?.value ?? cableMarkOptionValue(savedSource ?? effectiveSource, mark);
  }, [effectiveSource, manualCableOptionsForType]);
  const closeCableMarkModal = useCallback(() => {
    setCableMarkModalObjectId(null);
    setCableMarkModalCableType(null);
    setCableMarkModalValue(null);
    setCableMarkModalTargetVariants([]);
  }, []);
  const closeCableSizingModal = useCallback(() => {
    setCableSizingModalObjectId(null);
    setCableSizingMode('auto');
    setCableSizingManualMark(null);
    setMarkedCableSizingCandidateIds([]);
    setActiveCandidateFolderKey('all');
    setCandidateFolderModalOpen(false);
    setEditingCandidateFolder(null);
    setCandidateFolderName('');
    setCandidateColumnSettingsOpen(false);
  }, []);
  const openCableMarkModal = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    const currentCalc = currentElectricalCalc(calc);
    const type = getSavedCableTypeForObject(obj.id);
    setActiveRowId(obj.id);
    setCableMarkModalObjectId(obj.id);
    setCableMarkModalCableType(type);
    setCableMarkModalTargetVariants([variant]);
    const mark = getCableMark(currentCalc);
    setCableMarkModalValue(cableMarkValueForCalc(type, mark, currentCalc));
  }, [cableMarkValueForCalc, getSavedCableTypeForObject, stats.calcByObjectId, variant]);
  const openCableSizingModal = useCallback((obj: ProjectObject) => {
    const type = getSavedCableTypeForObject(obj.id);
    const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    setActiveRowId(obj.id);
    setCableSizingCableType(type);
    setCableSizingManualMark(getCableMark(calc) ?? null);
    setMarkedCableSizingCandidateIds([]);
    setActiveCandidateFolderKey('all');
    setCableSizingModalObjectId(obj.id);
  }, [getSavedCableTypeForObject, stats.calcByObjectId]);
  const changeCableMarkModalCableType = useCallback((nextType: CableTypeKey) => {
    setCableMarkModalCableType(normalizeAvailableCableType(nextType));
    setCableMarkModalValue(AUTO_CABLE_MARK_VALUE);
    setConnectionType('line_1ph');
  }, [normalizeAvailableCableType]);
  const applyCableMarkModal = useCallback(() => {
    if (!cableMarkModalObject || !cableMarkModalCableType) return;
    const targetVariants = cableMarkModalTargetVariants.length > 0
      ? cableMarkModalTargetVariants
      : [variant];
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMutate({
        objectId: cableMarkModalObject.id,
        cableType: cableMarkModalCableType,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    } else {
      const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
      if (!selectedOption?.mark) return;
      manualCableMutate({
        objectId: cableMarkModalObject.id,
        mark: selectedOption.mark,
        cableType: cableMarkModalCableType,
        cableSource: selectedOption.cableSource,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
    }
  }, [
    autoCableMutate,
    cableMarkModalCableType,
    cableMarkModalObject,
    cableMarkModalOptionByValue,
    cableMarkModalTargetVariants,
    cableMarkModalValue,
    closeCableMarkModal,
    manualCableMutate,
    variant,
  ]);

  const normalizedTableViewSettings = useMemo(
    () => normalizeElectricalTableViewSettings(tableViewSettings),
    [tableViewSettings],
  );
  const visibleElectricalColumnMetas = useMemo(
    () => getVisibleElectricalTableColumnMetas(
      tableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [normalizedTableViewSettings.tableLabelFormat, tableColumnSettings],
  );
  const visibleCandidateColumnMetas = useMemo(
    () => getVisibleElectricalCandidateTableColumnMetas(
      candidateTableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [candidateTableColumnSettings, normalizedTableViewSettings.tableLabelFormat],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveElectricalTableFontSize(normalizedTableViewSettings),
    [normalizedTableViewSettings],
  );
  const visibleElectricalColumnKeys = useMemo(
    () => visibleElectricalColumnMetas.map((meta) => meta.key),
    [visibleElectricalColumnMetas],
  );
  const visibleCandidateColumnKeys = useMemo(
    () => visibleCandidateColumnMetas.map((meta) => meta.key),
    [visibleCandidateColumnMetas],
  );
  const fieldCapabilityByKey = useMemo(
    () => new Map(electricalQueryCapabilities?.fields.map((field) => [field.key, field]) ?? []),
    [electricalQueryCapabilities],
  );
  const enumOptionsByColumn = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string }>> = {};
    for (const field of electricalQueryCapabilities?.fields ?? []) {
      if (!field.options) continue;
      result[field.key] = field.options.items.map((item) => ({
        value: String(item.value),
        label: item.label,
      }));
    }
    return result;
  }, [electricalQueryCapabilities]);
  const currentTableViewActive = hasActiveTableViewState(tableViewState);
  const candidateTableViewActive = hasActiveTableViewState(candidateTableViewState);
  const markedCableSizingCandidateSet = useMemo(
    () => new Set(markedCableSizingCandidateIds),
    [markedCableSizingCandidateIds],
  );
  const candidateColumnValueAccessors = useMemo<HeatCalcColumnValueAccessors<ElectricalCandidate>>(() => {
    const accessors: HeatCalcColumnValueAccessors<ElectricalCandidate> = {};
    for (const column of visibleCandidateColumnMetas) {
      if (column.key === 'actions') continue;
      accessors[column.key] = (candidate) =>
        candidateElectricalFieldValue(column.key, candidate, markedCableSizingCandidateSet.has(candidate.id));
    }
    return accessors;
  }, [markedCableSizingCandidateSet, visibleCandidateColumnMetas]);
  const activeCustomCandidateFolderId = candidateCustomFolderId(activeCandidateFolderKey);
  const activeCustomCandidateFolder = useMemo(
    () => activeCustomCandidateFolderId
      ? cableSizingCandidateFolders.find((folder) => folder.id === activeCustomCandidateFolderId) ?? null
      : null,
    [activeCustomCandidateFolderId, cableSizingCandidateFolders],
  );
  const cableSizingCandidatesByActiveFolder = useMemo(() => {
    if (activeCandidateFolderKey === 'favorite') {
      return cableSizingCandidates.filter((candidate) => candidate.is_pinned);
    }
    if (activeCustomCandidateFolder) {
      const ids = new Set(activeCustomCandidateFolder.candidate_ids);
      return cableSizingCandidates.filter((candidate) => ids.has(candidate.id));
    }
    return cableSizingCandidates;
  }, [activeCandidateFolderKey, activeCustomCandidateFolder, cableSizingCandidates]);
  const candidateFolderCounts = useMemo(() => {
    const allIds = new Set(cableSizingCandidates.map((candidate) => candidate.id));
    return {
      all: cableSizingCandidates.length,
      favorite: cableSizingCandidates.filter((candidate) => candidate.is_pinned).length,
      custom: new Map(
        cableSizingCandidateFolders.map((folder) => [
          folder.id,
          folder.candidate_ids.filter((candidateId) => allIds.has(candidateId)).length,
        ]),
      ),
    };
  }, [cableSizingCandidateFolders, cableSizingCandidates]);
  useEffect(() => {
    if (activeCustomCandidateFolderId && !activeCustomCandidateFolder) {
      setActiveCandidateFolderKey('all');
    }
  }, [activeCustomCandidateFolder, activeCustomCandidateFolderId]);
  useEffect(() => {
    if (previousActiveCandidateFolderKeyRef.current === activeCandidateFolderKey) return;
    previousActiveCandidateFolderKeyRef.current = activeCandidateFolderKey;
    setMarkedCableSizingCandidateIds([]);
  }, [activeCandidateFolderKey]);
  const cableSizingCandidateTableRows = useMemo(
    () => cableSizingCandidatesByActiveFolder.map((record, sourceIndex) => ({ record, sourceIndex })),
    [cableSizingCandidatesByActiveFolder],
  );
  const displayedCableSizingCandidates = useMemo(() => {
    const sortedRows = applyTableSort(
      applyColumnFilters(
        cableSizingCandidateTableRows,
        candidateTableViewState.filters,
        candidateColumnValueAccessors,
      ),
      candidateTableViewState.sort,
      candidateColumnValueAccessors,
    );
    const appliedRows = sortedRows.filter((row) => row.record.is_applied);
    const otherRows = sortedRows.filter((row) => !row.record.is_applied);
    return [...appliedRows, ...otherRows].map((row) => row.record);
  }, [cableSizingCandidateTableRows, candidateColumnValueAccessors, candidateTableViewState]);
  const displayedMarkedCableSizingCandidates = useMemo(
    () => displayedCableSizingCandidates.filter((candidate) =>
      markedCableSizingCandidateSet.has(candidate.id),
    ),
    [displayedCableSizingCandidates, markedCableSizingCandidateSet],
  );
  const cableSizingCandidateCompareActive = displayedMarkedCableSizingCandidates.length >= 2;
  const candidateCompareDiffColumnKeys = useMemo(() => {
    const diffKeys = new Set<ElectricalCandidateColumnKey>();
    if (!cableSizingCandidateCompareActive) return diffKeys;

    for (const column of visibleCandidateColumnMetas) {
      if (!isCandidateCompareColumn(column.key)) continue;
      const values = new Set(
        displayedMarkedCableSizingCandidates.map((candidate) =>
          candidateCompareValue(column.key, candidate),
        ),
      );
      if (values.size > 1) {
        diffKeys.add(column.key);
      }
    }
    return diffKeys;
  }, [
    cableSizingCandidateCompareActive,
    displayedMarkedCableSizingCandidates,
    visibleCandidateColumnMetas,
  ]);
  const candidateEnumOptionsByColumn = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string }>> = {};
    for (const column of visibleCandidateColumnMetas) {
      if (filterKindForCandidateColumn(column.key) !== 'enum') continue;
      const accessor = candidateColumnValueAccessors[column.key];
      if (!accessor) continue;
      const values = new Map<string, string>();
      cableSizingCandidates.forEach((candidate, index) => {
        const value = accessor(candidate, index);
        if (value === null || value === undefined || value === '' || value === '—') return;
        const text = String(value);
        values.set(text, text);
      });
      result[column.key] = [...values.values()]
        .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }))
        .map((value) => ({ value, label: value }));
    }
    return result;
  }, [cableSizingCandidates, candidateColumnValueAccessors, visibleCandidateColumnMetas]);

  useEffect(() => {
    setTableViewState((current) => {
      const cleaned = removeHiddenTableViewState(current, visibleElectricalColumnKeys);
      if (
        cleaned.sort === current.sort
        && Object.keys(cleaned.filters).length === Object.keys(current.filters).length
      ) {
        return current;
      }
      return cleaned;
    });
  }, [visibleElectricalColumnKeys]);

  useEffect(() => {
    setCandidateTableViewState((current) => {
      const cleaned = removeHiddenTableViewState(current, visibleCandidateColumnKeys);
      if (
        cleaned.sort === current.sort
        && Object.keys(cleaned.filters).length === Object.keys(current.filters).length
      ) {
        return current;
      }
      return cleaned;
    });
  }, [visibleCandidateColumnKeys]);

  const setColumnFilter = useCallback((columnKey: ElectricalColumnKey, filter?: HeatCalcColumnFilter) => {
    setTablePage(1);
    setTableViewState((current) => {
      const nextFilters = { ...current.filters };
      if (filter && isColumnFilterActive(filter)) {
        nextFilters[columnKey] = filter;
      } else {
        delete nextFilters[columnKey];
      }
      return {
        ...current,
        filters: nextFilters,
      };
    });
  }, []);

  const resetColumnFilter = useCallback((columnKey: ElectricalColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    setTablePage(1);
    setTableViewState(createEmptyTableViewState());
  }, []);

  const setElectricalTableSort = useCallback((
    columnKey: ElectricalColumnKey,
    direction?: 'asc' | 'desc',
  ) => {
    setTablePage(1);
    setTableViewState((current) => ({
      ...current,
      sort: direction ? { columnKey, direction } : undefined,
    }));
  }, []);

  const setCandidateColumnFilter = useCallback((
    columnKey: ElectricalCandidateColumnKey,
    filter?: HeatCalcColumnFilter,
  ) => {
    setCandidateTableViewState((current) => {
      const nextFilters = { ...current.filters };
      if (filter && isColumnFilterActive(filter)) {
        nextFilters[columnKey] = filter;
      } else {
        delete nextFilters[columnKey];
      }
      return {
        ...current,
        filters: nextFilters,
      };
    });
  }, []);

  const resetCandidateColumnFilter = useCallback((columnKey: ElectricalCandidateColumnKey) => {
    setCandidateColumnFilter(columnKey, undefined);
  }, [setCandidateColumnFilter]);

  const resetCandidateTableViewState = useCallback(() => {
    setCandidateTableViewState(createEmptyTableViewState());
  }, []);

  const setCandidateTableSort = useCallback((
    columnKey: ElectricalCandidateColumnKey,
    direction?: 'asc' | 'desc',
  ) => {
    setCandidateTableViewState((current) => ({
      ...current,
      sort: direction ? { columnKey, direction } : undefined,
    }));
  }, []);

  const handleElectricalTableChange = useCallback<NonNullable<TableProps<ProjectObject>['onChange']>>((pagination, _filters, sorter, extra) => {
    const nextPage = extra.action === 'sort' ? 1 : pagination.current ?? 1;
    setTablePage(nextPage);
    if (pagination.pageSize) setTablePageSize(pagination.pageSize);
    const nextSorter = Array.isArray(sorter)
      ? sorter.find((item) => item.order)
      : sorter;
    const columnKey = typeof nextSorter?.columnKey === 'string'
      ? nextSorter.columnKey
      : typeof nextSorter?.column?.key === 'string'
        ? nextSorter.column.key
        : null;
    const order = nextSorter?.order;
    setTableViewState((current) => ({
      ...current,
      sort: columnKey && order
        ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
        : undefined,
    }));
  }, []);

  const handleCandidateTableChange = useCallback<NonNullable<TableProps<ElectricalCandidate>['onChange']>>((_pagination, _filters, sorter) => {
    const nextSorter = Array.isArray(sorter)
      ? sorter.find((item) => item.order)
      : sorter;
    const columnKey = typeof nextSorter?.columnKey === 'string'
      ? nextSorter.columnKey
      : typeof nextSorter?.column?.key === 'string'
        ? nextSorter.column.key
        : null;
    const order = nextSorter?.order;
    setCandidateTableViewState((current) => ({
      ...current,
      sort: columnKey && order
        ? { columnKey, direction: order === 'ascend' ? 'asc' : 'desc' }
        : undefined,
    }));
  }, []);

  const electricalColumnRenderers = useMemo<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>>(() => ({
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) =>
        electricalDisplayOffset + idx + 1,
    },
    object_name: {
      ellipsis: true,
      render: (_: unknown, obj) => (
        <Text style={{ fontSize: 12 }}>
          {objectDisplayName(obj)}
        </Text>
      ),
    },
    object_type: {
      render: (_: unknown, obj) => OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type,
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        if (obj.is_valid) {
          return (
            <Tooltip title="Рассчитан">
              <Tag className="heatloss-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        }
        if (obj.validation_errors?.category === 'unsupported') {
          return (
            <Tooltip title={valueText(obj.validation_errors?.message ?? obj.validation_errors)}>
              <Tag color="default">Не применимо</Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            title={valueText(
              obj.validation_errors?.message ??
              obj.validation_errors,
            )}
          >
            <Tag className="heatloss-status-icon-tag" color="error" aria-label="Ошибка">
              <CloseCircleFilled />
            </Tag>
          </Tooltip>
        );
      },
    },
    electrical_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        const unsupported = isElectricalCalcUnsupported(calc);
        const stale = isElectricalCalcStale(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <Tag className="electrical-status-icon-tag" color="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (unsupported)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? err ?? 'Не применимо'}>
              <Tag
                className="electrical-status-icon-tag"
                color="default"
                aria-label="Не применимо"
              >
                <MinusCircleFilled />
              </Tag>
            </Tooltip>
          );
        if (stale)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? 'Требуется пересчёт'}>
              <Tag className="electrical-status-icon-tag" color="warning" aria-label="Требуется пересчёт">
                ↻
              </Tag>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title={err}>
              <Tag className="electrical-status-icon-tag" color="error" aria-label="Ошибка">
                <CloseCircleFilled />
              </Tag>
            </Tooltip>
          );
        return (
          <Tooltip title="Не рассчитан">
            <Tag className="electrical-status-icon-tag" aria-label="Не рассчитан">—</Tag>
          </Tooltip>
        );
      },
    },
    cable_type: {
      render: (_: unknown, obj) => {
        const type = getCalculatedCableTypeForObject(obj.id);
        if (!type) {
          return <Text style={{ fontSize: 12 }} type="secondary">—</Text>;
        }
        return (
          <Text style={{ fontSize: 12 }}>
            {CABLE_TYPE_LABEL[type] ?? valueText(type)}
          </Text>
        );
      },
    },
    cable_mark: {
      render: (_: unknown, obj) => {
        const calc = stats.calcByObjectId[obj.id];
        const currentCalc = currentElectricalCalc(calc);
        const mark = getCableMark(currentCalc);
        const isActive = activeRowId === obj.id;

        if (!isActive) {
          return (
            <Space size={4} wrap={false}>
              <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
                {mark ?? '—'}
              </Text>
            </Space>
          );
        }

        return (
          <div className="electrical-cable-mark-cell">
            <span className="electrical-cable-mark-current">
              <Text
                className="electrical-cable-mark-text"
                style={{ fontSize: 12 }}
                title={mark ?? undefined}
                type={mark ? undefined : 'secondary'}
              >
                {mark ?? '—'}
              </Text>
            </span>
            <span className="electrical-cable-mark-actions">
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!obj.is_valid || !project}
                loading={isCableMarkPending}
                onClick={() => openCableMarkModal(obj)}
              >
                Выбор
              </Button>
              <Button
                className="electrical-cable-mark-action"
                size="small"
                disabled={!project}
                onClick={() => openCableSizingModal(obj)}
              >
                Подбор
              </Button>
            </span>
          </div>
        );
      },
    },
    cable_snapshot_status: {
      render: (_: unknown, obj) => {
        const meta = cableSnapshotStatusTag(currentElectricalCalc(stats.calcByObjectId[obj.id]));
        if (!meta) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={meta.tooltip}>
            <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
              {meta.label}
            </Tag>
          </Tooltip>
        );
      },
    },
    selection_policy: {
      render: (_: unknown, obj) =>
        selectionPolicyText(currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.selection_policy),
    },
    applied_selection_policy: {
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const requested = calc?.results?.selection_policy;
        const applied = calc?.results?.applied_selection_policy;
        const label = selectionPolicyText(applied);
        const changed = typeof requested === 'string' && typeof applied === 'string' && requested !== applied;
        return changed ? <Tag color="warning">{label}</Tag> : label;
      },
    },
    selection_reason: {
      render: (_: unknown, obj) => {
        const reason = currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.selection_reason;
        return (
          <Tooltip title={valueText(reason)}>
            <span className="electrical-selection-reason-cell">
              {valueText(reason)}
            </span>
          </Tooltip>
        );
      },
    },
    winding_pitch_mm: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        return (
          <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
            {mark ? formatNumber(values.windingPitchMm, 0) : '—'}
          </Text>
        );
      },
    },
    number_of_threads: {
      align: 'right',
      render: (_: unknown, obj) => {
        const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
        const mark = getCableMark(calc);
        const values = calcLayoutValues(calc);
        const sourceMeta = threadSourceTag(getThreadSource(calc));
        const sourceTag = sourceMeta ? (
          <Tooltip title={sourceMeta.tooltip}>
            <Tag
              color={sourceMeta.color}
              style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}
            >
              {sourceMeta.label}
            </Tag>
          </Tooltip>
        ) : null;

        return (
          <Space size={4} wrap={false}>
            <Text style={{ fontSize: 12 }} type={mark ? undefined : 'secondary'}>
              {mark ? values.numberOfThreads : '—'}
            </Text>
            {mark ? sourceTag : null}
          </Space>
        );
      },
    },
    laying_step: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.laying_step ?? layingStep, 2),
    },
    heating_height: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.heating_height ?? heatingHeight, 1),
    },
    connection_type: {
      render: (_: unknown, obj) => {
        const value = stats.calcByObjectId[obj.id]?.params?.connection_type ?? connectionType;
        return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
      },
    },
    supply_voltage: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.supply_voltage ?? supplyVoltage, 0),
    },
    winding_coefficient: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.winding_coefficient ?? windingCoefficient,
          2,
        ),
    },
    vapor_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(stats.calcByObjectId[obj.id]?.params?.vapor_temperature ?? vaporTemperature, 1),
    },
    maintain_temperature: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(
          stats.calcByObjectId[obj.id]?.params?.maintain_temperature ?? maintainTemperature,
          1,
        ),
    },
    aggressive_product: {
      align: 'center',
      render: (_: unknown, obj) =>
        valueText(stats.calcByObjectId[obj.id]?.params?.aggressive_product ?? aggressiveProduct),
    },
    installed_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'installed_cable_length', 1),
    },
    order_cable_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(orderCableLengthValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 1),
    },
    total_power: {
      align: 'right',
      render: (_: unknown, obj) =>
        powerText(currentElectricalCalc(stats.calcByObjectId[obj.id])?.results?.total_power),
    },
    power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(cablePowerPerMeterValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 2),
    },
    installed_power_per_meter: {
      align: 'right',
      render: (_: unknown, obj) =>
        numberText(installedPowerPerMeterValue(currentElectricalCalc(stats.calcByObjectId[obj.id])), 2),
    },
    current: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'current', 2),
    },
    voltage: {
      align: 'right',
      render: (_: unknown, obj) => resultNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'voltage', 0),
    },
    price_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'price_per_meter', 2),
    },
    required_order_length: {
      align: 'right',
      render: (_: unknown, obj) =>
        commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'required_order_length', 1),
    },
    total_cost: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'total_cost', 2),
    },
    stock_status: {
      render: (_: unknown, obj) => {
        const value = commercialValue(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'stock_status');
        return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
      },
    },
    lead_time_days: {
      align: 'right',
      render: (_: unknown, obj) => commercialNumber(currentElectricalCalc(stats.calcByObjectId[obj.id]), 'lead_time_days', 0),
    },
    heat_loss_per_meter: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_meter', 2),
    },
    heat_loss_per_m2: {
      align: 'right',
      render: (_: unknown, obj) => objectResultNumber(obj, 'heat_loss_per_m2', 2),
    },
    total_heat_loss: {
      align: 'right',
      render: (_: unknown, obj) => powerText(obj.results?.total_heat_loss),
    },
  }), [
    activeRowId,
    aggressiveProduct,
    connectionType,
    getCalculatedCableTypeForObject,
    heatingHeight,
    isCableMarkPending,
    layingStep,
    maintainTemperature,
    openCableMarkModal,
    openCableSizingModal,
    electricalDisplayOffset,
    project,
    stats.calcByObjectId,
    supplyVoltage,
    vaporTemperature,
    windingCoefficient,
  ]);

  const persistTableColumnSettings = useCallback((
    settings: ElectricalTableColumnSettings,
    options: { closeModal?: boolean; showMessage?: boolean } = {},
  ) => {
    const normalized = normalizeElectricalTableColumnSettings(settings);
    setTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      updateTableColumnPreference.mutate({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalized);
    if (options.closeModal) setColumnSettingsOpen(false);
    if (options.showMessage !== false) message.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, registeredUserId, updateTableColumnPreference]);

  const persistCandidateTableColumnSettings = useCallback((
    settings: ElectricalCandidateTableColumnSettings,
    options: { closeModal?: boolean; showMessage?: boolean } = {},
  ) => {
    const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
    setCandidateTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredElectricalCandidateTableColumnCache(registeredUserId);
      updateCandidateTableColumnPreference.mutate({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestElectricalCandidateTableColumnSettings(normalized);
    if (options.closeModal) setCandidateColumnSettingsOpen(false);
    if (options.showMessage !== false) message.success('Настройки таблицы подбора сохранены');
  }, [isRegisteredUser, registeredUserId, updateCandidateTableColumnPreference]);

  const persistTableSettings = useCallback((
    columnSettings: ElectricalTableColumnSettings,
    viewSettings: ElectricalTableViewSettings,
  ) => {
    const normalizedColumns = normalizeElectricalTableColumnSettings(columnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(viewSettings);
    setTableColumnSettings(normalizedColumns);
    tableViewSettingsRef.current = normalizedView;
    setTableViewSettings(normalizedView);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      clearRegisteredElectricalTableViewCache(registeredUserId);
      updateTableSettingsPreference.mutate({
        columnSettings: normalizedColumns,
        viewSettings: normalizedView,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalizedColumns);
    writeGuestElectricalTableViewSettings(normalizedView);
    setColumnSettingsOpen(false);
    message.success('Настройки таблицы сохранены');
  }, [isRegisteredUser, registeredUserId, updateTableSettingsPreference]);

  const applyColumnWidth = useCallback((key: ElectricalColumnKey, widthPct: number) => {
    const nextSettings = setElectricalTableColumnWidthPct(
      tableColumnSettingsRef.current,
      key,
      clampElectricalTableColumnWidthPct(widthPct),
    );
    persistTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistTableColumnSettings]);

  const applyElectricalGlideColumnDraftWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    setTableColumnSettings((settings) =>
      setElectricalTableColumnWidthPct(
        settings,
        key,
        electricalTableColumnWidthPxToPct(widthPx),
      ),
    );
  }, []);

  const commitElectricalGlideColumnWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    applyColumnWidth(key, electricalTableColumnWidthPxToPct(widthPx));
  }, [applyColumnWidth]);

  const applyCandidateColumnWidth = useCallback((
    key: ElectricalCandidateColumnKey,
    widthPct: number,
  ) => {
    const nextSettings = setElectricalCandidateTableColumnWidthPct(
      candidateTableColumnSettingsRef.current,
      key,
      clampElectricalTableColumnWidthPct(widthPct),
    );
    persistCandidateTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistCandidateTableColumnSettings]);

  const applyElectricalCandidateGlideColumnDraftWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    setCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnWidthPct(
        settings,
        key,
        electricalTableColumnWidthPxToPct(widthPx),
      ),
    );
  }, []);

  const commitElectricalCandidateGlideColumnWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    applyCandidateColumnWidth(key, electricalTableColumnWidthPxToPct(widthPx));
  }, [applyCandidateColumnWidth]);

  const startColumnResize = useCallback((
    meta: { key: ElectricalColumnKey; width: number; widthPct: number },
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = meta.width;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;

    function flushDraftWidth() {
      frameId = null;
      setTableColumnSettings((settings) =>
        setElectricalTableColumnWidthPct(settings, meta.key, latestWidthPct),
      );
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(30, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = electricalTableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      applyColumnWidth(meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [applyColumnWidth]);

  const startCandidateColumnResize = useCallback((
    meta: { key: ElectricalCandidateColumnKey; width: number; widthPct: number },
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = meta.width;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;

    function flushDraftWidth() {
      frameId = null;
      setCandidateTableColumnSettings((settings) =>
        setElectricalCandidateTableColumnWidthPct(settings, meta.key, latestWidthPct),
      );
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(30, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = electricalTableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      applyCandidateColumnWidth(meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [applyCandidateColumnWidth]);

  const electricalColumns = useMemo<ColumnsType<ProjectObject>>(() =>
    visibleElectricalColumnMetas.map((column) => {
      const renderer = electricalColumnRenderers[column.key];
      const capability = fieldCapabilityByKey.get(column.key);
      const filterEnabled = column.key !== 'index' && (capability?.filter.enabled ?? false);
      const sortEnabled = column.key !== 'index' && (capability?.sort.enabled ?? false);
      const filterKind = filterKindForElectricalColumn(column.key, capability);
      const activeFilter = tableViewState.filters[column.key];
      return {
        key: column.key,
        title: (
          <ResizableColumnTitle
            title={column.title}
            label={column.label}
            onResizeStart={(event) => startColumnResize(column, event)}
          />
        ),
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        align: renderer?.align,
        ellipsis: column.key === 'selection_reason'
          ? false
          : column.ellipsis || renderer?.ellipsis,
        render: renderer?.render ?? (() => '—'),
        sorter: sortEnabled,
        sortOrder: sortEnabled && tableViewState.sort?.columnKey === column.key
          ? tableViewState.sort.direction === 'asc'
            ? 'ascend'
            : 'descend'
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${column.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }) => (
          <ColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={enumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => setColumnFilter(column.key, filter)}
            onReset={() => resetColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
      };
    }), [
      electricalColumnRenderers,
      enumOptionsByColumn,
      fieldCapabilityByKey,
      resetColumnFilter,
      setColumnFilter,
      startColumnResize,
      tableViewState,
      visibleElectricalColumnMetas,
    ]);

  const electricalGlideColumns = useMemo<HeatCalcGlideGridColumn[]>(() =>
    buildElectricalGlideColumns({
      columns: visibleElectricalColumnMetas,
      capabilitiesByKey: fieldCapabilityByKey,
      enumOptionsByColumn,
      getAlign: (key) => electricalColumnRenderers[key]?.align,
    }), [
      electricalColumnRenderers,
      enumOptionsByColumn,
      fieldCapabilityByKey,
      visibleElectricalColumnMetas,
    ]);

  const candidateGlideColumnMetaByKey = useMemo(
    () => new Map(visibleCandidateColumnMetas.map((column) => [column.key, column])),
    [visibleCandidateColumnMetas],
  );
  const electricalCandidateGlideColumns = useMemo<HeatCalcGlideGridColumn[]>(() =>
    buildElectricalCandidateGlideColumns({
      columns: visibleCandidateColumnMetas,
      enumOptionsByColumn: candidateEnumOptionsByColumn,
      getFilterKind: filterKindForCandidateColumn,
    }), [
      candidateEnumOptionsByColumn,
      visibleCandidateColumnMetas,
    ]);

  const electricalColumnCopyValue = useCallback((
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => {
    const calc = stats.calcByObjectId[obj.id];
    const currentCalc = currentElectricalCalc(calc);
    switch (key) {
      case 'index':
        return electricalDisplayOffset + index + 1;
      case 'object_name':
        return objectDisplayName(obj);
      case 'object_type':
        return OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type;
      case 'heat_loss_status':
        return obj.is_valid
          ? 'Рассчитан'
          : obj.validation_errors?.category === 'unsupported'
            ? 'Не применимо'
            : obj.validation_errors
              ? 'Ошибка'
              : 'Не рассчитан';
      case 'electrical_status':
        return isElectricalCalcSuccess(calc)
          ? 'Рассчитан'
          : isElectricalCalcUnsupported(calc)
            ? 'Не применимо'
            : isElectricalCalcStale(calc)
              ? 'Требуется пересчёт'
            : electricalCalcError(calc)
              ? 'Ошибка'
            : 'Не рассчитан';
      case 'cable_type':
        {
          const type = getCalculatedCableTypeForObject(obj.id);
          return type ? CABLE_TYPE_LABEL[type] ?? type : '—';
        }
      case 'cable_mark':
        return getCableMark(currentCalc) ?? '—';
      case 'cable_snapshot_status':
        return cableSnapshotStatusTag(currentCalc)?.label ?? '—';
      case 'selection_policy':
        return selectionPolicyText(currentCalc?.results?.selection_policy);
      case 'applied_selection_policy':
        return selectionPolicyText(currentCalc?.results?.applied_selection_policy);
      case 'selection_reason':
        return valueText(currentCalc?.results?.selection_reason);
      case 'winding_pitch_mm':
        return valueText(currentCalc?.results?.winding_pitch);
      case 'number_of_threads':
        {
          const source = threadSourceTag(getThreadSource(currentCalc));
          const value = valueText(currentCalc?.results?.num_circuits);
          return source ? `${value} (${source.label})` : value;
        }
      case 'laying_step':
        return valueText(calc?.params?.laying_step ?? layingStep);
      case 'heating_height':
        return valueText(calc?.params?.heating_height ?? heatingHeight);
      case 'connection_type':
        {
          const value = calc?.params?.connection_type ?? connectionType;
          return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
        }
      case 'supply_voltage':
        return valueText(calc?.params?.supply_voltage ?? supplyVoltage);
      case 'winding_coefficient':
        return valueText(calc?.params?.winding_coefficient ?? windingCoefficient);
      case 'vapor_temperature':
        return valueText(calc?.params?.vapor_temperature ?? vaporTemperature);
      case 'maintain_temperature':
        return valueText(calc?.params?.maintain_temperature ?? maintainTemperature);
      case 'aggressive_product':
        return valueText(calc?.params?.aggressive_product ?? aggressiveProduct);
      case 'order_cable_length':
        return valueText(orderCableLengthValue(currentCalc));
      case 'installed_cable_length':
      case 'total_power':
      case 'current':
      case 'voltage':
        return valueText(currentCalc?.results?.[key]);
      case 'power_per_meter':
        return valueText(cablePowerPerMeterValue(currentCalc));
      case 'installed_power_per_meter':
        return valueText(installedPowerPerMeterValue(currentCalc));
      case 'price_per_meter':
      case 'required_order_length':
      case 'total_cost':
      case 'lead_time_days':
        return valueText(commercialValue(currentCalc, key));
      case 'stock_status':
        {
          const value = commercialValue(currentCalc, key);
          return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
        }
      case 'heat_loss_per_meter':
      case 'heat_loss_per_m2':
      case 'total_heat_loss':
        return valueText(obj.results?.[key]);
      default:
        return '';
    }
  }, [
    aggressiveProduct,
    connectionType,
    getCalculatedCableTypeForObject,
    heatingHeight,
    layingStep,
    maintainTemperature,
    electricalDisplayOffset,
    stats.calcByObjectId,
    supplyVoltage,
    vaporTemperature,
    windingCoefficient,
  ]);

  const isElectricalLayoutCellEditable = useCallback((obj: ProjectObject, columnKey: string) => {
    if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return false;
    if (!project || !obj.is_valid || isCableMarkPending) return false;
    const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    if (!calc || !getCableMark(calc)) return false;
    const cableType = getSavedCableTypeForObject(obj.id);
    return cableType !== 'mineral' && cableType !== 'skin';
  }, [getSavedCableTypeForObject, isCableMarkPending, project, stats.calcByObjectId]);

  const getElectricalGlideCellState = useCallback((
    obj: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ): HeatCalcGlideGridCellState => {
    const renderer = electricalColumnRenderers[columnKey];
    const layoutEditable = isElectricalLayoutCellEditable(obj, columnKey);
    const currentCalc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    const layoutValues = layoutEditable ? calcLayoutValues(currentCalc) : null;
    const displayValue = layoutValues && columnKey === 'winding_pitch_mm'
      ? String(layoutValues.windingPitchMm)
      : layoutValues && columnKey === 'number_of_threads'
        ? String(layoutValues.numberOfThreads)
        : String(electricalColumnCopyValue(columnKey, obj, rowIndex) ?? '');
    const actions = columnKey === 'cable_mark' && activeRowId === obj.id
      ? [
        {
          key: 'choose',
          label: 'Выбор',
          disabled: !obj.is_valid || !project || isCableMarkPending,
        },
        {
          key: 'size',
          label: 'Подбор',
          disabled: !project,
        },
      ]
      : undefined;
    return {
      displayValue,
      editable: layoutEditable,
      align: renderer?.align,
      editor: layoutEditable ? 'number' : undefined,
      step: layoutEditable ? 1 : undefined,
      actions,
    };
  }, [
    activeRowId,
    electricalColumnCopyValue,
    electricalColumnRenderers,
    isCableMarkPending,
    isElectricalLayoutCellEditable,
    project,
    stats.calcByObjectId,
  ]);

  const handleElectricalGlideStartCellEdit = useCallback((obj: ProjectObject) => {
    setActiveRowId(obj.id);
  }, []);

  const handleElectricalGlideCommitCell = useCallback((
    obj: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    if (!ELECTRICAL_LAYOUT_EDITABLE_COLUMNS.has(columnKey)) return null;
    if (!project) return 'Проект не выбран';
    if (!obj.is_valid) return 'Теплопотери объекта не рассчитаны';
    const calc = currentElectricalCalc(stats.calcByObjectId[obj.id]);
    const mark = getCableMark(calc);
    if (!calc || !mark) return 'Сначала выполните электрорасчёт';

    const cableType = getSavedCableTypeForObject(obj.id);
    if (cableType === 'mineral' || cableType === 'skin') {
      return 'Для этого типа кабеля параметры укладки не редактируются в таблице';
    }

    const parsed = parseElectricalLayoutNumber(value);
    if (parsed === null) return 'Введите число';
    const layoutValues = calcLayoutValues(calc);
    let windingPitchMm = layoutValues.windingPitchMm;
    let numberOfThreads: number | null = null;

    if (columnKey === 'winding_pitch_mm') {
      if (parsed < 0) return 'Шаг навива не может быть отрицательным';
      const diameterMm = pipeOuterDiameterMm(obj);
      if (diameterMm !== null && parsed > 0 && parsed <= diameterMm) {
        return 'Шаг навива должен быть больше наружного диаметра трубы';
      }
      if (diameterMm !== null && parsed > 0) {
        const coefficient = windingCoefficientForPitch(diameterMm, parsed);
        const maxCoefficient = maxWindingCoefficientForDiameterMm(diameterMm);
        if (coefficient > maxCoefficient + 1e-9) {
          return `Коэффициент навива ${coefficient.toFixed(3)} превышает максимум ${maxCoefficient.toFixed(1)} для D=${diameterMm.toFixed(0)} мм`;
        }
      }
      windingPitchMm = parsed;
      const threadSource = getThreadSource(calc);
      if (threadSource === 'manual' || threadSource === 'previous_result') {
        numberOfThreads = Math.round(layoutValues.numberOfThreads);
      }
    } else if (columnKey === 'number_of_threads') {
      const integerValue = Math.round(parsed);
      if (integerValue !== parsed) return 'Количество ниток должно быть целым числом';
      if (integerValue < 1) return 'Количество ниток должно быть не меньше 1';
      const maxThreads = maxThreadsForCableType(cableType);
      if (integerValue > maxThreads) {
        return `Количество ниток должно быть не больше ${maxThreads}`;
      }
      numberOfThreads = integerValue;
    }

    const markSource = getCableMarkSource(calc);
    electricalLayoutMutate({
      objectId: obj.id,
      cableMark: markSource === 'manual' ? mark : null,
      cableSource: markSource === 'manual' ? catalogSourceFromSnapshot(calc) ?? effectiveSource : effectiveSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    });
    return null;
  }, [
    effectiveSource,
    electricalLayoutMutate,
    getSavedCableTypeForObject,
    project,
    stats.calcByObjectId,
  ]);

  const handleElectricalGlideCellAction = useCallback((
    obj: ProjectObject,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'cable_mark') return;
    if (actionKey === 'choose') {
      if (!obj.is_valid || !project || isCableMarkPending) return;
      openCableMarkModal(obj);
      return;
    }
    if (actionKey === 'size') {
      if (!project) return;
      openCableSizingModal(obj);
    }
  }, [isCableMarkPending, openCableMarkModal, openCableSizingModal, project]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selectedRows = objects
        .map((object, index) => ({ object, index }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      if (selectedRows.length === 0) return;
      const header = visibleElectricalColumnMetas.map((meta) => meta.title);
      const rows = selectedRows.map(({ object, index }) =>
        visibleElectricalColumnMetas.map((meta) =>
          String(electricalColumnCopyValue(meta.key, object, index) ?? ''),
        ),
      );
      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        message.success(`Скопировано строк: ${selectedRows.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    electricalColumnCopyValue,
    objects,
    selectedRowKeys,
    visibleElectricalColumnMetas,
  ]);

  const electricalTableScrollX = useMemo(
    () => Math.max(
      1200,
      visibleElectricalColumnMetas.reduce(
        (sum, column) => sum + Math.max(column.width, column.minWidthPx),
        36,
      ),
    ),
    [visibleElectricalColumnMetas],
  );

  const electricalTableScrollY = 'max(320px, calc(100vh - 230px))';

  const handleElectricalGlidePageChange = useCallback((page: number) => {
    setTablePage(page);
  }, []);

  const handleElectricalGlideLoadMore = useCallback(() => {
    if (isElectricalPageFetching || !pageInfo?.has_next_page || !nextElectricalPageCursor) return;
    const nextPage = tablePage + 1;
    setElectricalPageCursors((current) => {
      if (projectObjectsPageCursorsEqual(current[nextPage], nextElectricalPageCursor)) {
        return current;
      }
      return { ...current, [nextPage]: nextElectricalPageCursor };
    });
    setTablePage(nextPage);
  }, [isElectricalPageFetching, nextElectricalPageCursor, pageInfo?.has_next_page, tablePage]);

  const electricalRowClassName = useCallback((obj: ProjectObject) => {
    const calc = stats.calcByObjectId[obj.id];
    return [
      electricalCalcError(calc) && !isElectricalCalcUnsupported(calc)
        && !isElectricalCalcStale(calc)
        ? 'row-invalid'
        : '',
      activeRowId === obj.id ? 'electrical-row-active' : '',
    ].filter(Boolean).join(' ');
  }, [activeRowId, stats.calcByObjectId]);

  const openElectricalRow = useCallback((record: ProjectObject) => {
    setActiveRowId(record.id);
  }, []);

  function openColumnSettings() {
    setDraftTableColumnSettings(normalizeElectricalTableColumnSettings(tableColumnSettings));
    setDraftTableViewSettings(
      normalizeElectricalTableViewSettings({
        ...tableViewSettings,
        calculationCableSource: isEmployee
          ? tableViewSettings.calculationCableSource
          : 'builtin',
      }),
    );
    setColumnSettingsOpen(true);
  }

  function openCandidateColumnSettings() {
    setDraftCandidateTableColumnSettings(
      normalizeElectricalCandidateTableColumnSettings(candidateTableColumnSettings),
    );
    setCandidateColumnSettingsOpen(true);
  }

  const cablePickerModalTitle = (
    <div className="electrical-cable-picker-title">
      <span className="electrical-cable-picker-title-text">Выбор марки кабеля</span>
      {cableMarkModalObject && (
        <>
          <span className="electrical-cable-picker-title-for">для</span>
          <span className="electrical-cable-picker-title-object">
            {objectDisplayName(cableMarkModalObject)}
          </span>
        </>
      )}
    </div>
  );

  function updateDraftColumn(key: ElectricalColumnKey, checked: boolean) {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnVisibility(settings, key, checked),
    );
  }

  function updateDraftColumnOrder(key: ElectricalColumnKey, order: number) {
    setDraftTableColumnSettings((settings) =>
      moveElectricalTableColumnToOrder(settings, key, order),
    );
  }

  function reorderDraftColumn(activeKey: ElectricalColumnKey, overKey: ElectricalColumnKey) {
    setDraftTableColumnSettings((settings) =>
      reorderElectricalTableColumn(settings, activeKey, overKey),
    );
  }

  function updateDraftColumnWidth(key: ElectricalColumnKey, widthPct: number) {
    setDraftTableColumnSettings((settings) =>
      setElectricalTableColumnWidthPct(settings, key, widthPct),
    );
  }

  function updateDraftTableFontSize(fontSize: ElectricalTableFontSize) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({ ...settings, fontSize }),
    );
  }

  function resetDraftTableFontSize() {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        fontSize: defaultView.fontSize,
      }),
    );
  }

  function updateDraftTableLabelFormat(tableLabelFormat: ElectricalTableLabelFormat) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat,
      }),
    );
  }

  function updateDraftSettingsLabelFormat(settingsLabelFormat: ElectricalTableLabelFormat) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        settingsLabelFormat,
      }),
    );
  }

  function resetDraftLabelFormats() {
    const defaultView = getDefaultElectricalTableViewSettings();
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        tableLabelFormat: defaultView.tableLabelFormat,
        settingsLabelFormat: defaultView.settingsLabelFormat,
      }),
    );
  }

  function updateDraftCalculationCableSource(
    calculationCableSource: ElectricalCalculationCableSource,
  ) {
    setDraftTableViewSettings((settings) =>
      normalizeElectricalTableViewSettings({
        ...settings,
        calculationCableSource,
      }),
    );
  }

  function resetDraftColumnWidth(key: ElectricalColumnKey) {
    setDraftTableColumnSettings((settings) => resetElectricalTableColumnWidth(settings, key));
  }

  function resetDraftColumns() {
    setDraftTableColumnSettings(resetElectricalTableColumnSettings());
  }

  function selectAllDraftColumns() {
    setDraftTableColumnSettings((settings) =>
      createElectricalTableColumnSettingsPatch(settings, getAvailableElectricalTableColumnKeys()),
    );
  }

  function applyColumnSettings() {
    const normalized = normalizeElectricalTableColumnSettings(draftTableColumnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(draftTableViewSettings);
    persistTableSettings(normalized, normalizedView);
  }

  function updateDraftCandidateColumn(key: ElectricalCandidateColumnKey, checked: boolean) {
    setDraftCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnVisibility(settings, key, checked),
    );
  }

  function updateDraftCandidateColumnOrder(key: ElectricalCandidateColumnKey, order: number) {
    setDraftCandidateTableColumnSettings((settings) =>
      moveElectricalCandidateTableColumnToOrder(settings, key, order),
    );
  }

  function reorderDraftCandidateColumn(
    activeKey: ElectricalCandidateColumnKey,
    overKey: ElectricalCandidateColumnKey,
  ) {
    setDraftCandidateTableColumnSettings((settings) =>
      reorderElectricalCandidateTableColumn(settings, activeKey, overKey),
    );
  }

  function updateDraftCandidateColumnWidth(
    key: ElectricalCandidateColumnKey,
    widthPct: number,
  ) {
    setDraftCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnWidthPct(settings, key, widthPct),
    );
  }

  function resetDraftCandidateColumnWidth(key: ElectricalCandidateColumnKey) {
    setDraftCandidateTableColumnSettings((settings) =>
      resetElectricalCandidateTableColumnWidth(settings, key),
    );
  }

  function resetDraftCandidateColumns() {
    setDraftCandidateTableColumnSettings(resetElectricalCandidateTableColumnSettings());
  }

  function selectAllDraftCandidateColumns() {
    setDraftCandidateTableColumnSettings((settings) =>
      createElectricalCandidateTableColumnSettingsPatch(
        settings,
        getAvailableElectricalCandidateTableColumnKeys(),
      ),
    );
  }

  function applyCandidateColumnSettings() {
    const normalized = normalizeElectricalCandidateTableColumnSettings(
      draftCandidateTableColumnSettings,
    );
    persistCandidateTableColumnSettings(normalized, { closeModal: true });
  }

  const totalObjects = pageSummary?.total_objects ?? objects.length;
  const filteredTableCount = electricalPage?.counts?.filtered ?? totalObjects;
  const electricalPagination = useMemo<TableProps<ProjectObject>['pagination']>(() => ({
    current: tablePage,
    pageSize: tablePageSize,
    total: filteredTableCount,
    pageSizeOptions: ['25', '50', '100'],
    showSizeChanger: true,
    hideOnSinglePage: filteredTableCount <= tablePageSize,
    showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
    size: 'small',
  }), [filteredTableCount, tablePage, tablePageSize]);
  const electricalInfiniteLoading = useMemo(() => (electricalGlideEnabled ? {
    loaded: objects.length,
    total: filteredTableCount,
    hasNextPage: Boolean(pageInfo?.has_next_page && nextElectricalPageCursor),
    loading: isElectricalPageFetching,
  } : null), [
    electricalGlideEnabled,
    filteredTableCount,
    isElectricalPageFetching,
    nextElectricalPageCursor,
    objects.length,
    pageInfo?.has_next_page,
  ]);
  const validObjectsCount = pageSummary?.valid_objects ?? stats.validObjects.length;
  const selectedObjectsCount = selectedRowKeys.length;
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedRowKeys.includes(object.id)),
    [objects, selectedRowKeys],
  );
  const selectedValidObjectsCount = useMemo(
    () => selectedObjects.filter((object) => object.is_valid).length,
    [selectedObjects],
  );
  const selectedHeatLossFailedCount = selectedObjectsCount - selectedValidObjectsCount;
  const calculatedCount = pageSummary?.calculated_count ?? stats.calcedCount;
  const failedCount = pageSummary?.failed_count ?? stats.failedCount;
  const totalCableLength = pageSummary?.total_cable_length ?? stats.totalCableLength;
  const totalPower = pageSummary?.total_power ?? stats.totalPower;
  const totalCurrent = pageSummary?.total_current ?? stats.totalCurrent;
  const visibleManualCableCount = useMemo(
    () => objects.reduce(
      (count, object) =>
        count + (getCableMarkSource(stats.calcByObjectId[object.id]) === 'manual' ? 1 : 0),
      0,
    ),
    [objects, stats.calcByObjectId],
  );
  const manualCableCount = pageSummary?.manual_cable_mark_count ?? visibleManualCableCount;
  const selectedManualCableCount = useMemo(
    () => selectedRowKeys.reduce(
      (count, objectId) =>
        count + (getCableMarkSource(stats.calcByObjectId[objectId]) === 'manual' ? 1 : 0),
      0,
    ),
    [selectedRowKeys, stats.calcByObjectId],
  );
  const renderManualOverwriteControl = useCallback((manualCount: number): ReactNode => {
    if (manualCount <= 0) return null;
    return (
      <>
        <Text type="secondary">
          Найдено ручных выборов: {manualCount}. По умолчанию они будут сохранены и пропущены.
        </Text>
        <Checkbox
          checked={overwriteManualChoices}
          onChange={(event) => setOverwriteManualChoices(event.target.checked)}
        >
          Перезаписать ручные выборы ({manualCount})
        </Checkbox>
      </>
    );
  }, [overwriteManualChoices]);
  const electricalErrorItems = useMemo(() => objects
    .map((obj, index) => {
      const calc = stats.calcByObjectId[obj.id];
      const error = electricalCalcError(calc);
      if (!error || isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)) return null;
      return {
        objectId: obj.id,
        rowNumber: electricalDisplayOffset + index + 1,
        objectName: objectDisplayName(obj),
        error,
        cableType: calc?.cable_type ?? null,
        errorContext: electricalCalcGuidanceContext(calc),
        errorCode: electricalCalcErrorCode(calc),
        suggestedActions: electricalCalcSuggestedActions(calc),
      };
    })
    .filter((item): item is {
      objectId: string;
      rowNumber: number;
      objectName: string;
      error: string;
      cableType: string;
      errorContext: Record<string, unknown> | null;
      errorCode: string | null;
      suggestedActions: string[] | null;
    } => item != null),
  [electricalDisplayOffset, objects, stats.calcByObjectId]);
  const activeElectricalErrorItem = useMemo(() => {
    if (activeRowId) {
      const activeIndex = objects.findIndex((obj) => obj.id === activeRowId);
      const activeObject = activeIndex >= 0 ? objects[activeIndex] : null;
      if (activeObject) {
        const calc = stats.calcByObjectId[activeObject.id];
        const error = isElectricalCalcUnsupported(calc) || isElectricalCalcStale(calc)
          ? null
          : electricalCalcError(calc);
        if (!error) {
          const firstError = electricalErrorItems[0];
          return firstError ? { ...firstError, fallback: true } : null;
        }
        return {
          objectId: activeObject.id,
          rowNumber: electricalDisplayOffset + activeIndex + 1,
          objectName: objectDisplayName(activeObject),
          error,
          cableType: calc?.cable_type ?? null,
          errorContext: electricalCalcGuidanceContext(calc),
          errorCode: electricalCalcErrorCode(calc),
          suggestedActions: electricalCalcSuggestedActions(calc),
          fallback: false,
        };
      }
    }
    const firstError = electricalErrorItems[0];
    return firstError ? { ...firstError, fallback: true } : null;
  }, [activeRowId, electricalDisplayOffset, electricalErrorItems, objects, stats.calcByObjectId]);
  const activeElectricalErrorGuidance = activeElectricalErrorItem?.error
    ? getElectricalErrorGuidance({
        error: activeElectricalErrorItem.error,
        cableType: activeElectricalErrorItem.cableType,
        errorContext: activeElectricalErrorItem.errorContext,
        errorCode: activeElectricalErrorItem.errorCode,
        suggestedActions: activeElectricalErrorItem.suggestedActions,
      })
    : null;
  const showSummaryInKW = totalPower >= 1000;
  const summaryPowerDisplay = showSummaryInKW
    ? `${(totalPower / 1000).toFixed(2)} кВт`
    : `${totalPower.toFixed(0)} Вт`;

  const bannerStats = calculatedCount > 0
    ? `${totalCableLength.toFixed(1)} м · ${summaryPowerDisplay} · ${totalCurrent.toFixed(2)} А · рассчитано: ${calculatedCount}/${totalObjects}`
    : 'расчёт не выполнен';
  const activeJobStatus = activeJob?.status ?? null;
  const isJobActive = isActiveCalcJobStatus(activeJobStatus);
  const selectedRecalcDisabled = selectedValidObjectsCount === 0 || isJobActive;
  const selectedRecalcTooltip =
    selectedObjectsCount > 0 && selectedValidObjectsCount === 0
      ? 'Сначала рассчитайте теплопотери для выбранных объектов'
      : undefined;
  const selectedRecalcCountLabel =
    selectedHeatLossFailedCount > 0
      ? `${selectedValidObjectsCount}/${selectedObjectsCount}`
      : String(selectedObjectsCount);
  const jobProgress = activeJob?.progress;
  const jobProgressLabel = jobProgress?.total
    ? `${jobProgress.current}/${jobProgress.total}`
    : activeJobStatus ?? '';
  const bannerCableTypeLabel = selectedCableTypesMixed
    ? 'смешанные типы'
    : selectedCableType
      ? CABLE_TYPE_LABEL[selectedCableType]
      : 'тип по объектам';
  const cableTypeControlLabel = 'Тип для пересчёта:';
  const toggleElectricalCandidateGlideMarked = useCallback((
    candidate: ElectricalCandidate,
    checked: boolean,
  ) => {
    toggleCableSizingCandidateMark(candidate.id, checked);
  }, []);
  const getElectricalCandidateGlideCellState = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
  ): HeatCalcGlideGridCellState => {
    const marked = markedCableSizingCandidateSet.has(candidate.id);
    const isDiff = (
      cableSizingCandidateCompareActive
      && marked
      && candidateCompareDiffColumnKeys.has(columnKey)
    );
    const actions = columnKey === 'actions'
      ? [
        {
          key: 'apply',
          label: candidate.is_applied ? 'Выбран' : 'Выбрать',
          disabled: candidate.status !== 'applicable' || applyCandidateMut.isPending,
        },
        {
          key: 'folder',
          label: 'Папка',
          disabled: toggleCandidateFolderItemMut.isPending,
        },
        {
          key: 'exclude',
          label: candidate.status === 'excluded' ? 'Вернуть' : 'Искл.',
          disabled: updateCandidateMut.isPending,
        },
      ]
      : undefined;
    return {
      displayValue: columnKey === 'marked'
        ? (marked ? '1' : '0')
        : columnKey === 'actions'
          ? ''
          : candidateCompareDisplayValue(columnKey, candidate),
      editable: false,
      align: candidateGlideColumnMetaByKey.get(columnKey)?.align,
      dirty: isDiff,
      error: candidate.status === 'error'
        ? candidate.reason_message ?? 'Ошибка варианта'
        : undefined,
      actions,
    };
  }, [
    applyCandidateMut.isPending,
    cableSizingCandidateCompareActive,
    candidateCompareDiffColumnKeys,
    candidateGlideColumnMetaByKey,
    markedCableSizingCandidateSet,
    toggleCandidateFolderItemMut.isPending,
    updateCandidateMut.isPending,
  ]);
  const handleElectricalCandidateGlideCellAction = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey !== 'actions') return;
    if (actionKey === 'apply') {
      if (candidate.status !== 'applicable' || candidate.is_applied) return;
      applyCandidateMut.mutate(candidate.id);
      return;
    }
    if (actionKey === 'exclude') {
      updateCandidateMut.mutate({
        candidateId: candidate.id,
        patch: {
          status: candidate.status === 'excluded' ? 'applicable' : 'excluded',
        },
      });
    }
  }, [applyCandidateMut, updateCandidateMut]);
  const candidateFolderMenuItems = useCallback((candidate: ElectricalCandidate) => {
    const favoriteItem = {
      key: 'favorite',
      label: `${candidate.is_pinned ? '✓ ' : ''}Избранное`,
      disabled: updateCandidateMut.isPending,
      onClick: () => updateCandidateMut.mutate({
        candidateId: candidate.id,
        patch: {
          is_pinned: !candidate.is_pinned,
        },
      }),
    };
    const customFolderItems = cableSizingCandidateFolders.length > 0
      ? cableSizingCandidateFolders.map((folder) => {
          const checked = folder.candidate_ids.includes(candidate.id);
          return {
            key: folder.id,
            label: `${checked ? '✓ ' : ''}${folder.name}`,
            onClick: () => toggleCandidateFolderItemMut.mutate({
              folderId: folder.id,
              candidateId: candidate.id,
              checked: !checked,
            }),
          };
        })
      : [{ key: 'empty', label: 'Создайте папку', disabled: true }];
    return [
      favoriteItem,
      { key: 'folders-divider', type: 'divider' as const },
      ...customFolderItems,
    ];
  }, [cableSizingCandidateFolders, toggleCandidateFolderItemMut, updateCandidateMut]);
  const getElectricalCandidateGlideActionMenuItems = useCallback((
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => {
    if (columnKey === 'actions' && actionKey === 'folder') {
      return candidateFolderMenuItems(candidate);
    }
    return null;
  }, [candidateFolderMenuItems]);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const cableTypeOptions = availableCableTypeKeys.map((k) => ({
    label: commercialFeaturesAvailable
      ? CABLE_TYPE_LABEL[k]
      : <Tooltip title="Расширенные типы кабеля закрыты feature flag">{CABLE_TYPE_LABEL[k]}</Tooltip>,
    value: k,
  }));
  const cableSourceOptions: Array<{ label: string; value: ElectricalCalculationCableSource }> = [
    { label: 'Встроенная', value: 'builtin' },
    ...(isEmployee
      ? [
          { label: 'Внешняя', value: 'extended' as ElectricalCalculationCableSource },
          { label: 'Все', value: 'all' as ElectricalCalculationCableSource },
        ]
      : []),
  ];
  const sourceVariantCalculationCount =
    pageSummary?.electrical_calculations_total ?? elecCalcs.length;
  const projectObjectsForCopyCount = pageSummary?.total_objects ?? objects.length;
  const copyVariantMenuItems = [1, 2, 3, 4]
    .filter((targetVariant) => targetVariant !== variant)
    .map((targetVariant) => ({
      key: String(targetVariant),
      label: `Скопировать СО${variant} в СО${targetVariant}`,
      disabled: copyVariantMut.isPending || isJobActive,
    }));

  function showCopyVariantConfirm(targetVariant: number) {
    Modal.confirm({
      title: `Создать СО${targetVariant} на основании СО${variant}?`,
      content: (
        <Space direction="vertical" size={6}>
          <Text>
            Скопируются {sourceVariantCalculationCount} объектов с расчётами в СО{variant}.
          </Text>
          {sourceVariantCalculationCount < projectObjectsForCopyCount && (
            <Text type="secondary">
              В проекте объектов: {projectObjectsForCopyCount}. Остальные в СО{targetVariant}
              {' '}останутся не рассчитаны.
            </Text>
          )}
          <Text type="secondary">
            Система проверит скопированные марки на текущих данных, но не заменит их более
            оптимальным кабелем.
          </Text>
        </Space>
      ),
      okText: 'Создать',
      cancelText: 'Отмена',
      onOk: () => copyVariantMut.mutate({ targetVariant }),
    });
  }

  function renderElectricalTypeControls(
    cableType: CableTypeKey | null = visibleCableTypeControl,
    options: { block?: boolean } = {},
  ) {
    if (!cableType) return null;
    if (cableType === 'self_regulating') return null;

    const wrap = (content: ReactNode) =>
      options.block ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {content}
        </div>
      ) : content;

    if (cableType === 'self_regulating_tt') {
      return wrap(
        <>
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T проп., °C:</Text>
          <InputNumber<number>
            aria-label="T пропарки"
            size="small"
            value={vaporTemperature}
            onChange={setVaporTemperature}
            style={{ width: 92 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>T3, °C:</Text>
          <InputNumber<number>
            aria-label="T3 поддержания"
            size="small"
            value={maintainTemperature}
            onChange={setMaintainTemperature}
            style={{ width: 92 }}
          />
          <Checkbox
            checked={aggressiveProduct}
            onChange={(e) => setAggressiveProduct(e.target.checked)}
          >
            <span style={{ fontSize: 12 }}>агр.</span>
          </Checkbox>
        </>,
      );
    }
    if (cableType === 'single_core' || cableType === 'three_core') {
      const connectionOptions = cableType === 'single_core'
        ? [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_1ph', label: 'Петля' },
            { value: 'star_3ph', label: 'Звезда' },
          ]
        : [
            { value: 'line_1ph', label: 'Линия' },
            { value: 'loop_2x3', label: 'Петля 2×3' },
            { value: 'loop_1x3', label: 'Петля 1×3' },
            { value: 'star_3x3', label: 'Звезда 3×3' },
            { value: 'star_1x3', label: 'Звезда 1×3' },
          ];
      return wrap(
        <>
          <Select
            aria-label="Схема подключения"
            size="small"
            value={connectionType}
            onChange={setConnectionType}
            options={connectionOptions}
            style={{ width: 118 }}
          />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>U:</Text>
          <InputNumber<number> size="small" min={1} value={supplyVoltage} onChange={setSupplyVoltage} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>w:</Text>
          <InputNumber<number> size="small" min={1} max={1.5} step={0.05} value={windingCoefficient} onChange={setWindingCoefficient} style={{ width: 72 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>h:</Text>
          <InputNumber<number> size="small" min={0} step={0.1} value={heatingHeight} onChange={setHeatingHeight} style={{ width: 76 }} />
          <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>шаг:</Text>
          <InputNumber<number> size="small" min={0.05} max={0.5} step={0.01} value={layingStep} onChange={setLayingStep} style={{ width: 76 }} />
        </>,
      );
    }
    return null;
  }

  function renderRecalculationSettings() {
    return (
      <div
        className="table-view-settings-panel electrical-recalculation-settings-panel"
        aria-label="Настройки пересчёта"
      >
        {commercialFeaturesAvailable && (
          <>
            <Tooltip title="Используется только при новом пересчёте или новом ручном выборе. Уже рассчитанные строки хранят снимок кабеля в проекте.">
              <Text className="table-view-settings-label">
                База для пересчёта:
              </Text>
            </Tooltip>
            <Segmented<ElectricalCalculationCableSource>
              aria-label="База для пересчёта"
              size="small"
              value={isEmployee ? draftTableViewSettings.calculationCableSource : 'builtin'}
              onChange={updateDraftCalculationCableSource}
              options={cableSourceOptions}
            />
          </>
        )}
        {SHOW_COMMERCIAL_CABLE_BASE_UI && (
          <>
            <Tag color={commercialDataStatus.color} style={{ marginInlineEnd: 0 }}>
              {commercialDataStatus.label}
            </Tag>
            <Text className="table-view-settings-label">
              Критерий:
            </Text>
            <Select<SelectionPolicy>
              aria-label="Критерий подбора кабеля"
              size="small"
              value={selectionPolicy}
              onChange={setSelectionPolicy}
              options={SELECTION_POLICY_OPTIONS}
              style={{ width: 128 }}
            />
          </>
        )}
        <Tag color={technicalDataStatus.color} style={{ marginInlineEnd: 0 }}>
          {technicalDataStatus.label}
        </Tag>
      </div>
    );
  }

  function renderSelectedCableSummary() {
    const appliedCandidate = appliedCableSizingCandidate;
    const calc = cableSizingModalCalc;
    const mark = appliedCandidate?.cable_mark ?? getCableMark(calc);
    const cableType = (appliedCandidate?.cable_type ?? calc?.cable_type ?? cableSizingCableType) as CableTypeKey;
    const results = appliedCandidate?.results ?? calc?.results;
    const orderLength = appliedCandidate
      ? candidateOrderCableLengthValue(appliedCandidate)
      : orderCableLengthValue(calc);

    if (!mark) {
      return (
        <div className="electrical-selected-cable-summary">
          <Text strong>Выбранный кабель:</Text>
          <Text type="secondary">Кабель не выбран</Text>
        </div>
      );
    }

    return (
      <div className="electrical-selected-cable-summary">
        <Text strong>Выбранный кабель:</Text>
        <Tag color="blue" className="electrical-selected-cable-summary__mark">
          {mark}
        </Tag>
        <Text type="secondary">{CABLE_TYPE_LABEL[cableType] ?? valueText(cableType)}</Text>
        <Text type="secondary">
          P: <strong>{powerText(results?.total_power)}</strong>
        </Text>
        <Text type="secondary">
          Заказ: <strong>{numberText(orderLength, 1)} м</strong>
        </Text>
        <Text type="secondary">
          I: <strong>{numberText(results?.current, 2)} А</strong>
        </Text>
      </div>
    );
  }

  function toggleCableSizingCandidateMark(candidateId: string, checked: boolean) {
    setMarkedCableSizingCandidateIds((current) => {
      if (checked) {
        return current.includes(candidateId) ? current : [...current, candidateId];
      }
      return current.filter((id) => id !== candidateId);
    });
  }

  function cableSizingCandidateRowClassName(candidate: ElectricalCandidate) {
    return [
      candidate.status === 'error' ? 'electrical-cable-sizing-table__row--error' : '',
      cableSizingCandidateCompareActive && markedCableSizingCandidateSet.has(candidate.id)
        ? 'electrical-cable-sizing-table__row--compared'
        : '',
    ].filter(Boolean).join(' ');
  }

  function isCandidateCompareDiffCell(
    candidate: ElectricalCandidate,
    columnKey: ElectricalCandidateColumnKey,
  ) {
    return (
      cableSizingCandidateCompareActive
      && markedCableSizingCandidateSet.has(candidate.id)
      && candidateCompareDiffColumnKeys.has(columnKey)
    );
  }

  function renderCandidateCompareBar() {
    if (!cableSizingCandidateCompareActive) return null;
    const diffCount = candidateCompareDiffColumnKeys.size;
    return (
      <div
        className="electrical-candidate-compare-bar"
        data-testid="candidate-compare-bar"
        role="status"
        aria-live="polite"
      >
        <Text strong>Сравнение: {displayedMarkedCableSizingCandidates.length} вариантов</Text>
        <Text type="secondary">
          {diffCount > 0
            ? `Отличий в видимых колонках: ${diffCount}`
            : 'В видимых колонках отличий нет'}
        </Text>
        <Button
          size="small"
          onClick={() => setMarkedCableSizingCandidateIds([])}
        >
          Сбросить сравнение
        </Button>
      </div>
    );
  }

  function openCreateCandidateFolderModal() {
    setCandidateFolderModalMode('create');
    setEditingCandidateFolder(null);
    setCandidateFolderName('');
    setCandidateFolderModalOpen(true);
  }

  function openRenameCandidateFolderModal(folder: ElectricalCandidateFolder) {
    setCandidateFolderModalMode('rename');
    setEditingCandidateFolder(folder);
    setCandidateFolderName(folder.name);
    setCandidateFolderModalOpen(true);
  }

  function submitCandidateFolderModal() {
    const name = candidateFolderName.trim();
    if (!name) {
      message.warning('Введите название папки');
      return;
    }
    if (candidateFolderModalMode === 'rename' && editingCandidateFolder) {
      updateCandidateFolderMut.mutate({ folderId: editingCandidateFolder.id, name });
      return;
    }
    createCandidateFolderMut.mutate();
  }

  function showDeleteCandidateFolderConfirm(folder: ElectricalCandidateFolder) {
    Modal.confirm({
      title: `Удалить папку «${folder.name}»?`,
      content: 'Варианты останутся в списке. Удалится только фильтр-папка.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteCandidateFolderMut.mutate(folder.id),
    });
  }

  function candidateFolderEmptyText() {
    if (activeCandidateFolderKey === 'favorite') return 'В избранном пока нет вариантов';
    if (activeCustomCandidateFolder) return 'В этой папке пока нет вариантов';
    return 'Вариантов пока нет. Запустите авторасчёт или ручной расчёт.';
  }

  function renderCandidateFolderButton(
    key: CandidateFolderKey,
    label: string,
    count: number,
  ) {
    return (
      <Button
        key={key}
        size="small"
        type={activeCandidateFolderKey === key ? 'primary' : 'default'}
        onClick={() => setActiveCandidateFolderKey(key)}
      >
        {label} <span className="electrical-candidate-folder-count">{count}</span>
      </Button>
    );
  }

  function renderCandidateFolderTabs() {
    return (
      <div className="electrical-candidate-folders" aria-label="Папки вариантов подбора">
        <div className="electrical-candidate-folders__scroll">
          {renderCandidateFolderButton('all', 'Все', candidateFolderCounts.all)}
          {renderCandidateFolderButton('favorite', 'Избранное', candidateFolderCounts.favorite)}
          {cableSizingCandidateFolders.map((folder) => {
            const key = candidateCustomFolderKey(folder.id);
            return (
              <span key={folder.id} className="electrical-candidate-folder-tab">
                {renderCandidateFolderButton(
                  key,
                  folder.name,
                  candidateFolderCounts.custom.get(folder.id) ?? 0,
                )}
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'rename',
                        icon: <EditOutlined />,
                        label: 'Переименовать',
                        onClick: () => openRenameCandidateFolderModal(folder),
                      },
                      {
                        key: 'delete',
                        icon: <DeleteOutlined />,
                        danger: true,
                        label: 'Удалить',
                        onClick: () => showDeleteCandidateFolderConfirm(folder),
                      },
                    ],
                  }}
                >
                  <Button
                    size="small"
                    className="electrical-candidate-folder-menu"
                    icon={<MoreOutlined />}
                    aria-label={`Действия с папкой ${folder.name}`}
                  />
                </Dropdown>
              </span>
            );
          })}
        </div>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={openCreateCandidateFolderModal}
        >
          Папка
        </Button>
      </div>
    );
  }

  const cableSizingCandidateColumns: ColumnsType<ElectricalCandidate> =
    visibleCandidateColumnMetas.map((column) => {
      const filterEnabled = column.key !== 'actions';
      const sortEnabled = column.key !== 'actions';
      const activeFilter = candidateTableViewState.filters[column.key];
      const filterKind = filterKindForCandidateColumn(column.key);
      const columnTitle = (
        <ResizableColumnTitle
          title={column.title}
          label={column.label}
          onResizeStart={(event) => startCandidateColumnResize(column, event)}
        />
      );
      const baseColumn = {
        title: columnTitle,
        key: column.key,
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        fixed: column.fixed,
        sorter: sortEnabled,
        sortOrder: sortEnabled && candidateTableViewState.sort?.columnKey === column.key
          ? candidateTableViewState.sort.direction === 'asc'
            ? 'ascend' as const
            : 'descend' as const
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${column.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }: { close: () => void }) => (
          <ColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={candidateEnumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => setCandidateColumnFilter(column.key, filter)}
            onReset={() => resetCandidateColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
        onCell: (candidate: ElectricalCandidate) => {
          const isDiff = isCandidateCompareDiffCell(candidate, column.key);
          return {
            className: isDiff ? 'electrical-candidate-cell--diff' : undefined,
            title: isDiff ? 'Отличается в выбранных вариантах' : undefined,
            'data-testid': isDiff ? `candidate-diff-${candidate.id}-${column.key}` : undefined,
          } as HTMLAttributes<HTMLElement>;
        },
      };
      if (column.key === 'marked') {
        return {
          ...baseColumn,
          align: 'center' as const,
          render: (_value, candidate) => (
            <Checkbox
              aria-label={`Пометить кандидат ${candidate.cable_mark ?? candidate.id}`}
              data-testid={`candidate-mark-${candidate.id}`}
              checked={markedCableSizingCandidateIds.includes(candidate.id)}
              onChange={(event) => toggleCableSizingCandidateMark(candidate.id, event.target.checked)}
            />
          ),
        };
      }
      if (column.key === 'actions') {
        return {
          ...baseColumn,
          render: (_value, candidate) => {
            const candidateName = candidate.cable_mark ?? candidate.id;
            const applyTooltip = candidate.is_applied
              ? 'Уже выбран'
              : candidate.status !== 'applicable'
                ? candidate.reason_message ?? 'Недоступно для выбора'
                : 'Выбрать';
            const excluded = candidate.status === 'excluded';
            const exclusionTooltip = excluded ? 'Вернуть вариант' : 'Исключить вариант';

            return (
              <Space size={2} wrap={false} className="electrical-candidate-actions">
                <Tooltip title={applyTooltip}>
                  <Button
                    aria-label={`${applyTooltip} кандидат ${candidateName}`}
                    aria-pressed={candidate.is_applied}
                    data-testid={`candidate-apply-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    type={candidate.is_applied ? 'primary' : 'default'}
                    icon={<CheckOutlined />}
                    disabled={
                      candidate.status !== 'applicable' ||
                      applyCandidateMut.isPending
                    }
                    loading={applyCandidateMut.isPending && applyCandidateMut.variables === candidate.id}
                    onClick={() => {
                      if (!candidate.is_applied) {
                        applyCandidateMut.mutate(candidate.id);
                      }
                    }}
                  />
                </Tooltip>
                <Dropdown
                  trigger={['click']}
                  menu={{ items: candidateFolderMenuItems(candidate) }}
                >
                  <Button
                    aria-label={`Добавить кандидат ${candidateName} в папку`}
                    data-testid={`candidate-folder-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    icon={<FolderOutlined />}
                    disabled={toggleCandidateFolderItemMut.isPending}
                  />
                </Dropdown>
                <Tooltip title={exclusionTooltip}>
                  <Button
                    aria-label={exclusionTooltip}
                    data-testid={`candidate-exclude-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    danger={!excluded}
                    icon={excluded ? <UndoOutlined /> : <StopOutlined />}
                    disabled={updateCandidateMut.isPending}
                    onClick={() => updateCandidateMut.mutate({
                      candidateId: candidate.id,
                      patch: {
                        status: excluded ? 'applicable' : 'excluded',
                      },
                    })}
                  />
                </Tooltip>
              </Space>
            );
          },
        };
      }
      if (column.key === 'mode') {
        return {
          ...baseColumn,
          dataIndex: 'mode',
          render: (value) => (value === 'auto' ? 'Авто' : 'Ручной'),
        };
      }
      return {
        ...baseColumn,
        dataIndex: column.key,
        ellipsis: column.key === 'selection_reason' ? false : column.ellipsis,
        align: column.align,
        render: (_value: unknown, candidate: ElectricalCandidate) =>
          renderCandidateElectricalField(column.key, candidate),
      };
    });
  const cableSizingCandidateTableScrollX = Math.max(
    920,
    visibleCandidateColumnMetas.reduce(
      (sum, column) => sum + Math.max(column.width, column.minWidthPx),
      0,
    ),
  );

  return (
    <>
      <div ref={tableScrollRegionsRef}>
        <Space direction="vertical" size={5} style={{ width: '100%' }}>

        {/* Summary banner */}
        <div className="common-data-banner">
          <span>
            <span className="label">СО{variant} · {bannerCableTypeLabel} · </span>
            {bannerStats}
          </span>
        </div>
        {failedCount > 0 && (
          <div className="electrical-error-summary" aria-label="Сообщения ошибок электрорасчёта">
            <div className="electrical-error-summary__header">
              <Tag color="error" icon={<CloseCircleFilled />}>
                Ошибок: {failedCount}
              </Tag>
            </div>
            {activeElectricalErrorItem?.error ? (
              <div className="electrical-error-summary__record">
                <Tooltip title={activeElectricalErrorItem.error}>
                  <Text type="secondary" ellipsis className="electrical-error-summary__message">
                    {activeElectricalErrorItem.error}
                  </Text>
                </Tooltip>
                {activeElectricalErrorItem.fallback && (
                  <Text type="secondary" className="electrical-error-summary__hint">
                    Показана первая ошибка на текущей странице. Выберите строку, чтобы переключить сообщение.
                  </Text>
                )}
                {activeElectricalErrorGuidance && (
                  <div className="electrical-error-summary__suggestions" aria-label="Предложения по исправлению ошибки">
                    <Tag color={activeElectricalErrorGuidance.tagColor} className="electrical-error-summary__kind">
                      {activeElectricalErrorGuidance.label}
                    </Tag>
                    <Text type="secondary" className="electrical-error-summary__suggestion-label">
                      Что попробовать:
                    </Text>
                    {activeElectricalErrorGuidance.suggestions.map((suggestion) => (
                      <Tag key={suggestion} className="electrical-error-summary__suggestion-tag">
                        {suggestion}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ) : !activeRowId && !activeElectricalErrorItem ? (
              <Text type="secondary" className="electrical-error-summary__empty">
                Ошибки есть вне текущей страницы таблицы.
              </Text>
            ) : null}
          </div>
        )}

        {/* ActionBar */}
        <div className="actionbar-srs electrical-actionbar">
          <div className="electrical-actionbar-row electrical-actionbar-row--setup">
            {[1, 2, 3, 4].map((n) => (
              <Button
                key={n}
                size="small"
                type={variant === n ? 'primary' : 'default'}
                onClick={() => {
                  setTablePage(1);
                  setVariant(n);
                }}
              >
                СО{n}
              </Button>
            ))}
            <Dropdown
              trigger={['click']}
              disabled={copyVariantMut.isPending || isJobActive}
              menu={{
                items: copyVariantMenuItems,
                onClick: ({ key }) => showCopyVariantConfirm(Number(key)),
              }}
            >
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={copyVariantMut.isPending}
                disabled={copyVariantMut.isPending || isJobActive}
              >
                Создать на основании
              </Button>
            </Dropdown>
            <span className="sep" />
            <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>{cableTypeControlLabel}</Text>
            <Select<CableTypeKey>
              aria-label="Тип кабеля для пересчёта"
              size="small"
              value={visibleCableTypeControl ?? undefined}
              placeholder="Несколько типов"
              disabled={isJobActive || !commercialFeaturesAvailable}
              onChange={(next) => {
                const nextType = normalizeAvailableCableType(next);
                if (selectedRowKeys.length === 0) {
                  setDefaultCableType(nextType);
                } else {
                  setCableTypeDraftByObjectId((prev) => {
                    const nextDrafts = { ...prev };
                    for (const objectId of selectedRowKeys) {
                      if (nextType === getSavedCableTypeForObject(objectId)) {
                        delete nextDrafts[objectId];
                      } else {
                        nextDrafts[objectId] = nextType;
                      }
                    }
                    return nextDrafts;
                  });
                }
                setConnectionType('line_1ph');
              }}
              options={cableTypeOptions}
              style={{ width: 210 }}
            />
            {renderElectricalTypeControls()}
          </div>
          <div className="electrical-actionbar-row electrical-actionbar-row--actions">
            {selectedManualCableCount > 0 ? (
              <Popconfirm
                title="Пересчитать выбранные объекты?"
                description={(
                  <Space direction="vertical" size={8}>
                    <Text>
                      Будет обработано выбранных объектов с рассчитанными теплопотерями: {selectedValidObjectsCount}.
                    </Text>
                    {selectedHeatLossFailedCount > 0 && (
                      <Text type="secondary">
                        Без рассчитанных теплопотерь будет пропущено: {selectedHeatLossFailedCount}.
                      </Text>
                    )}
                    {renderManualOverwriteControl(selectedManualCableCount)}
                  </Space>
                )}
                okText="Пересчитать"
                okButtonProps={{ danger: overwriteManualChoices }}
                cancelText="Отмена"
                onOpenChange={(open) => {
                  if (open) setOverwriteManualChoices(false);
                }}
                onConfirm={() =>
                  batchMut.mutate({
                    scope: 'selected',
                    objectIds: selectedRowKeys,
                    skipManual: !overwriteManualChoices,
                  })
                }
                disabled={selectedRecalcDisabled}
              >
                <Tooltip title={selectedRecalcTooltip}>
                  <span>
                    <Button
                      size="small"
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={batchMut.isPending || isJobActive}
                      disabled={selectedRecalcDisabled}
                    >
                      Пересчитать выбранные ({selectedRecalcCountLabel})
                    </Button>
                  </span>
                </Tooltip>
              </Popconfirm>
            ) : (
              <Tooltip title={selectedRecalcTooltip}>
                <span>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={batchMut.isPending || isJobActive}
                    disabled={selectedRecalcDisabled}
                    onClick={() =>
                      batchMut.mutate({
                        scope: 'selected',
                        objectIds: selectedRowKeys,
                        skipManual: true,
                      })
                    }
                  >
                    Пересчитать выбранные ({selectedRecalcCountLabel})
                  </Button>
                </span>
              </Tooltip>
            )}
          <Popconfirm
            title={`Пересчитать все объекты СО${variant}?`}
            description={(
              <Space direction="vertical" size={8}>
                <Text>
                  {manualCableCount > 0
                    ? `Строки без ручной марки в СО${variant} будут пересчитаны с типом `
                    : `Все объекты СО${variant} будут пересчитаны с типом `}
                  «{CABLE_TYPE_LABEL[cableTypeForRecalculation]}». Тип кабеля у пересчитываемых
                  строк будет заменён.
                </Text>
                {renderManualOverwriteControl(manualCableCount)}
              </Space>
            )}
            okText="Да, пересчитать все"
            okButtonProps={{ danger: true }}
            cancelText="Отмена"
            onOpenChange={(open) => {
              if (open) setOverwriteManualChoices(false);
            }}
            onConfirm={() => batchMut.mutate({
              scope: 'all',
              skipManual: !overwriteManualChoices,
            })}
            disabled={validObjectsCount === 0 || isJobActive}
          >
            <Button
              size="small"
              danger
              icon={<ReloadOutlined />}
              loading={batchMut.isPending || isJobActive}
              disabled={validObjectsCount === 0 || isJobActive}
            >
              Пересчитать все СО{variant}
            </Button>
          </Popconfirm>
          {isJobActive && activeJobId && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={cancelJobMut.isPending}
              onClick={() => cancelJobMut.mutate()}
            >
              Отменить
            </Button>
          )}
          <Button
            size="small"
            icon={<TableOutlined />}
            aria-label="Настройки"
            onClick={openColumnSettings}
          >
            Настройки
          </Button>
          <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
            <span className="action-tooltip-wrap">
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                aria-label="Сбросить фильтры таблицы"
                disabled={!currentTableViewActive}
                onClick={resetCurrentTableViewState}
              >
                Сбросить фильтры
              </Button>
            </span>
          </Tooltip>
          </div>
        </div>

        {isJobActive && (
          <Alert
            type="info"
            showIcon
            message={`Электрорасчёт выполняется · ${jobProgressLabel}`}
          />
        )}

        {/* Table */}
        <Card size="small" className="workspace-table-card srs-table-wrap">
          {electricalPage && totalObjects === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Нет объектов"
              description="Добавьте объекты на шаге «Теплопотери»."
              style={{ margin: 12 }}
            />
          ) : electricalGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalGlideGrid
                rows={objects}
                gridColumns={electricalGlideColumns}
                tableScrollX={electricalTableScrollX}
                tableScrollY={electricalTableScrollY}
                fontSizeKey={resolvedTableFontSize.key}
                activeRowId={activeRowId}
                selectedRowKeys={selectedRowKeys}
                tableViewState={tableViewState}
                pagination={electricalPagination}
                infiniteLoading={electricalInfiniteLoading}
                emptyContent={currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined}
                rowClassName={electricalRowClassName}
                getCellState={getElectricalGlideCellState}
                onOpenRow={openElectricalRow}
                onSelectedRowKeysChange={setSelectedRowKeys}
                onSetColumnFilter={setColumnFilter}
                onResetColumnFilter={resetColumnFilter}
                onSetSort={setElectricalTableSort}
                onColumnResize={applyElectricalGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalGlideColumnWidth}
                onPageChange={handleElectricalGlidePageChange}
                onLoadMore={handleElectricalGlideLoadMore}
                onCellAction={handleElectricalGlideCellAction}
                onStartCellEdit={handleElectricalGlideStartCellEdit}
                onCommitCell={handleElectricalGlideCommitCell}
              />
            </Suspense>
          ) : (
            <Table<ProjectObject>
              className={`calc-spreadsheet calc-spreadsheet--${resolvedTableFontSize.key} electrical-spreadsheet`}
              rowKey="id"
              size="small"
              loading={isElectricalPageFetching}
              pagination={electricalPagination}
              dataSource={objects}
              onChange={handleElectricalTableChange}
              scroll={{ x: electricalTableScrollX }}
              rowClassName={electricalRowClassName}
              onRow={(obj) => ({
                onClick: (event) => {
                  if ((event.target as HTMLElement).closest('.ant-table-selection-column')) return;
                  setActiveRowId(obj.id);
                },
              })}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                columnWidth: 36,
              }}
              columns={electricalColumns}
              locale={{
                emptyText: currentTableViewActive && totalObjects > 0 ? (
                  <div className="table-filter-empty">
                    <Text type="secondary">Нет строк по текущим фильтрам</Text>
                    <Button size="small" onClick={resetCurrentTableViewState}>
                      Сбросить фильтры
                    </Button>
                  </div>
                ) : undefined,
              }}
            />
          )}

          {/* Legend / summary row */}
          <div className="legend-row-srs">
            <span>
              ⓘ Красная строка = ошибка подбора кабеля, серый статус = не применимо.
              Отметьте строки для пересчёта выбранных или используйте «Пересчитать все».
            </span>
            {calculatedCount > 0 && (
              <Space size={16}>
                <Text style={{ fontSize: 12 }}>
                  Кабель: <strong>{totalCableLength.toFixed(1)} м</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Мощность: <strong>{summaryPowerDisplay}</strong>
                </Text>
                <Text style={{ fontSize: 12 }}>
                  Ток: <strong>{totalCurrent.toFixed(2)} А</strong>
                </Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={() => navigate(ROUTES.specification)}
                >
                  Спецификация →
                </Button>
              </Space>
            )}
          </div>
        </Card>

        </Space>
      </div>
      <Modal
        open={!!cableMarkModalObject}
        width="min(92vw, 1056px)"
        className="electrical-cable-picker-dialog"
        style={{ top: 28 }}
        title={cablePickerModalTitle}
        okText="Применить"
        cancelText="Отмена"
        confirmLoading={isCableMarkPending}
        okButtonProps={{
          disabled: !cableMarkModalObject?.is_valid
            || !cableMarkModalValue
            || cableMarkModalTargetVariants.length === 0,
        }}
        onOk={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {cableMarkModalObject && (
            <CablePickerCharacteristics
              object={cableMarkModalObject}
              cable={cableMarkModalSelectedCable}
              cableType={cableMarkModalCableType}
            />
          )}
          {cableMarkModalCableType && (
            <div>
              <Text type="secondary">Тип кабеля</Text>
              <Select<CableTypeKey>
                aria-label="Тип кабеля для выбора марки"
                size="small"
                value={cableMarkModalCableType}
                disabled={isCableMarkPending || !commercialFeaturesAvailable}
                onChange={changeCableMarkModalCableType}
                options={cableTypeOptions}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
          )}
          {cableMarkModalCableType && renderElectricalTypeControls(cableMarkModalCableType, { block: true })}
          <div>
            <Text type="secondary">Марка</Text>
            <Select
              autoFocus
              showSearch
              value={cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE}
              options={cableMarkModalOptions}
              optionFilterProp="searchLabel"
              disabled={!cableMarkModalObject?.is_valid || !project}
              loading={isCableMarkPending}
              notFoundContent="Нет доступных марок"
              style={{ width: '100%', marginTop: 4 }}
              onChange={setCableMarkModalValue}
            />
          </div>
          <div>
            <Text type="secondary">Сохранить в СО</Text>
            <Checkbox.Group
              aria-label="СО для сохранения выбора марки"
              options={cableMarkModalTargetVariantOptions}
              value={cableMarkModalTargetVariants}
              disabled={isCableMarkPending}
              onChange={(values) => {
                setCableMarkModalTargetVariants(normalizeCalculationVariantList(values));
              }}
              style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            «Авто» запустит автоподбор для выбранных СО. Выбор конкретной марки сохранит ручной
            подбор в отмеченных СО.
          </Text>
        </Space>
      </Modal>
      <Modal
        open={!!cableSizingModalObject}
        width="100vw"
        style={{ top: 0, maxWidth: 'none', paddingBottom: 0 }}
        className="electrical-cable-picker-dialog electrical-cable-sizing-dialog"
        title={cableSizingModalObject ? `Подбор кабеля для ${objectDisplayName(cableSizingModalObject)}` : 'Подбор'}
        footer={null}
        onCancel={closeCableSizingModal}
      >
        <div className="electrical-cable-sizing-body">
          {cableSizingModalObject && (
            <CablePickerCharacteristics
              object={cableSizingModalObject}
              cable={cableSizingModalSelectedCable}
              cableType={cableSizingEffectiveCableType}
              showCable={false}
              objectColumnCount={4}
            />
          )}
          <div className="electrical-cable-sizing-controls">
            <Segmented<'auto' | 'manual'>
              aria-label="Режим подбора кабеля"
              size="small"
              value={cableSizingMode}
              onChange={setCableSizingMode}
              options={[
                { label: 'Авторасчёт', value: 'auto' },
                { label: 'Ручной расчёт', value: 'manual' },
              ]}
            />
            <Select<CableTypeKey>
              aria-label="Тип кабеля для подбора"
              size="small"
              value={cableSizingEffectiveCableType}
              disabled={!commercialFeaturesAvailable}
              onChange={(nextType) => {
                setCableSizingCableType(normalizeAvailableCableType(nextType));
                setCableSizingManualMark(null);
                setConnectionType('line_1ph');
              }}
              options={cableTypeOptions}
              style={{ minWidth: 220 }}
            />
            {cableSizingMode === 'manual' && (
              <Select
                aria-label="Марка ручного кандидата"
                showSearch
                size="small"
                value={cableSizingManualMark ?? undefined}
                placeholder="Марка"
                options={cableSizingManualOptions
                  .filter((option) => option.mark)
                  .map((option) => ({
                    ...option,
                    value: option.mark!,
                  }))}
                optionFilterProp="searchLabel"
                style={{ minWidth: 280 }}
                onChange={setCableSizingManualMark}
              />
            )}
            <Button
              size="small"
              type="primary"
              loading={createCandidateMut.isPending}
              disabled={
                !cableSizingModalObject ||
                (cableSizingMode === 'manual' && !cableSizingManualMark)
              }
              onClick={() => createCandidateMut.mutate({
                mode: cableSizingMode,
                mark: cableSizingManualMark,
              })}
            >
              {cableSizingMode === 'auto' ? 'Запустить авторасчёт' : 'Рассчитать вариант'}
            </Button>
            <Button
              size="small"
              icon={<TableOutlined />}
              aria-label="Настройки таблицы"
              onClick={() => openCandidateColumnSettings()}
            >
              Настройки таблицы
            </Button>
            <Button
              size="small"
              icon={<CloseCircleOutlined />}
              aria-label="Сбросить фильтры таблицы кандидатов"
              disabled={!candidateTableViewActive}
              onClick={resetCandidateTableViewState}
            >
              Сбросить фильтры
            </Button>
          </div>
          {renderElectricalTypeControls(cableSizingEffectiveCableType, { block: true })}
          {renderSelectedCableSummary()}
          {renderCandidateFolderTabs()}
          {renderCandidateCompareBar()}
          {electricalCandidateGlideEnabled ? (
            <Suspense fallback={null}>
              <ElectricalCandidateGlideGrid
                rows={displayedCableSizingCandidates}
                gridColumns={electricalCandidateGlideColumns}
                tableScrollX={cableSizingCandidateTableScrollX}
                tableScrollY="calc(100vh - 332px)"
                fontSizeKey={resolvedTableFontSize.key}
                loading={isCableSizingCandidatesFetching}
                tableViewState={candidateTableViewState}
                emptyContent={candidateFolderEmptyText()}
                rowClassName={cableSizingCandidateRowClassName}
                getCellState={getElectricalCandidateGlideCellState}
                onToggleMarked={toggleElectricalCandidateGlideMarked}
                onCellAction={handleElectricalCandidateGlideCellAction}
                getActionMenuItems={getElectricalCandidateGlideActionMenuItems}
                onSetColumnFilter={setCandidateColumnFilter}
                onResetColumnFilter={resetCandidateColumnFilter}
                onSetSort={setCandidateTableSort}
                onColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
                onColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
              />
            </Suspense>
          ) : (
            <Table<ElectricalCandidate>
              className="electrical-cable-sizing-table"
              size="small"
              rowKey="id"
              onRow={(candidate) => ({
                'data-testid': `candidate-row-${candidate.id}`,
              }) as HTMLAttributes<HTMLElement>}
              rowClassName={cableSizingCandidateRowClassName}
              loading={isCableSizingCandidatesFetching}
              dataSource={displayedCableSizingCandidates}
              columns={cableSizingCandidateColumns}
              onChange={handleCandidateTableChange}
              pagination={false}
              scroll={{ x: cableSizingCandidateTableScrollX, y: 'calc(100vh - 332px)' }}
              locale={{
                emptyText: candidateFolderEmptyText(),
              }}
            />
          )}
          <Input.TextArea
            aria-label="Комментарий к выбранному кандидату"
            size="small"
            rows={2}
            maxLength={2000}
            placeholder="Комментарий инженера к выбранному варианту"
            disabled={!cableSizingCandidates.find((candidate) => candidate.is_applied)}
            defaultValue={
              cableSizingCandidates.find((candidate) => candidate.is_applied)?.engineer_comment ?? ''
            }
            onBlur={(event) => {
              const applied = cableSizingCandidates.find((candidate) => candidate.is_applied);
              if (!applied) return;
              const nextComment = event.currentTarget.value;
              if ((applied.engineer_comment ?? '') === nextComment) return;
              updateCandidateMut.mutate({
                candidateId: applied.id,
                patch: { engineer_comment: nextComment },
              });
            }}
          />
        </div>
      </Modal>
      <Modal
        open={candidateFolderModalOpen}
        title={candidateFolderModalMode === 'rename' ? 'Переименовать папку' : 'Новая папка'}
        okText={candidateFolderModalMode === 'rename' ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        confirmLoading={createCandidateFolderMut.isPending || updateCandidateFolderMut.isPending}
        okButtonProps={{ disabled: candidateFolderName.trim().length === 0 }}
        onOk={submitCandidateFolderModal}
        onCancel={() => {
          setCandidateFolderModalOpen(false);
          setEditingCandidateFolder(null);
          setCandidateFolderName('');
        }}
      >
        <Input
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          onChange={(event) => setCandidateFolderName(event.target.value)}
          onPressEnter={submitCandidateFolderModal}
        />
      </Modal>
      {candidateColumnSettingsOpen && (
        <ElectricalCandidateColumnSettingsModal
          open={candidateColumnSettingsOpen}
          settings={draftCandidateTableColumnSettings}
          settingsLabelFormat={normalizedTableViewSettings.settingsLabelFormat}
          confirmLoading={updateCandidateTableColumnPreference.isPending}
          onOk={applyCandidateColumnSettings}
          onCancel={() => setCandidateColumnSettingsOpen(false)}
          onSelectAllColumns={selectAllDraftCandidateColumns}
          onResetColumns={resetDraftCandidateColumns}
          onVisibleChange={updateDraftCandidateColumn}
          onOrderChange={updateDraftCandidateColumnOrder}
          onColumnReorder={reorderDraftCandidateColumn}
          onWidthChange={updateDraftCandidateColumnWidth}
          onResetWidth={resetDraftCandidateColumnWidth}
        />
      )}
      {columnSettingsOpen && (
        <ElectricalColumnSettingsModal
          open={columnSettingsOpen}
          settings={draftTableColumnSettings}
          viewSettings={draftTableViewSettings}
          confirmLoading={
            updateTableColumnPreference.isPending || updateTableSettingsPreference.isPending
          }
          onOk={applyColumnSettings}
          onCancel={() => setColumnSettingsOpen(false)}
          onSelectAllColumns={selectAllDraftColumns}
          onResetColumns={resetDraftColumns}
          onVisibleChange={updateDraftColumn}
          onOrderChange={updateDraftColumnOrder}
          onColumnReorder={reorderDraftColumn}
          onWidthChange={updateDraftColumnWidth}
          onResetWidth={resetDraftColumnWidth}
          onFontSizeChange={updateDraftTableFontSize}
          onTableLabelFormatChange={updateDraftTableLabelFormat}
          onSettingsLabelFormatChange={updateDraftSettingsLabelFormat}
          onResetFontSize={resetDraftTableFontSize}
          onResetLabelFormats={resetDraftLabelFormats}
          recalculationSettings={renderRecalculationSettings()}
        />
      )}
    </>
  );
}
