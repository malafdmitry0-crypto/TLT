import { Form, InputNumber, Select } from 'antd';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

export default function ThermalStep() {
  const form = Form.useFormInstance();
  const insulationMaterial = Form.useWatch('insulation_material', form);
  const { data: materials = [], isError, isFetching } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const materialOptions = [
    ...materials.map((m) => ({ value: m.material, label: m.name })),
    { value: 'other', label: 'Другое' },
  ];
  const selectedMaterial = materials.find((m) => m.material === insulationMaterial);
  const isOtherMaterial = insulationMaterial === 'other';

  return (
    <>
      <Form.Item
        className="numeric-form-item short-number-form-item helped-form-item"
        label={fieldLabel('Толщина изоляции')}
        name="insulation_thickness_mm"
        rules={[
          { required: true, message: 'Укажите толщину изоляции' },
          { type: 'number', min: 1, message: 'Минимальная толщина — 1 мм' },
          { type: 'number', max: 500, message: 'Максимальная толщина — 500 мм' },
        ]}
      >
        {withHelp(
          <InputNumber data-testid="insulation-thickness-input" min={1} max={500} step={5} addonAfter="мм" />,
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
          'Коэффициент теплопроводности первого слоя изоляции λ, Вт/(м·К). Для материала «Другое» вводится вручную: 0,001…400.',
        )}
      </Form.Item>

      <Form.Item
        className="fixed-select-form-item reduced-select-form-item helped-form-item"
        label={fieldLabel('Материал изоляции')}
        name="insulation_material"
        rules={[{ required: true, message: 'Выберите материал изоляции' }]}
      >
        {withHelp(
          <Select
            data-testid="insulation-material-select"
            options={materialOptions}
            placeholder="Выберите материал"
            loading={isFetching}
            notFoundContent={isError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
          />,
          'Материал основного слоя изоляции. Значение используется для выбора теплопроводности и расчёта теплопотерь.',
        )}
      </Form.Item>
    </>
  );
}
