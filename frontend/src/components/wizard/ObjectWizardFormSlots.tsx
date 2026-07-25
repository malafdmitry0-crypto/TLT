/**
 * @module wizard/object-wizard-form-slots
 * @owner heat
 * Geometry / climate / insulation slot builders for ObjectWizard layout panels.
 */
import { Form } from 'antd';
import type { FormInstance } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import ElectricalAndFittingsStep from './steps/ElectricalAndFittingsStep';
import InsulationLayersStep from './steps/InsulationLayersStep';
import PlacementGroundStep from './steps/PlacementGroundStep';
import PipeGeometryStep from './steps/PipeGeometryStep';
import PipeWallMaterialStep from './steps/PipeWallMaterialStep';
import TankGeometryStep from './steps/TankGeometryStep';
import TemperatureEnvironmentStep from './steps/TemperatureEnvironmentStep';
import {
  heatCalcFormFieldRules,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import InsulationSettingsRow from './InsulationSettingsRow';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
import { fieldHelp, fieldLabel, withHelp } from './objectWizardFieldHelpers';
import type { useObjectWizardFormModel } from './useObjectWizardFormModel';
import { TltTextField } from '@/components/ui-kit';

type FormModel = ReturnType<typeof useObjectWizardFormModel>;

export type ObjectWizardFormSlotsInput = {
  objectType: ObjectType;
  layoutVariant: ObjectWizardLayoutVariant;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  form: FormInstance;
  heatCalcObjectType: HeatCalcObjectType;
  watchedValues: FormModel['watchedValues'];
  watchedValue: FormModel['watchedValue'];
  showWindField: boolean;
  layerCount: number;
  secondInsulationMaterial: string;
  thirdInsulationMaterial: string;
  insulationMaterials: FormModel['insulationMaterials'];
  insulationMaterialsError: FormModel['insulationMaterialsError'];
  isInsulationMaterialsFetching: FormModel['isInsulationMaterialsFetching'];
  insulationMaterialOptions: FormModel['insulationMaterialOptions'];
  pipeMaterialOptions: FormModel['pipeMaterialOptions'];
  climateOptions: FormModel['climateOptions'];
  isClimateFetching: FormModel['isClimateFetching'];
  soilOptions: FormModel['soilOptions'];
  isSoilFetching: FormModel['isSoilFetching'];
  selectedSecondInsulation: FormModel['selectedSecondInsulation'];
  selectedThirdInsulation: FormModel['selectedThirdInsulation'];
  requestClimateReference: FormModel['requestClimateReference'];
  requestSoilReference: FormModel['requestSoilReference'];
  syncProgrammaticValuesChange: FormModel['syncProgrammaticValuesChange'];
};

export function buildObjectWizardFormSlots(input: ObjectWizardFormSlotsInput) {
  const {
    objectType,
    layoutVariant,
    fieldInputSettings,
    form,
    heatCalcObjectType,
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
    syncProgrammaticValuesChange,
  } = input;

  const geometry = (
    <>
      <Form.Item
        className="name-form-item helped-form-item"
        label={fieldLabel('name', heatCalcObjectType)}
        name="name"
        rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'name')}
      >
        {withHelp(
          <TltTextField
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

  const climate = (
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

  const insulationSettings = (
    <InsulationSettingsRow
      objectType={heatCalcObjectType}
      fieldInputSettings={fieldInputSettings}
      watchedValues={watchedValues}
    />
  );

  const insulationTable = (
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

  return { geometry, climate, insulationSettings, insulationTable };
}
