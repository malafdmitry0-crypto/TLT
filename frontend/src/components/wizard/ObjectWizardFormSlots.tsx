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

  const nameField = (
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
  );
  const placementStep = (part: 'all' | 'wide' | 'numeric') => (
    <PlacementGroundStep
      objectType={heatCalcObjectType}
      part={part}
      fieldInputSettings={fieldInputSettings}
      isSoilFetching={isSoilFetching}
      onSoilPickerOpen={requestSoilReference}
      soilOptions={soilOptions}
    />
  );
  const temperatureStep = (part: 'all' | 'wide' | 'temperatures' | 'wind') => (
    <TemperatureEnvironmentStep
      objectType={heatCalcObjectType}
      part={part}
      fieldInputSettings={fieldInputSettings}
      climateOptions={climateOptions}
      isClimateFetching={isClimateFetching}
      onClimatePickerOpen={requestClimateReference}
      showWindField={showWindField}
    />
  );
  const insulationModeField = (
    <InsulationSettingsRow
      objectType={heatCalcObjectType}
      fieldInputSettings={fieldInputSettings}
      watchedValues={watchedValues}
    />
  );
  const electricalStep = (
    <ElectricalAndFittingsStep
      objectType={heatCalcObjectType}
      fieldInputSettings={fieldInputSettings}
    />
  );

  const geometry = layoutVariant === 'wide' ? (
    <>
      {nameField}
      {objectType === 'pipe' ? (
        <PipeWallMaterialStep
          part="material"
          fieldInputSettings={fieldInputSettings}
          pipeMaterialOptions={pipeMaterialOptions}
        />
      ) : (
        <TankGeometryStep part="wide" fieldInputSettings={fieldInputSettings} />
      )}
      {placementStep('wide')}
      {temperatureStep('wide')}
      {insulationModeField}
    </>
  ) : (
    <>
      {nameField}
      {objectType === 'pipe'
        ? <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
        : <TankGeometryStep fieldInputSettings={fieldInputSettings} />}
      {objectType === 'pipe' && (
        <PipeWallMaterialStep
          fieldInputSettings={fieldInputSettings}
          pipeMaterialOptions={pipeMaterialOptions}
        />
      )}
      {placementStep('all')}
      {electricalStep}
    </>
  );

  const climate = layoutVariant === 'wide' ? (
    <>
      {objectType === 'pipe' ? (
        <>
          <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
          <PipeWallMaterialStep
            part="thickness"
            fieldInputSettings={fieldInputSettings}
            pipeMaterialOptions={pipeMaterialOptions}
          />
          {electricalStep}
          <PipeWallMaterialStep
            part="lambda"
            fieldInputSettings={fieldInputSettings}
            pipeMaterialOptions={pipeMaterialOptions}
          />
        </>
      ) : (
        <TankGeometryStep part="numeric" fieldInputSettings={fieldInputSettings} />
      )}
    </>
  ) : temperatureStep('all');

  const insulationSettings = layoutVariant === 'wide' ? (
    <>
      {temperatureStep('temperatures')}
      {objectType === 'tank' ? electricalStep : null}
      {temperatureStep('wind')}
      {placementStep('numeric')}
    </>
  ) : insulationModeField;

  const wideLeft = layoutVariant === 'wide' ? (
    <>
      {nameField}
      {temperatureStep('wide')}
    </>
  ) : null;

  const wideRight = layoutVariant === 'wide' ? (
    <>
      {objectType === 'pipe' ? (
        <PipeWallMaterialStep part="material" fieldInputSettings={fieldInputSettings} pipeMaterialOptions={pipeMaterialOptions} />
      ) : (
        <TankGeometryStep part="wide" fieldInputSettings={fieldInputSettings} />
      )}
      {placementStep('wide')}
      {insulationModeField}
    </>
  ) : null;

  const compactLeft = layoutVariant === 'wide' ? (
    <>
      {temperatureStep('temperatures')}
      {temperatureStep('wind')}
      {electricalStep}
    </>
  ) : null;

  const compactRight = layoutVariant === 'wide' ? (
    objectType === 'pipe' ? (
      <>
        <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
        <PipeWallMaterialStep part="thickness" fieldInputSettings={fieldInputSettings} pipeMaterialOptions={pipeMaterialOptions} />
        <PipeWallMaterialStep part="lambda" fieldInputSettings={fieldInputSettings} pipeMaterialOptions={pipeMaterialOptions} />
        {placementStep('numeric')}
      </>
    ) : (
      <>
        <TankGeometryStep part="numeric" fieldInputSettings={fieldInputSettings} />
        {placementStep('numeric')}
      </>
    )
  ) : null;

  const insulationTable = (
    <InsulationLayersStep
      objectType={heatCalcObjectType}
      layout={layoutVariant}
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

  return { geometry, climate, insulationSettings, insulationTable, wideLeft, wideRight, compactLeft, compactRight };
}
