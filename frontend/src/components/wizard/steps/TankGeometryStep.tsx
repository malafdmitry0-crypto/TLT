import { Form, InputNumber, Select } from 'antd';
import type { ReactElement } from 'react';
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
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

interface Props {
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

export default function TankGeometryStep({ fieldInputSettings }: Props) {
  const form = Form.useFormInstance();
  const numberInputProps = (fieldId: string) =>
    heatCalcNumberInputProps('tank', fieldId, { fieldInputSettings });

  return (
    <>
      <Form.Item
        className="fixed-select-form-item helped-form-item"
        label={fieldLabel('Форма резервуара')}
        name="shape"
        rules={[{ required: true, message: 'Выберите форму резервуара' }]}
      >
        {withHelp(
          <Select data-testid="tank-shape-select" options={SHAPE_OPTIONS} placeholder="Выберите форму" />,
          'Форма резервуара определяет набор геометрических размеров, необходимых для расчёта площади поверхности.',
        )}
      </Form.Item>

      <Form.Item
        noStyle
        shouldUpdate={(prev, cur) => prev.shape !== cur.shape}
      >
        {({ getFieldValue }) => {
          const shape: string | undefined = getFieldValue('shape');
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
                  rules={heatCalcFormFieldRules(form, 'tank', 'diameter_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-diameter-input"
                      {...numberInputProps('diameter_mm')}
                      addonAfter="мм"
                    />,
                    'Внешний диаметр резервуара Ø, мм. Обязателен для цилиндрической и сферической форм. Диапазон ТНП: 10,8–3000 мм.',
                  )}
                </Form.Item>
              )}

              {needHeight && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Высота')}
                  name="height_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'height_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-height-input"
                      {...numberInputProps('height_mm')}
                      addonAfter="мм"
                    />,
                    'Высота резервуара. Обязательна для цилиндрической и прямоугольной форм. Диапазон ТНП: 500–200 000 мм.',
                  )}
                </Form.Item>
              )}

              {needLength && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Длина')}
                  name="length_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'length_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-length-input"
                      {...numberInputProps('length_mm')}
                      addonAfter="мм"
                    />,
                    'Длина прямоугольного резервуара L, мм. В новых переменных ТНП отдельный диапазон для L не задан.',
                  )}
                </Form.Item>
              )}

              {needWidth && (
                <Form.Item
                  className="numeric-form-item tank-size-form-item helped-form-item"
                  label={fieldLabel('Ширина')}
                  name="width_mm"
                  rules={heatCalcFormFieldRules(form, 'tank', 'width_mm')}
                >
                  {withHelp(
                    <InputNumber
                      data-testid="tank-width-input"
                      {...numberInputProps('width_mm')}
                      addonAfter="мм"
                    />,
                    'Ширина прямоугольного резервуара B, мм. В новых переменных ТНП отдельный диапазон для B не задан.',
                  )}
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>

      <Form.Item
        className="numeric-form-item tank-size-form-item helped-form-item"
        label={fieldLabel('Стенка')}
        name="wall_thickness_mm"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_thickness_mm')}
      >
        {withHelp(
          <InputNumber
            data-testid="tank-wall-thickness-input"
            {...numberInputProps('wall_thickness_mm')}
            addonAfter="мм"
          />,
          'Толщина стенки резервуара. Если задана вместе с λ стенки, учитывается как δ/λ в теплопотерях.',
        )}
      </Form.Item>

      <Form.Item
        className="numeric-form-item tank-size-form-item helped-form-item"
        label={fieldLabel('λ стенки')}
        name="wall_lambda"
        rules={heatCalcFormFieldRules(form, 'tank', 'wall_lambda')}
      >
        {withHelp(
          <InputNumber
            data-testid="tank-wall-lambda-input"
            {...numberInputProps('wall_lambda')}
            addonAfter="Вт/мК"
          />,
          'Теплопроводность стенки резервуара. Работает в паре с толщиной стенки.',
        )}
      </Form.Item>
    </>
  );
}
