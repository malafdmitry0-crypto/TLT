import type { HeatCalcObjectType } from '@/types/project';

export type HeatCalcFieldId = string;
export type HeatCalcTableScope = HeatCalcObjectType | 'all';
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

