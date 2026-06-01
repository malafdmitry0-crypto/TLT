import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Button, Form, Input, type FormInstance } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ObjectType } from '@/constants/objectTypes';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import ElectricalAndFittingsStep from './steps/ElectricalAndFittingsStep';
import InsulationLayersStep from './steps/InsulationLayersStep';
import PlacementGroundStep from './steps/PlacementGroundStep';
import PipeGeometryStep from './steps/PipeGeometryStep';
import PipeWallMaterialStep from './steps/PipeWallMaterialStep';
import TankGeometryStep from './steps/TankGeometryStep';
import TemperatureEnvironmentStep from './steps/TemperatureEnvironmentStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import { getClimate, getInsulation, getPipeMaterials, getSoilConductivity } from '@/api/references';
import {
  generatePipeName,
  generateTankName,
  applyObjectFormDefaults,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
  type PipeFormValues,
  type TankFormValues,
} from '@/utils/objectWizardUtils';
import {
  heatCalcFormFieldRules,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import {
  defaultInsulationTemperatureBasisForPlacement,
  isInsulationTemperatureBasisAllowedForPlacement,
  isHeatCalcFieldRequired,
  isHeatCalcFieldVisible,
} from '@/domain/heatCalcFieldRules';
import {
  buildInsulationReferenceOptions,
  buildPipeMaterialReferenceOptions,
  buildSoilReferenceOptions,
} from '@/utils/referenceOptions';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcFormSectionWeights } from '@/utils/heatCalcTableViewSettings';
import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import {
  climateBasisLabel,
  climateKey,
  climatePolicyBasisForObject,
  climatePolicyBasisReason,
  climateTemperature,
  climateWind,
  numericFormValue,
} from './objectWizardClimateModel';
import {
  expandedChangedFieldNames,
  INSULATION_LAYER_FORM_FIELDS,
  insulationReferenceFieldValues,
  isReferenceInsulationMaterial,
} from './objectWizardInsulationModel';
import {
  buildCalculationFieldErrors,
  isEmptyFormValue,
  normalizeFieldErrorsForForm,
  REQUIRED_FIELD_ERROR_MESSAGE,
} from './objectWizardValidationModel';
import { useObjectWizardSectionResize } from './useObjectWizardSectionResize';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
  /** Pass already converted form values when editing an unsaved table draft. */
  initialFormValues?: Record<string, unknown>;
  validationErrors?: ProjectObject['validation_errors'];
  fieldErrors?: Record<string, string>;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  formSectionWeights?: HeatCalcFormSectionWeights;
  sectionResizeEnabled?: boolean;
  onFormSectionWeightsChange?: (weights: HeatCalcFormSectionWeights) => void;
  onFormSectionWeightsCommit?: (weights: HeatCalcFormSectionWeights) => void;
  onDraftValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
}

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

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType?: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType?: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}

function equivalentFormValue(left: unknown, right: unknown) {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return true;
    return Math.abs(leftNumber - rightNumber) < 1e-9;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function formAlreadyHasValues(form: FormInstance, values: Record<string, unknown>) {
  const current = form.getFieldsValue(true) as Record<string, unknown>;
  return Object.entries(values).every(([key, value]) => equivalentFormValue(current[key], value));
}

export default function ObjectWizard({
  objectType,
  onClose,
  onSubmit,
  submitting = false,
  initialParams,
  initialFormValues,
  validationErrors,
  fieldErrors,
  fieldInputSettings,
  formSectionWeights,
  sectionResizeEnabled = false,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
  onDraftValuesChange,
}: Props) {
  const [form] = Form.useForm();
  const heatCalcObjectType = objectType as HeatCalcObjectType;
  const { formGridRef, resizeHandleProps, sectionStyle } = useObjectWizardSectionResize({
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
  const calculationFieldErrors = useMemo(
    () => ({
      ...buildCalculationFieldErrors(validationErrors, heatCalcObjectType),
      ...normalizeFieldErrorsForForm(fieldErrors, heatCalcObjectType),
    }),
    [fieldErrors, heatCalcObjectType, validationErrors],
  );
  const calculationFieldErrorNamesRef = useRef<string[]>([]);
  const localRequiredFieldErrorNamesRef = useRef<string[]>([]);
  const requiredFieldSyncTimerRef = useRef<number | null>(null);
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
  const prevSuggestedRef = useRef<string>('');

  useEffect(() => () => {
    if (requiredFieldSyncTimerRef.current != null) {
      window.clearTimeout(requiredFieldSyncTimerRef.current);
    }
  }, []);

  const insulationLayerCount = watchedString('insulation_layer_count');
  const insulationMaterial = watchedString('insulation_material');
  const placement = watchedString('placement');
  const selectedClimateKey = watchedString('climate_key');
  const selectedGroundType = watchedString('ground_type');
  const climateBasisValue = watchedString('climate_temperature_basis');
  const outerDiameterMm = numericFormValue(watchedValue('outer_diameter_mm'));
  const climateBasis = climatePolicyBasisForObject(objectType, outerDiameterMm, climateBasisValue);
  const climateBasisDisplay = climateBasis
    ? `${climateBasisLabel(climateBasis)} · ${climatePolicyBasisReason(objectType, outerDiameterMm)}`
    : climatePolicyBasisReason(objectType, outerDiameterMm);
  const secondInsulationMaterial = watchedString('second_insulation_material');
  const thirdInsulationMaterial = watchedString('third_insulation_material');
  const layerCount = Math.min(Math.max(Number(insulationLayerCount || '1') || 1, 1), 3);
  const hasClimate = selectedClimateKey.length > 0;
  const isUnderground = placement === 'underground';
  const showWindField = placement === 'outdoor' || (objectType === 'tank' && isUnderground);
  const showAlphaField = placement === 'outdoor'
    || placement === 'indoor'
    || (objectType === 'tank' && isUnderground);
  const [climateReferenceRequested, setClimateReferenceRequested] = useState(false);
  const [soilReferenceRequested, setSoilReferenceRequested] = useState(false);
  const { data: insulationMaterials = [], isError: insulationMaterialsError, isFetching: isInsulationMaterialsFetching } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const { data: pipeMaterials = [] } = useQuery({
    queryKey: referenceQueryKeys.pipeMaterials,
    queryFn: getPipeMaterials,
    ...referenceQueryOptions,
  });
  const { data: climateEntries = [], isFetching: isClimateFetching } = useQuery({
    queryKey: referenceQueryKeys.climate,
    queryFn: getClimate,
    enabled: climateReferenceRequested || selectedClimateKey.length > 0,
    ...referenceQueryOptions,
  });
  const { data: soilEntries = [], isFetching: isSoilFetching } = useQuery({
    queryKey: referenceQueryKeys.soilConductivity,
    queryFn: getSoilConductivity,
    enabled: soilReferenceRequested || selectedGroundType.length > 0,
    ...referenceQueryOptions,
  });
  const insulationMaterialOptions = useMemo(
    () => [
      ...buildInsulationReferenceOptions(insulationMaterials),
      { value: 'other', label: 'Другое' },
    ],
    [insulationMaterials],
  );
  const pipeMaterialOptions = useMemo(
    () => pipeMaterials.length > 0
      ? buildPipeMaterialReferenceOptions(pipeMaterials)
      : [{ value: 'carbon_steel', label: 'Углеродистая сталь' }],
    [pipeMaterials],
  );
  const climateOptions = useMemo(
    () => climateEntries.map((entry) => ({
      value: climateKey(entry),
      label: `${entry.city ?? entry.region} · ${entry.region}`,
      group: entry.region,
    })),
    [climateEntries],
  );
  const selectedClimate = climateEntries.find((entry) => climateKey(entry) === selectedClimateKey);
  const soilOptions = useMemo(
    () => buildSoilReferenceOptions(soilEntries),
    [soilEntries],
  );
  const selectedSecondInsulation = insulationMaterials.find((m) => m.material === secondInsulationMaterial);
  const selectedThirdInsulation = insulationMaterials.find((m) => m.material === thirdInsulationMaterial);

  useEffect(() => {
    if (!formAlreadyHasValues(form, formInitialValues as Record<string, unknown>)) {
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
    const fieldUpdates = [
      ...fieldNamesToClear.map((fieldName) => ({ name: fieldName, errors: [] })),
      ...nextFieldNames.map((fieldName) => ({ name: fieldName, errors: [REQUIRED_FIELD_ERROR_MESSAGE] })),
    ];
    if (fieldUpdates.length > 0) form.setFields(fieldUpdates);
  }, [form, heatCalcObjectType]);

  const scheduleMissingRequiredFieldSync = useCallback(() => {
    if (requiredFieldSyncTimerRef.current != null) {
      window.clearTimeout(requiredFieldSyncTimerRef.current);
    }
    requiredFieldSyncTimerRef.current = window.setTimeout(() => {
      requiredFieldSyncTimerRef.current = null;
      syncMissingRequiredFieldErrors();
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
      const suggestedName =
        objectType === 'pipe'
          ? generatePipeName(watchedValues as unknown as PipeFormValues)
          : generateTankName(watchedValues as unknown as TankFormValues);
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

  async function handleFinish() {
    try {
      await form.validateFields();
      const vals = form.getFieldsValue(true);
      const params =
        objectType === 'pipe'
          ? pipeFormToApiParams(vals)
          : tankFormToApiParams(vals);
      onSubmit(params);
    } catch {
      scrollToFirstError();
    }
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
    if (Object.prototype.hasOwnProperty.call(changed, 'safety_factor')) {
      setSyncedFields({
        safety_factor_source: changed.safety_factor == null ? undefined : 'manual',
      });
    }
    const layerSyncValues = collectInsulationLayerSyncValues(changed);
    if (Object.keys(layerSyncValues).length > 0) {
      setSyncedFields(layerSyncValues);
    }
    scheduleMissingRequiredFieldSync();
    onDraftValuesChange?.(syncedChanges, form.getFieldsValue(true) as Record<string, unknown>);
  }

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

  function renderSectionResizeHandle(handleIndex: number) {
    return <div className="form-col-resize-handle" {...resizeHandleProps(handleIndex)} />;
  }

  function renderSectionTitle(title: string, step: number) {
    return <h4 data-step={step}><span>{title}</span></h4>;
  }
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={formInitialValues}
      className="inline-object-form"
      onValuesChange={handleValuesChange}
    >
      <Form.Item name="climate_city" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="climate_region" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="climate_temperature_basis" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="ambient_temperature_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="wind_speed_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="safety_factor_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <div className="form-col-srs heatcalc-cable-algorithm-section">
        {renderSectionTitle('алгоритм выбора кабеля', 1)}
      </div>
      <div className="form-grid-srs" ref={formGridRef}>

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          className="form-col-srs form-col-srs--primary"
          style={sectionStyle(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара', 2)}
          <Form.Item
            className="name-form-item helped-form-item"
            label={fieldLabel('name', heatCalcObjectType)}
            name="name"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'name')}
          >
            {withHelp(
              <Input
                data-testid="object-name-input"
                {...heatCalcTextInputProps(heatCalcObjectType, 'name')}
              />,
              fieldHelp('name', heatCalcObjectType),
            )}
          </Form.Item>
          {objectType === 'pipe'
            ? <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
            : <TankGeometryStep fieldInputSettings={fieldInputSettings} />}
          {objectType === 'pipe' && (
            <PipeWallMaterialStep
              fieldInputSettings={fieldInputSettings}
              pipeMaterialOptions={pipeMaterialOptions}
            />
          )}
          <PlacementGroundStep
            objectType={heatCalcObjectType}
            fieldInputSettings={fieldInputSettings}
            isSoilFetching={isSoilFetching}
            onSoilPickerOpen={() => setSoilReferenceRequested(true)}
            soilOptions={soilOptions}
          />
          <ElectricalAndFittingsStep
            objectType={heatCalcObjectType}
            fieldInputSettings={fieldInputSettings}
          />
        </div>

        {renderSectionResizeHandle(0)}

        <div
          className="form-col-srs"
          style={sectionStyle(1)}
        >
          <InsulationLayersStep
            objectType={heatCalcObjectType}
            fieldInputSettings={fieldInputSettings}
            layerCount={layerCount}
            insulationMaterials={insulationMaterials}
            insulationMaterialOptions={insulationMaterialOptions}
            insulationMaterialsError={insulationMaterialsError}
            isInsulationMaterialsFetching={isInsulationMaterialsFetching}
            secondInsulationMaterial={secondInsulationMaterial}
            thirdInsulationMaterial={thirdInsulationMaterial}
            selectedSecondInsulation={selectedSecondInsulation}
            selectedThirdInsulation={selectedThirdInsulation}
            onProgrammaticValuesChange={syncProgrammaticValuesChange}
          />
        </div>

        {renderSectionResizeHandle(1)}

        <div
          className="form-col-srs"
          style={sectionStyle(2)}
        >
          <TemperatureEnvironmentStep
            objectType={heatCalcObjectType}
            fieldInputSettings={fieldInputSettings}
            climateOptions={climateOptions}
            isClimateFetching={isClimateFetching}
            onClimatePickerOpen={() => setClimateReferenceRequested(true)}
            hasClimate={hasClimate}
            climateBasisDisplay={climateBasisDisplay}
            watchedValues={watchedValues}
            showWindField={showWindField}
            showAlphaField={showAlphaField}
            ambientTemperatureSourceFallback={watchedValue('ambient_temperature_source')}
            windSpeedSourceFallback={watchedValue('wind_speed_source')}
          />
        </div>

      </div>
      <div className="hidden-submit">
        <Button id="inline-object-save" type="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </Button>
        <Button id="inline-object-cancel" onClick={onClose}>Отмена</Button>
      </div>
    </Form>
  );
}

function scrollToFirstError() {
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
