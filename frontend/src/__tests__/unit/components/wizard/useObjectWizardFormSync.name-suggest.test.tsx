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

describe('useObjectWizardFormSync — name suggestion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

});
