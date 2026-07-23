import {
  useMemo,
  type ReactElement,
} from 'react';
import { Button, Form, Input } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import ElectricalAndFittingsStep from './steps/ElectricalAndFittingsStep';
import InsulationLayersStep from './steps/InsulationLayersStep';
import PlacementGroundStep from './steps/PlacementGroundStep';
import PipeGeometryStep from './steps/PipeGeometryStep';
import PipeWallMaterialStep from './steps/PipeWallMaterialStep';
import TankGeometryStep from './steps/TankGeometryStep';
import TemperatureEnvironmentStep from './steps/TemperatureEnvironmentStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import {
  applyObjectFormDefaults,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardUtils';
import {
  heatCalcFormFieldRules,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
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
import CableAlgorithmPanel from './CableAlgorithmPanel';
import InsulationSettingsRow from './InsulationSettingsRow';
import WizardZoneBoundary from './isolation/WizardZoneBoundary';
import ObjectWizardSidePanel from './ObjectWizardSidePanel';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
import ObjectWizardWidePanel from './ObjectWizardWidePanel';
import { useObjectWizardFormSync, scrollToFirstError } from './useObjectWizardFormSync';
import { useObjectWizardReferenceData } from './useObjectWizardReferenceData';
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
  layoutVariant?: ObjectWizardLayoutVariant;
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
  layoutVariant = 'wide',
  formSectionWeights,
  sectionResizeEnabled = false,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
  onDraftValuesChange,
}: Props) {
  const [form] = Form.useForm();
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

  const geometrySlot = (
    <>
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
      {layoutVariant !== 'wide' && (
        <PlacementGroundStep
          objectType={heatCalcObjectType}
          fieldInputSettings={fieldInputSettings}
          isSoilFetching={isSoilFetching}
          onSoilPickerOpen={requestSoilReference}
          soilOptions={soilOptions}
        />
      )}
      <ElectricalAndFittingsStep
        objectType={heatCalcObjectType}
        fieldInputSettings={fieldInputSettings}
      />
    </>
  );

  const climateSlot = (
    <>
      {layoutVariant === 'wide' && (
        <PlacementGroundStep
          objectType={heatCalcObjectType}
          fieldInputSettings={fieldInputSettings}
          isSoilFetching={isSoilFetching}
          onSoilPickerOpen={requestSoilReference}
          soilOptions={soilOptions}
        />
      )}
      <TemperatureEnvironmentStep
        objectType={heatCalcObjectType}
        fieldInputSettings={fieldInputSettings}
        climateOptions={climateOptions}
        isClimateFetching={isClimateFetching}
        onClimatePickerOpen={requestClimateReference}
        showWindField={showWindField}
        ambientTemperatureSourceFallback={watchedValue('ambient_temperature_source')}
        windSpeedSourceFallback={watchedValue('wind_speed_source')}
      />
    </>
  );

  const insulationSettingsSlot = (
    <InsulationSettingsRow
      objectType={heatCalcObjectType}
      fieldInputSettings={fieldInputSettings}
      watchedValues={watchedValues}
    />
  );

  const insulationTableSlot = (
    <InsulationLayersStep
      objectType={heatCalcObjectType}
      fieldInputSettings={fieldInputSettings}
      watchedValues={watchedValues}
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
      includeSettingsRow={false}
    />
  );

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={formInitialValues}
      className={`inline-object-form inline-object-form--${layoutVariant}`}
      data-layout={layoutVariant}
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
      {layoutVariant === 'side' ? (
        <div className="heatcalc-dual-forms heatcalc-dual-forms--side">
          <div className="heatcalc-dual-forms__heat">
            <ObjectWizardSidePanel
              geometry={geometrySlot}
              climate={climateSlot}
              insulationSettings={insulationSettingsSlot}
              insulationTable={insulationTableSlot}
            />
          </div>
          <WizardZoneBoundary
            islandId="cable-algorithm"
            className="heatcalc-dual-forms__cable"
            data-testid="wizard-zone-cable-algorithm"
          >
            <CableAlgorithmPanel
              objectType={heatCalcObjectType}
              fieldInputSettings={fieldInputSettings}
            />
          </WizardZoneBoundary>
        </div>
      ) : (
        <div className="heatcalc-dual-forms heatcalc-dual-forms--wide">
          <div className="heatcalc-dual-forms__heat">
            <ObjectWizardWidePanel
              formGridRef={formGridRef}
              geometry={geometrySlot}
              climate={climateSlot}
              insulationSettings={insulationSettingsSlot}
              insulationTable={insulationTableSlot}
            />
          </div>
          <WizardZoneBoundary
            islandId="cable-algorithm"
            className="heatcalc-dual-forms__cable"
            data-testid="wizard-zone-cable-algorithm"
          >
            <CableAlgorithmPanel
              objectType={heatCalcObjectType}
              fieldInputSettings={fieldInputSettings}
            />
          </WizardZoneBoundary>
        </div>
      )}
      <div className="hidden-submit">
        <Button id="inline-object-save" type="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </Button>
        <Button id="inline-object-cancel" onClick={onClose}>Отмена</Button>
      </div>
    </Form>
  );
}
