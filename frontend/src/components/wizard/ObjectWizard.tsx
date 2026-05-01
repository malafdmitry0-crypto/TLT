import { useEffect, useRef, type ReactElement } from 'react';
import { Button, Form, Input, InputNumber, Select } from 'antd';
import type { ObjectType } from '@/constants/objectTypes';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
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

const SECTION_RESIZE_HANDLE_WIDTH = 1;
const SECTION_WIDTH_WEIGHTS = [1.1, 1.17, 0.68, 1.05];
const SECTION_FIELD_PAIR_MIN_WIDTHS = [248, 252, 252, 238];
const SECTION_FIELD_GRID =
  'repeat(auto-fit, minmax(min(100%, max(var(--field-pair-min-width), calc((100% - 4px) / 2))), 1fr))';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
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
  const insulationLayerCount = String(
    (values as Record<string, unknown> | undefined)?.insulation_layer_count ?? '1',
  );

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

  function sectionStyle(idx: number): React.CSSProperties {
    const expandedWeight = SECTION_WIDTH_WEIGHTS.reduce(
      (total, weight) => total + weight,
      0,
    );
    const availableWidth = `100% - ${SECTION_RESIZE_HANDLE_WIDTH * 3}px`;
    const share = expandedWeight > 0 ? SECTION_WIDTH_WEIGHTS[idx] / expandedWeight : 1;

    const style = {
      width: `calc((${availableWidth}) * ${share})`,
      gridTemplateColumns: SECTION_FIELD_GRID,
    } as React.CSSProperties & Record<string, string>;
    style['--field-pair-min-width'] = `${SECTION_FIELD_PAIR_MIN_WIDTHS[idx]}px`;

    return style;
  }

  function renderSectionTitle(title: string) {
    return <h4><span>{title}</span></h4>;
  }
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={initialValues}
      className="inline-object-form"
    >
      <div className="form-grid-srs">

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара')}
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Наименование')}
            name="name"
            rules={[
              { required: true, message: 'Укажите наименование объекта' },
              { max: 200, message: 'Максимальная длина — 200 символов' },
            ]}
          >
            {withHelp(
              <Input maxLength={200} />,
              'Автоматически формируется из параметров объекта. Можно изменить вручную; до 200 символов.',
            )}
          </Form.Item>
          {objectType === 'pipe' ? <PipeGeometryStep /> : <TankGeometryStep />}
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="fit-label-form-item short-number-form-item helped-form-item"
                label={fieldLabel('Толщина стенки')}
              >
                {withHelp(
                  <InputNumber value={4} min={1} max={100} step={0.1} addonAfter="мм" />,
                  'Толщина стенки трубы. Целевой диапазон SRS: 1…100 мм. Поле пока справочное и не участвует в расчёте.',
                )}
              </Form.Item>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel('λ трубы')}
              >
                {withHelp(
                  <InputNumber value={56} step={0.1} addonAfter="Вт/мК" />,
                  'Коэффициент теплопроводности материала трубы λ, Вт/(м·К). Показывает, насколько интенсивно материал стенки проводит тепло. Сейчас поле справочное и не отправляется в расчётный payload.',
                )}
              </Form.Item>
              <Form.Item
                className="pipe-material-form-item reduced-select-form-item helped-form-item"
                label={fieldLabel('Материал трубы')}
              >
                {withHelp(
                  <Select value="carbon_steel" options={[{ value: 'carbon_steel', label: 'Сталь углеродистая' }]} />,
                  'Материал стенки трубопровода. Сейчас поле справочное; теплопотери MVP считаются по сохранённым обязательным параметрам.',
                )}
              </Form.Item>
            </>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel(objectType === 'pipe' ? 'Размещение трубопровода' : 'Размещение резервуара')}
          >
            {withHelp(
              <Select value="outdoor" options={[{ value: 'outdoor', label: 'На открытом воздухе' }]} />,
              'Варианты по SRS: на открытом воздухе, в помещении, подземно. Сейчас поле справочное; подземная логика будет вынесена в отдельную задачу.',
            )}
          </Form.Item>
          <Form.Item
            className="fit-label-form-item helped-form-item"
            label={fieldLabel('Глубина прокладки')}
          >
            {withHelp(
              <InputNumber disabled min={0.1} max={5} step={0.1} placeholder="—" addonAfter="м" />,
              'Используется только для подземной прокладки. Целевой диапазон SRS: 0,1…5,0 м.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" />

        {/* ── Теплоизоляция ──────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(1)}
        >
          {renderSectionTitle('Теплоизоляция')}
          <ThermalStep />
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel('Материал покрытия')}
          >
            {withHelp(
              <Select value="none" options={[{ value: 'none', label: 'Не указано' }]} />,
              'Защитное покрытие теплоизоляции из справочника. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="layer-count-form-item helped-form-item"
            label={fieldLabel('Кол-во слоёв ИЗ')}
            name="insulation_layer_count"
            initialValue="1"
          >
            {withHelp(
              <Select options={[{ value: '1', label: '1 слой' }, { value: '2', label: '2 слоя' }, { value: '3', label: '3 слоя' }]} />,
              'Целевой диапазон SRS: 1…3 слоя. Сейчас расчётный payload MVP использует основной слой изоляции.',
            )}
          </Form.Item>
          {insulationLayerCount !== '1' && (
            <>
              <Form.Item
                className="medium-select-form-item second-layer-material-form-item helped-form-item"
                label={fieldLabel('Материал 2-го слоя')}
                preserve={false}
              >
                {withHelp(
                  <Select value="none" options={[{ value: 'none', label: 'Не указан' }, { value: 'polyurethane_foam', label: 'Пенополиуретан' }]} />,
                  'Используется при 2 или 3 слоях изоляции. Сейчас поле справочное и не входит в расчётный payload.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item"
                label={fieldLabel('Толщина 2-го слоя')}
                preserve={false}
              >
                {withHelp(
                  <InputNumber value={1} min={1} max={500} addonAfter="мм" />,
                  'Целевой диапазон SRS: 1…500 мм при выбранном 2-м слое. Сейчас поле справочное.',
                )}
              </Form.Item>
            </>
          )}
        </div>

        <div className="form-col-resize-handle" />

        {/* ── Температура и среда ────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(2)}
        >
          {renderSectionTitle('Температура и среда')}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Требуемая T° объекта')}
          >
            {withHelp(
              <InputNumber value={10} step={0.1} addonAfter="°C" />,
              'Требуемая температура поддержания объекта, °C. Сейчас поле справочное; расчёт использует температуру продукта.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Макс. T° окр. среды')}
          >
            {withHelp(
              <InputNumber value={30} step={0.1} addonAfter="°C" />,
              'Максимальная температура окружающей среды, °C. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Макс. допуст. T° продукта')}
          >
            {withHelp(
              <InputNumber value={90} step={0.1} addonAfter="°C" />,
              'Максимально допустимая температура продукта, °C. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item helped-form-item"
            label={fieldLabel('Среда')}
          >
            {withHelp(
              <Select value="normal" options={[{ value: 'normal', label: 'Нормальная' }, { value: 'aggressive', label: 'Агрессивная' }]} />,
              'Условия эксплуатации: нормальная или агрессивная среда. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item helped-form-item"
            label={fieldLabel('Классификация зоны')}
          >
            {withHelp(
              <Select value="safe" options={[{ value: 'safe', label: 'Безопасная' }, { value: 'explosive', label: 'Взрывоопасная' }]} />,
              'Безопасная или взрывоопасная зона. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="temperature-group-form-item helped-form-item"
            label={fieldLabel('Температурная группа')}
          >
            {withHelp(
              <Select value="T1" options={['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((v) => ({ value: v, label: v }))} />,
              'Температурная группа T1…T6 для классификации зоны. Сейчас поле справочное.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" />

        {/* ── Электропараметры и арматура ───────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(3)}
        >
          {renderSectionTitle('Электропараметры и арматура')}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Мин. T° включения')}
          >
            {withHelp(
              <InputNumber value={-20} step={0.1} addonAfter="°C" />,
              'Температура включения электрообогрева, °C. Сейчас поле справочное; выбор кабеля выполняется на шаге «Электрорасчёт».',
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Рабочее напряжение')}
          >
            {withHelp(
              <Select value="220" options={[{ value: '220', label: '220 В' }, { value: '380', label: '380 В' }]} />,
              'Допустимые значения по SRS: 220 В или 380 В. Сейчас поле справочное для формы SC-03.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('Kзап')}
          >
            {withHelp(
              <InputNumber value={1.2} min={1} max={2} step={0.01} />,
              'Коэффициент запаса Kзап. Целевой диапазон SRS: 1,00…2,00. Сейчас поле справочное; сохранение в payload вынесено в отдельную задачу.',
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Пропарка')}
          >
            {withHelp(
              <Select value="no" options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]} />,
              'Если «Да», по SRS требуется максимальная температура пара. Сейчас поле справочное.',
            )}
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Задвижки')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} max={100} addonAfter="шт" />,
                  'Количество задвижек, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Фланцы')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} max={100} addonAfter="шт" />,
                  'Количество фланцев, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Опоры')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} max={100} addonAfter="шт" />,
                  'Количество опор, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
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
