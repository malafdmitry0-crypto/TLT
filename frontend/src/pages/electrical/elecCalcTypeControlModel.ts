/**
 * Общие опции и типы recalc-контролов электрорасчёта.
 * Используются компактными контролами тулбара и панелью заполнения параметров.
 */

export const SINGLE_CORE_CONNECTION_OPTIONS = [
  { value: 'line_1ph', label: 'Линия' },
  { value: 'loop_1ph', label: 'Петля' },
  { value: 'star_3ph', label: 'Звезда' },
];

export const THREE_CORE_CONNECTION_OPTIONS = [
  { value: 'line_1ph', label: 'Линия' },
  { value: 'loop_2x3', label: 'Петля 2×3' },
  { value: 'loop_1x3', label: 'Петля 1×3' },
  { value: 'star_3x3', label: 'Звезда 3×3' },
  { value: 'star_1x3', label: 'Звезда 1×3' },
];

export type ElecCalcTypeControlValues = {
  aggressiveProduct: boolean | undefined;
  connectionType: string;
  heatingHeight: number | null;
  layingStep: number | null | undefined;
  maintainTemperature: number | null | undefined;
  supplyVoltage: number | null;
  vaporTemperature: number | null | undefined;
  windingCoefficient: number | null;
};

export type ElecCalcTypeControlSetters = {
  aggressiveProduct: (value: boolean | undefined) => void;
  connectionType: (value: string) => void;
  heatingHeight: (value: number | null) => void;
  layingStep: (value: number | null | undefined) => void;
  maintainTemperature: (value: number | null | undefined) => void;
  supplyVoltage: (value: number | null) => void;
  vaporTemperature: (value: number | null | undefined) => void;
  windingCoefficient: (value: number | null) => void;
};
