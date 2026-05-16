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

function resistiveCableResistanceOhmKm(item: Record<string, unknown>): number {
  const raw = item.resistanceOhmKm ?? item.resistance_ohm_km;
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw > 0) return raw;
  const section = item.conductorCrossSection ?? item.conductor_cross_section;
  if (typeof section !== 'number' || Number.isNaN(section) || section <= 0) {
    throw new Error('catalog item must include resistanceOhmKm or conductorCrossSection');
  }
  return (0.0175 * 1000) / section;
}

function resistiveAutoMetrics(
  cable: Record<string, unknown>,
  {
    objectLength,
    sectionLength,
    voltage,
    threads,
    schemes,
    maxCurrentA,
    maxLinearPowerWM,
  }: {
    objectLength: number;
    sectionLength: number;
    voltage: number;
    threads: number;
    schemes: number;
    maxCurrentA: number;
    maxLinearPowerWM?: number;
  },
) {
  const resistanceOhmKm = resistiveCableResistanceOhmKm(cable);
  const resistancePerM = resistanceOhmKm / 1000;
  let circuitResistanceOhm: number;
  let current: number;
  if (threads === 2) {
    circuitResistanceOhm = resistancePerM * sectionLength * threads;
    current = voltage / circuitResistanceOhm;
  } else if (threads === 3) {
    circuitResistanceOhm = resistancePerM * sectionLength;
    current = (voltage / Math.sqrt(3)) / circuitResistanceOhm;
  } else {
    throw new Error('threads must be 2 or 3');
  }
  const p2WM = current ** 2 * resistancePerM;
  const p3ByCurrent = maxCurrentA ** 2 * resistancePerM;
  const p3WM = maxLinearPowerWM === undefined ? p3ByCurrent : Math.min(p3ByCurrent, maxLinearPowerWM);
  const perThreadPower = p2WM * sectionLength;
  const totalPower = perThreadPower * threads * schemes;
  return {
    model: String(cable.model ?? cable.brand ?? ''),
    resistanceOhmKm,
    circuitResistanceOhm,
    current,
    p2WM,
    p3WM,
    totalPower,
    linearPowerWM: totalPower / objectLength,
    voltage,
    threads,
    schemes,
    connectionType: threads === 2 ? 'loop_1ph' : 'star_3ph',
    cableLength: sectionLength * threads * schemes,
  };
}

function resistiveVsdxAutoSelect(input: Record<string, unknown>) {
  const requiredHeatLoss = numberInput(input, 'requiredHeatLoss');
  const objectLength = numberInput(input, 'objectLength');
  const windingCoefficient = optionalNumberInput(input, 'windingCoefficient') ?? 1;
  const startVoltage = optionalNumberInput(input, 'startVoltage') ?? 220;
  const highVoltage = optionalNumberInput(input, 'highVoltage') ?? 380;
  const minAdjustedVoltage = optionalNumberInput(input, 'minAdjustedVoltage') ?? 1;
  const voltageStep = optionalNumberInput(input, 'voltageStep') ?? 1;
  const maxCurrentA = optionalNumberInput(input, 'maxCurrentA') ?? 65;
  const maxLinearPowerWM = optionalNumberInput(input, 'maxLinearPowerWM');
  const maxParallelSchemes = optionalNumberInput(input, 'maxParallelSchemes') ?? 20;
  const catalog = input.catalog;
  if (requiredHeatLoss <= 0) throw new Error('requiredHeatLoss must be > 0');
  if (objectLength <= 0) throw new Error('objectLength must be > 0');
  if (windingCoefficient <= 0) throw new Error('windingCoefficient must be > 0');
  if (!Array.isArray(catalog)) throw new Error('catalog must be an array');

  const cables = catalog
    .filter((raw): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null)
    .sort((left, right) => resistiveCableResistanceOhmKm(right) - resistiveCableResistanceOhmKm(left));
  const requiredLinearPowerWM = requiredHeatLoss / objectLength;
  const sectionLength = objectLength * windingCoefficient;

  for (let schemes = 1; schemes <= maxParallelSchemes; schemes += 1) {
    let voltage = startVoltage;
    while (voltage >= minAdjustedVoltage) {
      let reduceVoltage = false;
      for (let index = 0; index < cables.length; index += 1) {
        const metrics = resistiveAutoMetrics(cables[index], {
          objectLength,
          sectionLength,
          voltage,
          threads: 2,
          schemes,
          maxCurrentA,
          maxLinearPowerWM,
        });
        if (metrics.p2WM > metrics.p3WM) {
          if (index === 0) {
            reduceVoltage = true;
            break;
          }
          continue;
        }
        if (metrics.linearPowerWM >= requiredLinearPowerWM) return metrics;
      }
      if (!reduceVoltage) break;
      voltage -= voltageStep;
    }

    for (const candidate of [
      { voltage: highVoltage, threads: 2 },
      { voltage: highVoltage, threads: 3 },
    ]) {
      for (const cable of cables) {
        const metrics = resistiveAutoMetrics(cable, {
          objectLength,
          sectionLength,
          voltage: candidate.voltage,
          threads: candidate.threads,
          schemes,
          maxCurrentA,
          maxLinearPowerWM,
        });
        if (metrics.p2WM <= metrics.p3WM && metrics.linearPowerWM >= requiredLinearPowerWM) {
          return metrics;
        }
      }
    }
  }
  throw new Error(`No VSDX auto selection for ${requiredLinearPowerWM} W/m`);
}

const BUILTIN_ALGORITHMS: Record<string, AlgorithmFunction> = {
  tlt_tank_cable_length: tankCableLength,
  tlt_climate_safety_factor: climateSafetyFactor,
  tlt_max_winding_coefficient: maxWindingCoefficient,
  tlt_tt_series_selection: ttSeriesSelection,
  tlt_select_min_sufficient_cable: selectMinSufficientCable,
  tlt_resistive_pick_cross_section: pickCrossSection,
  tlt_resistive_passport_ohm_law: resistivePassportOhmLaw,
  tlt_resistive_vsdx_auto_select: resistiveVsdxAutoSelect,
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
