import fieldRegistryConfig from '@/config/heatcalc-fields.default.json';
import type { HeatCalcObjectType } from '@/types/project';

export type HeatCalcFieldId = string;
export type HeatCalcEditorKind = 'text' | 'number' | 'select';
export type HeatCalcInputUnit = 'mm' | 'm' | 'raw';
export type HeatCalcFieldLabelContext = 'form' | 'table' | 'settings' | 'report' | 'import';
export type HeatCalcFieldLabelVariant = 'full' | 'short' | 'compact';

export interface HeatCalcFieldOption {
  label: string;
  value: string | number;
}

export interface HeatCalcFieldDefinition {
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
  options?: HeatCalcFieldOption[];
  inputUnit?: HeatCalcInputUnit;
  displayDigits?: number;
}

export interface HeatCalcFieldLabels {
  full: string;
  short: string;
  compact: string;
}

export interface HeatCalcFieldInputConfig {
  type?: string;
  unit?: string;
  min?: number;
  max?: number;
  default_step?: number;
  configurable_step?: boolean;
  required?: boolean;
  max_length?: number;
  options?: HeatCalcFieldOption[];
  input_unit?: HeatCalcInputUnit;
  display_digits?: number;
}

export interface HeatCalcFieldConfig {
  service_name: string;
  object_types: HeatCalcObjectType[];
  definition_object_types?: HeatCalcObjectType[];
  group: string;
  labels: HeatCalcFieldLabels;
  contexts?: Record<string, unknown>;
  table_keys?: Partial<Record<HeatCalcObjectType, string>>;
  description?: string;
  description_by_type?: Partial<Record<HeatCalcObjectType, string>>;
  description_by_mode?: Record<string, string>;
  input?: HeatCalcFieldInputConfig;
  input_by_type?: Partial<Record<HeatCalcObjectType, HeatCalcFieldInputConfig>>;
}

export interface HeatCalcRegistryTableColumn {
  key: string;
  field?: string;
  group?: string;
  defaultWidthPct?: number;
  minWidthPx?: number;
  required?: boolean;
  ellipsis?: boolean;
  copyTitle?: string;
  valueType?: string;
  defaultVisible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
}

export interface HeatCalcFieldLabelOptions {
  context?: HeatCalcFieldLabelContext;
  variant?: HeatCalcFieldLabelVariant;
  objectType?: HeatCalcObjectType;
  tableKey?: string;
}

export interface HeatCalcFieldDescriptionOptions {
  objectType?: HeatCalcObjectType;
  mode?: string;
}

const OBJECT_TYPES: HeatCalcObjectType[] = ['pipe', 'tank'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function objectTypesFromUnknown(value: unknown): HeatCalcObjectType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HeatCalcObjectType => item === 'pipe' || item === 'tank');
}

function normalizeOptions(value: unknown): HeatCalcFieldOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = stringValue(item.label);
      const rawValue = item.value;
      if (!label || (typeof rawValue !== 'string' && typeof rawValue !== 'number')) return null;
      return { label, value: rawValue };
    })
    .filter((item): item is HeatCalcFieldOption => item != null);
  return options.length > 0 ? options : undefined;
}

function normalizeInput(value: unknown): HeatCalcFieldInputConfig {
  if (!isRecord(value)) return {};
  const result: HeatCalcFieldInputConfig = {};
  const type = stringValue(value.type);
  if (type) result.type = type;
  const unit = stringValue(value.unit);
  if (unit) result.unit = unit;
  const min = numberValue(value.min);
  if (min != null) result.min = min;
  const max = numberValue(value.max);
  if (max != null) result.max = max;
  const defaultStep = numberValue(value.default_step);
  if (defaultStep != null) result.default_step = defaultStep;
  const configurableStep = booleanValue(value.configurable_step);
  if (configurableStep != null) result.configurable_step = configurableStep;
  const required = booleanValue(value.required);
  if (required != null) result.required = required;
  const maxLength = numberValue(value.max_length);
  if (maxLength != null) result.max_length = maxLength;
  const options = normalizeOptions(value.options);
  if (options) result.options = options;
  const inputUnit = stringValue(value.input_unit);
  if (inputUnit === 'mm' || inputUnit === 'm' || inputUnit === 'raw') result.input_unit = inputUnit;
  const displayDigits = numberValue(value.display_digits);
  if (displayDigits != null) result.display_digits = displayDigits;
  return result;
}

function normalizeLabels(fieldId: string, value: unknown): HeatCalcFieldLabels {
  const source = isRecord(value) ? value : {};
  const full = stringValue(source.full) ?? fieldId;
  return {
    full,
    short: stringValue(source.short) ?? full,
    compact: stringValue(source.compact) ?? stringValue(source.short) ?? full,
  };
}

function normalizeField(fieldId: string, value: unknown): HeatCalcFieldConfig {
  const source = isRecord(value) ? value : {};
  const serviceName = stringValue(source.service_name) ?? fieldId;
  const inputByType: HeatCalcFieldConfig['input_by_type'] = {};
  if (isRecord(source.input_by_type)) {
    for (const objectType of OBJECT_TYPES) {
      if (source.input_by_type[objectType]) {
        inputByType[objectType] = normalizeInput(source.input_by_type[objectType]);
      }
    }
  }
  const descriptionsByType: HeatCalcFieldConfig['description_by_type'] = {};
  if (isRecord(source.description_by_type)) {
    for (const objectType of OBJECT_TYPES) {
      const description = stringValue(source.description_by_type[objectType]);
      if (description) descriptionsByType[objectType] = description;
    }
  }
  const descriptionByMode: Record<string, string> = {};
  if (isRecord(source.description_by_mode)) {
    for (const [mode, description] of Object.entries(source.description_by_mode)) {
      if (typeof description === 'string') descriptionByMode[mode] = description;
    }
  }
  const tableKeys: HeatCalcFieldConfig['table_keys'] = {};
  if (isRecord(source.table_keys)) {
    for (const objectType of OBJECT_TYPES) {
      const key = stringValue(source.table_keys[objectType]);
      if (key) tableKeys[objectType] = key;
    }
  }

  return {
    service_name: serviceName,
    object_types: objectTypesFromUnknown(source.object_types),
    definition_object_types: objectTypesFromUnknown(source.definition_object_types),
    group: stringValue(source.group) ?? 'Прочее',
    labels: normalizeLabels(serviceName, source.labels),
    contexts: isRecord(source.contexts) ? source.contexts : undefined,
    table_keys: Object.keys(tableKeys).length > 0 ? tableKeys : undefined,
    description: stringValue(source.description),
    description_by_type: Object.keys(descriptionsByType).length > 0 ? descriptionsByType : undefined,
    description_by_mode: Object.keys(descriptionByMode).length > 0 ? descriptionByMode : undefined,
    input: normalizeInput(source.input),
    input_by_type: Object.keys(inputByType).length > 0 ? inputByType : undefined,
  };
}

const rawConfig: Record<string, unknown> = isRecord(fieldRegistryConfig)
  ? fieldRegistryConfig as Record<string, unknown>
  : {};
const rawFields = isRecord(rawConfig.fields) ? rawConfig.fields : {};

export const HEATCALC_FIELD_REGISTRY_VERSION = numberValue(rawConfig.version) ?? 1;

export const HEATCALC_FIELD_REGISTRY: Record<string, HeatCalcFieldConfig> = Object.fromEntries(
  Object.entries(rawFields).map(([fieldId, value]) => [fieldId, normalizeField(fieldId, value)]),
);

function contextRecord(field: HeatCalcFieldConfig, key: string) {
  const contexts = isRecord(field.contexts) ? field.contexts : {};
  return isRecord(contexts[key]) ? contexts[key] : {};
}

function labelFromContext(field: HeatCalcFieldConfig, options: HeatCalcFieldLabelOptions) {
  if (options.context === 'table' && options.tableKey) {
    const tableByKey = contextRecord(field, 'table_by_key');
    const rawTableContext = tableByKey[options.tableKey];
    const tableContext = isRecord(rawTableContext) ? rawTableContext : {};
    if (options.variant === 'full') return stringValue(tableContext.full_label) ?? stringValue(tableContext.label);
    if (options.variant === 'compact') return stringValue(tableContext.compact_label);
    return stringValue(tableContext.label) ?? stringValue(tableContext.full_label);
  }
  if (options.context === 'settings' && options.tableKey) {
    const settingsByKey = contextRecord(field, 'settings_by_key');
    const rawSettingsContext = settingsByKey[options.tableKey];
    const settingsContext = isRecord(rawSettingsContext) ? rawSettingsContext : {};
    return stringValue(settingsContext.label);
  }
  if (options.context === 'form' && options.objectType) {
    const formByType = contextRecord(field, 'form_by_type');
    const rawTypedContext = formByType[options.objectType];
    const typedContext = isRecord(rawTypedContext) ? rawTypedContext : {};
    const typedLabel = stringValue(typedContext.label);
    if (typedLabel) return typedLabel;
  }
  if (options.context) {
    const context = contextRecord(field, options.context);
    return stringValue(context.label);
  }
  return undefined;
}

export function getHeatCalcFieldConfig(fieldId: string) {
  return HEATCALC_FIELD_REGISTRY[fieldId] ?? null;
}

export function getHeatCalcFieldInputConfig(
  fieldId: string,
  objectType?: HeatCalcObjectType,
): HeatCalcFieldInputConfig | null {
  const field = getHeatCalcFieldConfig(fieldId);
  if (!field) return null;
  return {
    ...(field.input ?? {}),
    ...(objectType ? field.input_by_type?.[objectType] ?? {} : {}),
  };
}

export function getHeatCalcFieldLabel(
  fieldId: string,
  options: HeatCalcFieldLabelOptions = {},
) {
  const field = getHeatCalcFieldConfig(fieldId);
  if (!field) return fieldId;
  const contextLabel = labelFromContext(field, options);
  if (contextLabel) return contextLabel;
  const variant = options.variant ?? (options.context === 'table' ? 'short' : 'full');
  return field.labels[variant] ?? field.labels.full ?? field.service_name;
}

export function getHeatCalcFieldDescription(
  fieldId: string,
  options: HeatCalcFieldDescriptionOptions = {},
) {
  const field = getHeatCalcFieldConfig(fieldId);
  if (!field) return '';
  if (options.mode && field.description_by_mode?.[options.mode]) {
    return field.description_by_mode[options.mode];
  }
  if (options.objectType && field.description_by_type?.[options.objectType]) {
    return field.description_by_type[options.objectType] ?? '';
  }
  return field.description ?? '';
}

function editorFromInput(input: HeatCalcFieldInputConfig): HeatCalcEditorKind | null {
  if (input.type === 'text') return 'text';
  if (input.type === 'number') return 'number';
  if (input.type === 'select') return 'select';
  return null;
}

function fieldDefinitionForType(
  field: HeatCalcFieldConfig,
  objectType: HeatCalcObjectType,
): HeatCalcFieldDefinition | null {
  const input = getHeatCalcFieldInputConfig(field.service_name, objectType) ?? {};
  const editor = editorFromInput(input);
  if (!editor) return null;
  const tableColumnKeys = field.table_keys ?? {};
  const definition: HeatCalcFieldDefinition = {
    id: field.service_name,
    objectTypes: [objectType],
    tableColumnKeys,
    label: getHeatCalcFieldLabel(field.service_name, {
      context: 'settings',
      objectType,
      tableKey: tableColumnKeys[objectType],
      variant: 'full',
    }),
    editor,
  };
  if (input.unit != null) definition.unit = input.unit;
  if (input.min != null) definition.min = input.min;
  if (input.max != null) definition.max = input.max;
  if (input.default_step != null) definition.step = input.default_step;
  if (input.required != null) definition.required = input.required;
  if (input.max_length != null) definition.maxLength = input.max_length;
  if (input.options != null) definition.options = input.options;
  if (input.input_unit != null) definition.inputUnit = input.input_unit;
  if (input.display_digits != null) definition.displayDigits = input.display_digits;
  return definition;
}

export const HEATCALC_FIELD_DEFINITIONS: HeatCalcFieldDefinition[] = Object.values(HEATCALC_FIELD_REGISTRY)
  .flatMap((field) => (field.definition_object_types ?? [])
    .map((objectType) => fieldDefinitionForType(field, objectType))
    .filter((item): item is HeatCalcFieldDefinition => item != null));

const FIELD_BY_ID = new Map<string, HeatCalcFieldDefinition>();
const FIELD_BY_ID_AND_TYPE = new Map<string, HeatCalcFieldDefinition>();
const FIELD_BY_COLUMN = new Map<string, HeatCalcFieldDefinition>();

for (const field of HEATCALC_FIELD_DEFINITIONS) {
  if (!FIELD_BY_ID.has(field.id)) FIELD_BY_ID.set(field.id, field);
  for (const objectType of field.objectTypes) {
    FIELD_BY_ID_AND_TYPE.set(`${objectType}:${field.id}`, field);
    const columnKey = field.tableColumnKeys[objectType];
    if (columnKey) FIELD_BY_COLUMN.set(`${objectType}:${columnKey}`, field);
  }
}

export function getHeatCalcFieldDefinition(fieldId: string, objectType?: HeatCalcObjectType) {
  if (objectType) return FIELD_BY_ID_AND_TYPE.get(`${objectType}:${fieldId}`) ?? null;
  return FIELD_BY_ID.get(fieldId) ?? null;
}

export function getHeatCalcFieldByColumn(
  objectType: HeatCalcObjectType,
  columnKey: string,
) {
  return FIELD_BY_COLUMN.get(`${objectType}:${columnKey}`) ?? null;
}

export function isHeatCalcFieldStepConfigurable(
  objectType: HeatCalcObjectType,
  fieldId: string,
) {
  const input = getHeatCalcFieldInputConfig(fieldId, objectType);
  return input?.type === 'number' && input.configurable_step === true;
}

function tableConfig(): Record<string, unknown> {
  const rawTable = rawConfig.table;
  return isRecord(rawTable) ? rawTable : {};
}

export function getHeatCalcTableColumnRegistry(type: HeatCalcObjectType): HeatCalcRegistryTableColumn[] {
  const rawRegistry = tableConfig().registry;
  const registry: Record<string, unknown> = isRecord(rawRegistry) ? rawRegistry : {};
  const rawColumns = registry[type];
  const columns: unknown[] = Array.isArray(rawColumns) ? rawColumns : [];
  return columns
    .filter(isRecord)
    .map((column) => ({
      key: stringValue(column.key) ?? '',
      field: stringValue(column.field),
      group: stringValue(column.group),
      defaultWidthPct: numberValue(column.defaultWidthPct),
      minWidthPx: numberValue(column.minWidthPx),
      required: booleanValue(column.required),
      ellipsis: booleanValue(column.ellipsis),
      copyTitle: stringValue(column.copyTitle),
      valueType: stringValue(column.valueType),
      defaultVisible: booleanValue(column.defaultVisible),
      sortable: booleanValue(column.sortable),
      filterable: booleanValue(column.filterable),
      resizable: booleanValue(column.resizable),
    }))
    .filter((column) => column.key.length > 0);
}

export function getHeatCalcDefaultVisibleTableKeys(type: HeatCalcObjectType) {
  const rawDefaultVisible = tableConfig().default_visible;
  const defaultVisible: Record<string, unknown> = isRecord(rawDefaultVisible) ? rawDefaultVisible : {};
  const rawKeys = defaultVisible[type];
  const keys: unknown[] = Array.isArray(rawKeys) ? rawKeys : [];
  return keys.filter((key): key is string => typeof key === 'string');
}
