import { Form, InputNumber, Select } from 'antd';
import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const { data: materials = [], isError, isFetching } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
  });

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
          <InputNumber min={1} max={500} step={5} addonAfter="мм" />,
          'Толщина слоя тепловой изоляции. Диапазон: 1–500 мм.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('T° окр. среды')}
        name="ambient_temperature"
        rules={[
          { required: true, message: 'Укажите температуру окружающей среды' },
          { type: 'number', min: -70, message: 'Минимальная температура среды: −70°C' },
          { type: 'number', max: 70, message: 'Максимальная температура среды: +70°C' },
        ]}
      >
        {withHelp(
          <InputNumber min={-70} max={70} addonAfter="°C" />,
          'Расчётная температура окружающей среды. Диапазон: −70°C … +70°C.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item temperature-number-form-item helped-form-item"
        label={fieldLabel('T° продукта')}
        name="process_temperature"
        dependencies={['ambient_temperature']}
        rules={[
          { required: true, message: 'Укажите температуру продукта' },
          { type: 'number', min: -90, message: 'Минимальная температура продукта: −90°C' },
          { type: 'number', max: 600, message: 'Максимальная температура продукта: +600°C' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              const ambient = getFieldValue('ambient_temperature');
              if (value == null || ambient == null) return Promise.resolve();
              if (value <= ambient) {
                return Promise.reject(
                  new Error('Температура продукта должна быть выше температуры среды')
                );
              }
              return Promise.resolve();
            },
          }),
        ]}
      >
        {withHelp(
          <InputNumber min={-90} max={600} addonAfter="°C" />,
          'Температура транспортируемой/хранимой среды. Диапазон: −90°C … +600°C. Должна быть выше температуры окружающей среды.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item coefficient-form-item helped-form-item"
        label={fieldLabel('λ 1-го слоя')}
      >
        {withHelp(
          <InputNumber disabled value={0.045} min={0.005} max={5} step={0.001} addonAfter="Вт/мК" />,
          'Коэффициент теплопроводности первого слоя изоляции λ, Вт/(м·К). Для материала «Другое» по SRS нужно ручное значение 0,005…5,0.',
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
            options={materials.map((m) => ({ value: m.material, label: m.name }))}
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
