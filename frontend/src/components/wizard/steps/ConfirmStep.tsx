import { useEffect, useRef } from 'react';
import { Form, Input, Descriptions, Alert } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import {
  generatePipeName,
  generateTankName,
  type PipeFormValues,
  type TankFormValues,
} from '@/utils/objectWizardUtils';

interface Props {
  objectType: ObjectType;
}

// Inner component with access to form instance via Form.useFormInstance
function ConfirmStepInner({ objectType }: Props) {
  const form = Form.useFormInstance();
  const values = Form.useWatch([], form);
  const prevSuggestedRef = useRef<string>('');

  // Build suggested name whenever params change
  const suggestedName = (() => {
    if (!values) return '';
    try {
      if (objectType === 'pipe') {
        return generatePipeName(values as PipeFormValues);
      } else {
        return generateTankName(values as TankFormValues);
      }
    } catch {
      return '';
    }
  })();

  // Auto-fill name when entering step for the first time, or if still matches the auto-generated pattern
  useEffect(() => {
    if (!suggestedName) return;
    const current = form.getFieldValue('name') as string | undefined;
    // Set name only if blank or if it equals the previous auto-suggestion (user hasn't customised)
    if (!current || current === prevSuggestedRef.current) {
      prevSuggestedRef.current = suggestedName;
      form.setFieldsValue({ name: suggestedName });
    }
  }, [suggestedName, form]);

  const getVal = (k: string) => form.getFieldValue(k) as unknown;

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="Проверьте параметры объекта"
        description="Теплопотери будут рассчитаны автоматически после сохранения."
        style={{ marginBottom: 16 }}
      />

      {objectType === 'pipe' ? (
        <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Наружный диаметр">{getVal('outer_diameter_mm') as number} мм</Descriptions.Item>
          <Descriptions.Item label="Длина">{getVal('pipe_length') as number} м</Descriptions.Item>
          <Descriptions.Item label="Толщина изоляции">{getVal('insulation_thickness_mm') as number} мм</Descriptions.Item>
          <Descriptions.Item label="Материал изоляции">{getVal('insulation_material') as string}</Descriptions.Item>
          <Descriptions.Item label="Т° среды">{getVal('ambient_temperature') as number}°C</Descriptions.Item>
          <Descriptions.Item label="Т° поддержания">{getVal('process_temperature') as number}°C</Descriptions.Item>
        </Descriptions>
      ) : (
        <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Форма">
            {{ cylindrical: 'Цилиндрическая', rectangular: 'Параллелепипед', spherical: 'Сферическая' }[getVal('shape') as string] ?? String(getVal('shape'))}
          </Descriptions.Item>
          {getVal('diameter_mm') != null && (
            <Descriptions.Item label="Диаметр">{getVal('diameter_mm') as number} мм</Descriptions.Item>
          )}
          {getVal('height_mm') != null && (
            <Descriptions.Item label="Высота">{getVal('height_mm') as number} мм</Descriptions.Item>
          )}
          {getVal('length_mm') != null && (
            <Descriptions.Item label="Длина">{getVal('length_mm') as number} мм</Descriptions.Item>
          )}
          {getVal('width_mm') != null && (
            <Descriptions.Item label="Ширина">{getVal('width_mm') as number} мм</Descriptions.Item>
          )}
          <Descriptions.Item label="Толщина изоляции">{getVal('insulation_thickness_mm') as number} мм</Descriptions.Item>
          <Descriptions.Item label="Материал изоляции">{getVal('insulation_material') as string}</Descriptions.Item>
          <Descriptions.Item label="Т° среды">{getVal('ambient_temperature') as number}°C</Descriptions.Item>
          <Descriptions.Item label="Т° поддержания">{getVal('process_temperature') as number}°C</Descriptions.Item>
        </Descriptions>
      )}

      <Form.Item
        label="Наименование объекта"
        name="name"
        rules={[{ required: true, message: 'Укажите наименование объекта' }]}
        extra="Наименование генерируется автоматически из параметров. Вы можете изменить его."
      >
        <Input placeholder="Напр.: Труба DN100 участок 1" />
      </Form.Item>
    </>
  );
}

export default function ConfirmStep({ objectType }: Props) {
  return <ConfirmStepInner objectType={objectType} />;
}
