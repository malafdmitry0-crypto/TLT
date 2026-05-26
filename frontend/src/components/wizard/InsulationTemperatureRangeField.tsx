import { EditOutlined } from '@ant-design/icons';
import { Form, Input, Modal } from 'antd';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import { validateHeatCalcField } from '@/domain/heatCalcFieldRules';
import type { HeatCalcObjectType } from '@/types/project';
import type { InsulationEntry } from '@/types/reference';
import { formatInsulationTemperatureRange } from '@/utils/referenceOptions';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form' })} />;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function numericValue(value: unknown) {
  if (!hasValue(value)) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatNumber(value: number) {
  return String(Number(value.toFixed(1)));
}

function formatEditableRange(min?: number, max?: number) {
  if (min == null || max == null) return undefined;
  return `${formatNumber(min)}...${formatNumber(max)} °C`;
}

type RangeModalValues = {
  min?: number;
  max?: number;
};

interface Props {
  material?: string;
  selectedMaterial?: InsulationEntry;
  minName: string;
  maxName: string;
  dataTestIdPrefix: string;
  objectType: HeatCalcObjectType;
  labelFieldId?: string;
  hint: string;
  required?: boolean;
  onRangeChange?: (changedValues: Record<string, unknown>) => void;
}

export default function InsulationTemperatureRangeField({
  selectedMaterial,
  minName,
  maxName,
  dataTestIdPrefix,
  objectType,
  labelFieldId = 'first_insulation_temperature_range',
  hint,
  required = false,
  onRangeChange,
}: Props) {
  const form = Form.useFormInstance();
  const [modalForm] = Form.useForm<RangeModalValues>();
  const [open, setOpen] = useState(false);
  const referenceRange = formatInsulationTemperatureRange(selectedMaterial?.temperature_range) ?? '—';
  const currentMin = numericValue(Form.useWatch(minName, form) ?? form.getFieldValue(minName));
  const currentMax = numericValue(Form.useWatch(maxName, form) ?? form.getFieldValue(maxName));
  const editableRange = formatEditableRange(currentMin, currentMax);
  const minInputConfig = getHeatCalcFieldInputConfig(minName);
  const maxInputConfig = getHeatCalcFieldInputConfig(maxName);
  const modalMinLimit = minInputConfig?.min ?? -273;
  const modalMaxLimit = maxInputConfig?.max ?? 1000;
  const minStep = minInputConfig?.default_step ?? 1;
  const maxStep = maxInputConfig?.default_step ?? minStep;
  const rangeLimitMessage = `Допустимо ${modalMinLimit}...${modalMaxLimit} °C`;
  const rangeValidator = (currentName: string) => ({
    validator(_: unknown, value: unknown) {
      const values = {
        ...form.getFieldsValue(true),
        [currentName]: value,
      };
      const error = validateHeatCalcField(
        labelFieldId,
        undefined,
        { objectType, values },
        { enforceRequired: false },
      );
      if (error) return Promise.reject(new Error(error));
      return Promise.resolve();
    },
  });
  const modalRangeValidator = (isMin: boolean) => ({
    validator(_: unknown, value: unknown) {
      const pairValue = modalForm.getFieldValue(isMin ? 'max' : 'min');
      if (!hasValue(value) || !hasValue(pairValue)) return Promise.resolve();
      const min = Number(isMin ? value : pairValue);
      const max = Number(isMin ? pairValue : value);
      if (Number.isFinite(min) && Number.isFinite(max) && min >= max) {
        return Promise.reject(new Error('Нижняя граница должна быть меньше верхней'));
      }
      return Promise.resolve();
    },
  });

  function openRangeModal() {
    modalForm.setFieldsValue({
      min: numericValue(form.getFieldValue(minName)),
      max: numericValue(form.getFieldValue(maxName)),
    });
    setOpen(true);
  }

  async function applyRange() {
    const values = await modalForm.validateFields();
    form.setFieldsValue({
      [minName]: values.min,
      [maxName]: values.max,
    });
    onRangeChange?.({
      [minName]: values.min,
      [maxName]: values.max,
    });
    await form.validateFields([minName, maxName]).catch(() => undefined);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openRangeModal();
    }
  }

  return (
    <>
      <Form.Item
        className={[
          'fit-label-form-item',
          'insulation-temperature-range-form-item',
          'helped-form-item',
        ].filter(Boolean).join(' ')}
        label={fieldLabel(labelFieldId)}
        name={minName}
        preserve={false}
        rules={[rangeValidator(minName)]}
      >
        {withHelp(
          <button
            type="button"
            className={[
              'reference-picker-control',
              'temperature-range-picker-control',
              editableRange ? '' : 'reference-picker-control--empty',
              required ? 'reference-picker-control--required' : '',
            ].filter(Boolean).join(' ')}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-required={required}
            title={editableRange ?? referenceRange ?? 'Задать диапазон T'}
            data-testid={`${dataTestIdPrefix}-temperature-range-button`}
            onClick={openRangeModal}
            onKeyDown={handleKeyDown}
          >
            <span className="reference-picker-value">
              {editableRange ?? referenceRange ?? (
                <span className="reference-picker-placeholder">Задать</span>
              )}
            </span>
            <EditOutlined className="reference-picker-icon" />
          </button>,
          hint,
        )}
      </Form.Item>

      <Form.Item
        name={maxName}
        hidden
        preserve={false}
        rules={[rangeValidator(maxName)]}
      >
        <Input />
      </Form.Item>

      <Modal
        title="Диапазон температуры"
        open={open}
        okText="Применить"
        cancelText="Отмена"
        destroyOnHidden
        className="temperature-range-modal"
        onOk={applyRange}
        onCancel={() => setOpen(false)}
      >
        <Form form={modalForm} layout="vertical" className="temperature-range-modal-form">
          <Form.Item
            label="От"
            name="min"
            rules={[
              { required: true, message: 'Укажите нижнюю границу' },
              { type: 'number', min: modalMinLimit, max: modalMaxLimit, message: rangeLimitMessage },
              modalRangeValidator(true),
            ]}
          >
            <UnitInputNumber
              data-testid={`${dataTestIdPrefix}-temperature-min-input`}
              min={modalMinLimit}
              max={modalMaxLimit}
              step={minStep}
                    unit="°C"
            />
          </Form.Item>
          <Form.Item
            label="До"
            name="max"
            rules={[
              { required: true, message: 'Укажите верхнюю границу' },
              { type: 'number', min: modalMinLimit, max: modalMaxLimit, message: rangeLimitMessage },
              modalRangeValidator(false),
            ]}
          >
            <UnitInputNumber
              data-testid={`${dataTestIdPrefix}-temperature-max-input`}
              min={modalMinLimit}
              max={modalMaxLimit}
              step={maxStep}
                    unit="°C"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
