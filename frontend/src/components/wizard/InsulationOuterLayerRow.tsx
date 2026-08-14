/**
 * Outer insulation layer rows (layer 2 / 3) for InsulationLayersTable (P-BAND-19).
 */
import type { FormInstance } from 'antd';
import { Form } from 'antd';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  heatCalcCustomControlRequiredProps,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import InsulationConductivityField from './InsulationConductivityField';
import { FieldSourceTag } from './FieldSourceTag';
import InsulationTemperatureRangeField from './InsulationTemperatureRangeField';
import ReferencePicker, { type ReferencePickerOption } from './ReferencePicker';
import type { OuterInsulationLayerConfig } from './insulationOuterLayerConfig';
import type { ReactElement, ReactNode } from 'react';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

function Cell({
  role,
  children,
}: {
  role: 'index' | 'material' | 'thickness' | 'lambda' | 'range';
  children: ReactNode;
}) {
  return (
    <div className={`insulation-layer-cell insulation-layer-cell--${role}`} data-ins-cell={role}>
      {children}
    </div>
  );
}

export interface InsulationOuterLayerRowProps {
  config: OuterInsulationLayerConfig;
  form: FormInstance;
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  insulationMaterialOptions: ReferencePickerOption[];
  insulationMaterialsError: boolean;
  isInsulationMaterialsFetching: boolean;
  material?: string;
  selectedMaterial?: InsulationEntry;
  indexCell: ReactNode;
  active: boolean;
  onActivate: () => void;
  onProgrammaticValuesChange: (changedValues: Record<string, unknown>) => void;
}

export function InsulationOuterLayerRow({
  config,
  form,
  objectType,
  fieldInputSettings,
  insulationMaterialOptions,
  insulationMaterialsError,
  isInsulationMaterialsFetching,
  material,
  selectedMaterial,
  indexCell,
  active,
  onActivate,
  onProgrammaticValuesChange,
}: InsulationOuterLayerRowProps) {
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });

  return (
    <div
      className={`insulation-layer-group${active ? ' insulation-layer-group--active' : ''}`}
      data-layer={String(config.layer)}
      data-active={active ? 'true' : 'false'}
      onClick={onActivate}
      onFocusCapture={onActivate}
    >
      {indexCell}
      <Cell role="material">
        <Form.Item
          className={config.materialClassName}
          label={fieldLabel(config.materialField, objectType)}
          name={config.materialField}
          preserve={false}
          rules={heatCalcFormFieldRules(form, objectType, config.materialField)}
        >
          {withHelp(
            <ReferencePicker
              data-testid={config.materialTestId}
              options={insulationMaterialOptions}
              placeholder="Выберите материал"
              modalTitle={config.modalTitle}
              searchPlaceholder="Поиск материала"
              loading={isInsulationMaterialsFetching}
              notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
              {...heatCalcCustomControlRequiredProps(form, objectType, config.materialField)}
            />,
            fieldHelp(config.materialField, objectType),
          )}
        </Form.Item>
      </Cell>
      <Cell role="thickness">
        <Form.Item
          className={`${config.thicknessClassName} field-source-form-item`}
          label={fieldLabel(config.thicknessField, objectType)}
          name={config.thicknessField}
          preserve={false}
          extra={<FieldSourceTag source="manual" />}
          rules={heatCalcFormFieldRules(form, objectType, config.thicknessField)}
        >
          {withHelp(
            <UnitInputNumber
              data-testid={config.thicknessTestId}
              {...numberInputProps(config.thicknessField)}
              unit="мм"
            />,
            fieldHelp(config.thicknessField, objectType),
          )}
        </Form.Item>
      </Cell>
      <Cell role="lambda">
        <InsulationConductivityField
          material={material}
          selectedMaterial={selectedMaterial}
          name={config.lambdaField}
          dataTestIdPrefix={config.dataTestIdPrefix}
          objectType={objectType}
          fieldInputSettings={fieldInputSettings}
          labelFieldId={config.lambdaField}
        />
      </Cell>
      <Cell role="range">
        <InsulationTemperatureRangeField
          material={material}
          selectedMaterial={selectedMaterial}
          minName={config.tempMinField}
          maxName={config.tempMaxField}
          dataTestIdPrefix={config.dataTestIdPrefix}
          objectType={objectType}
          labelFieldId={config.tempRangeField}
          hint={fieldHelp(config.tempRangeField, objectType)}
          required={heatCalcCustomControlRequiredProps(form, objectType, config.tempRangeField).required}
          onRangeChange={onProgrammaticValuesChange}
        />
      </Cell>
    </div>
  );
}
