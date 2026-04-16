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
      <InfoCircleOutlined style={{ color: '#8c8c8c', marginLeft: 4, cursor: 'help' }} />
    </Tooltip>
  );
}

function label(text: string, hint: string) {
  return (
    <span>
      {text}
      <HelpIcon text={hint} />
    </span>
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
                    'Диаметр, мм',
                    'Внешний диаметр резервуара. Обязателен для цилиндрической и сферической форм.'
                  )}
                  name="diameter_mm"
                  rules={[
                    { required: true, message: 'Укажите диаметр' },
                    { type: 'number', min: 1, message: 'Диаметр должен быть больше 0' },
                  ]}
                >
                  <InputNumber min={1} step={100} style={{ width: '100%' }} addonAfter="мм" />
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  label={label(
                    'Высота, мм',
                    'Высота резервуара. Обязательна для цилиндрической и прямоугольной форм.'
                  )}
                  name="height_mm"
                  rules={[
                    { required: true, message: 'Укажите высоту' },
                    { type: 'number', min: 1, message: 'Высота должна быть больше 0' },
                  ]}
                >
                  <InputNumber min={1} step={100} style={{ width: '100%' }} addonAfter="мм" />
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  label={label('Длина, мм', 'Длина прямоугольного резервуара.')}
                  name="length_mm"
                  rules={[
                    { required: true, message: 'Укажите длину' },
                    { type: 'number', min: 1, message: 'Длина должна быть больше 0' },
                  ]}
                >
                  <InputNumber min={1} step={100} style={{ width: '100%' }} addonAfter="мм" />
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  label={label('Ширина, мм', 'Ширина прямоугольного резервуара.')}
                  name="width_mm"
                  rules={[
                    { required: true, message: 'Укажите ширину' },
                    { type: 'number', min: 1, message: 'Ширина должна быть больше 0' },
                  ]}
                >
                  <InputNumber min={1} step={100} style={{ width: '100%' }} addonAfter="мм" />
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>
    </>
  );
}
