import { describe, expect, it } from 'vitest';

import { MockLlmClient } from '../src/llm/MockLlmClient';
import {
  evaluateTltHeatLossCases,
  fixtureTltHeatLossCases,
  LlmTltHeatLossCaseGenerator,
  LocalTltHeatLossRunner,
  sanitizeTltHeatLossCases,
} from '../src/domain/TltHeatLossDomainCases';

describe('TLT heat-loss domain cases', () => {
  it('sanitizes realistic LLM pipe and tank cases to backend-compatible params', () => {
    const result = sanitizeTltHeatLossCases(
      {
        cases: [
          {
            id: 'pipe-ai',
            object_type: 'pipe',
            scenario: 'AI generated pipe',
            risk_tags: ['pipe', 'boundary'],
            params: {
              outer_diameter: '0,108',
              pipe_length: 25,
              ambient_temperature: -20,
              process_temperature: 80,
              insulation_thickness: 0.05,
              insulation_material: 'mineral_wool_boards_120',
              insulation_temperature_basis: 'outdoor_winter',
              wall_thickness: 0.004,
              pipe_material: 'carbon_steel',
            },
          },
          {
            id: 'tank-ai',
            object_type: 'tank',
            params: {
              shape: 'rectangular',
              length: 4,
              width: 2,
              height: 3,
              ambient_temperature: -15,
              process_temperature: 55,
              insulation_thickness: 0.06,
              insulation_material: 'polyurethane_products_50',
              insulation_temperature_basis: 'outdoor_winter',
            },
          },
        ],
      },
      { source: 'llm' },
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0]).toMatchObject({
      id: 'pipe-ai',
      objectType: 'pipe',
      source: 'llm',
    });
    expect(result.accepted[0].params.outer_diameter).toBe(0.108);
    expect(result.accepted[1].params.shape).toBe('rectangular');
  });

  it('rejects malformed cases instead of sending them to formula runners', () => {
    const result = sanitizeTltHeatLossCases({
      cases: [
        { id: 'bad-type', object_type: 'pump', params: {} },
        { id: 'bad-params', object_type: 'pipe', params: null },
      ],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((item) => item.id)).toEqual(['bad-type', 'bad-params']);
  });

  it('uses LLM only for scenario generation and returns raw cases for deterministic validation', async () => {
    const llm = new MockLlmClient({
      cases: [
        {
          id: 'llm-pipe',
          object_type: 'pipe',
          params: {
            outer_diameter: 0.108,
            pipe_length: 10,
            ambient_temperature: -20,
            process_temperature: 70,
            insulation_thickness: 0.05,
            insulation_material: 'mineral_wool_boards_120',
            insulation_temperature_basis: 'outdoor_winter',
          },
        },
      ],
    });

    const raw = await new LlmTltHeatLossCaseGenerator(llm).generate({
      pipeCases: 1,
      tankCases: 0,
      documentation: '# Contract',
    });
    const sanitized = sanitizeTltHeatLossCases(raw, { source: 'llm' });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].system).toContain('Do not calculate final numeric truth');
    expect(sanitized.accepted[0].id).toBe('llm-pipe');
  });

  it('evaluates fixture cases with local runner and metamorphic invariants', async () => {
    const sanitized = sanitizeTltHeatLossCases(fixtureTltHeatLossCases(2), { source: 'fixture' });
    const results = await evaluateTltHeatLossCases(sanitized.accepted, new LocalTltHeatLossRunner());

    expect(results.length).toBeGreaterThan(sanitized.accepted.length);
    expect(results.every((result) => result.finalVerdict === 'pass')).toBe(true);
  });
});
