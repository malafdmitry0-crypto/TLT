import { Form, InputNumber, Select, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getInsulation } from '@/api/references';

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  );
}

function label(text: string, hint: string) {
  return (
    <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {text}
      </span>
      <HelpIcon text={hint} />
    </>
  );
}

export default function ThermalStep() {
  const { data: materials = [], isError, isFetching } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
  });

  return (
    <>
      <Form.Item
        label={label(
          'Толщина изоляции',
          'Толщина слоя тепловой изоляции. Диапазон: 1–500 мм.'
        )}
        name="insulation_thickness_mm"
        rules={[
          { required: true, message: 'Укажите толщину изоляции' },
          { type: 'number', min: 1, message: 'Минимальная толщина — 1 мм' },
          { type: 'number', max: 500, message: 'Максимальная толщина — 500 мм' },
        ]}
      >
        <InputNumber min={1} max={500} step={5} addonAfter="мм" />
      </Form.Item>

      <Form.Item
        className="wide-select-form-item"
        label="Материал изоляции"
        name="insulation_material"
        rules={[{ required: true, message: 'Выберите материал изоляции' }]}
      >
        <Select
          options={materials.map((m) => ({ value: m.material, label: m.name }))}
          placeholder="Выберите материал"
          loading={isFetching}
          notFoundContent={isError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
        />
      </Form.Item>

      <Form.Item
        label={label(
          'T° окр. среды',
          'Расчётная температура окружающей среды. Диапазон: −70°C … +70°C.'
        )}
        name="ambient_temperature"
        rules={[
          { required: true, message: 'Укажите температуру окружающей среды' },
          { type: 'number', min: -70, message: 'Минимальная температура среды: −70°C' },
          { type: 'number', max: 70, message: 'Максимальная температура среды: +70°C' },
        ]}
      >
        <InputNumber min={-70} max={70} addonAfter="°C" />
      </Form.Item>

      <Form.Item
        label={label(
          'T° продукта',
          'Температура транспортируемой/хранимой среды. Диапазон: −90°C … +600°C. Должна быть выше температуры окружающей среды.'
        )}
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
        <InputNumber min={-90} max={600} addonAfter="°C" />
      </Form.Item>
    </>
  );
}
