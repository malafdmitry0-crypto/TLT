// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getHeatCalcFieldDescription } from '@/domain/heatCalcFields';

describe('tank additional heat loss description', () => {
  it('explains the included bottom and impact on design-specific loss', () => {
    expect(getHeatCalcFieldDescription('q_additional', { objectType: 'tank' })).toBe(
      'Дополнительные потери, не учтённые поверхностями резервуара ' +
      '(например, штуцера, опоры и фланцы). Прибавляются после коэффициента запаса ' +
      'и увеличивают итоговые и проектные удельные теплопотери. ' +
      'Днище уже учтено в площади резервуара.',
    );
  });
});
