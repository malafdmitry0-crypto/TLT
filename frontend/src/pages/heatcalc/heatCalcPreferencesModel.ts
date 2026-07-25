/**
 * Pure HeatCalc preference helpers (P-BAND-01).
 * Keeps guest/registered resolve, change detection, and hydrate plans out of
 * the React owner hook.
 */
import {
  getDefaultTableColumnSettings,
  normalizeTableColumnSettings,
  readGuestTableColumnSettings,
  readRegisteredTableColumnCache,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  areFormSectionWeightsEqual,
  getDefaultTableViewSettings,
  isDefaultTableViewSettings,
  normalizeTableViewSettings,
  readGuestTableViewSettings,
  readRegisteredTableViewCache,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  getDefaultCalculationDetailsSettings,
  isDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  readGuestCalculationDetailsSettings,
  readRegisteredCalculationDetailsCache,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';

export type PreferenceUserContext = {
  isRegisteredUser: boolean;
  registeredUserId: string | null;
};

export type PreferenceValueEnvelope<T> = {
  value: T | null | undefined;
  user_id?: string | null;
};

export type PreferenceHydrationPlan<T> =
  | { kind: 'apply'; settings: T; cacheUserId: string | null | undefined }
  | { kind: 'reset-default'; clearUserId: string | null | undefined };

export type GuestSettingsWriteAction<T> =
  | { kind: 'noop' }
  | { kind: 'clear' }
  | { kind: 'write'; settings: T };

export function resolveInitialTableColumnSettings({
  isRegisteredUser,
  registeredUserId,
}: PreferenceUserContext): HeatCalcTableColumnSettings {
  if (isRegisteredUser) {
    return readRegisteredTableColumnCache(registeredUserId) ?? getDefaultTableColumnSettings();
  }
  return readGuestTableColumnSettings();
}

export function resolveInitialTableViewSettings({
  isRegisteredUser,
  registeredUserId,
}: PreferenceUserContext): HeatCalcTableViewSettings {
  if (isRegisteredUser) {
    return readRegisteredTableViewCache(registeredUserId) ?? getDefaultTableViewSettings();
  }
  return readGuestTableViewSettings();
}

export function resolveInitialCalculationDetailsSettings({
  isRegisteredUser,
  registeredUserId,
}: PreferenceUserContext): HeatCalcCalculationDetailsSettings {
  if (isRegisteredUser) {
    return readRegisteredCalculationDetailsCache(registeredUserId)
      ?? getDefaultCalculationDetailsSettings();
  }
  return readGuestCalculationDetailsSettings();
}

export function hasTableViewSettingsChanged(
  next: HeatCalcTableViewSettings,
  current: HeatCalcTableViewSettings,
): boolean {
  const normalizedNext = normalizeTableViewSettings(next);
  const normalizedCurrent = normalizeTableViewSettings(current);
  return normalizedNext.fontSize !== normalizedCurrent.fontSize
    || normalizedNext.tableLabelFormat !== normalizedCurrent.tableLabelFormat
    || normalizedNext.settingsLabelFormat !== normalizedCurrent.settingsLabelFormat
    || normalizedNext.formPlacement !== normalizedCurrent.formPlacement
    || normalizedNext.sideFormWidthPct !== normalizedCurrent.sideFormWidthPct
    || !areFormSectionWeightsEqual(
      normalizedNext.formSectionWeights,
      normalizedCurrent.formSectionWeights,
    );
}

export function hasCalculationDetailsSettingsChanged(
  next: HeatCalcCalculationDetailsSettings,
  current: HeatCalcCalculationDetailsSettings,
): boolean {
  const normalizedNext = normalizeCalculationDetailsSettings(next);
  const normalizedCurrent = normalizeCalculationDetailsSettings(current);
  return normalizedNext.preset !== normalizedCurrent.preset
    || normalizedNext.visibleMetrics.length !== normalizedCurrent.visibleMetrics.length
    || normalizedNext.visibleMetrics.some(
      (metric) => !normalizedCurrent.visibleMetrics.includes(metric),
    );
}

export function planPreferenceHydration<T>(
  isRegisteredUser: boolean,
  preference: PreferenceValueEnvelope<T> | null | undefined,
  registeredUserId: string | null,
  normalize: (value: T) => T,
): PreferenceHydrationPlan<T> | null {
  if (!isRegisteredUser || !preference) return null;
  if (preference.value) {
    return {
      kind: 'apply',
      settings: normalize(preference.value),
      cacheUserId: preference.user_id,
    };
  }
  return {
    kind: 'reset-default',
    clearUserId: registeredUserId ?? preference.user_id,
  };
}

export function planGuestTableViewWrite(
  viewChanged: boolean,
  normalizedView: HeatCalcTableViewSettings,
): GuestSettingsWriteAction<HeatCalcTableViewSettings> {
  if (!viewChanged) return { kind: 'noop' };
  if (isDefaultTableViewSettings(normalizedView)) return { kind: 'clear' };
  return { kind: 'write', settings: normalizedView };
}

export function planGuestCalculationDetailsWrite(
  detailsChanged: boolean,
  normalizedDetails: HeatCalcCalculationDetailsSettings,
): GuestSettingsWriteAction<HeatCalcCalculationDetailsSettings> {
  if (!detailsChanged) return { kind: 'noop' };
  if (isDefaultCalculationDetailsSettings(normalizedDetails)) return { kind: 'clear' };
  return { kind: 'write', settings: normalizedDetails };
}

export function normalizePreferenceBundle(
  columnSettings: HeatCalcTableColumnSettings,
  viewSettings: HeatCalcTableViewSettings,
  calculationDetails: HeatCalcCalculationDetailsSettings,
) {
  return {
    columns: normalizeTableColumnSettings(columnSettings),
    view: normalizeTableViewSettings(viewSettings),
    details: normalizeCalculationDetailsSettings(calculationDetails),
  };
}
