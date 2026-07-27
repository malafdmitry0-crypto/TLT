import { Form } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcFormSectionWeights } from '@/utils/heatCalcTableViewSettings';
import type { ProjectObject } from '@/types/project';
import CableAlgorithmPanel from './CableAlgorithmPanel';
import WizardZoneBoundary from './isolation/WizardZoneBoundary';
import ObjectWizardSidePanel from './ObjectWizardSidePanel';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
import ObjectWizardWidePanel from './ObjectWizardWidePanel';
import { buildObjectWizardFormSlots } from './ObjectWizardFormSlots';
import { useObjectWizardFormModel } from './useObjectWizardFormModel';
import { TltButton, TltTextField } from '@/components/ui-kit';

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
  const model = useObjectWizardFormModel({
    objectType,
    onSubmit,
    initialParams,
    initialFormValues,
    validationErrors,
    fieldErrors,
    fieldInputSettings,
    layoutVariant,
    formSectionWeights,
    sectionResizeEnabled,
    onFormSectionWeightsChange,
    onFormSectionWeightsCommit,
    onDraftValuesChange,
  });
  const {
    form,
    heatCalcObjectType,
    formGridRef,
    isEditMode,
    formInitialValues,
    handleValuesChange,
    handleFinish,
  } = model;

  const slots = buildObjectWizardFormSlots({
    objectType,
    layoutVariant,
    fieldInputSettings,
    form,
    heatCalcObjectType,
    watchedValues: model.watchedValues,
    showWindField: model.showWindField,
    layerCount: model.layerCount,
    secondInsulationMaterial: model.secondInsulationMaterial,
    thirdInsulationMaterial: model.thirdInsulationMaterial,
    insulationMaterials: model.insulationMaterials,
    insulationMaterialsError: model.insulationMaterialsError,
    isInsulationMaterialsFetching: model.isInsulationMaterialsFetching,
    insulationMaterialOptions: model.insulationMaterialOptions,
    pipeMaterialOptions: model.pipeMaterialOptions,
    climateOptions: model.climateOptions,
    isClimateFetching: model.isClimateFetching,
    soilOptions: model.soilOptions,
    isSoilFetching: model.isSoilFetching,
    selectedSecondInsulation: model.selectedSecondInsulation,
    selectedThirdInsulation: model.selectedThirdInsulation,
    requestClimateReference: model.requestClimateReference,
    requestSoilReference: model.requestSoilReference,
    syncProgrammaticValuesChange: model.syncProgrammaticValuesChange,
  });

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
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="climate_region" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="climate_temperature_basis" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="ambient_temperature_source" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="wind_speed_source" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      <Form.Item name="safety_factor_source" hidden noStyle>
        <TltTextField type="hidden" />
      </Form.Item>
      {layoutVariant === 'side' ? (
        <div
          className="heatcalc-dual-forms heatcalc-dual-forms--side"
          data-object-type={heatCalcObjectType}
        >
          <div className="heatcalc-dual-forms__heat">
            <ObjectWizardSidePanel
              objectType={heatCalcObjectType}
              geometry={slots.geometry}
              climate={slots.climate}
              insulationSettings={slots.insulationSettings}
              insulationTable={slots.insulationTable}
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
        <div
          className="heatcalc-dual-forms heatcalc-dual-forms--wide"
          data-object-type={heatCalcObjectType}
        >
          <div className="heatcalc-dual-forms__heat">
            <ObjectWizardWidePanel
              formGridRef={formGridRef}
              objectType={heatCalcObjectType}
              geometry={slots.geometry}
              climate={slots.climate}
              insulationSettings={slots.insulationSettings}
              insulationTable={slots.insulationTable}
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
        <TltButton id="inline-object-save" variant="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </TltButton>
        <TltButton id="inline-object-cancel" onClick={onClose}>Отмена</TltButton>
      </div>
    </Form>
  );
}
