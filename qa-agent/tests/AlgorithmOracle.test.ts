import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AlgorithmOracle } from '../src/oracle/AlgorithmOracle';
import { AlgorithmRegistry } from '../src/registry/AlgorithmRegistry';
import type { TestCase } from '../src/test-generation/types';

function registry() {
  const algorithmRegistry = new AlgorithmRegistry();
  algorithmRegistry.loadFromFile(path.resolve('examples/tlt-formulas.registry.yaml'));
  return algorithmRegistry;
}

function testCase(requirementId: string, input: Record<string, unknown>): TestCase {
  return {
    id: `${requirementId}-test`,
    requirementId,
    input,
    kind: 'fixed',
    metadata: { algorithmId: requirementId },
  };
}

describe('AlgorithmOracle', () => {
  it('computes TLT tank cable length for cylindrical tanks', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_tank_cable_length', {
        shape: 'cylindrical',
        diameter: 2,
        heatingHeight: 3,
        layingStep: 0.3,
      }),
    );

    expect(result.value).toBeCloseTo(31.41592653589793);
    expect(result.metadata.ok).toBe(true);
  });

  it('computes TLT tank cable length for rectangular tanks with perimeter 2 * (L + B)', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_tank_cable_length', {
        shape: 'rectangular',
        length: 4,
        width: 2,
        heatingHeight: 3,
        layingStep: 0.3,
      }),
    );

    expect(result.value).toBeCloseTo(60);
    expect(result.metadata.ok).toBe(true);
  });

  it('resolves TNP climate rule for pipe diameter >= 100 mm', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_climate_safety_factor', {
        objectType: 'pipe',
        diameterMm: 100,
        t0: -40,
        t1: -35,
      }),
    );

    expect(result.value).toEqual({
      safetyFactor: 1.1,
      ambientTemperature: -35,
      temperatureBasis: 'T1',
      rule: 'pipe_diameter_ge_100',
    });
  });

  it('resolves TNP climate rule for pipe diameter < 100 mm', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_climate_safety_factor', {
        objectType: 'pipe',
        diameterMm: 99,
        t0: -40,
        t1: -35,
      }),
    );

    expect(result.value).toEqual({
      safetyFactor: 1.12,
      ambientTemperature: -40,
      temperatureBasis: 'T0',
      rule: 'pipe_diameter_lt_100',
    });
  });

  it('resolves TNP climate rule for non-pipe objects', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_climate_safety_factor', {
        objectType: 'tank',
        tColdFiveDay092: -33,
      }),
    );

    expect(result.value).toEqual({
      safetyFactor: 1.1,
      ambientTemperature: -33,
      temperatureBasis: 't_cold_fiveday_0_92',
      rule: 'non_pipe_cold_fiveday_0_92',
    });
  });

  it('uses upper-inclusive boundaries for TNP max winding coefficient', () => {
    const oracle = new AlgorithmOracle(registry());

    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 56.9 })).value).toBe(1);
    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 57 })).value).toBe(1.1);
    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 75 })).value).toBe(1.2);
    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 89 })).value).toBe(1.3);
    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 108 })).value).toBe(1.4);
    expect(oracle.evaluate(testCase('tlt_max_winding_coefficient', { diameterMm: 108.1 })).value).toBe(1.5);
  });

  it('selects TT series by product and vapor temperature', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_tt_series_selection', {
        processTemperature: 80,
        vaporTemperature: 120,
      }),
    );

    expect(result.value).toBe('ТТВ');
  });

  it('treats TT series temperature limits as inclusive rated maximums', () => {
    const oracle = new AlgorithmOracle(registry());

    expect(
      oracle.evaluate(
        testCase('tlt_tt_series_selection', {
          processTemperature: 65,
          vaporTemperature: 85,
        }),
      ).value,
    ).toBe('ТТН');
    expect(
      oracle.evaluate(
        testCase('tlt_tt_series_selection', {
          processTemperature: 120,
          vaporTemperature: 210,
        }),
      ).value,
    ).toBe('ТТВ');
    expect(
      oracle.evaluate(
        testCase('tlt_tt_series_selection', {
          processTemperature: 150,
          vaporTemperature: 250,
        }),
      ).value,
    ).toBe('ТТХ');
  });

  it('selects the minimal sufficient cable from an explicit catalog', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_select_min_sufficient_cable', {
        requiredPowerPerMeter: 15,
        safetyFactor: 1.1,
        layoutFactor: 1,
        ambientTemperature: -40,
        processTemperature: 50,
        catalog: [
          { model: 'TLT-10', power_per_meter: 10, min_temperature: -60, max_temperature: 65 },
          { model: 'TLT-17', power_per_meter: 17, min_temperature: -60, max_temperature: 65 },
          { model: 'TLT-30', power_per_meter: 30, min_temperature: -60, max_temperature: 120 },
        ],
      }),
    );

    expect(result.value).toBe('TLT-17');
  });

  it('picks the smallest sufficient conductor cross-section', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_pick_cross_section', {
        requiredCrossSection: 3.7,
        crossSections: [1.5, 2.5, 4, 6],
      }),
    );

    expect(result.value).toBe(4);
  });

  it('evaluates resistive passport resistance power and 65A current limit', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_passport_ohm_law', {
        resistanceOhmKm: 80,
        cableLength: 100,
        supplyVoltage: 220,
      }),
    );

    expect(result.value).toEqual({
      resistanceOhm: 8,
      totalPower: 6050,
      current: 27.5,
      maxCurrentA: 65,
      withinCurrentLimit: true,
    });
  });

  it('evaluates full-version resistive VSDX auto selection', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_vsdx_auto_select', {
        requiredHeatLoss: 5000,
        objectLength: 100,
        catalog: [
          { model: 'TT R1 100', resistanceOhmKm: 100, conductorCrossSection: 0.47 },
          { model: 'TT R1 80', resistanceOhmKm: 80, conductorCrossSection: 0.22 },
        ],
      }),
    );

    expect(result.metadata.ok).toBe(true);
    expect(result.value).toMatchObject({
      model: 'TT R1 100',
      voltage: 380,
      threads: 2,
      schemes: 1,
      connectionType: 'loop_1ph',
    });
    expect((result.value as { totalPower: number }).totalPower).toBeGreaterThan(5000);
  });

  it('evaluates three-core R3 VSDX loop with scheme multiplier', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_vsdx_auto_select', {
        cableKind: 'three_core',
        requiredHeatLoss: 10000,
        objectLength: 100,
        maxLinearPowerWM: 200,
        catalog: [{ model: 'TT R3 100', resistanceOhmKm: 100, conductorCrossSection: 0.47 }],
      }),
    );

    expect(result.metadata.ok).toBe(true);
    expect(result.value).toMatchObject({
      model: 'TT R3 100',
      voltage: 380,
      threads: 2,
      schemes: 1,
      connectionType: 'loop_2x3',
    });
    expect((result.value as { totalPower: number }).totalPower).toBeCloseTo(21660);
    expect((result.value as { current: number }).current).toBeCloseTo(57);
    expect((result.value as { p2WM: number }).p2WM).toBeCloseTo(108.3);
  });

  it('applies type-specific R3 50 W/m default p3 cap', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_vsdx_auto_select', {
        cableKind: 'three_core',
        requiredHeatLoss: 13000,
        objectLength: 100,
        maxParallelSchemes: 1,
        catalog: [{ model: 'TT R3 35', resistanceOhmKm: 35, conductorCrossSection: 0.5 }],
      }),
    );

    expect(result.metadata.ok).toBe(true);
    expect(result.value).toMatchObject({
      model: 'TT R3 35',
      voltage: 380,
      threads: 3,
      schemes: 1,
      connectionType: 'star_3x3',
    });
    expect((result.value as { p2WM: number }).p2WM).toBeGreaterThan(40);
    expect((result.value as { p3WM: number }).p3WM).toBeCloseTo(50);
  });

  it('evaluates three-core R3 VSDX star with scheme multiplier', () => {
    const result = new AlgorithmOracle(registry()).evaluate(
      testCase('tlt_resistive_vsdx_auto_select', {
        cableKind: 'three_core',
        requiredHeatLoss: 4500,
        objectLength: 100,
        maxLinearPowerWM: 20,
        catalog: [{ model: 'TT R3 100', resistanceOhmKm: 100, conductorCrossSection: 0.47 }],
      }),
    );

    expect(result.metadata.ok).toBe(true);
    expect(result.value).toMatchObject({
      model: 'TT R3 100',
      voltage: 380,
      threads: 3,
      schemes: 1,
      connectionType: 'star_3x3',
    });
    expect((result.value as { totalPower: number }).totalPower).toBeCloseTo(4813.333333);
    expect((result.value as { current: number }).current).toBeCloseTo(7.313103);
    expect((result.value as { p2WM: number }).p2WM).toBeCloseTo(16.044444);
  });

  it('returns a structured error for unsupported algorithms', () => {
    const result = new AlgorithmOracle(registry()).evaluate(testCase('unknown_algorithm', {}));

    expect(result.value).toBeNull();
    expect(result.metadata.error).toBe('algorithm_function_not_found');
  });
});
