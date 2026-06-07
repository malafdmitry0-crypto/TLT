export function e2eCommercialFeaturesEnabled(): boolean {
  const value = process.env.E2E_COMMERCIAL_FEATURES_ENABLED ?? process.env.VITE_COMMERCIAL_FEATURES_ENABLED;
  return value != null && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const COMMERCIAL_FEATURE_SKIP_REASON =
  'commercial/advanced UI is temporarily disabled; run with E2E_COMMERCIAL_FEATURES_ENABLED=1 when the feature flag is enabled';
