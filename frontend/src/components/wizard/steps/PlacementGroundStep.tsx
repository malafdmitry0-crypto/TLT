import { Form } from 'antd';
import type { ReactElement } from 'react';
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
import type { SoilReferenceOption } from '@/utils/referenceOptions';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';
import ReferencePicker from '../ReferencePicker';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  isSoilFetching: boolean;
  soilOptions: SoilReferenceOption[];
}

export default function PlacementGroundStep({
  objectType,
  fieldInputSettings,
  isSoilFetching,
  soilOptions,
}: Props) {
  const form = Form.useFormInstance();
  const placement = Form.useWatch('placement', form);
  const isUnderground = placement === 'underground';
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps(objectType, fieldId, { form });

  return (
    <>
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item helped-form-item"
        label={fieldLabel('placement', objectType)}
        name="placement"
        rules={heatCalcFormFieldRules(form, objectType, 'placement')}
      >
        {withHelp(
          <TltSelect
            data-testid="placement-select"
            {...selectInputProps('placement')}
            placeholder="Выберите размещение"
            options={heatCalcSelectOptions(objectType, 'placement')}
          />,
          fieldHelp('placement', objectType),
        )}
      </Form.Item>
      {isUnderground && (
        <>
          <Form.Item
            className="fit-label-form-item helped-form-item"
            label={fieldLabel('burial_depth', objectType)}
            name="burial_depth"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'burial_depth')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="burial-depth-input"
                {...numberInputProps('burial_depth')}
                unit="м"
              />,
              fieldHelp('burial_depth', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('ground_type', objectType)}
            name="ground_type"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'ground_type')}
          >
            {withHelp(
              <ReferencePicker
                data-testid="ground-type-select"
                loading={isSoilFetching}
                placeholder="Выберите грунт"
                modalTitle="Грунт"
                searchPlaceholder="Поиск грунта"
                options={[...soilOptions, { value: 'custom', label: 'Другое' }]}
                {...heatCalcCustomControlRequiredProps(form, objectType, 'ground_type')}
              />,
              fieldHelp('ground_type', objectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('ground_conductivity', objectType)}
            name="ground_conductivity"
            preserve={false}
            rules={heatCalcFormFieldRules(form, objectType, 'ground_conductivity')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="ground-conductivity-input"
                {...numberInputProps('ground_conductivity')}
                unit="Вт/мК"
              />,
              fieldHelp('ground_conductivity', objectType),
            )}
          </Form.Item>
        </>
      )}
    </>
  );
}
