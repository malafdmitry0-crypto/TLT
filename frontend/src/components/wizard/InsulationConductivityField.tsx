import { Form } from 'antd';
import type { ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import FieldLabel from './FieldLabel';
import { FieldSourceTag } from './FieldSourceTag';
import HelpedControl from './HelpedControl';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function formatConductivity(value?: number) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Number(value.toFixed(4))} Вт/мК`;
}

interface Props {
  material?: string;
  selectedMaterial?: InsulationEntry;
  name: string;
  dataTestIdPrefix: string;
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  labelFieldId: string;
}

export default function InsulationConductivityField({
  material,
  selectedMaterial,
  name,
  dataTestIdPrefix,
  objectType,
  fieldInputSettings,
  labelFieldId,
}: Props) {
  const form = Form.useFormInstance();
  const label = (
    <FieldLabel text={getHeatCalcFieldLabel(labelFieldId, { context: 'form', objectType })} />
  );
  const hint = getHeatCalcFieldDescription(labelFieldId, {
    objectType,
    mode: material === 'other' ? 'manual' : 'reference',
  });

  if (material === 'other') {
    return (
      <Form.Item
        className="numeric-form-item coefficient-form-item helped-form-item field-source-form-item"
        label={label}
        name={name}
        preserve={false}
        extra={<FieldSourceTag source="manual" />}
        rules={heatCalcFormFieldRules(form, objectType, labelFieldId)}
      >
        {withHelp(
          <UnitInputNumber
            data-testid={`${dataTestIdPrefix}-lambda-input`}
            {...heatCalcNumberInputProps(objectType, labelFieldId, { fieldInputSettings, form })}
            unit="Вт/мК"
          />,
          hint,
        )}
      </Form.Item>
    );
  }

  const value = formatConductivity(selectedMaterial?.conductivity);
  return (
    <Form.Item
      className="coefficient-form-item insulation-reference-form-item helped-form-item"
      label={label}
    >
      {withHelp(
        <output
          className="insulation-reference-value"
          data-testid={`${dataTestIdPrefix}-lambda-reference`}
          aria-label={`Теплопроводность материала: ${value}`}
        >
          {value}
        </output>,
        hint,
      )}
    </Form.Item>
  );
}
