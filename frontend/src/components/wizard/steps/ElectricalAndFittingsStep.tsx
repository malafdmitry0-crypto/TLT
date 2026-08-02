import { Form } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

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
}

/**
 * Локальные элементы трубы + q_доп резервуара.
 * Электропараметры алгоритма выбора кабеля вынесены в CableAlgorithmPanel
 * (правая форма HeatCalc). Hidden round-trip больше не нужен — те же Form.Item
 * живут в CableAlgorithmPanel внутри того же Form.
 */
export default function ElectricalAndFittingsStep({
  objectType,
  fieldInputSettings,
}: Props) {
  const form = Form.useFormInstance();
  const localElementCount = Number(
    Form.useWatch('num_local_elements', form) ?? form.getFieldValue('num_local_elements') ?? 0,
  );
  const numberInputProps = (
    fieldId: string,
    options: { includeStep?: boolean } = {},
  ) => heatCalcNumberInputProps(objectType, fieldId, {
    ...options,
    fieldInputSettings,
    form,
  });

  return (
    <>
      {objectType === 'tank' && (
        <Form.Item
          className="numeric-form-item coefficient-form-item tank-additional-heat-loss-form-item helped-form-item"
          label={fieldLabel('q_additional', objectType)}
          name="q_additional"
          preserve={false}
          rules={heatCalcFormFieldRules(form, objectType, 'q_additional')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="q-additional-input"
              {...numberInputProps('q_additional')}
              unit="Вт"
            />,
            fieldHelp('q_additional', objectType),
          )}
        </Form.Item>
      )}
      {objectType === 'pipe' && (
        <>
          <Form.Item
            className="numeric-form-item fitting-count-form-item local-elements-count-form-item helped-form-item"
            label={fieldLabel('num_local_elements', objectType)}
            name="num_local_elements"
            rules={heatCalcFormFieldRules(form, objectType, 'num_local_elements')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="local-elements-count-input"
                {...numberInputProps('num_local_elements')}
                unit="шт"
              />,
              fieldHelp('num_local_elements', objectType),
            )}
          </Form.Item>
          {Number.isFinite(localElementCount) && localElementCount > 0 && (
            <Form.Item
              className="numeric-form-item fitting-count-form-item local-element-equiv-length-form-item helped-form-item"
              label={fieldLabel('local_element_equiv_length', objectType)}
              name="local_element_equiv_length"
              preserve={false}
              rules={heatCalcFormFieldRules(form, objectType, 'local_element_equiv_length')}
            >
              {withHelp(
                <UnitInputNumber
                  data-testid="local-element-equiv-length-input"
                  {...numberInputProps('local_element_equiv_length')}
                  unit="м"
                />,
                fieldHelp('local_element_equiv_length', objectType),
              )}
            </Form.Item>
          )}
        </>
      )}
    </>
  );
}
