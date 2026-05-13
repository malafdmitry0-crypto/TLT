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

  it('сохраняет пользовательский шаг и сбрасывает его к дефолту поля', () => {
    const customized = setHeatCalcFieldStep(
      getDefaultFieldInputSettings(),
      'pipe',
      'outer_diameter_mm',
      10,
    );

    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', customized)).toBe(10);
    expect(isDefaultFieldInputSettings(customized)).toBe(false);

    const reset = resetHeatCalcFieldStep(customized, 'pipe', 'outer_diameter_mm');
    expect(resolveHeatCalcFieldStep('pipe', 'outer_diameter_mm', reset)).toBe(1);
    expect(isDefaultFieldInputSettings(reset)).toBe(true);
  });

  it('нормализует только положительные шаги известных числовых полей', () => {
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
      version: 1,
      fields: {
        pipe: {
          outer_diameter_mm: { step: 2.5 },
        },
      },
    });
  });

  it('пишет гостевые настройки и читает кеш только текущего пользователя', () => {
    const settings = setHeatCalcFieldStep(
      getDefaultFieldInputSettings(),
      'tank',
      'diameter_mm',
      25,
    );

    writeGuestFieldInputSettings(settings);
    expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY) ?? '{}'))
      .toMatchObject({ fields: { tank: { diameter_mm: { step: 25 } } } });
    expect(readGuestFieldInputSettings().fields.tank?.diameter_mm?.step).toBe(25);

    writeRegisteredFieldInputCache('user-1', settings);
    expect(readRegisteredFieldInputCache('user-2')).toBeNull();
    expect(readRegisteredFieldInputCache('user-1')?.fields.tank?.diameter_mm?.step).toBe(25);
    expect(JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY) ?? '{}'))
      .toHaveProperty('userId', 'user-1');
  });

  it('возвращает список настраиваемых шагов только для числовых полей', () => {
    const items = getHeatCalcFieldStepSettingItems('pipe', getDefaultFieldInputSettings());

    expect(items.map((item) => item.fieldId)).toContain('outer_diameter_mm');
    expect(items.map((item) => item.fieldId)).not.toContain('name');
    expect(items.find((item) => item.fieldId === 'outer_diameter_mm')).toMatchObject({
      label: 'Наружный диаметр',
      defaultStep: 1,
      step: 1,
      overridden: false,
    });
  });
});
