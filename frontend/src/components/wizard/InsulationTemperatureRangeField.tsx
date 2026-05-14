import { EditOutlined } from '@ant-design/icons';
import { Form, Input, Modal } from 'antd';
import { useState, type KeyboardEvent, type ReactElement } from 'react';
import UnitInputNumber from '@/components/common/UnitInputNumber';
import {
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
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
  labelFieldId?: string;
  hint: string;
}

export default function InsulationTemperatureRangeField({
  material,
  selectedMaterial,
  minName,
  maxName,
  dataTestIdPrefix,
  labelFieldId = 'first_insulation_temperature_range',
  hint,
}: Props) {
  const form = Form.useFormInstance();
  const [modalForm] = Form.useForm<RangeModalValues>();
  const [open, setOpen] = useState(false);
  const isOtherMaterial = material === 'other';
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
  const rangeValidator = (pairName: string, isMin: boolean) => ({
    validator(_: unknown, value: unknown) {
      const pairValue = form.getFieldValue(pairName);
      if (!hasValue(value) || !hasValue(pairValue)) {
        return Promise.reject(new Error('Укажите диапазон T'));
      }
      const min = Number(isMin ? value : pairValue);
      const max = Number(isMin ? pairValue : value);
      if (Number.isFinite(min) && Number.isFinite(max) && min >= max) {
        return Promise.reject(new Error('Нижняя граница должна быть меньше верхней'));
      }
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
        name={isOtherMaterial ? minName : undefined}
        preserve={false}
        rules={isOtherMaterial ? [rangeValidator(maxName, true)] : undefined}
      >
        {withHelp(
          isOtherMaterial ? (
            <button
              type="button"
              className={[
                'reference-picker-control',
                'temperature-range-picker-control',
                editableRange ? '' : 'reference-picker-control--empty',
                'reference-picker-control--required',
              ].filter(Boolean).join(' ')}
              aria-haspopup="dialog"
              aria-expanded={open}
              title={editableRange ?? 'Задать диапазон T'}
              data-testid={`${dataTestIdPrefix}-temperature-range-button`}
              onClick={openRangeModal}
              onKeyDown={handleKeyDown}
            >
              <span className="reference-picker-value">
                {editableRange ?? (
                  <span className="reference-picker-placeholder">Задать</span>
                )}
              </span>
              <EditOutlined className="reference-picker-icon" />
            </button>
          ) : (
            <Input
              data-testid={`${dataTestIdPrefix}-temperature-range-input`}
              disabled
              value={referenceRange}
            />
          ),
          hint,
        )}
      </Form.Item>

      {isOtherMaterial && (
        <Form.Item
          name={maxName}
          hidden
          preserve={false}
          rules={[rangeValidator(minName, false)]}
        >
          <Input />
        </Form.Item>
      )}

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
