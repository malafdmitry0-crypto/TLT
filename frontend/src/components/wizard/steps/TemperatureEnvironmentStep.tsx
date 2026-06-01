import type { ReactElement } from 'react';
import { Form, Input, Tag } from 'antd';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectInputProps,
  heatCalcSelectOptions,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';
import ReferencePicker, { type ReferencePickerOption } from '../ReferencePicker';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType: HeatCalcObjectType) {
  return getHeatCalcFieldDescription(fieldId, { objectType });
}

function sourceTag(source: unknown) {
  if (source === 'climate') return <Tag className="field-source-tag">из климата</Tag>;
  if (source === 'manual') return <Tag className="field-source-tag">вручную</Tag>;
  return null;
}

function FieldSourceTag({
  name,
  fallback,
}: {
  name: string;
  fallback?: unknown;
}) {
  const form = Form.useFormInstance();
  const source = Form.useWatch(name, form);
  return sourceTag(source ?? fallback);
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  climateOptions: ReferencePickerOption[];
  isClimateFetching: boolean;
  onClimatePickerOpen?: () => void;
  hasClimate: boolean;
  climateBasisDisplay: string;
  watchedValues?: Record<string, unknown>;
  showWindField: boolean;
  showAlphaField: boolean;
  ambientTemperatureSourceFallback?: unknown;
  windSpeedSourceFallback?: unknown;
}

export default function TemperatureEnvironmentStep({
  objectType,
  fieldInputSettings,
  climateOptions,
  isClimateFetching,
  onClimatePickerOpen,
  hasClimate,
  climateBasisDisplay,
  watchedValues,
  showWindField,
  showAlphaField,
  ambientTemperatureSourceFallback,
  windSpeedSourceFallback,
}: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });
  const selectInputProps = (fieldId: string) =>
    heatCalcSelectInputProps(objectType, fieldId, { form });

  return (
    <>
      <h4 data-step={4}><span>Температура и среда</span></h4>
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item helped-form-item"
        label={fieldLabel('climate_key', objectType)}
        name="climate_key"
      >
        {withHelp(
          <ReferencePicker
            data-testid="climate-select"
            allowClear
            options={climateOptions}
            loading={isClimateFetching}
            onOpen={onClimatePickerOpen}
            placeholder="Выберите город"
            modalTitle="Климат"
            searchPlaceholder="Город или регион"
            groupFilterPlaceholder="Область или край"
          />,
          fieldHelp('climate_key', objectType),
        )}
      </Form.Item>
      {hasClimate && (
        <Form.Item
          className="compact-select-form-item helped-form-item"
          label={fieldLabel('climate_temperature_basis', objectType)}
        >
          {withHelp(
            <Input
              data-testid="climate-basis-display"
              readOnly
              value={climateBasisDisplay}
            />,
            `${fieldHelp('climate_temperature_basis', objectType)} Значение применяется автоматически по алгоритму климата.`,
          )}
        </Form.Item>
      )}
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
      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('ambient_temperature', objectType)}
        name="ambient_temperature"
        extra={
          <FieldSourceTag
            name="ambient_temperature_source"
            fallback={ambientTemperatureSourceFallback}
          />
        }
        rules={heatCalcFormFieldRules(form, objectType, 'ambient_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="ambient-temperature-input"
            {...numberInputProps('ambient_temperature')}
            unit="°C"
          />,
          fieldHelp('ambient_temperature', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('process_temperature', objectType)}
        name="process_temperature"
        dependencies={['ambient_temperature']}
        rules={heatCalcFormFieldRules(form, objectType, 'process_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="process-temperature-input"
            {...numberInputProps('process_temperature')}
            unit="°C"
          />,
          fieldHelp('process_temperature', objectType),
        )}
      </Form.Item>
      {showWindField && (
        <Form.Item
          className="numeric-form-item short-number-form-item helped-form-item"
          label={fieldLabel('wind_speed', objectType)}
          name="wind_speed"
          preserve={false}
          extra={
            <FieldSourceTag
              name="wind_speed_source"
              fallback={windSpeedSourceFallback}
            />
          }
          rules={[
            ...heatCalcFormFieldRules(form, objectType, 'wind_speed'),
          ]}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="wind-speed-input"
              {...numberInputProps('wind_speed')}
              unit="м/с"
            />,
            fieldHelp('wind_speed', objectType),
          )}
        </Form.Item>
      )}
      {showAlphaField && (
        <Form.Item
          className="numeric-form-item coefficient-form-item alpha-vnesh-form-item helped-form-item"
          label={fieldLabel('alpha_vnesh', objectType)}
          name="alpha_vnesh"
          preserve={false}
          rules={heatCalcFormFieldRules(form, objectType, 'alpha_vnesh')}
        >
          {withHelp(
            <UnitInputNumber
              data-testid="alpha-vnesh-input"
              {...numberInputProps('alpha_vnesh')}
              unit="Вт/м²К"
            />,
            fieldHelp('alpha_vnesh', objectType),
          )}
        </Form.Item>
      )}
      <Form.Item
        className="numeric-form-item temperature-number-form-item max-ambient-temperature-form-item helped-form-item"
        label={fieldLabel('max_ambient_temperature', objectType)}
        name="max_ambient_temperature"
        rules={heatCalcFormFieldRules(form, objectType, 'max_ambient_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="max-ambient-temperature-input"
            {...numberInputProps('max_ambient_temperature')}
            unit="°C"
          />,
          fieldHelp('max_ambient_temperature', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('max_process_temperature', objectType)}
        name="max_process_temperature"
        rules={heatCalcFormFieldRules(form, objectType, 'max_process_temperature')}
      >
        {withHelp(
          <UnitInputNumber
            data-testid="max-process-temperature-input"
            {...numberInputProps('max_process_temperature')}
            unit="°C"
          />,
          fieldHelp('max_process_temperature', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="medium-select-form-item environment-form-item helped-form-item"
        label={fieldLabel('environment', objectType)}
        name="environment"
      >
        {withHelp(
          <TltSelect
            data-testid="environment-select"
            {...selectInputProps('environment')}
            options={heatCalcSelectOptions(objectType, 'environment')}
            placeholder="Выберите среду"
          />,
          fieldHelp('environment', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="medium-select-form-item zone-classification-form-item helped-form-item"
        label={fieldLabel('zone_classification', objectType)}
        name="zone_classification"
      >
        {withHelp(
          <TltSelect
            data-testid="zone-classification-select"
            {...selectInputProps('zone_classification')}
            options={heatCalcSelectOptions(objectType, 'zone_classification')}
            placeholder="Выберите зону"
          />,
          fieldHelp('zone_classification', objectType),
        )}
      </Form.Item>
      <Form.Item
        className="temperature-group-form-item helped-form-item"
        label={fieldLabel('temperature_group', objectType)}
        name="temperature_group"
      >
        {withHelp(
          <TltSelect
            data-testid="temperature-group-select"
            {...selectInputProps('temperature_group')}
            options={heatCalcSelectOptions(objectType, 'temperature_group')}
            placeholder="Выберите"
          />,
          fieldHelp('temperature_group', objectType),
        )}
      </Form.Item>
    </>
  );
}
