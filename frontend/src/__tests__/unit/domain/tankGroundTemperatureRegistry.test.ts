// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFormFieldIds,
} from '@/domain/heatCalcFields';

describe('tank ground temperature registry', () => {
  it('registers ground temperature as one editable form field', () => {
    const tankFieldIds = getHeatCalcFormFieldIds('tank');

    expect(tankFieldIds.filter((fieldId) => fieldId === 'ground_temperature')).toHaveLength(1);
    expect(getHeatCalcFieldInputConfig('ground_temperature', 'tank')).toMatchObject({
      type: 'number',
      unit: '°C',
      min: -70,
      max: 70,
    });
  });
});
