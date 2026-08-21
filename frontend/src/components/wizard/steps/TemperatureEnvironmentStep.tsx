import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltSelect } from '@/components/form-controls';
import { TltForm } from '@/components/ui-kit';
import { heatCalcSelectOptions } from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import HeatFormField from '../HeatFormField';
import ReferencePicker, { type ReferencePickerOption } from '../ReferencePicker';

/**
 * Откуда взято значение: климатический справочник или ручной ввод (кейс 1 §5,
 * «Источник температуры» — нужен, чтобы обосновать цифру перед заказчиком).
 * Метка рисуется только при известном источнике: пустой `.ant-form-item-extra`
 * резервирует ~24px и ломает ритм строк [label | control].
 */
function sourceTag(source: unknown) {
  if (source === 'climate') return <span className="field-source-tag">из климата</span>;
  if (source === 'manual') return <span className="field-source-tag">вручную</span>;
  return undefined;
}

interface Props {
  objectType: HeatCalcObjectType;
  /**
   * Пофилдовые значения добавлены к прежним: числовой блок макета чередует
   * температуры с геометрией, поэтому слоты забирают поля по одному.
   * Старые `temperatures` и `wind` продолжают отдавать свою пару — боковая
   * раскладка и прочие вызовы не меняются.
   */
  part?:
    | 'all' | 'wide' | 'temperatures' | 'wind'
    | 'ambient' | 'process' | 'wind-speed' | 'alpha';
  fieldInputSettings?: HeatCalcFieldInputSettings;
  climateOptions: ReferencePickerOption[];
  isClimateFetching: boolean;
  onClimatePickerOpen?: () => void;
  showWindField: boolean;
  /** Источник до того, как `Form.useWatch` увидит initial values. */
  ambientTemperatureSourceFallback?: unknown;
  windSpeedSourceFallback?: unknown;
}

export default function TemperatureEnvironmentStep({
  objectType,
  part = 'all',
  fieldInputSettings,
  climateOptions,
  isClimateFetching,
  onClimatePickerOpen,
  showWindField,
  ambientTemperatureSourceFallback,
  windSpeedSourceFallback,
}: Props) {
  const form = TltForm.useFormInstance();
  const placement = TltForm.useWatch('placement', form) ?? form.getFieldValue('placement');
  const isUndergroundPipe = objectType === 'pipe' && placement === 'underground';
  // Источник виден всегда: пустое или очищенное поле заполняет инженер вручную.
  const ambientSource = TltForm.useWatch('ambient_temperature_source', form)
    ?? ambientTemperatureSourceFallback ?? 'manual';
  const windSource = TltForm.useWatch('wind_speed_source', form)
    ?? windSpeedSourceFallback ?? 'manual';
  const wants = (field: 'ambient' | 'process' | 'wind-speed' | 'alpha') =>
    part === 'all'
    || part === field
    || (part === 'temperatures' && (field === 'ambient' || field === 'process'))
    || (part === 'wind' && (field === 'wind-speed' || field === 'alpha'));

  return (
    <>
      {(part === 'all' || part === 'wide') && (
        <HeatFormField
          id="climate_key"
          objectType={objectType}
          className="fixed-select-form-item reduced-select-form-item climate-form-item helped-form-item"
          rules={[]}
        >
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
          />
        </HeatFormField>
      )}
      {wants('ambient') && !isUndergroundPipe && (
        <HeatFormField
          id="ambient_temperature"
          objectType={objectType}
          className="numeric-form-item temperature-number-form-item ambient-temperature-form-item helped-form-item"
          testId="ambient-temperature-input"
          fieldInputSettings={fieldInputSettings}
          preserve={false}
          extra={sourceTag(ambientSource)}
        />
      )}
      {wants('process') && (
        <HeatFormField
          id="process_temperature"
          objectType={objectType}
          className="numeric-form-item temperature-number-form-item process-temperature-form-item helped-form-item"
          testId="process-temperature-input"
          fieldInputSettings={fieldInputSettings}
          dependencies={['ambient_temperature', 'ground_temperature']}
        />
      )}
      {wants('wind-speed') && showWindField && (
        <HeatFormField
          id="wind_speed"
          objectType={objectType}
          className="numeric-form-item short-number-form-item wind-speed-form-item helped-form-item"
          testId="wind-speed-input"
          fieldInputSettings={fieldInputSettings}
          preserve={false}
          extra={sourceTag(windSource)}
        />
      )}
      {wants('alpha') && objectType === 'pipe' && !isUndergroundPipe && (
        <HeatFormField
          id="alpha_vnesh"
          objectType={objectType}
          className="numeric-form-item coefficient-form-item alpha-vnesh-form-item helped-form-item"
          testId="alpha-vnesh-input"
          fieldInputSettings={fieldInputSettings}
          preserve={false}
        />
      )}
      {/* max_* и zone — не входы теплопотерь; round-trip в params.
          environment / temperature_group / электро-поля — в CableAlgorithmPanel. */}
      {(part === 'all' || part === 'wide') && (
        <>
          <TltForm.Item name="max_ambient_temperature" hidden>
            <UnitInputNumber data-testid="max-ambient-temperature-input" unit="°C" />
          </TltForm.Item>
          <TltForm.Item name="max_process_temperature" hidden>
            <UnitInputNumber data-testid="max-process-temperature-input" unit="°C" />
          </TltForm.Item>
          <TltForm.Item name="zone_classification" hidden>
            <TltSelect
              data-testid="zone-classification-select"
              options={heatCalcSelectOptions(objectType, 'zone_classification')}
            />
          </TltForm.Item>
        </>
      )}
    </>
  );
}
