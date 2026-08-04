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
  const temperatureStep = (
    part: 'all' | 'wide' | 'temperatures' | 'wind'
    | 'ambient' | 'process' | 'wind-speed' | 'alpha',
  ) => (
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

  const wall = (part: 'thickness' | 'lambda') => (
    <PipeWallMaterialStep
      part={part}
      fieldInputSettings={fieldInputSettings}
      pipeMaterialOptions={pipeMaterialOptions}
    />
  );

  /**
   * Числовой блок широкой раскладки — один плоский список в порядке кадра
   * (`mockups/html/ishodnye-truba-zapolneno.html`, `rezervuar-*.html`):
   * размер · температура среды · размер · требуемая температура · остальное.
   * Кадр чередует геометрию с температурами, поэтому поля берутся у шагов
   * по одному. Условия видимости живут внутри шагов и не менялись.
   */
  const numericBlock = objectType === 'pipe' ? (
    <>
      <PipeGeometryStep part="diameter" fieldInputSettings={fieldInputSettings} />
      {temperatureStep('ambient')}
      <PipeGeometryStep part="length" fieldInputSettings={fieldInputSettings} />
      {temperatureStep('process')}
      {wall('thickness')}
      {temperatureStep('wind-speed')}
      <ElectricalAndFittingsStep
        objectType={heatCalcObjectType}
        fieldInputSettings={fieldInputSettings}
        part="count"
      />
      {temperatureStep('alpha')}
      {/* поля, которых на кадре нет, — следующими строками того же блока */}
      <ElectricalAndFittingsStep
        objectType={heatCalcObjectType}
        fieldInputSettings={fieldInputSettings}
        part="equiv"
      />
      {wall('lambda')}
      {placementStep('numeric')}
    </>
  ) : (
    <>
      <TankGeometryStep part="size-a" fieldInputSettings={fieldInputSettings} />
      {temperatureStep('ambient')}
      <TankGeometryStep part="size-b" fieldInputSettings={fieldInputSettings} />
      {temperatureStep('process')}
      <TankGeometryStep part="size-rest" fieldInputSettings={fieldInputSettings} />
      {temperatureStep('wind-speed')}
      <ElectricalAndFittingsStep
        objectType={heatCalcObjectType}
        fieldInputSettings={fieldInputSettings}
        part="q"
      />
      {temperatureStep('alpha')}
      {placementStep('numeric')}
    </>
  );

  const climate = layoutVariant === 'wide' ? numericBlock : temperatureStep('all');

  // в широкой раскладке числовые поля живут одним блоком (см. numericBlock),
  // третий слот пуст — панель рисует два блока вместо трёх
  const insulationSettings = layoutVariant === 'wide' ? null : insulationModeField;

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

  return { geometry, climate, insulationSettings, insulationTable };
}
