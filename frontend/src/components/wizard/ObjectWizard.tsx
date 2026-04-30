import { useEffect, useRef } from 'react';
import { Button, Col, Form, Input, InputNumber, Row, Select, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { ObjectType } from '@/constants/objectTypes';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import {
  generatePipeName,
  generateTankName,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
  type PipeFormValues,
  type TankFormValues,
} from '@/utils/objectWizardUtils';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
}

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <InfoCircleOutlined style={{ color: '#8c8c8c', marginLeft: 4, cursor: 'help' }} />
    </Tooltip>
  );
}

function hintLabel(text: string, hint: string) {
  return (
    <span>
      {text}
      <HelpIcon text={hint} />
    </span>
  );
}

export default function ObjectWizard({
  objectType,
  onClose,
  onSubmit,
  submitting = false,
  initialParams,
}: Props) {
  const [form] = Form.useForm();
  const isEditMode = !!initialParams;
  const values = Form.useWatch([], form);
  const prevSuggestedRef = useRef<string>('');

  const initialValues =
    initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined;

  useEffect(() => {
    form.resetFields();
    if (initialValues) form.setFieldsValue(initialValues);
  }, [form, initialParams, objectType]);

  useEffect(() => {
    if (!values) return;
    try {
      const suggestedName =
        objectType === 'pipe'
          ? generatePipeName(values as PipeFormValues)
          : generateTankName(values as TankFormValues);
      if (!suggestedName) return;
      const current = form.getFieldValue('name') as string | undefined;
      if (!current || current === prevSuggestedRef.current) {
        prevSuggestedRef.current = suggestedName;
        form.setFieldsValue({ name: suggestedName });
      }
    } catch {
      // Пока форма заполнена частично, автонаименование может быть недоступно.
    }
  }, [form, objectType, values]);

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

  return (
    <Form form={form} layout="vertical" initialValues={initialValues} className="inline-object-form">
      <div className="inline-form-head">
        <h3>
          {isEditMode
            ? `Параметры объекта «${String(initialParams?.name ?? OBJECT_TYPE_LABELS[objectType])}»`
            : `Параметры нового объекта: ${OBJECT_TYPE_LABELS[objectType]}`}
        </h3>
        <span className={`mode ${isEditMode ? 'edit' : 'new'}`}>
          {isEditMode ? '✎ Режим: редактирование' : '＋ Режим: новая запись'}
        </span>
      </div>
      <Row gutter={[3, 3]} className="form-grid-srs">
        <Col xs={24} lg={6} className="form-col-srs">
          <h4>{objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара'}</h4>
          <Form.Item
            label={hintLabel(
              'Наименование',
              'Автоматически формируется из параметров объекта. Можно изменить вручную; до 200 символов.',
            )}
            name="name"
            rules={[{ required: true, message: 'Укажите наименование объекта' }]}
          >
            <Input />
          </Form.Item>
          {objectType === 'pipe' ? <PipeGeometryStep /> : <TankGeometryStep />}
          {objectType === 'pipe' && (
            <>
              <Form.Item
                label={hintLabel(
                  'Толщина стенки',
                  'Толщина стенки трубы. Целевой диапазон SRS: 1…100 мм. Поле пока справочное и не участвует в расчёте.',
                )}
              >
                <InputNumber value={4} step={0.1} addonAfter="мм" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Материал трубы',
                  'Материал стенки трубопровода. Сейчас поле справочное; теплопотери MVP считаются по сохранённым обязательным параметрам.',
                )}
              >
                <Select value="carbon_steel" options={[{ value: 'carbon_steel', label: 'Сталь углеродистая' }]} />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Коэф. теплопроводн. трубы',
                  'λ материала трубы, Вт/(м·К). Сейчас поле справочное и не отправляется в расчётный payload.',
                )}
              >
                <InputNumber value={56} step={0.1} addonAfter="Вт/мК" style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          <Form.Item
            label={hintLabel(
              objectType === 'pipe' ? 'Размещение трубопровода' : 'Размещение резервуара',
              'Варианты по SRS: на открытом воздухе, в помещении, подземно. Сейчас поле справочное; подземная логика будет вынесена в отдельную задачу.',
            )}
          >
            <Select value="outdoor" options={[{ value: 'outdoor', label: 'На открытом воздухе' }]} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Глубина прокладки',
              'Используется только для подземной прокладки. Целевой диапазон SRS: 0,1…5,0 м.',
            )}
          >
            <InputNumber disabled placeholder="—" addonAfter="м" style={{ width: '100%' }} />
          </Form.Item>
        </Col>

        <Col xs={24} lg={6} className="form-col-srs">
          <h4>Теплоизоляция</h4>
          <Form.Item
            label={hintLabel(
              'Кол-во слоёв ИЗ',
              'Целевой диапазон SRS: 1…3 слоя. Сейчас расчётный payload MVP использует основной слой изоляции.',
            )}
          >
            <Select value="1" options={[{ value: '1', label: '1 слой' }, { value: '2', label: '2 слоя' }]} />
          </Form.Item>
          <ThermalStep />
          <Form.Item
            label={hintLabel(
              'Коэф. теплопр. 1-го слоя',
              'λ первого слоя, Вт/(м·К). Для материала «Другое» по SRS нужно ручное значение 0,005…5,0.',
            )}
          >
            <InputNumber disabled value={0.045} step={0.001} addonAfter="Вт/мК" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Материал 2-го слоя',
              'Используется при 2 или 3 слоях изоляции. Сейчас поле справочное и не входит в расчётный payload.',
            )}
          >
            <Select value="none" options={[{ value: 'none', label: 'Не указан' }, { value: 'polyurethane_foam', label: 'Пенополиуретан' }]} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Толщина 2-го слоя',
              'Целевой диапазон SRS: 1…500 мм при выбранном 2-м слое. Сейчас поле справочное.',
            )}
          >
            <InputNumber value={0} addonAfter="мм" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Материал покрытия',
              'Защитное покрытие теплоизоляции из справочника. Сейчас поле справочное.',
            )}
          >
            <Select value="none" options={[{ value: 'none', label: 'Не указано' }]} />
          </Form.Item>
        </Col>

        <Col xs={24} lg={6} className="form-col-srs">
          <h4>Температура и среда</h4>
          <Form.Item
            label={hintLabel(
              'Требуемая T° объекта',
              'Требуемая температура поддержания объекта, °C. Сейчас поле справочное; расчёт использует температуру продукта.',
            )}
          >
            <InputNumber value={10} step={0.1} addonAfter="°C" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Макс. T° окр. среды',
              'Максимальная температура окружающей среды, °C. Сейчас поле справочное.',
            )}
          >
            <InputNumber value={30} step={0.1} addonAfter="°C" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Макс. допуст. T° продукта',
              'Максимально допустимая температура продукта, °C. Сейчас поле справочное.',
            )}
          >
            <InputNumber value={90} step={0.1} addonAfter="°C" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Среда',
              'Условия эксплуатации: нормальная или агрессивная среда. Сейчас поле справочное.',
            )}
          >
            <Select value="normal" options={[{ value: 'normal', label: 'Нормальная' }, { value: 'aggressive', label: 'Агрессивная' }]} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Классификация зоны',
              'Безопасная или взрывоопасная зона. Сейчас поле справочное.',
            )}
          >
            <Select value="safe" options={[{ value: 'safe', label: 'Безопасная' }, { value: 'explosive', label: 'Взрывоопасная' }]} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Температурная группа',
              'Температурная группа T1…T6 для классификации зоны. Сейчас поле справочное.',
            )}
          >
            <Select value="T1" options={['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Col>

        <Col xs={24} lg={6} className="form-col-srs">
          <h4>Электропараметры и арматура</h4>
          <Form.Item
            label={hintLabel(
              'Мин. T° включения',
              'Температура включения электрообогрева, °C. Сейчас поле справочное; выбор кабеля выполняется на шаге «Электрорасчёт».',
            )}
          >
            <InputNumber value={-20} step={0.1} addonAfter="°C" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Рабочее напряжение',
              'Допустимые значения по SRS: 220 В или 380 В. Сейчас поле справочное для формы SC-03.',
            )}
          >
            <Select value="220" options={[{ value: '220', label: '220 В' }, { value: '380', label: '380 В' }]} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Коэффициент запаса',
              'Целевой диапазон SRS: 1,00…2,00. Сейчас поле справочное; сохранение в payload вынесено в отдельную задачу.',
            )}
          >
            <InputNumber value={1.2} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Пропарка',
              'Если «Да», по SRS требуется максимальная температура пара. Сейчас поле справочное.',
            )}
          >
            <Select value="no" options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]} />
          </Form.Item>
          <div className="srs-note">
            Тип кабеля, марка, шаг навива, количество ниток и варианты CO1…CO4 — на следующем шаге «Электрорасчёт».
          </div>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                label={hintLabel(
                  'Задвижки',
                  'Количество задвижек, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Фланцы',
                  'Количество фланцев, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Опоры',
                  'Количество опор, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
        </Col>
      </Row>
      <div className="hidden-submit">
        <Button id="inline-object-save" type="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </Button>
        <Button id="inline-object-cancel" onClick={onClose}>Отмена</Button>
      </div>
    </Form>
  );
}

function scrollToFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('.inline-object-form .ant-form-item-has-error');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>('input, select, textarea')?.focus();
    }
  }, 0);
}
