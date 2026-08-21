import { beforeEach, describe, expect, it } from 'vitest';
import {
  HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY,
  HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY,
  getDefaultCalculationDetailsSettings,
  isDefaultCalculationDetailsSettings,
  normalizeCalculationDetailsSettings,
  readGuestCalculationDetailsSettings,
  readRegisteredCalculationDetailsCache,
  setCalculationDetailsMetrics,
  setCalculationDetailsPreset,
  writeGuestCalculationDetailsSettings,
  writeRegisteredCalculationDetailsCache,
} from '@/utils/heatCalcCalculationDetailsSettings';

describe('heatCalcCalculationDetailsSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('возвращает стандартный пресет по умолчанию без записи в localStorage', () => {
    const settings = readGuestCalculationDetailsSettings();

    expect(settings.preset).toBe('standard');
    expect(settings.visibleMetrics).toEqual(expect.arrayContaining([
      'delta_t',
      'applied_alpha_vnesh',
      'applied_safety_factor',
      'insulation_resistance',
    ]));
    expect(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY)).toBeNull();
  });

  it('переключает пресет и сохраняет гостевые настройки', () => {
    const detailed = setCalculationDetailsPreset(getDefaultCalculationDetailsSettings(), 'detailed');
    writeGuestCalculationDetailsSettings(detailed);

    const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY) ?? '{}');
    expect(saved.preset).toBe('detailed');
    expect(saved.visibleMetrics).toContain('thermal_resistance');
    expect(readGuestCalculationDetailsSettings().visibleMetrics).toContain('ground_surface_area');
  });

  it('ручной набор метрик переводит настройки в пользовательский режим', () => {
    const settings = setCalculationDetailsMetrics(
      getDefaultCalculationDetailsSettings(),
      ['delta_t', 'applied_alpha_vnesh'],
    );

    expect(settings.preset).toBe('custom');
    expect(settings.visibleMetrics).toEqual(['delta_t', 'applied_alpha_vnesh']);
    expect(isDefaultCalculationDetailsSettings(settings)).toBe(false);
  });

  it('нормализует старые и повреждённые значения без неизвестных метрик', () => {
    const settings = normalizeCalculationDetailsSettings({
      preset: 'unknown',
      visibleMetrics: ['delta_t', 'bad_metric', 'delta_t'],
    });

    expect(settings.preset).toBe('custom');
    expect(settings.visibleMetrics).toEqual(['delta_t']);
  });

  it('читает только кеш текущего зарегистрированного пользователя', () => {
    writeRegisteredCalculationDetailsCache('user-1', setCalculationDetailsPreset(
      getDefaultCalculationDetailsSettings(),
      'brief',
    ));

    expect(readRegisteredCalculationDetailsCache('user-2')).toBeNull();
    expect(readRegisteredCalculationDetailsCache('user-1')?.preset).toBe('brief');
    expect(JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY) ?? '{}'))
      .toHaveProperty('userId', 'user-1');
  });
});
