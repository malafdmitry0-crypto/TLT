import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FormulaOracle } from '../src/oracle/FormulaOracle';
import { FormulaRegistry } from '../src/registry/FormulaRegistry';
import type { TestCase } from '../src/test-generation/types';

function registry() {
  const formulaRegistry = new FormulaRegistry();
  formulaRegistry.loadFromFile(path.resolve('examples/requirements.example.yaml'));
  return formulaRegistry;
}

function tltRegistry() {
  const formulaRegistry = new FormulaRegistry();
  formulaRegistry.loadFromFile(path.resolve('examples/tlt-formulas.registry.yaml'));
  return formulaRegistry;
}

function testCase(requirementId: string, input: Record<string, unknown>): TestCase {
  return {
    id: `${requirementId}-test`,
    requirementId,
    input,
    kind: 'fixed',
    metadata: { formulaId: requirementId },
  };
}

describe('FormulaOracle', () => {
  it('evaluates compound_interest', () => {
    const result = new FormulaOracle(registry()).evaluate(
      testCase('compound_interest', { P: 1000, r: 0.05, n: 12, t: 10 }),
    );
    expect(result.value).toBeCloseTo(1647.00949769028);
    expect(result.metadata.ok).toBe(true);
  });

  it('evaluates circle_area', () => {
    const result = new FormulaOracle(registry()).evaluate(testCase('circle_area', { r: 3 }));
    expect(result.value).toBeCloseTo(Math.PI * 9);
  });

  it('evaluates linear_function', () => {
    const result = new FormulaOracle(registry()).evaluate(
      testCase('linear_function', { m: 2, x: 5, b: 1 }),
    );
    expect(result.value).toBe(11);
  });

  it('returns structured error for invalid input', () => {
    const result = new FormulaOracle(registry()).evaluate(testCase('circle_area', { r: -1 }));
    expect(result.value).toBeNull();
    expect(result.metadata.error).toBe('constraint_failed');
  });

  it('returns structured error for missing variable', () => {
    const result = new FormulaOracle(registry()).evaluate(testCase('linear_function', { m: 2, x: 5 }));
    expect(result.value).toBeNull();
    expect(result.metadata.error).toBe('invalid_input');
  });

  it('evaluates TLT outdoor alpha primitive', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_alpha_outdoor', { windSpeed: 4 }),
    );
    expect(result.value).toBeCloseTo(25.6);
  });

  it('evaluates TLT pipe effective length primitive', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_pipe_effective_length', {
        pipeLength: 100,
        numLocalElements: 3,
        localElementEquivLength: 1.5,
      }),
    );
    expect(result.value).toBeCloseTo(104.5);
  });

  it('keeps pipe electrical required power free of heat-loss safety factor', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_pipe_electrical_required_power_per_meter', {
        heatLossPerMeter: 25,
      }),
    );
    expect(result.value).toBeCloseTo(25);
  });

  it('evaluates TLT tank flat-wall external resistance primitive', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_tank_external_resistance', { alpha: 25.6 }),
    );
    expect(result.value).toBeCloseTo(1 / 25.6);
  });

  it('removes already-applied tank safety factor before electrical selection', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_tank_electrical_required_power_per_meter', {
        totalHeatLoss: 1100,
        safetyFactor: 1.1,
        cableLength: 50,
      }),
    );
    expect(result.value).toBeCloseTo(20);
  });

  it('evaluates TLT resistive rho temperature primitive', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_resistive_rho_t', { processTemperature: 70 }),
    );
    expect(result.value).toBeCloseTo(0.021175);
  });

  it('returns structured error for TLT ground resistance boundary', () => {
    const result = new FormulaOracle(tltRegistry()).evaluate(
      testCase('tlt_pipe_ground_resistance', {
        burialDepth: 0.05,
        rOuter: 0.1,
        lambdaGround: 1.5,
      }),
    );
    expect(result.value).toBeNull();
    expect(result.metadata.error).toBe('evaluation_error');
  });
});
