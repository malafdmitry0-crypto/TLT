import type { FormulaRegistry } from '../registry/FormulaRegistry';
import type { FormulaDefinition } from '../registry/types';
import type { TestCase } from '../test-generation/types';
import type { ReferenceOracle } from './ReferenceOracle';
import type { ExpectedResult } from './types';

type FormulaFunction = (input: Record<string, number>) => number;

const BUILTIN_FORMULAS: Record<string, FormulaFunction> = {
  compound_interest: ({ P, r, n, t }) => P * (1 + r / n) ** (n * t),
  circle_area: ({ r }) => Math.PI * r ** 2,
  linear_function: ({ m, x, b }) => m * x + b,

  // TLT heat-loss primitives from backend/app/formulas/heat_loss.
  // These are intentionally small deterministic primitives, not imports from the app under test.
  tlt_alpha_outdoor: ({ windSpeed }) => Math.min(Math.max(11.6 + 7.0 * Math.sqrt(Math.max(windSpeed, 0)), 11.6), 52.0),
  tlt_pipe_effective_length: ({ pipeLength, numLocalElements, localElementEquivLength }) =>
    pipeLength + numLocalElements * localElementEquivLength,
  tlt_cylindrical_layer_resistance: ({ rIn, rOut, lambda }) =>
    Math.log(rOut / rIn) / (2 * Math.PI * lambda),
  tlt_pipe_external_resistance: ({ rOuter, alpha }) => 1 / (2 * Math.PI * rOuter * alpha),
  tlt_pipe_ground_resistance: ({ burialDepth, rOuter, lambdaGround }) => {
    const ratio = burialDepth / rOuter;
    if (ratio < 1) throw new Error('burialDepth / rOuter must be >= 1');
    return Math.log(ratio + Math.sqrt(ratio * ratio - 1)) / (2 * Math.PI * lambdaGround);
  },
  tlt_pipe_linear_heat_loss: ({ deltaT, thermalResistance }) => deltaT / thermalResistance,
  tlt_pipe_total_heat_loss: ({ heatLossPerMeter, effectiveLength, safetyFactor }) =>
    heatLossPerMeter * effectiveLength * safetyFactor,
  tlt_pipe_electrical_required_power_per_meter: ({ heatLossPerMeter }) => heatLossPerMeter,

  // TLT tank primitives from backend/app/formulas/heat_loss/tank.py.
  tlt_tank_surface_area_cylindrical: ({ diameter, height }) =>
    Math.PI * diameter * height + 2 * Math.PI * (diameter / 2) ** 2,
  tlt_tank_surface_area_rectangular: ({ length, width, height }) =>
    2 * (length * width + length * height + width * height),
  tlt_tank_surface_area_spherical: ({ diameter }) => 4 * Math.PI * (diameter / 2) ** 2,
  tlt_tank_external_resistance: ({ alpha }) => 1 / alpha,
  tlt_tank_flat_heat_flux: ({ deltaT, wallResistance, insulationResistance, externalResistance }) =>
    deltaT / (wallResistance + insulationResistance + externalResistance),
  tlt_tank_total_heat_loss: ({ heatLossPerM2, surfaceArea, safetyFactor, qAdditional }) =>
    heatLossPerM2 * surfaceArea * safetyFactor + qAdditional,
  tlt_tank_electrical_required_power_per_meter: ({ totalHeatLoss, safetyFactor, cableLength }) =>
    totalHeatLoss / safetyFactor / cableLength,

  // TLT electrical primitives from backend/app/formulas/electrical.
  tlt_self_reg_cable_length: ({ pipeLength, windingCoefficient, numberOfThreads }) =>
    pipeLength * 1.1 * windingCoefficient * numberOfThreads,
  tlt_tt_power_curve: ({ q1, processTemperature, q2 }) => q1 * processTemperature + q2,
  tlt_resistive_rho_t: ({ processTemperature }) => 0.0175 * (1.0 + 0.0042 * (processTemperature - 20.0)),
  tlt_resistive_single_line_cross_section: ({ requiredHeatLoss, supplyVoltage, rhoT, cableLength }) =>
    (requiredHeatLoss / supplyVoltage ** 2) * rhoT * cableLength,
  tlt_resistive_single_loop_cross_section: ({ requiredHeatLoss, supplyVoltage, rhoT, cableLength }) =>
    (requiredHeatLoss / supplyVoltage ** 2) * rhoT * 2 * cableLength,
  tlt_resistive_single_star_cross_section: ({ requiredHeatLoss, supplyVoltage, rhoT, cableLength }) => {
    const phaseVoltage = supplyVoltage / Math.sqrt(3);
    return (requiredHeatLoss / phaseVoltage ** 2) * rhoT * 3 * cableLength;
  },
};

function parseConstraint(constraint: string): RegExpExecArray | null {
  return /^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|>|<=|<|===|==)\s*(-?\d+(?:\.\d+)?)$/.exec(
    constraint.trim(),
  );
}

function checkConstraint(input: Record<string, number>, constraint: string): string | undefined {
  const match = parseConstraint(constraint);
  if (!match) return `Unsupported constraint: ${constraint}`;
  const [, variable, operator, rawLimit] = match;
  const value = input[variable];
  const limit = Number(rawLimit);
  let ok = false;
  if (operator === '>=') ok = value >= limit;
  if (operator === '>') ok = value > limit;
  if (operator === '<=') ok = value <= limit;
  if (operator === '<') ok = value < limit;
  if (operator === '==' || operator === '===') ok = value === limit;
  return ok ? undefined : `Constraint failed: ${constraint}`;
}

function numericInput(
  definition: FormulaDefinition,
  input: Record<string, unknown>,
): { values?: Record<string, number>; error?: string } {
  const values: Record<string, number> = {};
  for (const variable of definition.variables) {
    const raw = input[variable];
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
      return { error: `Missing or non-numeric variable: ${variable}` };
    }
    values[variable] = raw;
  }
  return { values };
}

export class FormulaOracle implements ReferenceOracle {
  constructor(
    private readonly formulaRegistry: FormulaRegistry,
    private readonly functions: Record<string, FormulaFunction> = BUILTIN_FORMULAS,
  ) {}

  evaluate(testCase: TestCase): ExpectedResult {
    const formulaId = String(testCase.metadata.formulaId ?? testCase.requirementId);
    const definition = this.formulaRegistry.getById(formulaId);
    if (!definition) {
      return {
        value: null,
        warnings: [`Formula not found: ${formulaId}`],
        metadata: { ok: false, formulaId, error: 'formula_not_found' },
      };
    }

    const fn = this.functions[definition.id];
    if (!fn) {
      return {
        value: null,
        unit: definition.output,
        warnings: [`No registered oracle function for formula: ${definition.id}`],
        metadata: { ok: false, formulaId, error: 'oracle_function_not_found' },
      };
    }

    const parsed = numericInput(definition, testCase.input);
    if (!parsed.values) {
      return {
        value: null,
        unit: definition.output,
        warnings: [parsed.error ?? 'Invalid input'],
        metadata: { ok: false, formulaId, error: 'invalid_input' },
      };
    }

    const constraintWarnings = (definition.constraints ?? [])
      .map((constraint) => checkConstraint(parsed.values!, constraint))
      .filter((warning): warning is string => Boolean(warning));

    if (constraintWarnings.length > 0) {
      return {
        value: null,
        unit: definition.output,
        warnings: constraintWarnings,
        metadata: { ok: false, formulaId, error: 'constraint_failed' },
      };
    }

    try {
      return {
        value: fn(parsed.values),
        unit: definition.output,
        warnings: [],
        metadata: {
          ok: true,
          formulaId,
          expression: definition.expression,
          tolerance: definition.tolerance,
        },
      };
    } catch (error) {
      return {
        value: null,
        unit: definition.output,
        warnings: [error instanceof Error ? error.message : String(error)],
        metadata: { ok: false, formulaId, error: 'evaluation_error' },
      };
    }
  }
}
