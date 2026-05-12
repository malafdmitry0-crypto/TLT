import type { HeatCalcObjectType } from '@/types/project';

export type HeatCalcFieldId = string;
export type HeatCalcEditorKind = 'text' | 'number' | 'select';
export type HeatCalcInputUnit = 'mm' | 'm' | 'raw';

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

export const HEATCALC_PHASE1_PIPE_COLUMN_KEYS = [
  'name',
  'pipe_outer_diameter',
  'pipe_length',
  'pipe_wall_thickness',
  'insulation_thickness',
  'ambient_temperature',
  'process_temperature',
  'min_switch_temperature',
  'supply_voltage',
  'safety_factor',
] as const;

export const HEATCALC_PHASE1_TANK_COLUMN_KEYS = [
  'name',
  'tank_diameter',
  'tank_height',
  'tank_length',
  'tank_width',
  'tank_wall_thickness',
  'tank_wall_lambda',
  'insulation_thickness',
  'ambient_temperature',
  'process_temperature',
  'q_additional',
] as const;

export const HEATCALC_PHASE1_READONLY_COLUMN_KEYS = [
  'placement',
  'tank_shape',
  'insulation_material',
  'pipe_dn',
] as const;

export const HEATCALC_FIELD_DEFINITIONS: HeatCalcFieldDefinition[] = [
  {
    id: 'name',
    objectTypes: ['pipe', 'tank'],
    tableColumnKeys: { pipe: 'name', tank: 'name' },
    label: 'Наименование',
    editor: 'text',
    required: true,
    maxLength: 200,
  },
  {
    id: 'outer_diameter_mm',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'pipe_outer_diameter' },
    label: 'Наружный диаметр',
    editor: 'number',
    unit: 'мм',
    min: 10.8,
    max: 3000,
    step: 1,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'pipe_length',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'pipe_length' },
    label: 'Длина трубопровода',
    editor: 'number',
    unit: 'м',
    min: 0.5,
    max: 200000,
    step: 1,
    required: true,
    inputUnit: 'm',
    displayDigits: 1,
  },
  {
    id: 'wall_thickness_mm',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'pipe_wall_thickness' },
    label: 'Толщина стенки',
    editor: 'number',
    unit: 'мм',
    min: 0.1,
    max: 40,
    step: 0.1,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'wall_thickness_mm',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_wall_thickness' },
    label: 'Толщина стенки',
    editor: 'number',
    unit: 'мм',
    min: 1,
    max: 500,
    step: 1,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'diameter_mm',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_diameter' },
    label: 'Диаметр резервуара',
    editor: 'number',
    unit: 'мм',
    min: 10.8,
    max: 3000,
    step: 1,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'height_mm',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_height' },
    label: 'Высота резервуара',
    editor: 'number',
    unit: 'мм',
    min: 500,
    max: 200000,
    step: 100,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'length_mm',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_length' },
    label: 'Длина резервуара',
    editor: 'number',
    unit: 'мм',
    min: 1,
    step: 100,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'width_mm',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_width' },
    label: 'Ширина резервуара',
    editor: 'number',
    unit: 'мм',
    min: 1,
    step: 100,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'wall_lambda',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'tank_wall_lambda' },
    label: 'λ стенки',
    editor: 'number',
    unit: 'Вт/мК',
    min: 0.001,
    max: 400,
    step: 0.1,
    inputUnit: 'raw',
    displayDigits: 3,
  },
  {
    id: 'insulation_thickness_mm',
    objectTypes: ['pipe', 'tank'],
    tableColumnKeys: { pipe: 'insulation_thickness', tank: 'insulation_thickness' },
    label: 'Толщина изоляции',
    editor: 'number',
    unit: 'мм',
    min: 1,
    max: 500,
    step: 5,
    required: true,
    inputUnit: 'mm',
    displayDigits: 0,
  },
  {
    id: 'ambient_temperature',
    objectTypes: ['pipe', 'tank'],
    tableColumnKeys: { pipe: 'ambient_temperature', tank: 'ambient_temperature' },
    label: 'Температура среды',
    editor: 'number',
    unit: '°C',
    min: -70,
    max: 70,
    step: 0.1,
    required: true,
    inputUnit: 'raw',
    displayDigits: 0,
  },
  {
    id: 'process_temperature',
    objectTypes: ['pipe', 'tank'],
    tableColumnKeys: { pipe: 'process_temperature', tank: 'process_temperature' },
    label: 'Температура объекта',
    editor: 'number',
    unit: '°C',
    min: -90,
    max: 600,
    step: 0.1,
    required: true,
    inputUnit: 'raw',
    displayDigits: 0,
  },
  {
    id: 'min_switch_temperature',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'min_switch_temperature' },
    label: 'Мин. температура включения',
    editor: 'number',
    unit: '°C',
    min: -70,
    max: 70,
    step: 0.1,
    inputUnit: 'raw',
    displayDigits: 0,
  },
  {
    id: 'supply_voltage',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'supply_voltage' },
    label: 'Рабочее напряжение',
    editor: 'select',
    unit: 'В',
    options: [
      { value: 220, label: '220' },
      { value: 380, label: '380' },
    ],
    inputUnit: 'raw',
    displayDigits: 0,
  },
  {
    id: 'safety_factor',
    objectTypes: ['pipe'],
    tableColumnKeys: { pipe: 'safety_factor' },
    label: 'Коэффициент запаса',
    editor: 'number',
    min: 1.05,
    max: 1.7,
    step: 0.01,
    inputUnit: 'raw',
    displayDigits: 2,
  },
  {
    id: 'q_additional',
    objectTypes: ['tank'],
    tableColumnKeys: { tank: 'q_additional' },
    label: 'Q_доп',
    editor: 'number',
    unit: 'Вт',
    min: 0,
    step: 10,
    inputUnit: 'raw',
    displayDigits: 0,
  },
];

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
