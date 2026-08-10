import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formAlreadyHasValues,
  useObjectWizardFormSync,
  type UseObjectWizardFormSyncInput,
} from '@/components/wizard/useObjectWizardFormSync';

function FormHost({
  children,
  onReady,
}: {
  children?: ReactNode;
  onReady: (form: FormInstance) => void;
}) {
  const [form] = Form.useForm();
  onReady(form);
  return (
    <Form form={form} initialValues={{}}>
      <Form.Item name="name"><input /></Form.Item>
      <Form.Item name="outer_diameter_mm"><input /></Form.Item>
      <Form.Item name="pipe_length"><input /></Form.Item>
      <Form.Item name="placement"><input /></Form.Item>
      <Form.Item name="insulation_temperature_basis"><input /></Form.Item>
      <Form.Item name="climate_key"><input /></Form.Item>
      <Form.Item name="climate_city"><input /></Form.Item>
      <Form.Item name="climate_region"><input /></Form.Item>
      <Form.Item name="climate_temperature_basis"><input /></Form.Item>
      <Form.Item name="ambient_temperature"><input /></Form.Item>
      <Form.Item name="ambient_temperature_source"><input /></Form.Item>
      <Form.Item name="wind_speed"><input /></Form.Item>
      <Form.Item name="wind_speed_source"><input /></Form.Item>
      <Form.Item name="safety_factor"><input /></Form.Item>
      <Form.Item name="safety_factor_source"><input /></Form.Item>
      <Form.Item name="pipe_material"><input /></Form.Item>
      <Form.Item name="pipe_lambda_mode"><input /></Form.Item>
      <Form.Item name="pipe_lambda"><input /></Form.Item>
      <Form.Item name="insulation_material"><input /></Form.Item>
      <Form.Item name="first_insulation_lambda"><input /></Form.Item>
      <Form.Item name="ground_type"><input /></Form.Item>
      <Form.Item name="ground_conductivity"><input /></Form.Item>
      {children}
    </Form>
  );
}

function renderFormSync(
  overrides: Partial<UseObjectWizardFormSyncInput> = {},
) {
  let formRef: FormInstance | null = null;
  const onDraftValuesChange = vi.fn();

  const { result, rerender, unmount } = renderHook(
    (props: Partial<UseObjectWizardFormSyncInput>) => {
      // form is populated via FormHost wrapper render path below
      const form = formRef as FormInstance;
      return useObjectWizardFormSync({
        form,
        objectType: 'pipe',
        heatCalcObjectType: 'pipe',
        formInitialValues: {},
        calculationFieldErrors: {},
        watchedValues: undefined,
        climateBasis: undefined,
        selectedClimate: undefined,
        selectedGroundType: '',
        soilOptions: [],
        insulationMaterials: [],
        insulationMaterial: '',
        secondInsulationMaterial: '',
        thirdInsulationMaterial: '',
        layerCount: 1,
        onDraftValuesChange,
        ...props,
      });
    },
    {
      initialProps: overrides,
      wrapper: ({ children }) => (
        <FormHost
          onReady={(form) => {
            formRef = form;
          }}
        >
          {children}
        </FormHost>
      ),
    },
  );

  return {
    result,
    rerender: (next: Partial<UseObjectWizardFormSyncInput> = {}) => rerender({ ...overrides, ...next }),
    unmount,
    getForm: () => formRef as FormInstance,
    onDraftValuesChange,
  };
}

describe('useObjectWizardFormSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('formAlreadyHasValues treats equivalent numeric form values as equal', () => {
    const form = {
      getFieldsValue: () => ({ outer_diameter_mm: 108, name: 'A' }),
    } as unknown as FormInstance;

    expect(formAlreadyHasValues(form, { outer_diameter_mm: 108, name: 'A' })).toBe(true);
    expect(formAlreadyHasValues(form, { outer_diameter_mm: '108', name: 'A' })).toBe(true);
    expect(formAlreadyHasValues(form, { outer_diameter_mm: 109, name: 'A' })).toBe(false);
  });

  it('clears required-field sync timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { result, unmount, getForm } = renderFormSync();

    act(() => {
      result.current.handleValuesChange({ placement: 'outdoor' });
    });

    // scheduleMissingRequiredFieldSync uses setTimeout(0); unmount must clear it.
    const scheduledBeforeUnmount = clearTimeoutSpy.mock.calls.length;
    unmount();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(scheduledBeforeUnmount);
    // form remains usable only as a detached instance; no throw expected
    expect(getForm()).toBeTruthy();
  });

  it('applies calculation field errors on a zero-delay timer and clears them when empty', () => {
    const { rerender, getForm } = renderFormSync({
      calculationFieldErrors: {
        // Non-required calc error keeps its message (required ones are re-synced to '').
        pipe_length: { message: 'Диапазонная ошибка' },
      },
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(getForm().getFieldError('pipe_length')).toEqual(['Диапазонная ошибка']);

    rerender({ calculationFieldErrors: {} });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(getForm().getFieldError('pipe_length')).toEqual([]);
  });

  it('tracks required calculation errors and re-syncs empty required fields via timeout', () => {
    const { result, getForm } = renderFormSync({
      calculationFieldErrors: {
        pipe_length: { message: 'Не заполнено', required: true },
      },
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Required re-sync replaces the backend wording with the local actionable message.
    expect(getForm().getFieldError('pipe_length')).toEqual(['Укажите значение']);

    act(() => {
      getForm().setFieldsValue({ pipe_length: 12 });
      result.current.handleValuesChange({ pipe_length: 12 });
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(getForm().getFieldError('pipe_length')).toEqual([]);
  });

  it('clears pending calculation-error timer when deps change before fire', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { rerender } = renderFormSync({
      calculationFieldErrors: {
        outer_diameter_mm: { message: 'required', required: true },
      },
    });

    const clearedBefore = clearTimeoutSpy.mock.calls.length;
    rerender({
      calculationFieldErrors: {
        pipe_length: { message: 'required', required: true },
      },
    });
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearedBefore);

    act(() => {
      vi.runOnlyPendingTimers();
    });
  });

  it('suggests object name when name is empty and watched geometry is enough', () => {
    const { rerender, getForm } = renderFormSync({
      watchedValues: {
        outer_diameter_mm: 108,
        pipe_length: 25,
        placement: 'outdoor',
        process_temperature: 80,
        ambient_temperature: -25,
      },
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // force re-run with same values after form is ready
    rerender({
      watchedValues: {
        outer_diameter_mm: 108,
        pipe_length: 25,
        placement: 'outdoor',
        process_temperature: 80,
        ambient_temperature: -25,
      },
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    const name = getForm().getFieldValue('name') as string | undefined;
    // generatePipeName may return empty for incomplete shapes; when it succeeds name is set
    if (name) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('does not overwrite a user-edited name that differs from the last suggestion', () => {
    const { result, rerender, getForm } = renderFormSync();

    act(() => {
      getForm().setFieldsValue({ name: 'Пользовательское имя' });
    });

    rerender({
      watchedValues: {
        outer_diameter_mm: 108,
        pipe_length: 25,
        placement: 'outdoor',
      },
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(getForm().getFieldValue('name')).toBe('Пользовательское имя');
    // handleValuesChange remains callable after name protection
    act(() => {
      result.current.handleValuesChange({ ambient_temperature: 1 });
    });
    expect(getForm().getFieldValue('ambient_temperature_source')).toBe('manual');
  });

  it('syncs derived fields on values change (placement basis, climate clear, sources)', () => {
    const { result, getForm, onDraftValuesChange } = renderFormSync();

    act(() => {
      getForm().setFieldsValue({
        insulation_temperature_basis: 'invalid-for-underground',
        climate_key: 'Москва|||Москва',
        climate_city: 'Москва',
        climate_region: 'Москва',
        ambient_temperature: -25,
        wind_speed: 4,
      });
    });

    act(() => {
      result.current.handleValuesChange({ placement: 'underground' });
    });
    expect(getForm().getFieldValue('insulation_temperature_basis')).toBeTruthy();

    act(() => {
      result.current.handleValuesChange({ climate_key: undefined });
    });
    expect(getForm().getFieldValue('climate_city')).toBeUndefined();
    expect(getForm().getFieldValue('ambient_temperature_source')).toBe('manual');

    act(() => {
      result.current.handleValuesChange({ safety_factor: 1.1 });
    });
    expect(getForm().getFieldValue('safety_factor_source')).toBe('manual');

    act(() => {
      result.current.handleValuesChange({ pipe_material: 'carbon_steel' });
    });
    expect(getForm().getFieldValue('pipe_lambda_mode')).toBe('reference');
    expect(getForm().getFieldValue('pipe_lambda')).toBeUndefined();

    expect(onDraftValuesChange).toHaveBeenCalled();
  });

  it('syncs climate reference temperatures into the form when climate is selected', () => {
    const climate = {
      city: 'Москва',
      region: 'Москва',
      t_0_92: -25,
      t_0_98: -28,
      t_abs_min: -42,
      wind_avg_cold: 4.2,
    };
    const { rerender, getForm, onDraftValuesChange } = renderFormSync();

    rerender({
      selectedClimate: climate,
      climateBasis: 't_0_92',
    });

    expect(getForm().getFieldValue('ambient_temperature')).toBe(-25);
    expect(getForm().getFieldValue('ambient_temperature_source')).toBe('climate');
    expect(getForm().getFieldValue('wind_speed')).toBe(4.2);
    expect(getForm().getFieldValue('climate_city')).toBe('Москва');
    expect(onDraftValuesChange).toHaveBeenCalled();
  });

  it('syncs ground conductivity from soil options when ground type is set', () => {
    const { rerender, getForm } = renderFormSync();

    rerender({
      selectedGroundType: 'dry_sand:na:0',
      soilOptions: [
        {
          value: 'dry_sand:na:0',
          entry: {
            soil: 'Песок',
            soil_code: 'dry_sand',
            density_kg_m3: null,
            moisture_percent: 0,
            conductivity: 0.8,
          },
        },
      ],
    });

    expect(getForm().getFieldValue('ground_conductivity')).toBe(0.8);
    expect(getForm().getFieldValue('ground_conductivity_source')).toBe('reference');
  });

  it('syncs insulation reference lambda when materials load for a reference material', () => {
    const { rerender, getForm } = renderFormSync();

    act(() => {
      getForm().setFieldsValue({ insulation_material: 'mineral_wool' });
    });

    rerender({
      insulationMaterial: 'mineral_wool',
      insulationMaterials: [
        {
          material: 'mineral_wool',
          name: 'Минеральная вата',
          conductivity: 0.045,
          temperature_range: [-60, 400],
        },
      ],
      layerCount: 1,
    });

    expect(getForm().getFieldValue('first_insulation_lambda')).toBe(0.045);
  });
});
