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
      <Form.Item className="fixed-select-form-item helped-form-item" label={fieldLabel('Форма резервуара')} name="shape" initialValue="cylindrical">
        {withHelp(
          <Select options={SHAPE_OPTIONS} />,
          'Форма резервуара определяет набор геометрических размеров, необходимых для расчёта площади поверхности.',
        )}
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
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Ø')}
                  name="diameter_mm"
                  rules={[
                    { required: true, message: 'Укажите диаметр' },
                    { type: 'number', min: 10.8, message: 'Минимальный диаметр — 10,8 мм' },
                    { type: 'number', max: 3000, message: 'Максимальный диаметр — 3000 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={10.8} max={3000} step={1} addonAfter="мм" />,
                    'Внешний диаметр резервуара Ø, мм. Обязателен для цилиндрической и сферической форм. Диапазон ТНП: 10,8–3000 мм.',
                  )}
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Высота')}
                  name="height_mm"
                  rules={[
                    { required: true, message: 'Укажите высоту' },
                    { type: 'number', min: 500, message: 'Минимальная высота — 500 мм' },
                    { type: 'number', max: 200000000, message: 'Максимальная высота — 200 000 м' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={500} max={200000000} step={100} addonAfter="мм" />,
                    'Высота резервуара. Обязательна для цилиндрической и прямоугольной форм. Диапазон ТНП: 0,5–200 000 м.',
                  )}
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Длина')}
                  name="length_mm"
                  rules={[
                    { required: true, message: 'Укажите длину' },
                    { type: 'number', min: 1, message: 'Минимальная длина — 1 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={1} step={100} addonAfter="мм" />,
                    'Длина прямоугольного резервуара L, мм. В новых переменных ТНП отдельный диапазон для L не задан.',
                  )}
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Ширина')}
                  name="width_mm"
                  rules={[
                    { required: true, message: 'Укажите ширину' },
                    { type: 'number', min: 1, message: 'Минимальная ширина — 1 мм' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={1} step={100} addonAfter="мм" />,
                    'Ширина прямоугольного резервуара B, мм. В новых переменных ТНП отдельный диапазон для B не задан.',
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
