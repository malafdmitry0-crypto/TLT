import type { ReactElement } from 'react';
import { Form } from 'antd';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import { TltBadge } from '@/components/ui-kit';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
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
  if (source === 'climate') return <TltBadge className="field-source-tag">из климата</TltBadge>;
  if (source === 'manual') return <TltBadge className="field-source-tag">вручную</TltBadge>;
  return null;
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
  climateOptions: ReferencePickerOption[];
  isClimateFetching: boolean;
  onClimatePickerOpen?: () => void;
  showWindField: boolean;
  ambientTemperatureSourceFallback?: unknown;
  windSpeedSourceFallback?: unknown;
}

export default function TemperatureEnvironmentStep({
  objectType,
  fieldInputSettings,
  climateOptions,
  isClimateFetching,
  onClimatePickerOpen,
  showWindField,
  ambientTemperatureSourceFallback,
  windSpeedSourceFallback,
}: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings, form });
  // extra только при видимом теге: пустой .ant-form-item-extra резервирует ~24px
  // и ломает единый ритм строк [label | control] (HARD RULE 1 heat-object-fields)
  const ambientSource = Form.useWatch('ambient_temperature_source', form);
  const windSource = Form.useWatch('wind_speed_source', form);
  const ambientSourceTag = sourceTag(ambientSource ?? ambientTemperatureSourceFallback);
  const windSourceTag = sourceTag(windSource ?? windSpeedSourceFallback);

  return (
    <>
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item climate-form-item helped-form-item"
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
      <Form.Item
        className="numeric-form-item temperature-number-form-item ambient-temperature-form-item helped-form-item"
        label={fieldLabel('ambient_temperature', objectType)}
        name="ambient_temperature"
        extra={ambientSourceTag ?? undefined}
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
        className="numeric-form-item temperature-number-form-item process-temperature-form-item helped-form-item"
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
          className="numeric-form-item short-number-form-item wind-speed-form-item helped-form-item"
          label={fieldLabel('wind_speed', objectType)}
          name="wind_speed"
          preserve={false}
          extra={windSourceTag ?? undefined}
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
      {/* max_* и zone — не входы теплопотерь; round-trip в params.
          environment / temperature_group / электро-поля — в CableAlgorithmPanel. */}
      <Form.Item name="max_ambient_temperature" hidden>
        <UnitInputNumber data-testid="max-ambient-temperature-input" unit="°C" />
      </Form.Item>
      <Form.Item name="max_process_temperature" hidden>
        <UnitInputNumber data-testid="max-process-temperature-input" unit="°C" />
      </Form.Item>
      <Form.Item name="zone_classification" hidden>
        <TltSelect
          data-testid="zone-classification-select"
          options={heatCalcSelectOptions(objectType, 'zone_classification')}
        />
      </Form.Item>
    </>
  );
}
