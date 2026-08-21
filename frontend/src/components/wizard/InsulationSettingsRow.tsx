import type { ReactElement } from 'react';
import { Form } from 'antd';
import { TltSelect } from '@/components/form-controls';
import {
  heatCalcFormFieldRules,
  heatCalcSelectInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}

export interface InsulationSettingsRowProps {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  watchedValues?: Record<string, unknown>;
}

/**
 * Режим tm only.
 * Количество слоёв задаётся в InsulationLayersTable («+» в шапке / «−» на строке).
 */
export default function InsulationSettingsRow({
  objectType,
  watchedValues,
}: InsulationSettingsRowProps) {
  const form = Form.useFormInstance();
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps(objectType, fieldId, { form });

  return (
    <div className="insulation-settings-row" data-testid="insulation-settings-row">
      <Form.Item
        className="fixed-select-form-item insulation-temperature-basis-form-item helped-form-item"
        label={fieldLabel('insulation_temperature_basis', objectType)}
        name="insulation_temperature_basis"
        rules={heatCalcFormFieldRules(form, objectType, 'insulation_temperature_basis')}
      >
        {withHelp(
          <TltSelect
            data-testid="insulation-temperature-basis-select"
            {...selectInputProps('insulation_temperature_basis')}
            placeholder="Выберите режим tm"
            options={heatCalcSelectOptions(
              objectType,
              'insulation_temperature_basis',
              watchedValues,
            )}
          />,
          fieldHelp('insulation_temperature_basis', objectType),
        )}
      </Form.Item>
    </div>
  );
}
