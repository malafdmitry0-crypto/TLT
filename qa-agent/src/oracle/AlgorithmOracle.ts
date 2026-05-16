import type { AlgorithmRegistry } from '../registry/AlgorithmRegistry';
import type { TestCase } from '../test-generation/types';
import type { ReferenceOracle } from './ReferenceOracle';
import type { ExpectedResult } from './types';

type AlgorithmFunction = (input: Record<string, unknown>) => unknown;

function numberInput(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing or non-numeric input: ${key}`);
  }
  return value;
}

function optionalNumberInput(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Non-numeric input: ${key}`);
  }
  return value;
}

function stringInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing or non-string input: ${key}`);
  }
  return value;
}

function tankCableLength(input: Record<string, unknown>): number {
  const shape = stringInput(input, 'shape');
  const heatingHeight = numberInput(input, 'heatingHeight');
  const layingStep = numberInput(input, 'layingStep');
  if (heatingHeight <= 0) throw new Error('heatingHeight must be > 0');
  if (layingStep < 0.05 || layingStep > 0.5) {
    throw new Error('layingStep must be in the range 0.05..0.5 m');
  }

  let perimeter: number;
  if (shape === 'cylindrical') {
    const diameter = numberInput(input, 'diameter');
    if (diameter <= 0) throw new Error('diameter must be > 0');
    perimeter = Math.PI * diameter;
  } else if (shape === 'rectangular') {
    const length = numberInput(input, 'length');
    const width = numberInput(input, 'width');
    if (length <= 0 || width <= 0) throw new Error('length and width must be > 0');
    perimeter = 2 * (length + width);
  } else {
    throw new Error(`Unsupported tank cable shape: ${shape}`);
  }

  return (perimeter / 2) * (heatingHeight / layingStep);
}

function climateSafetyFactor(input: Record<string, unknown>): Record<string, unknown> {
  const objectType = stringInput(input, 'objectType');

  if (objectType === 'pipe') {
    const diameterMm = numberInput(input, 'diameterMm');
    if (diameterMm <= 0) throw new Error('diameterMm must be > 0');

    if (diameterMm >= 100) {
      return {
        safetyFactor: 1.1,
        ambientTemperature: numberInput(input, 't1'),
        temperatureBasis: 'T1',
        rule: 'pipe_diameter_ge_100',
      };
    }

    return {
      safetyFactor: 1.12,
      ambientTemperature: numberInput(input, 't0'),
      temperatureBasis: 'T0',
      rule: 'pipe_diameter_lt_100',
    };
  }

  if (objectType === 'tank' || objectType === 'non_pipe') {
    return {
      safetyFactor: 1.1,
      ambientTemperature: numberInput(input, 'tColdFiveDay092'),
      temperatureBasis: 't_cold_fiveday_0_92',
      rule: 'non_pipe_cold_fiveday_0_92',
    };
  }

  throw new Error(`Unsupported climate objectType: ${objectType}`);
}

function maxWindingCoefficient(input: Record<string, unknown>): number {
  const diameterMm = numberInput(input, 'diameterMm');
  if (diameterMm <= 0) throw new Error('diameterMm must be > 0');

  if (diameterMm < 57) return 1.0;
  if (diameterMm === 57) return 1.1;
  if (diameterMm <= 75) return 1.2;
  if (diameterMm <= 89) return 1.3;
  if (diameterMm <= 108) return 1.4;
  return 1.5;
}

function ttSeriesSelection(input: Record<string, unknown>): string {
  const processTemperature = numberInput(input, 'processTemperature');
  const vaporTemperature = optionalNumberInput(input, 'vaporTemperature');
  const seriesLimits = [
    { series: 'ТТН', maxProductTemp: 65, maxVaporTemp: 85 },
    { series: 'ТТВ', maxProductTemp: 120, maxVaporTemp: 210 },
    { series: 'ТТХ', maxProductTemp: 150, maxVaporTemp: 250 },
  ];

  const match = seriesLimits.find(
    (item) =>
      processTemperature <= item.maxProductTemp &&
      (vaporTemperature === undefined || vaporTemperature <= item.maxVaporTemp),
  );
  if (!match) {
    throw new Error('Temperature exceeds TTН/TTВ/TTХ series limits');
  }
  return match.series;
}

function selectMinSufficientCable(input: Record<string, unknown>): string {
  const requiredPowerPerMeter = numberInput(input, 'requiredPowerPerMeter');
  const safetyFactor = numberInput(input, 'safetyFactor');
  const layoutFactor = numberInput(input, 'layoutFactor');
  const ambientTemperature = numberInput(input, 'ambientTemperature');
  const processTemperature = optionalNumberInput(input, 'processTemperature');
  const catalog = input.catalog;
  if (!Array.isArray(catalog)) throw new Error('catalog must be an array');

  const requiredEffective = requiredPowerPerMeter * safetyFactor;
  const candidates = catalog
    .filter((raw): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null)
    .filter((item) => {
      const power = item.power_per_meter;
      const minTemperature = item.min_temperature;
      const maxTemperature = item.max_temperature;
      return (
        typeof item.model === 'string' &&
        typeof power === 'number' &&
        power * layoutFactor >= requiredEffective &&
        typeof minTemperature === 'number' &&
        minTemperature <= ambientTemperature &&
        (processTemperature === undefined ||
          (typeof maxTemperature === 'number' && maxTemperature >= processTemperature))
      );
    })
    .sort((left, right) => Number(left.power_per_meter) - Number(right.power_per_meter));

  if (candidates.length === 0) {
    throw new Error(`No cable satisfies required effective power ${requiredEffective}`);
  }
  return String(candidates[0].model);
}

function pickCrossSection(input: Record<string, unknown>): number {
  const requiredCrossSection = numberInput(input, 'requiredCrossSection');
  const crossSections = input.crossSections;
  if (!Array.isArray(crossSections)) throw new Error('crossSections must be an array');
  const candidates = crossSections
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
    .filter((value) => value >= requiredCrossSection)
    .sort((left, right) => left - right);
  if (candidates.length === 0) {
    throw new Error(`No cross-section >= ${requiredCrossSection}`);
  }
  return candidates[0];
}

function resistivePassportOhmLaw(input: Record<string, unknown>): Record<string, number | boolean> {
  const resistanceOhmKm = numberInput(input, 'resistanceOhmKm');
  const cableLength = numberInput(input, 'cableLength');
  const supplyVoltage = numberInput(input, 'supplyVoltage');
  const resistanceFactor = optionalNumberInput(input, 'resistanceFactor') ?? 1;
  const powerMultiplier = optionalNumberInput(input, 'powerMultiplier') ?? 1;
  const maxCurrentA = optionalNumberInput(input, 'maxCurrentA') ?? 65;
  if (resistanceOhmKm <= 0) throw new Error('resistanceOhmKm must be > 0');
  if (cableLength <= 0) throw new Error('cableLength must be > 0');
  if (supplyVoltage <= 0) throw new Error('supplyVoltage must be > 0');
  if (resistanceFactor <= 0) throw new Error('resistanceFactor must be > 0');
  if (powerMultiplier <= 0) throw new Error('powerMultiplier must be > 0');

  const resistanceOhm = (resistanceOhmKm / 1000) * cableLength * resistanceFactor;
  const totalPower = (supplyVoltage ** 2 / resistanceOhm) * powerMultiplier;
  const current = totalPower / supplyVoltage;
  return {
    resistanceOhm,
    totalPower,
    current,
    maxCurrentA,
    withinCurrentLimit: current <= maxCurrentA,
  };
}

const BUILTIN_ALGORITHMS: Record<string, AlgorithmFunction> = {
  tlt_tank_cable_length: tankCableLength,
  tlt_climate_safety_factor: climateSafetyFactor,
  tlt_max_winding_coefficient: maxWindingCoefficient,
  tlt_tt_series_selection: ttSeriesSelection,
  tlt_select_min_sufficient_cable: selectMinSufficientCable,
  tlt_resistive_pick_cross_section: pickCrossSection,
  tlt_resistive_passport_ohm_law: resistivePassportOhmLaw,
};

export class AlgorithmOracle implements ReferenceOracle {
  constructor(
    private readonly algorithmRegistry?: AlgorithmRegistry,
    private readonly algorithms: Record<string, AlgorithmFunction> = BUILTIN_ALGORITHMS,
  ) {}

  evaluate(testCase: TestCase): ExpectedResult {
    const algorithmId = String(testCase.metadata.algorithmId ?? testCase.requirementId);
    const definition = this.algorithmRegistry?.getById(algorithmId);
    const fn = this.algorithms[algorithmId];

    if (!fn) {
      return {
        value: null,
        unit: definition?.outputs[0],
        warnings: [`No registered oracle function for algorithm: ${algorithmId}`],
        metadata: { ok: false, algorithmId, error: 'algorithm_function_not_found' },
      };
    }

    try {
      return {
        value: fn(testCase.input),
        unit: definition?.outputs[0],
        warnings: [],
        metadata: {
          ok: true,
          algorithmId,
          oracle: definition?.oracle,
        },
      };
    } catch (error) {
      return {
        value: null,
        unit: definition?.outputs[0],
        warnings: [error instanceof Error ? error.message : String(error)],
        metadata: { ok: false, algorithmId, error: 'evaluation_error' },
      };
    }
  }
}
