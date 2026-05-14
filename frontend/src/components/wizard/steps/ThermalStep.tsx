import { Form, InputNumber } from 'antd';
import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  buildInsulationReferenceOptions,
} from '@/utils/referenceOptions';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';
import ReferencePicker from '../ReferencePicker';
import InsulationTemperatureRangeField from '../InsulationTemperatureRangeField';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

interface Props {
  objectType: HeatCalcObjectType;
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

export default function ThermalStep({ objectType, fieldInputSettings }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps(objectType, fieldId, { fieldInputSettings });
  const insulationMaterial = Form.useWatch('insulation_material', form);
  const { data: materials = [], isError, isFetching } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const materialOptions = useMemo(
    () => [
      ...buildInsulationReferenceOptions(materials),
      { value: 'other', label: 'Другое' },
    ],
    [materials],
  );
  const selectedMaterial = materials.find((m) => m.material === insulationMaterial);
  const isOtherMaterial = insulationMaterial === 'other';

  return (
    <>
      <Form.Item
        className="fixed-select-form-item reduced-select-form-item layer-material-form-item first-layer-material-form-item helped-form-item"
        label={fieldLabel('Материал изоляции')}
        name="insulation_material"
        rules={[{ required: true, message: 'Выберите материал изоляции' }]}
      >
        {withHelp(
          <ReferencePicker
            data-testid="insulation-material-select"
            options={materialOptions}
            placeholder="Выберите материал"
            modalTitle="Материал изоляции"
            searchPlaceholder="Поиск материала"
            loading={isFetching}
            notFoundContent={isError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
            required
          />,
          'Материал основного слоя изоляции. Значение используется для выбора теплопроводности и расчёта теплопотерь.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item short-number-form-item helped-form-item"
        label={fieldLabel('Толщина изоляции')}
        name="insulation_thickness_mm"
        rules={heatCalcFormFieldRules(form, objectType, 'insulation_thickness_mm')}
      >
        {withHelp(
          <InputNumber
            data-testid="insulation-thickness-input"
            {...numberInputProps('insulation_thickness_mm')}
            addonAfter="мм"
          />,
          'Толщина слоя тепловой изоляции. Диапазон: 1–500 мм.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item coefficient-form-item helped-form-item"
        label={fieldLabel('λ 1-го слоя')}
        name={isOtherMaterial ? 'first_insulation_lambda' : undefined}
        preserve={false}
        rules={isOtherMaterial ? [
            { required: true, message: 'Укажите λ 1-го слоя' },
            { type: 'number', min: 0.001, message: 'Минимальная λ — 0,001 Вт/мК' },
            { type: 'number', max: 400, message: 'Максимальная λ — 400 Вт/мК' },
          ] : undefined}
      >
        {withHelp(
          <InputNumber
            data-testid="first-insulation-lambda-input"
            disabled={!isOtherMaterial}
            value={isOtherMaterial ? undefined : selectedMaterial?.conductivity}
            min={0.001}
            max={400}
            step={0.001}
            addonAfter="Вт/мК"
          />,
          isOtherMaterial
            ? 'Коэффициент теплопроводности первого слоя изоляции λ, Вт/(м·К). Для материала «Другое» вводится вручную: 0,001…400.'
            : 'Справочное значение λ первого слоя из выбранного материала изоляции.',
        )}
      </Form.Item>

      <InsulationTemperatureRangeField
        material={typeof insulationMaterial === 'string' ? insulationMaterial : undefined}
        selectedMaterial={selectedMaterial}
        minName="first_insulation_temperature_min"
        maxName="first_insulation_temperature_max"
        dataTestIdPrefix="first-insulation"
        hint="Температурный диапазон применения выбранного материала изоляции. Для материала «Другое» задаётся вручную."
      />
    </>
  );
}
