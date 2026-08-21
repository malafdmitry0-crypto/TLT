type FeatureFlagEnv = Record<string, string | boolean | undefined>;

export interface AppFeatureFlags {
  commercialFeatures: boolean;
}

export function parseBooleanFeatureFlag(value: string | boolean | undefined, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value.trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function getFeatureFlags(env: FeatureFlagEnv = import.meta.env): AppFeatureFlags {
  return {
    commercialFeatures: parseBooleanFeatureFlag(env.VITE_COMMERCIAL_FEATURES_ENABLED, false),
  };
}

export function areCommercialFeaturesEnabled() {
  return getFeatureFlags().commercialFeatures;
}
