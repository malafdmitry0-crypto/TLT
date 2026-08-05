import { useEffect, useRef } from 'react';
import { Form, Descriptions } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import {
  generatePipeName,
  generateTankName,
  type PipeNameFields,
  type TankNameFields,
} from '@/utils/objectWizardUtils';
import '../wizard-chrome.css';
import { TltAlert, TltTextField } from '@/components/ui-kit';

interface Props {
  objectType: ObjectType;
}

/** Watched fields used only for auto-name preview (union of pipe/tank name inputs). */
type ConfirmStepWatchedValues = PipeNameFields & TankNameFields;

const CONFIRM_STEP_WATCH_FIELDS = [
  'ambient_temperature',
  'diameter_mm',
  'height_mm',
  'insulation_material',
  'insulation_thickness_mm',
  'length_mm',
  'outer_diameter_mm',
  'pipe_length',
  'process_temperature',
  'shape',
  'width_mm',
] as const;

function selectConfirmStepWatchedValues(values: Record<string, unknown> = {}): ConfirmStepWatchedValues {
  return Object.fromEntries(
    CONFIRM_STEP_WATCH_FIELDS.map((fieldName) => [fieldName, values[fieldName]]),
  ) as ConfirmStepWatchedValues;
}

// Inner component with access to form instance via Form.useFormInstance
function ConfirmStepInner({ objectType }: Props) {
  const form = Form.useFormInstance();
  const values = Form.useWatch(selectConfirmStepWatchedValues, form) as ConfirmStepWatchedValues | undefined;
  const prevSuggestedRef = useRef<string>('');

  // Build suggested name whenever params change
  const suggestedName = (() => {
    if (!values) return '';
    try {
      if (objectType === 'pipe') {
        return generatePipeName(values);
      } else {
        return generateTankName(values);
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
      <TltAlert
        tone="info"
        title="Проверьте параметры объекта"
        className="wizard-confirm-alert"
      >
        Теплопотери будут рассчитаны автоматически после сохранения.
      </TltAlert>

      {objectType === 'pipe' ? (
        <Descriptions size="small" column={2} bordered className="wizard-confirm-block">
          <Descriptions.Item label="Наружный диаметр">{getVal('outer_diameter_mm') as number} мм</Descriptions.Item>
          <Descriptions.Item label="Длина">{getVal('pipe_length') as number} м</Descriptions.Item>
          <Descriptions.Item label="Толщина изоляции">{getVal('insulation_thickness_mm') as number} мм</Descriptions.Item>
          <Descriptions.Item label="Материал изоляции">{getVal('insulation_material') as string}</Descriptions.Item>
          <Descriptions.Item label="Т° среды">{getVal('ambient_temperature') as number}°C</Descriptions.Item>
          <Descriptions.Item label="Т° поддержания">{getVal('process_temperature') as number}°C</Descriptions.Item>
        </Descriptions>
      ) : (
        <Descriptions size="small" column={2} bordered className="wizard-confirm-block">
          <Descriptions.Item label="Форма">
            {{ cylindrical: 'Цилиндрическая', rectangular: 'Параллелепипед' }[getVal('shape') as string] ?? String(getVal('shape'))}
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
        <TltTextField placeholder="Напр.: Труба DN100 участок 1" />
      </Form.Item>
    </>
  );
}

export default function ConfirmStep({ objectType }: Props) {
  return <ConfirmStepInner objectType={objectType} />;
}
