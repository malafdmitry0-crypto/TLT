import { describe, expect, it } from 'vitest';

import {
  getFeatureFlags,
  parseBooleanFeatureFlag,
} from '@/config/featureFlags';

describe('featureFlags', () => {
  it('keeps commercial features disabled by default', () => {
    expect(getFeatureFlags({}).commercialFeatures).toBe(false);
    expect(parseBooleanFeatureFlag(undefined)).toBe(false);
  });

  it('accepts explicit truthy env values', () => {
    expect(getFeatureFlags({ VITE_COMMERCIAL_FEATURES_ENABLED: 'true' }).commercialFeatures).toBe(true);
    expect(parseBooleanFeatureFlag('1')).toBe(true);
    expect(parseBooleanFeatureFlag('on')).toBe(true);
  });

  it('treats falsey env values as disabled', () => {
    expect(getFeatureFlags({ VITE_COMMERCIAL_FEATURES_ENABLED: 'false' }).commercialFeatures).toBe(false);
    expect(parseBooleanFeatureFlag('0')).toBe(false);
    expect(parseBooleanFeatureFlag('off')).toBe(false);
  });
});
