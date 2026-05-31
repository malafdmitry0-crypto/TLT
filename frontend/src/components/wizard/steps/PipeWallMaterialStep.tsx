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
import type { ReferenceOption } from '@/utils/referenceOptions';
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

function fieldLabel(fieldId: string) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType: 'pipe' })} />;
}

function fieldHelp(fieldId: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType: 'pipe' });
}

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
  pipeMaterialOptions: ReferenceOption[];
}

export default function PipeWallMaterialStep({ fieldInputSettings, pipeMaterialOptions }: Props) {
  const form = Form.useFormInstance();
  const pipeLambdaMode = Form.useWatch('pipe_lambda_mode', form);
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps('pipe', fieldId, { fieldInputSettings, form });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps('pipe', fieldId, { form });

  return (
    <>
      <Form.Item
        className="fit-label-form-item short-number-form-item helped-form-item"
        label={fieldLabel('wall_thickness_mm')}
        name="wall_thickness_mm"
        rules={heatCalcFormFieldRules(form, 'pipe', 'wall_thickness_mm')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="wall-thickness-input"
            {...numberInputProps('wall_thickness_mm')}
            unit="мм"
          />,
          fieldHelp('wall_thickness_mm'),
        )}
      </Form.Item>
      <Form.Item
        className="compact-select-form-item helped-form-item"
        label={fieldLabel('pipe_lambda_mode')}
        name="pipe_lambda_mode"
        rules={heatCalcFormFieldRules(form, 'pipe', 'pipe_lambda_mode')}
      >
        {withHelp(
          <TltSelect
            data-testid="pipe-lambda-mode-select"
            {...selectInputProps('pipe_lambda_mode')}
            placeholder="Выберите режим"
            options={heatCalcSelectOptions('pipe', 'pipe_lambda_mode')}
          />,
          fieldHelp('pipe_lambda_mode'),
        )}
      </Form.Item>
      {pipeLambdaMode === 'manual' ? (
        <Form.Item
          className="fit-label-form-item helped-form-item"
          label={fieldLabel('pipe_lambda')}
          name="pipe_lambda"
          preserve={false}
          rules={heatCalcFormFieldRules(form, 'pipe', 'pipe_lambda')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="pipe-lambda-input"
              {...numberInputProps('pipe_lambda')}
              unit="Вт/мК"
            />,
            fieldHelp('pipe_lambda'),
          )}
        </Form.Item>
      ) : pipeLambdaMode === 'reference' ? (
        <Form.Item
          className="pipe-material-form-item reduced-select-form-item helped-form-item"
          label={fieldLabel('pipe_material')}
          name="pipe_material"
          preserve={false}
          rules={heatCalcFormFieldRules(form, 'pipe', 'pipe_material')}
        >
          {withHelp(
            <ReferencePicker
              data-testid="pipe-material-select"
              options={pipeMaterialOptions}
              placeholder="Выберите материал"
              modalTitle="Материал трубы"
              searchPlaceholder="Поиск материала трубы"
              {...heatCalcCustomControlRequiredProps(form, 'pipe', 'pipe_material')}
            />,
            fieldHelp('pipe_material'),
          )}
        </Form.Item>
      ) : null}
    </>
  );
}
