/**
 * Pure mappers for useObjectWizardFormSync (P-BAND-17).
 */
import type { FormInstance } from 'antd';
import type { ClimateEntry, InsulationEntry } from '@/types/reference';
import {
  defaultInsulationTemperatureBasisForPlacement,
  isInsulationTemperatureBasisAllowedForPlacement,
} from '@/domain/heatCalcFieldRules';
import {
  climateTemperature,
  climateWind,
  type ClimateBasis,
} from './objectWizardClimateModel';
import {
  INSULATION_LAYER_FORM_FIELDS,
  insulationReferenceFieldValues,
  isReferenceInsulationMaterial,
  expandedChangedFieldNames,
} from './objectWizardInsulationModel';

export function equivalentFormValue(left: unknown, right: unknown) {
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

/**
 * Значения из климатического справочника.
 *
 * Обеспеченность зависит от Ø трубы (≥100 мм → 0,92, <100 мм → абс. минимум),
 * но ждать диаметр незачем: пока его нет, показываем 0,92, а при расчёте
 * бэкенд всё равно выводит правило сам (`_apply_climate_policy`) и переписывает
 * температуру — кроме введённой вручную. При пассивной синхронизации ручной
 * ввод сохраняется; при явном выборе климата caller не передаёт manualSources.
 */
export function buildClimateSyncValues(
  selectedClimate: ClimateEntry,
  climateBasis: ClimateBasis | null | undefined,
  manualSources: { ambient?: boolean; wind?: boolean } = {},
): Record<string, unknown> {
  const previewBasis: ClimateBasis = climateBasis ?? 't_0_92';
  const tAmbient = manualSources.ambient ? null : climateTemperature(selectedClimate, previewBasis);
  const wind = manualSources.wind ? null : climateWind(selectedClimate);
  return {
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
}

export function buildInsulationReferenceSyncValues(args: {
  form: FormInstance;
  insulationMaterials: InsulationEntry[];
  layerCount: number;
}): Record<string, unknown> {
  const { form, insulationMaterials, layerCount } = args;
  const nextValues: Record<string, unknown> = {};
  INSULATION_LAYER_FORM_FIELDS.forEach((layer, index) => {
    if (index + 1 > layerCount) return;
    const material = form.getFieldValue(layer.material);
    if (!isReferenceInsulationMaterial(material)) return;
    Object.assign(nextValues, insulationReferenceFieldValues(layer, insulationMaterials, material));
  });
  return nextValues;
}

export function collectInsulationLayerSyncValues(args: {
  form: FormInstance;
  changed: Record<string, unknown>;
  insulationMaterials: InsulationEntry[];
}): Record<string, unknown> {
  const { form, changed, insulationMaterials } = args;
  const nextValues: Record<string, unknown> = {};
  const rawLayerCount = Object.prototype.hasOwnProperty.call(changed, 'insulation_layer_count')
    ? changed.insulation_layer_count
    : form.getFieldValue('insulation_layer_count');
  const parsedLayerCount = Number(rawLayerCount);
  const activeLayerCount = Number.isFinite(parsedLayerCount)
    ? Math.min(INSULATION_LAYER_FORM_FIELDS.length, Math.max(1, Math.trunc(parsedLayerCount)))
    : INSULATION_LAYER_FORM_FIELDS.length;

  INSULATION_LAYER_FORM_FIELDS.forEach((layer, index) => {
    if (index >= activeLayerCount) return;
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

export function shouldResetAllCalcErrors(expandedChangedNames: string[] | undefined) {
  return !expandedChangedNames
    || expandedChangedNames.some((fieldName) => (
      fieldName === 'insulation_layer_count'
      || fieldName === 'placement'
      || fieldName === 'shape'
      || fieldName === 'pipe_lambda_mode'
    ));
}

export function resolveCalcErrorNamesToClear(
  currentFieldNames: string[],
  changedFieldNames?: string[],
): { namesToClear: string[]; resetAll: boolean } {
  const expandedChangedNames = changedFieldNames ? expandedChangedFieldNames(changedFieldNames) : undefined;
  const resetAll = shouldResetAllCalcErrors(expandedChangedNames);
  const namesToClear = resetAll
    ? currentFieldNames
    : currentFieldNames.filter((fieldName) => expandedChangedNames!.includes(fieldName));
  return { namesToClear, resetAll };
}

export function buildPlacementBasisSync(
  placement: unknown,
  currentBasis: unknown,
): Record<string, unknown> | null {
  if (
    !currentBasis
    || !isInsulationTemperatureBasisAllowedForPlacement(currentBasis, placement)
  ) {
    return {
      insulation_temperature_basis: defaultInsulationTemperatureBasisForPlacement(placement),
    };
  }
  return null;
}

export function buildClearedClimateKeySync(form: FormInstance): Record<string, unknown> {
  return {
    climate_city: undefined,
    climate_region: undefined,
    climate_temperature_basis: undefined,
    ambient_temperature_source: form.getFieldValue('ambient_temperature') == null ? undefined : 'manual',
    wind_speed_source: form.getFieldValue('wind_speed') == null ? undefined : 'manual',
  };
}

export function buildPipeMaterialLambdaSync(pipeMaterial: unknown): Record<string, unknown> {
  const manualPipeLambda = pipeMaterial === 'other';
  return {
    pipe_lambda_mode: manualPipeLambda ? 'manual' : 'reference',
    ...(!manualPipeLambda ? { pipe_lambda: undefined } : {}),
  };
}
