import { beforeEach, describe, expect, it } from 'vitest';
import {
  HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY,
  HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
  getDefaultFieldInputSettings,
  getHeatCalcFieldStepSettingItems,
  isDefaultFieldInputSettings,
  normalizeFieldInputSettings,
  readGuestFieldInputSettings,
  readRegisteredFieldInputCache,
  resolveHeatCalcFieldStep,
  resetHeatCalcFieldStep,
  setHeatCalcFieldStep,
  writeGuestFieldInputSettings,
  writeRegisteredFieldInputCache,
} from '@/utils/heatCalcFieldInputSettings';
import { heatCalcNumberInputProps } from '@/utils/heatCalcWizardFieldRules';

describe('heatCalcFieldInputSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('берёт дефолтный шаг из описания поля без записи в localStorage', () => {
    const settings = readGuestFieldInputSettings();

    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', settings)).toBe(1);
    expect(heatCalcNumberInputProps('pipe', 'outer_diameter_mm', { fieldInputSettings: settings }))
      .toMatchObject({ min: 10.8, max: 3000, step: 1 });
    expect(localStorage.getItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY)).toBeNull();
  });

  it('не сохраняет пользовательский шаг и оставляет дефолт поля', () => {
    const customized = setHeatCalcFieldStep(
      getDefaultFieldInputSettings(),
      'pipe',
      'outer_diameter_mm',
      10,
    );

    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', customized)).toBe(1);
    expect(isDefaultFieldInputSettings(customized)).toBe(true);

    const reset = resetHeatCalcFieldStep(customized, 'pipe', 'outer_diameter_mm');
    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', reset)).toBe(1);
    expect(isDefaultFieldInputSettings(reset)).toBe(true);
  });

  it('игнорирует legacy-настройки пользовательских шагов', () => {
    const settings = normalizeFieldInputSettings({
      version: 99,
      fields: {
        pipe: {
          outer_diameter_mm: { step: '2.5' },
          name: { step: 10 },
          unknown: { step: 10 },
          pipe_length: { step: -1 },
        },
      },
    });

    expect(settings).toEqual({
      version: 2,
      fields: {},
    });
    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', settings)).toBe(1);
    expect(isDefaultFieldInputSettings(settings)).toBe(true);
  });

  it('пишет пустые настройки и читает legacy-кеш как дефолт только для текущего пользователя', () => {
    const settings = getDefaultFieldInputSettings();

    writeGuestFieldInputSettings(settings);
    expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY) ?? '{}'))
      .toEqual({ version: 2, fields: {} });
    localStorage.setItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      fields: { tank: { diameter_mm: { step: 25 } } },
    }));
    expect(readGuestFieldInputSettings()).toEqual(getDefaultFieldInputSettings());

    localStorage.setItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY, JSON.stringify({
      userId: 'user-1',
      settings: {
        version: 1,
        fields: { tank: { diameter_mm: { step: 25 } } },
      },
      cachedAt: '2026-05-08T00:00:00.000Z',
    }));
    expect(readRegisteredFieldInputCache('user-2')).toBeNull();
    expect(readRegisteredFieldInputCache('user-1')).toEqual(getDefaultFieldInputSettings());

    localStorage.clear();
    writeRegisteredFieldInputCache('user-1', settings);
    expect(JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY) ?? '{}'))
      .toMatchObject({ userId: 'user-1', settings: { version: 2, fields: {} } });
  });

  it('не возвращает список настраиваемых шагов', () => {
    const items = getHeatCalcFieldStepSettingItems('pipe', getDefaultFieldInputSettings());

    expect(items).toEqual([]);
  });
});
