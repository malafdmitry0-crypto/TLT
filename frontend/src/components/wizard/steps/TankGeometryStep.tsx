import { Form, InputNumber, Select, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const SHAPE_OPTIONS = [
  { value: 'cylindrical', label: 'Цилиндрическая' },
  { value: 'rectangular', label: 'Параллелепипед' },
  { value: 'spherical', label: 'Сферическая' },
];

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

export default function TankGeometryStep() {
  return (
    <>
      <Form.Item label="Форма резервуара" name="shape" initialValue="cylindrical">
        <Select options={SHAPE_OPTIONS} />
      </Form.Item>

      <Form.Item
        noStyle
        shouldUpdate={(prev, cur) => prev.shape !== cur.shape}
      >
        {({ getFieldValue }) => {
          const shape: string = getFieldValue('shape') ?? 'cylindrical';
          const needDiameter = shape === 'cylindrical' || shape === 'spherical';
          const needHeight = shape === 'cylindrical' || shape === 'rectangular';
          const needLength = shape === 'rectangular';
          const needWidth = shape === 'rectangular';

          return (
            <>
              {needDiameter && (
                <Form.Item
                  label={label(
                    'Диаметр',
                    'Внешний диаметр резервуара. Обязателен для цилиндрической и сферической форм. Диапазон: 100–50 000 мм.'
                  )}
                  name="diameter_mm"
                  rules={[
                    { required: true, message: 'Укажите диаметр' },
                    { type: 'number', min: 100, message: 'Минимальный диаметр — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальный диаметр — 50 000 мм' },
                  ]}
                >
                  <InputNumber min={100} max={50000} step={100} addonAfter="мм" />
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  label={label(
                    'Высота',
                    'Высота резервуара. Обязательна для цилиндрической и прямоугольной форм. Диапазон: 100–50 000 мм.'
                  )}
                  name="height_mm"
                  rules={[
                    { required: true, message: 'Укажите высоту' },
                    { type: 'number', min: 100, message: 'Минимальная высота — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная высота — 50 000 мм' },
                  ]}
                >
                  <InputNumber min={100} max={50000} step={100} addonAfter="мм" />
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  label={label('Длина', 'Длина прямоугольного резервуара. Диапазон: 100–50 000 мм.')}
                  name="length_mm"
                  rules={[
                    { required: true, message: 'Укажите длину' },
                    { type: 'number', min: 100, message: 'Минимальная длина — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная длина — 50 000 мм' },
                  ]}
                >
                  <InputNumber min={100} max={50000} step={100} addonAfter="мм" />
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  label={label('Ширина', 'Ширина прямоугольного резервуара. Диапазон: 100–50 000 мм.')}
                  name="width_mm"
                  rules={[
                    { required: true, message: 'Укажите ширину' },
                    { type: 'number', min: 100, message: 'Минимальная ширина — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная ширина — 50 000 мм' },
                  ]}
                >
                  <InputNumber min={100} max={50000} step={100} addonAfter="мм" />
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>
    </>
  );
}
