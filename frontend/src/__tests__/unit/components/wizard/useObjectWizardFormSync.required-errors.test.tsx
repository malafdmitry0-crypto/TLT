/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
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

describe('useObjectWizardFormSync — required / calculation errors', () => {
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

    // Required re-sync replaces message with REQUIRED_FIELD_ERROR_MESSAGE ('').
    expect(getForm().getFieldError('pipe_length')).toEqual(['']);

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

});
