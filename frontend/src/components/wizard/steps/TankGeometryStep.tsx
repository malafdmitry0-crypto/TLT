import { Form, InputNumber, Select } from 'antd';
import type { ReactElement } from 'react';
import HelpedControl from '../HelpedControl';
import FieldLabel from '../FieldLabel';

const SHAPE_OPTIONS = [
  { value: 'cylindrical', label: 'Цилиндрическая' },
  { value: 'rectangular', label: 'Параллелепипед' },
  { value: 'spherical', label: 'Сферическая' },
];

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

export default function TankGeometryStep() {
  return (
    <>
      <Form.Item className="fixed-select-form-item" label={fieldLabel('Форма резервуара')} name="shape" initialValue="cylindrical">
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
                  className="helped-form-item"
                  label={fieldLabel('Ø')}
                  name="diameter_mm"
                  rules={[
                    { required: true, message: 'Укажите диаметр' },
                    { type: 'number', min: 100, message: 'Минимальный диаметр — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальный диаметр — 50 000 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={100} max={50000} step={100} addonAfter="мм" />,
                    'Внешний диаметр резервуара Ø, мм. Обязателен для цилиндрической и сферической форм. Диапазон: 100–50 000 мм.',
                  )}
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  className="helped-form-item"
                  label={fieldLabel('Высота')}
                  name="height_mm"
                  rules={[
                    { required: true, message: 'Укажите высоту' },
                    { type: 'number', min: 100, message: 'Минимальная высота — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная высота — 50 000 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={100} max={50000} step={100} addonAfter="мм" />,
                    'Высота резервуара. Обязательна для цилиндрической и прямоугольной форм. Диапазон: 100–50 000 мм.',
                  )}
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  className="helped-form-item"
                  label={fieldLabel('Длина')}
                  name="length_mm"
                  rules={[
                    { required: true, message: 'Укажите длину' },
                    { type: 'number', min: 100, message: 'Минимальная длина — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная длина — 50 000 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={100} max={50000} step={100} addonAfter="мм" />,
                    'Длина прямоугольного резервуара. Диапазон: 100–50 000 мм.',
                  )}
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  className="helped-form-item"
                  label={fieldLabel('Ширина')}
                  name="width_mm"
                  rules={[
                    { required: true, message: 'Укажите ширину' },
                    { type: 'number', min: 100, message: 'Минимальная ширина — 100 мм' },
                    { type: 'number', max: 50000, message: 'Максимальная ширина — 50 000 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={100} max={50000} step={100} addonAfter="мм" />,
                    'Ширина прямоугольного резервуара. Диапазон: 100–50 000 мм.',
                  )}
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>
    </>
  );
}
