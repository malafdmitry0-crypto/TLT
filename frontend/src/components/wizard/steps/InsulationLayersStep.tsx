import type { ReactElement } from 'react';
import { Form } from 'antd';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import {
  heatCalcCustomControlRequiredProps,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';
import InsulationTemperatureRangeField from '../InsulationTemperatureRangeField';
import ReferencePicker, { type ReferencePickerOption } from '../ReferencePicker';
import ThermalStep from './ThermalStep';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  layerCount: number;
  insulationMaterials: InsulationEntry[];
  insulationMaterialOptions: ReferencePickerOption[];
  insulationMaterialsError: boolean;
  isInsulationMaterialsFetching: boolean;
  secondInsulationMaterial?: string;
  thirdInsulationMaterial?: string;
  selectedSecondInsulation?: InsulationEntry;
  selectedThirdInsulation?: InsulationEntry;
  onProgrammaticValuesChange: (changedValues: Record<string, unknown>) => void;
}

export default function InsulationLayersStep({
  objectType,
  fieldInputSettings,
  layerCount,
  insulationMaterials,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  secondInsulationMaterial,
  thirdInsulationMaterial,
  selectedSecondInsulation,
  selectedThirdInsulation,
  onProgrammaticValuesChange,
}: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps(objectType, fieldId, { form });

  return (
    <>
      <h4 data-step={3}><span>Теплоизоляция</span></h4>
      <Form.Item
        className="layer-count-form-item insulation-layer-count-form-item helped-form-item"
        label={fieldLabel('insulation_layer_count', objectType)}
        name="insulation_layer_count"
        rules={heatCalcFormFieldRules(form, objectType, 'insulation_layer_count')}
      >
        {withHelp(
          <TltSelect
            data-testid="insulation-layer-count-select"
            {...selectInputProps('insulation_layer_count')}
            options={heatCalcSelectOptions(objectType, 'insulation_layer_count')}
            placeholder="Выберите"
          />,
          fieldHelp('insulation_layer_count', objectType),
        )}
      </Form.Item>
      <div className="insulation-layer-group">
        <ThermalStep
          objectType={objectType}
          fieldInputSettings={fieldInputSettings}
          insulationMaterials={insulationMaterials}
          onProgrammaticValuesChange={onProgrammaticValuesChange}
          insulationMaterialOptions={insulationMaterialOptions}
          insulationMaterialsError={insulationMaterialsError}
          isInsulationMaterialsFetching={isInsulationMaterialsFetching}
        />
      </div>
      {layerCount >= 2 && (
        <div className="insulation-layer-group">
          <Form.Item
            className="medium-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item"
            label={fieldLabel('second_insulation_material', objectType)}
            name="second_insulation_material"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'second_insulation_material')}
          >
            {withHelp(
              <ReferencePicker
                data-testid="second-insulation-material-select"
                options={insulationMaterialOptions}
                placeholder="Выберите материал"
                modalTitle="Материал 2-го слоя"
                searchPlaceholder="Поиск материала"
                loading={isInsulationMaterialsFetching}
                notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                {...heatCalcCustomControlRequiredProps(form, objectType, 'second_insulation_material')}
              />,
              fieldHelp('second_insulation_material', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item"
            label={fieldLabel('second_insulation_thickness_mm', objectType)}
            name="second_insulation_thickness_mm"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'second_insulation_thickness_mm')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="second-insulation-thickness-input"
                {...numberInputProps('second_insulation_thickness_mm')}
                unit="мм"
              />,
              fieldHelp('second_insulation_thickness_mm', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('second_insulation_lambda', objectType)}
            name="second_insulation_lambda"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'second_insulation_lambda')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="second-insulation-lambda-input"
                {...numberInputProps('second_insulation_lambda')}
                unit="Вт/мК"
              />,
              fieldHelp(
                'second_insulation_lambda',
                objectType,
                secondInsulationMaterial === 'other' ? 'manual' : 'reference',
              ),
            )}
          </Form.Item>
          <InsulationTemperatureRangeField
            material={secondInsulationMaterial}
            selectedMaterial={selectedSecondInsulation}
            minName="second_insulation_temperature_min"
            maxName="second_insulation_temperature_max"
            dataTestIdPrefix="second-insulation"
            objectType={objectType}
            labelFieldId="second_insulation_temperature_range"
            hint={fieldHelp('second_insulation_temperature_range', objectType)}
            required={heatCalcCustomControlRequiredProps(form, objectType, 'second_insulation_temperature_range').required}
            onRangeChange={onProgrammaticValuesChange}
          />
        </div>
      )}
      {layerCount >= 3 && (
        <div className="insulation-layer-group">
          <Form.Item
            className="medium-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item"
            label={fieldLabel('third_insulation_material', objectType)}
            name="third_insulation_material"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'third_insulation_material')}
          >
            {withHelp(
              <ReferencePicker
                data-testid="third-insulation-material-select"
                options={insulationMaterialOptions}
                placeholder="Выберите материал"
                modalTitle="Материал 3-го слоя"
                searchPlaceholder="Поиск материала"
                loading={isInsulationMaterialsFetching}
                notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                {...heatCalcCustomControlRequiredProps(form, objectType, 'third_insulation_material')}
              />,
              fieldHelp('third_insulation_material', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item short-number-form-item third-layer-thickness-form-item helped-form-item"
            label={fieldLabel('third_insulation_thickness_mm', objectType)}
            name="third_insulation_thickness_mm"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'third_insulation_thickness_mm')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="third-insulation-thickness-input"
                {...numberInputProps('third_insulation_thickness_mm')}
                unit="мм"
              />,
              fieldHelp('third_insulation_thickness_mm', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('third_insulation_lambda', objectType)}
            name="third_insulation_lambda"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'third_insulation_lambda')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="third-insulation-lambda-input"
                {...numberInputProps('third_insulation_lambda')}
                unit="Вт/мК"
              />,
              fieldHelp(
                'third_insulation_lambda',
                objectType,
                thirdInsulationMaterial === 'other' ? 'manual' : 'reference',
              ),
            )}
          </Form.Item>
          <InsulationTemperatureRangeField
            material={thirdInsulationMaterial}
            selectedMaterial={selectedThirdInsulation}
            minName="third_insulation_temperature_min"
            maxName="third_insulation_temperature_max"
            dataTestIdPrefix="third-insulation"
            objectType={objectType}
            labelFieldId="third_insulation_temperature_range"
            hint={fieldHelp('third_insulation_temperature_range', objectType)}
            required={heatCalcCustomControlRequiredProps(form, objectType, 'third_insulation_temperature_range').required}
            onRangeChange={onProgrammaticValuesChange}
          />
        </div>
      )}
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item insulation-cover-form-item helped-form-item"
        label={fieldLabel('insulation_cover_material', objectType)}
        name="insulation_cover_material"
      >
        {withHelp(
          <TltSelect
            data-testid="insulation-cover-material-select"
            {...selectInputProps('insulation_cover_material')}
            options={heatCalcSelectOptions(objectType, 'insulation_cover_material')}
            placeholder="Не указано"
          />,
          fieldHelp('insulation_cover_material', objectType),
        )}
      </Form.Item>
    </>
  );
}
