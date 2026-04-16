import { useState } from 'react';
import { Button, Form, Modal, Space, Steps } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import ConfirmStep from './steps/ConfirmStep';
import {
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardUtils';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
}

const STEPS = [
  { title: 'Геометрия' },
  { title: 'Изоляция и температуры' },
  { title: 'Подтверждение' },
];

export default function ObjectWizard({
  objectType,
  onClose,
  onSubmit,
  submitting = false,
  initialParams,
}: Props) {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const isEditMode = !!initialParams;

  // Pre-fill form in edit mode
  const initialValues =
    initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined;

  async function nextStep() {
    try {
      const fieldsToValidate = getStepFields(objectType, step);
      await form.validateFields(fieldsToValidate);
      setStep((s) => s + 1);
    } catch {
      scrollToFirstError();
    }
  }

  function prevStep() {
    setStep((s) => s - 1);
  }

  async function handleFinish() {
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const params =
        objectType === 'pipe'
          ? pipeFormToApiParams(values)
          : tankFormToApiParams(values);
      onSubmit(params);
    } catch {
      scrollToFirstError();
    }
  }

  const isLastStep = step === STEPS.length - 1;

  const footer = (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Button onClick={step === 0 ? onClose : prevStep}>
        {step === 0 ? 'Отмена' : '← Назад'}
      </Button>
      {isLastStep ? (
        <Button type="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </Button>
      ) : (
        <Button type="primary" onClick={nextStep}>
          Далее →
        </Button>
      )}
    </Space>
  );

  return (
    <Modal
      open
      title={
        isEditMode
          ? `Редактировать объект: ${OBJECT_TYPE_LABELS[objectType]}`
          : `Добавить объект: ${OBJECT_TYPE_LABELS[objectType]}`
      }
      onCancel={onClose}
      footer={footer}
      width={600}
      destroyOnClose
    >
      <Steps
        current={step}
        items={STEPS}
        size="small"
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
      >
        {/* All steps are always mounted — hiding with CSS keeps field values in form store */}
        <div style={{ display: step === 0 ? 'block' : 'none' }}>
          {objectType === 'pipe' ? <PipeGeometryStep /> : <TankGeometryStep />}
        </div>
        <div style={{ display: step === 1 ? 'block' : 'none' }}>
          <ThermalStep />
        </div>
        <div style={{ display: step === 2 ? 'block' : 'none' }}>
          <ConfirmStep objectType={objectType} />
        </div>
      </Form>
    </Modal>
  );
}

function scrollToFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('.ant-modal-body .ant-form-item-has-error');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>('input, select, textarea')?.focus();
    }
  }, 0);
}

// ---------------------------------------------------------------------------
// Which form fields belong to each step — used for per-step validation
// ---------------------------------------------------------------------------
function getStepFields(objectType: ObjectType, step: number): string[] {
  if (step === 0) {
    if (objectType === 'pipe') return ['outer_diameter_mm', 'pipe_length'];
    return ['shape', 'diameter_mm', 'height_mm', 'length_mm', 'width_mm'];
  }
  if (step === 1) {
    return ['insulation_thickness_mm', 'insulation_material', 'ambient_temperature', 'process_temperature'];
  }
  return ['name'];
}
