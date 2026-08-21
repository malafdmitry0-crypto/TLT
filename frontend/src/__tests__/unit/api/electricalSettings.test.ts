import { describe, expect, it } from 'vitest';

import {
  isElectricalSettingsVersionConflict,
  parseIdopAmps,
} from '@/api/electricalSettings';

describe('electricalSettings helpers', () => {
  it('parseIdopAmps accepts positive numbers and decimal strings', () => {
    expect(parseIdopAmps(13)).toBe(13);
    expect(parseIdopAmps('13.065')).toBe(13.065);
    expect(parseIdopAmps(null)).toBeNull();
    expect(parseIdopAmps(undefined)).toBeNull();
    expect(parseIdopAmps(0)).toBeNull();
    expect(parseIdopAmps(-1)).toBeNull();
    expect(parseIdopAmps('')).toBeNull();
    expect(parseIdopAmps('x')).toBeNull();
  });

  it('detects electrical settings version conflict', () => {
    expect(isElectricalSettingsVersionConflict({
      status: 409,
      code: 'ELECTRICAL_SETTINGS_VERSION_CONFLICT',
    })).toBe(true);
    expect(isElectricalSettingsVersionConflict({
      status: 409,
      code: 'OTHER',
    })).toBe(false);
    expect(isElectricalSettingsVersionConflict(new Error('x'))).toBe(false);
  });
});
