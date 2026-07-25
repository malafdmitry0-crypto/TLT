/**
 * @module wizard/object-wizard-form-sync
 * @owner heat
 * @depends form instance (caller-owned), climate/insulation models, field rules
 * @does-not form ownership, reference queries, InsulationLayersTable, dual-form layout
 *
 * WIZ2: required-field / name / form synchronization effects for ObjectWizard.
 * Timer and effect cleanup must stay byte-compatible with prior characterization.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { FormInstance } from 'antd';

import type { ObjectType } from '@/constants/objectTypes';
import type { HeatCalcObjectType } from '@/types/project';
import type { ClimateEntry, InsulationEntry, SoilConductivityEntry } from '@/types/reference';
import {
  generatePipeName,
  generateTankName,
  type PipeNameFields,
  type TankNameFields,
} from '@/utils/objectWizardUtils';
import {
  defaultInsulationTemperatureBasisForPlacement,
  isInsulationTemperatureBasisAllowedForPlacement,
  isHeatCalcFieldRequired,
  isHeatCalcFieldVisible,
} from '@/domain/heatCalcFieldRules';
import {
  climateTemperature,
  climateWind,
  type ClimateBasis,
} from './objectWizardClimateModel';
import {
  expandedChangedFieldNames,
  INSULATION_LAYER_FORM_FIELDS,
  insulationReferenceFieldValues,
  isReferenceInsulationMaterial,
} from './objectWizardInsulationModel';
import {
  isEmptyFormValue,
  REQUIRED_FIELD_ERROR_MESSAGE,
  type CalculationFieldError,
} from './objectWizardValidationModel';

export type ObjectWizardSoilOption = {
  value: string;
  entry?: SoilConductivityEntry;
};

export type UseObjectWizardFormSyncInput = {
  form: FormInstance;
  objectType: ObjectType;
  heatCalcObjectType: HeatCalcObjectType;
  formInitialValues: Record<string, unknown>;
  calculationFieldErrors: Record<string, CalculationFieldError>;
  watchedValues: Record<string, unknown> | undefined;
  climateBasis: ClimateBasis | null | undefined;
  selectedClimate: ClimateEntry | undefined;
  selectedGroundType: string;
  soilOptions: ObjectWizardSoilOption[];
  insulationMaterials: InsulationEntry[];
  insulationMaterial: string;
  secondInsulationMaterial: string;
  thirdInsulationMaterial: string;
  layerCount: number;
  onDraftValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
};

function equivalentFormValue(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return true;
    return Math.abs(leftNumber - rightNumber) < 1e-9;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function formAlreadyHasValues(form: FormInstance, values: Record<string, unknown>) {
  const current = form.getFieldsValue(true) as Record<string, unknown>;
  return Object.entries(values).every(([key, value]) => equivalentFormValue(current[key], value));
}

export function scrollToFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('.inline-object-form .ant-form-item-has-error');
    if (el) {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>(
        'input, select, textarea, .tlt-select__trigger, .reference-picker-control',
      )?.focus();
    }
  }, 0);
}

export function useObjectWizardFormSync({
  form,
  objectType,
  heatCalcObjectType,
  formInitialValues,
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
}: UseObjectWizardFormSyncInput) {
  const calculationFieldErrorNamesRef = useRef<string[]>([]);
  const localRequiredFieldErrorNamesRef = useRef<string[]>([]);
  const requiredFieldSyncTimerRef = useRef<number | null>(null);
  const prevSuggestedRef = useRef<string>('');

  useEffect(() => () => {
    if (requiredFieldSyncTimerRef.current != null) {
      window.clearTimeout(requiredFieldSyncTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!formAlreadyHasValues(form, formInitialValues)) {
      form.resetFields();
      form.setFieldsValue(formInitialValues);
    }
    localRequiredFieldErrorNamesRef.current = [];
  }, [form, formInitialValues]);

  const syncMissingRequiredFieldErrors = useCallback(() => {
    const trackedFieldNames = localRequiredFieldErrorNamesRef.current;
    if (trackedFieldNames.length === 0) return;
    const values = form.getFieldsValue(true) as Record<string, unknown>;
    const context = { objectType: heatCalcObjectType, values };
    const nextFieldNames = trackedFieldNames.filter((fieldName) => (
      isHeatCalcFieldVisible(fieldName, context)
        && isHeatCalcFieldRequired(fieldName, context)
        && isEmptyFormValue(values[fieldName])
    ));
    const fieldNamesToClear = trackedFieldNames.filter((fieldName) => !nextFieldNames.includes(fieldName));
    // Clear Ant warningOnly results when forcing the error highlight so CSS
    // `.ant-form-item-has-error` (not warning) remains the required signal.
    const fieldUpdates = [
      ...fieldNamesToClear.map((fieldName) => ({
        name: fieldName,
        errors: [] as string[],
        warnings: [] as string[],
      })),
      ...nextFieldNames.map((fieldName) => ({
        name: fieldName,
        errors: [REQUIRED_FIELD_ERROR_MESSAGE],
        warnings: [] as string[],
      })),
    ];
    if (fieldUpdates.length > 0) form.setFields(fieldUpdates);
  }, [form, heatCalcObjectType]);

  const scheduleMissingRequiredFieldSync = useCallback(() => {
    if (requiredFieldSyncTimerRef.current != null) {
      window.clearTimeout(requiredFieldSyncTimerRef.current);
    }
    // Ant InputNumber + async Form validators can overwrite setFields(errors)
    // with warningOnly required-rule results. Re-apply after validators settle.
    requiredFieldSyncTimerRef.current = window.setTimeout(() => {
      syncMissingRequiredFieldErrors();
      requiredFieldSyncTimerRef.current = window.setTimeout(() => {
        requiredFieldSyncTimerRef.current = null;
        syncMissingRequiredFieldErrors();
      }, 0);
    }, 0);
  }, [syncMissingRequiredFieldErrors]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const previousFieldNames = calculationFieldErrorNamesRef.current;
      if (previousFieldNames.length > 0) {
        form.setFields(previousFieldNames.map((fieldName) => ({ name: fieldName, errors: [] })));
      }

      const nextFieldEntries = Object.entries(calculationFieldErrors);
      const nextFieldNames = nextFieldEntries.map(([fieldName]) => fieldName);
      const nextRequiredFieldNames = nextFieldEntries
        .filter(([, error]) => error.required)
        .map(([fieldName]) => fieldName);
      const staleLocalFieldNames = localRequiredFieldErrorNamesRef.current.filter((fieldName) => (
        !nextRequiredFieldNames.includes(fieldName)
        && !nextFieldNames.includes(fieldName)
      ));
      if (staleLocalFieldNames.length > 0) {
        form.setFields(staleLocalFieldNames.map((fieldName) => ({ name: fieldName, errors: [] })));
      }
      if (nextFieldEntries.length > 0) {
        form.setFields(nextFieldEntries.map(([fieldName, error]) => ({
          name: fieldName,
          errors: [error.message],
        })));
        calculationFieldErrorNamesRef.current = nextFieldNames;
        localRequiredFieldErrorNamesRef.current = nextRequiredFieldNames;
        scheduleMissingRequiredFieldSync();
        scrollToFirstError();
      } else {
        calculationFieldErrorNamesRef.current = [];
        localRequiredFieldErrorNamesRef.current = [];
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calculationFieldErrors, form, scheduleMissingRequiredFieldSync]);

  useEffect(() => {
    if (!selectedClimate) return;
    const tAmbient = climateBasis ? climateTemperature(selectedClimate, climateBasis) : null;
    const wind = climateWind(selectedClimate);
    const nextValues = {
      climate_city: selectedClimate.city ?? selectedClimate.region,
      climate_region: selectedClimate.region,
      climate_temperature_basis: climateBasis,
      ...(tAmbient != null
        ? {
            ambient_temperature: tAmbient,
            ambient_temperature_source: 'climate',
          }
        : {}),
      ...(wind != null
        ? {
            wind_speed: wind,
            wind_speed_source: 'climate',
          }
        : {}),
    };
    form.setFieldsValue(nextValues);
    onDraftValuesChange?.(nextValues, form.getFieldsValue(true) as Record<string, unknown>);
  }, [climateBasis, form, onDraftValuesChange, selectedClimate]);

  useEffect(() => {
    if (!selectedGroundType) return;
    const selectedSoil = soilOptions.find((option) => option.value === selectedGroundType)?.entry;
    if (!selectedSoil) return;
    const nextValues = { ground_conductivity: selectedSoil.conductivity };
    form.setFieldsValue(nextValues);
    onDraftValuesChange?.(nextValues, form.getFieldsValue(true) as Record<string, unknown>);
  }, [form, onDraftValuesChange, selectedGroundType, soilOptions]);

  useEffect(() => {
    if (insulationMaterials.length === 0) return;
    const nextValues: Record<string, unknown> = {};
    INSULATION_LAYER_FORM_FIELDS.forEach((layer, index) => {
      if (index + 1 > layerCount) return;
      const material = form.getFieldValue(layer.material);
      if (!isReferenceInsulationMaterial(material)) return;
      Object.assign(nextValues, insulationReferenceFieldValues(layer, insulationMaterials, material));
    });
    if (Object.keys(nextValues).length === 0 || formAlreadyHasValues(form, nextValues)) return;
    form.setFieldsValue(nextValues);
  }, [
    form,
    insulationMaterial,
    insulationMaterials,
    layerCount,
    secondInsulationMaterial,
    thirdInsulationMaterial,
  ]);

  useEffect(() => {
    if (!watchedValues) return;
    try {
      // watchedValues is a form watch bag; name generators only read their declared fields.
      const nameFields = watchedValues as PipeNameFields & TankNameFields;
      const suggestedName =
        objectType === 'pipe'
          ? generatePipeName(nameFields)
          : generateTankName(nameFields);
      if (!suggestedName) return;
      const current = form.getFieldValue('name') as string | undefined;
      if (!current || current === prevSuggestedRef.current) {
        prevSuggestedRef.current = suggestedName;
        form.setFieldsValue({ name: suggestedName });
      }
    } catch {
      // Пока форма заполнена частично, автонаименование может быть недоступно.
    }
  }, [form, objectType, watchedValues]);

  function clearCalculationFieldErrors(changedFieldNames?: string[]) {
    const currentFieldNames = calculationFieldErrorNamesRef.current;
    if (currentFieldNames.length === 0) return;
    const expandedChangedNames = changedFieldNames ? expandedChangedFieldNames(changedFieldNames) : undefined;
    const resetAll = !expandedChangedNames
      || expandedChangedNames.some((fieldName) => (
        fieldName === 'insulation_layer_count'
        || fieldName === 'placement'
        || fieldName === 'shape'
        || fieldName === 'pipe_lambda_mode'
      ));
    const namesToClear = resetAll
      ? currentFieldNames
      : currentFieldNames.filter((fieldName) => expandedChangedNames.includes(fieldName));
    if (namesToClear.length === 0) return;
    form.setFields(namesToClear.map((fieldName) => ({ name: fieldName, errors: [] })));
    calculationFieldErrorNamesRef.current = resetAll
      ? []
      : currentFieldNames.filter((fieldName) => !namesToClear.includes(fieldName));
  }

  function collectInsulationLayerSyncValues(changed: Record<string, unknown>) {
    const nextValues: Record<string, unknown> = {};
    INSULATION_LAYER_FORM_FIELDS.forEach((layer) => {
      if (Object.prototype.hasOwnProperty.call(changed, layer.material)) {
        const material = changed[layer.material];
        if (isReferenceInsulationMaterial(material)) {
          Object.assign(nextValues, insulationReferenceFieldValues(layer, insulationMaterials, material));
        }
      }

      const manualFieldChanged = [layer.lambda, layer.min, layer.max].some((fieldName) => (
        Object.prototype.hasOwnProperty.call(changed, fieldName)
      ));
      if (manualFieldChanged) {
        const material = Object.prototype.hasOwnProperty.call(changed, layer.material)
          ? changed[layer.material]
          : form.getFieldValue(layer.material);
        if (material !== 'other') {
          nextValues[layer.material] = 'other';
        }
      }
    });
    return nextValues;
  }

  function syncProgrammaticValuesChange(changed: Record<string, unknown>) {
    const syncedChanges: Record<string, unknown> = { ...changed };
    const layerSyncValues = collectInsulationLayerSyncValues(changed);
    if (Object.keys(layerSyncValues).length > 0) {
      form.setFieldsValue(layerSyncValues);
      Object.assign(syncedChanges, layerSyncValues);
    }
    clearCalculationFieldErrors(Object.keys(syncedChanges));
    scheduleMissingRequiredFieldSync();
    onDraftValuesChange?.(syncedChanges, form.getFieldsValue(true) as Record<string, unknown>);
  }

  function handleValuesChange(changed: Record<string, unknown>) {
    const syncedChanges: Record<string, unknown> = { ...changed };
    if (Object.prototype.hasOwnProperty.call(changed, 'safety_factor')) {
      const nextSource = { safety_factor_source: 'manual' as const };
      form.setFieldsValue(nextSource);
      Object.assign(syncedChanges, nextSource);
    }
    function setSyncedFields(values: Record<string, unknown>) {
      form.setFieldsValue(values);
      Object.assign(syncedChanges, values);
    }

    clearCalculationFieldErrors(Object.keys(changed));
    if (Object.prototype.hasOwnProperty.call(changed, 'placement')) {
      const currentBasis = form.getFieldValue('insulation_temperature_basis');
      if (
        !currentBasis
        || !isInsulationTemperatureBasisAllowedForPlacement(currentBasis, changed.placement)
      ) {
        setSyncedFields({
          insulation_temperature_basis: defaultInsulationTemperatureBasisForPlacement(
            changed.placement,
          ),
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'climate_key') && !changed.climate_key) {
      setSyncedFields({
        climate_city: undefined,
        climate_region: undefined,
        climate_temperature_basis: undefined,
        ambient_temperature_source: form.getFieldValue('ambient_temperature') == null ? undefined : 'manual',
        wind_speed_source: form.getFieldValue('wind_speed') == null ? undefined : 'manual',
      });
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'ambient_temperature')) {
      setSyncedFields({ ambient_temperature_source: 'manual' });
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'wind_speed')) {
      setSyncedFields({ wind_speed_source: 'manual' });
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'pipe_material')) {
      const manualPipeLambda = changed.pipe_material === 'other';
      setSyncedFields({
        pipe_lambda_mode: manualPipeLambda ? 'manual' : 'reference',
        ...(!manualPipeLambda ? { pipe_lambda: undefined } : {}),
      });
    }
    const layerSyncValues = collectInsulationLayerSyncValues(changed);
    if (Object.keys(layerSyncValues).length > 0) {
      setSyncedFields(layerSyncValues);
    }
    scheduleMissingRequiredFieldSync();
    onDraftValuesChange?.(syncedChanges, form.getFieldsValue(true) as Record<string, unknown>);
  }

  return {
    handleValuesChange,
    syncProgrammaticValuesChange,
  };
}
