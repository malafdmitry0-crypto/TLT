/**
 * @module wizard/object-wizard-form-model
 * @owner heat
 * @depends form instance, reference data, form-sync, section resize, mappers
 * @does-not dual-form layout, step JSX, cable algorithm panel
 *
 * Form ownership bag for ObjectWizard: form instance, watched values,
 * reference queries, sync handlers, and submit.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, type FormProps } from 'antd';

import type { ObjectType } from '@/constants/objectTypes';
import {
  applyObjectFormDefaults,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardUtils';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import { registerHeatCalcWizardRenderValues } from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFormSectionWeights } from '@/utils/heatCalcTableViewSettings';
import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import {
  climatePolicyBasisForObject,
  numericFormValue,
} from './objectWizardClimateModel';
import {
  buildCalculationFieldErrors,
  normalizeFieldErrorsForForm,
} from './objectWizardValidationModel';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
import { useObjectWizardFormSync, scrollToFirstError } from './useObjectWizardFormSync';
import { useObjectWizardReferenceData } from './useObjectWizardReferenceData';
import { useObjectWizardSectionResize } from './useObjectWizardSectionResize';

export type UseObjectWizardFormModelInput = {
  objectType: ObjectType;
  onSubmit: (params: Record<string, unknown>) => void;
  initialParams?: Record<string, unknown>;
  initialFormValues?: Record<string, unknown>;
  validationErrors?: ProjectObject['validation_errors'];
  fieldErrors?: Record<string, string>;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  layoutVariant?: ObjectWizardLayoutVariant;
  formSectionWeights?: HeatCalcFormSectionWeights;
  sectionResizeEnabled?: boolean;
  onFormSectionWeightsChange?: (weights: HeatCalcFormSectionWeights) => void;
  onFormSectionWeightsCommit?: (weights: HeatCalcFormSectionWeights) => void;
  onDraftValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
};

type ObjectWizardWatchedValues = Record<string, unknown>;

const OBJECT_WIZARD_WATCH_FIELDS = [
  'ambient_temperature',
  'climate_key',
  'climate_temperature_basis',
  'diameter_mm',
  'ground_type',
  'height_mm',
  'insulation_layer_count',
  'insulation_material',
  'insulation_thickness_mm',
  'length_mm',
  'outer_diameter_mm',
  'pipe_length',
  'placement',
  'process_temperature',
  'second_insulation_material',
  'shape',
  'third_insulation_material',
  'width_mm',
] as const;

function selectObjectWizardWatchedValues(values: ObjectWizardWatchedValues = {}) {
  return Object.fromEntries(
    OBJECT_WIZARD_WATCH_FIELDS.map((fieldName) => [fieldName, values[fieldName]]),
  ) as ObjectWizardWatchedValues;
}

export function useObjectWizardFormModel({
  objectType,
  onSubmit,
  initialParams,
  initialFormValues,
  validationErrors,
  fieldErrors,
  formSectionWeights,
  sectionResizeEnabled = false,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
  onDraftValuesChange,
}: UseObjectWizardFormModelInput) {
  const [form] = Form.useForm();
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const submitAttemptedRef = useRef(false);
  const heatCalcObjectType = objectType as HeatCalcObjectType;
  const { formGridRef } = useObjectWizardSectionResize({
    formSectionWeights,
    sectionResizeEnabled,
    onFormSectionWeightsChange,
    onFormSectionWeightsCommit,
  });
  const isEditMode = !!initialParams || !!initialFormValues;
  const initialValues = useMemo(() =>
    initialFormValues != null
      ? initialFormValues
      : initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined,
    [initialFormValues, initialParams, objectType],
  );
  const formInitialValues = useMemo(
    () => applyObjectFormDefaults(heatCalcObjectType, initialValues),
    [heatCalcObjectType, initialValues],
  );
  /*
   * Render-safe values for the rules helpers: until <Form> mounts the store is
   * empty (and a thrown-away render — Suspense retry, StrictMode — never hooks
   * it, which triggers rc-field-form's «useForm is not connected»). Pre-mount
   * the store would contain exactly formInitialValues, so serve those instead;
   * post-mount fall through to the live store as before.
   */
  const formMountedRef = useRef(false);
  useEffect(() => {
    formMountedRef.current = true;
  }, []);
  registerHeatCalcWizardRenderValues(form, () => (
    formMountedRef.current
      ? form.getFieldsValue(true)
      : (formInitialValues as Record<string, unknown>)
  ));
  const calculationFieldErrors = useMemo(
    () => ({
      ...buildCalculationFieldErrors(validationErrors, heatCalcObjectType),
      ...normalizeFieldErrorsForForm(fieldErrors, heatCalcObjectType),
    }),
    [fieldErrors, heatCalcObjectType, validationErrors],
  );
  const watchedValues = Form.useWatch(selectObjectWizardWatchedValues, form) as ObjectWizardWatchedValues | undefined;
  const watchedValue = (name: string, fallback?: unknown) => {
    if (watchedValues && Object.prototype.hasOwnProperty.call(watchedValues, name)) {
      return watchedValues[name];
    }
    return (formInitialValues as Record<string, unknown>)[name] ?? fallback;
  };
  const watchedString = (name: string, fallback = '') => {
    const value = watchedValue(name, fallback);
    return value == null ? fallback : String(value);
  };

  const insulationLayerCount = watchedString('insulation_layer_count');
  const insulationMaterial = watchedString('insulation_material');
  const placement = watchedString('placement');
  const selectedClimateKey = watchedString('climate_key');
  const selectedGroundType = watchedString('ground_type');
  const climateBasisValue = watchedString('climate_temperature_basis');
  const outerDiameterMm = numericFormValue(watchedValue('outer_diameter_mm'));
  const climateBasis = climatePolicyBasisForObject(objectType, outerDiameterMm, climateBasisValue);
  const secondInsulationMaterial = watchedString('second_insulation_material');
  const thirdInsulationMaterial = watchedString('third_insulation_material');
  const layerCount = Math.min(Math.max(Number(insulationLayerCount || '1') || 1, 1), 3);
  const isUnderground = placement === 'underground';
  const showWindField = placement === 'outdoor' || (objectType === 'tank' && isUnderground);
  const {
    insulationMaterials,
    insulationMaterialsError,
    isInsulationMaterialsFetching,
    insulationMaterialOptions,
    pipeMaterialOptions,
    climateOptions,
    isClimateFetching,
    selectedClimate,
    soilOptions,
    isSoilFetching,
    selectedSecondInsulation,
    selectedThirdInsulation,
    requestClimateReference,
    requestSoilReference,
  } = useObjectWizardReferenceData({
    selectedClimateKey,
    selectedGroundType,
    secondInsulationMaterial,
    thirdInsulationMaterial,
  });

  const { handleValuesChange, syncProgrammaticValuesChange } = useObjectWizardFormSync({
    form,
    objectType,
    heatCalcObjectType,
    formInitialValues: formInitialValues as Record<string, unknown>,
    calculationFieldErrors,
    watchedValues,
    climateBasis,
    selectedClimate,
    selectedGroundType,
    soilOptions,
    insulationMaterials,
    insulationMaterial,
    secondInsulationMaterial,
    thirdInsulationMaterial,
    layerCount,
    onDraftValuesChange,
  });

  async function handleFinish() {
    try {
      await form.validateFields();
      submitAttemptedRef.current = false;
      setShowValidationSummary(false);
      const vals = form.getFieldsValue(true);
      const params =
        objectType === 'pipe'
          ? pipeFormToApiParams(vals)
          : tankFormToApiParams(vals);
      onSubmit(params);
    } catch {
      submitAttemptedRef.current = true;
      setShowValidationSummary(true);
      scrollToFirstError();
    }
  }

  const handleFieldsChange: NonNullable<FormProps['onFieldsChange']> = (_changedFields, allFields) => {
    if (!submitAttemptedRef.current) return;
    const hasErrors = allFields.some((field) => (field.errors?.length ?? 0) > 0);
    setShowValidationSummary(hasErrors);
    if (!hasErrors) submitAttemptedRef.current = false;
  };

  return {
    form,
    heatCalcObjectType,
    formGridRef,
    isEditMode,
    formInitialValues,
    watchedValues,
    watchedValue,
    showWindField,
    layerCount,
    secondInsulationMaterial,
    thirdInsulationMaterial,
    insulationMaterials,
    insulationMaterialsError,
    isInsulationMaterialsFetching,
    insulationMaterialOptions,
    pipeMaterialOptions,
    climateOptions,
    isClimateFetching,
    soilOptions,
    isSoilFetching,
    selectedSecondInsulation,
    selectedThirdInsulation,
    requestClimateReference,
    requestSoilReference,
    showValidationSummary,
    handleFieldsChange,
    handleValuesChange,
    syncProgrammaticValuesChange,
    handleFinish,
  };
}
