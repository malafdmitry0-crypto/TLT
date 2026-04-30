import { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, Select, Tooltip } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ObjectType } from '@/constants/objectTypes';
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
      <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  );
}

function hintLabel(text: string, hint: string) {
  return (
    <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
        {text}
      </span>
      <HelpIcon text={hint} />
    </>
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
  const [collapsedSections, setCollapsedSections] = useState([false, false, false, false]);

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
      const vals = form.getFieldsValue(true);
      const params =
        objectType === 'pipe'
          ? pipeFormToApiParams(vals)
          : tankFormToApiParams(vals);
      onSubmit(params);
    } catch {
      scrollToFirstError();
    }
  }

  // ── Resizable columns ──────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const colWidthsRef = useRef([25, 25, 25, 25]);
  const [colWidths, setColWidths] = useState([25, 25, 25, 25]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const collapsedColumnWidth = 22;
  const resizeHandleWidth = 5;

  useEffect(() => () => cleanupRef.current?.(), []);

  function onHandleMouseDown(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidths = [...colWidthsRef.current];

    const onMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const pct = ((ev.clientX - startX) / containerRef.current.offsetWidth) * 100;
      const l = startWidths[idx] + pct;
      const r = startWidths[idx + 1] - pct;
      if (l >= 12 && r >= 12) {
        const w = startWidths.map((v, i) => (i === idx ? l : i === idx + 1 ? r : v));
        colWidthsRef.current = w;
        setColWidths([...w]);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cleanupRef.current = null;
    };

    cleanupRef.current = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function toggleSection(idx: number) {
    setCollapsedSections((prev) => prev.map((value, i) => (i === idx ? !value : value)));
  }

  function collapsedClickHandler(idx: number) {
    return collapsedSections[idx] ? () => toggleSection(idx) : undefined;
  }

  function sectionStyle(idx: number): React.CSSProperties {
    if (collapsedSections[idx]) {
      return { width: collapsedColumnWidth };
    }

    const expandedTotal = colWidths.reduce(
      (total, width, i) => (collapsedSections[i] ? total : total + width),
      0,
    );
    const collapsedCount = collapsedSections.filter(Boolean).length;
    const availableWidth = `100% - ${collapsedCount * collapsedColumnWidth}px - ${resizeHandleWidth * 3}px`;
    const share = expandedTotal > 0 ? colWidths[idx] / expandedTotal : 1;

    return { width: `calc((${availableWidth}) * ${share})` };
  }

  function renderSectionTitle(title: string, idx: number) {
    const collapsed = collapsedSections[idx];
    return (
      <h4>
        <span>{title}</span>
        <button
          type="button"
          className="form-section-toggle"
          aria-label={collapsed ? `Развернуть: ${title}` : `Свернуть: ${title}`}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          onClick={(e) => {
            e.stopPropagation();
            toggleSection(idx);
          }}
        >
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </button>
      </h4>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Form form={form} layout="vertical" initialValues={initialValues} className="inline-object-form">
      <div ref={containerRef} className="form-grid-srs">

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          className={`form-col-srs ${collapsedSections[0] ? 'collapsed' : ''}`}
          style={sectionStyle(0)}
          onClick={collapsedClickHandler(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара', 0)}
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
                <InputNumber value={4} step={0.1} addonAfter="мм" />
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
                <InputNumber value={56} step={0.1} addonAfter="Вт/мК" />
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
            <InputNumber disabled placeholder="—" addonAfter="м" />
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 0)} />

        {/* ── Теплоизоляция ──────────────────────────────────────────── */}
        <div
          className={`form-col-srs ${collapsedSections[1] ? 'collapsed' : ''}`}
          style={sectionStyle(1)}
          onClick={collapsedClickHandler(1)}
        >
          {renderSectionTitle('Теплоизоляция', 1)}
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
            <InputNumber disabled value={0.045} step={0.001} addonAfter="Вт/мК" />
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
            <InputNumber value={0} addonAfter="мм" />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Материал покрытия',
              'Защитное покрытие теплоизоляции из справочника. Сейчас поле справочное.',
            )}
          >
            <Select value="none" options={[{ value: 'none', label: 'Не указано' }]} />
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 1)} />

        {/* ── Температура и среда ────────────────────────────────────── */}
        <div
          className={`form-col-srs ${collapsedSections[2] ? 'collapsed' : ''}`}
          style={sectionStyle(2)}
          onClick={collapsedClickHandler(2)}
        >
          {renderSectionTitle('Температура и среда', 2)}
          <Form.Item
            label={hintLabel(
              'Требуемая T° объекта',
              'Требуемая температура поддержания объекта, °C. Сейчас поле справочное; расчёт использует температуру продукта.',
            )}
          >
            <InputNumber value={10} step={0.1} addonAfter="°C" />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Макс. T° окр. среды',
              'Максимальная температура окружающей среды, °C. Сейчас поле справочное.',
            )}
          >
            <InputNumber value={30} step={0.1} addonAfter="°C" />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Макс. допуст. T° продукта',
              'Максимально допустимая температура продукта, °C. Сейчас поле справочное.',
            )}
          >
            <InputNumber value={90} step={0.1} addonAfter="°C" />
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
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 2)} />

        {/* ── Электропараметры и арматура ───────────────────────────── */}
        <div
          className={`form-col-srs ${collapsedSections[3] ? 'collapsed' : ''}`}
          style={sectionStyle(3)}
          onClick={collapsedClickHandler(3)}
        >
          {renderSectionTitle('Электропараметры и арматура', 3)}
          <Form.Item
            label={hintLabel(
              'Мин. T° включения',
              'Температура включения электрообогрева, °C. Сейчас поле справочное; выбор кабеля выполняется на шаге «Электрорасчёт».',
            )}
          >
            <InputNumber value={-20} step={0.1} addonAfter="°C" />
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
            <InputNumber value={1.2} step={0.01} />
          </Form.Item>
          <Form.Item
            label={hintLabel(
              'Пропарка',
              'Если «Да», по SRS требуется максимальная температура пара. Сейчас поле справочное.',
            )}
          >
            <Select value="no" options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]} />
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                label={hintLabel(
                  'Задвижки',
                  'Количество задвижек, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Фланцы',
                  'Количество фланцев, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" />
              </Form.Item>
              <Form.Item
                label={hintLabel(
                  'Опоры',
                  'Количество опор, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              >
                <InputNumber value={2} min={0} addonAfter="шт" />
              </Form.Item>
            </>
          )}
        </div>

      </div>
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
