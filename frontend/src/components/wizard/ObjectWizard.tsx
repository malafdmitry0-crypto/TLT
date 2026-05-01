import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { Button, Form, Input, InputNumber, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ObjectType } from '@/constants/objectTypes';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import { getInsulation, getPipeMaterials } from '@/api/references';
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
const SECTION_WIDTH_WEIGHTS = [1.1, 1.17, 0.78, 0.95];
const SECTION_FIELD_PAIR_MIN_WIDTHS = [206, 206, 252, 180];
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
  const placement = String((values as Record<string, unknown> | undefined)?.placement ?? 'outdoor');
  const secondInsulationMaterial = String(
    (values as Record<string, unknown> | undefined)?.second_insulation_material ?? '',
  );
  const thirdInsulationMaterial = String(
    (values as Record<string, unknown> | undefined)?.third_insulation_material ?? '',
  );
  const layerCount = Math.min(Math.max(Number(insulationLayerCount) || 1, 1), 3);
  const { data: insulationMaterials = [], isError: insulationMaterialsError, isFetching: isInsulationMaterialsFetching } = useQuery({
    queryKey: ['insulation'],
    queryFn: getInsulation,
  });
  const { data: pipeMaterials = [] } = useQuery({
    queryKey: ['pipe-materials'],
    queryFn: getPipeMaterials,
  });
  const insulationMaterialOptions = [
    ...insulationMaterials.map((m) => ({
      value: m.material,
      label: m.name,
    })),
    { value: 'other', label: 'Другое' },
  ];
  const pipeMaterialOptions = pipeMaterials.length > 0
    ? pipeMaterials.map((m) => ({ value: m.material, label: m.name }))
    : [{ value: 'carbon_steel', label: 'Углеродистая сталь' }];

  const initialValues = useMemo(() =>
    initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined,
    [initialParams, objectType],
  );

  useEffect(() => {
    form.resetFields();
    if (initialValues) form.setFieldsValue(initialValues);
  }, [form, initialValues]);

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
    if (idx === 2) {
      style['--compact-field-label-width'] = '104px';
    }

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
            className="name-form-item helped-form-item"
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
                name="wall_thickness_mm"
                initialValue={4}
                rules={[
                  { required: true, message: 'Укажите толщину стенки' },
                  { type: 'number', min: 0.1, message: 'Минимальная толщина — 0,1 мм' },
                  { type: 'number', max: 40, message: 'Максимальная толщина — 40 мм' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0.1} max={40} step={0.1} addonAfter="мм" />,
                  'Толщина стенки трубы. Диапазон ТНП: 0,1…40 мм. Используется в расчёте сопротивления стенки.',
                )}
              </Form.Item>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel('λ трубы')}
                name="pipe_lambda"
                rules={[
                  { type: 'number', min: 0.001, message: 'λ должна быть больше 0' },
                  { type: 'number', max: 400, message: 'Максимальное значение λ — 400 Вт/мК' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0.001} max={400} step={0.1} addonAfter="Вт/мК" />,
                  'Ручное переопределение теплопроводности трубы, Вт/(м·К). Если поле пустое, расчёт берёт λ из справочника материала трубы.',
                )}
              </Form.Item>
              <Form.Item
                className="pipe-material-form-item reduced-select-form-item helped-form-item"
                label={fieldLabel('Материал трубы')}
                name="pipe_material"
                initialValue="carbon_steel"
                rules={[{ required: true, message: 'Выберите материал трубы' }]}
              >
                {withHelp(
                  <Select options={pipeMaterialOptions} />,
                  'Материал стенки трубопровода. Используется для выбора теплопроводности, если λ трубы не задана вручную.',
                )}
              </Form.Item>
            </>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel(objectType === 'pipe' ? 'Размещение трубопровода' : 'Размещение резервуара')}
            name="placement"
            initialValue="outdoor"
            rules={[{ required: true, message: 'Выберите размещение объекта' }]}
          >
            {withHelp(
              <Select
                options={[
                  { value: 'outdoor', label: 'На открытом воздухе' },
                  { value: 'indoor', label: 'В помещении' },
                  { value: 'underground', label: 'Подземно' },
                ]}
              />,
              'Размещение объекта. В помещении меняет коэффициент внешней теплоотдачи; для подземной прокладки используется глубина.',
            )}
          </Form.Item>
          <Form.Item
            className="fit-label-form-item helped-form-item"
            label={fieldLabel('Глубина прокладки')}
            name="burial_depth"
            preserve={false}
            rules={[
              { required: placement === 'underground', message: 'Укажите глубину прокладки' },
              { type: 'number', min: 0, message: 'Минимальная глубина — 0 м' },
              { type: 'number', max: 200, message: 'Максимальная глубина — 200 м' },
            ]}
          >
            {withHelp(
              <InputNumber disabled={placement !== 'underground'} min={0} max={200} step={0.1} placeholder="—" addonAfter="м" />,
              'Используется только для подземной прокладки. Диапазон ТНП: 0…200 м.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Грунт')}
            name="ground_type"
            initialValue="dry_sand"
            preserve={false}
            rules={[{ required: placement === 'underground', message: 'Выберите грунт' }]}
          >
            {withHelp(
              <Select
                disabled={placement !== 'underground'}
                options={[
                  { value: 'dry_sand', label: 'Сухой песок' },
                  { value: 'wet_sand', label: 'Влажный песок' },
                  { value: 'clay', label: 'Глина' },
                  { value: 'custom', label: 'Другое' },
                ]}
              />,
              'Тип грунта для подземной прокладки. Используется вместе с теплопроводностью грунта.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('λ грунта')}
            name="ground_conductivity"
            initialValue={1.5}
            preserve={false}
            rules={[
              { required: placement === 'underground', message: 'Укажите λ грунта' },
              { type: 'number', min: 0.8, message: 'Минимальная λ грунта — 0,8 Вт/мК' },
              { type: 'number', max: 3, message: 'Максимальная λ грунта — 3,0 Вт/мК' },
            ]}
          >
            {withHelp(
              <InputNumber disabled={placement !== 'underground'} min={0.8} max={3} step={0.1} addonAfter="Вт/мК" />,
              'Теплопроводность грунта для подземной прокладки. Диапазон: 0,8…3,0 Вт/(м·К).',
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
            name="insulation_cover_material"
            initialValue="none"
          >
            {withHelp(
              <Select options={[{ value: 'none', label: 'Не указано' }]} />,
              'Защитное покрытие теплоизоляции. Сохраняется в параметрах объекта для спецификации и отчёта.',
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
              'Количество слоёв изоляции. При 2 или 3 слоях форма добавляет отдельные материал и толщину для каждого дополнительного слоя.',
            )}
          </Form.Item>
          {insulationLayerCount !== '1' && (
            <>
              <Form.Item
                className="medium-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item"
                label={fieldLabel('Материал 2-го слоя')}
                name="second_insulation_material"
                preserve={false}
                rules={[{ required: true, message: 'Выберите материал 2-го слоя' }]}
              >
                {withHelp(
                  <Select
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                  />,
                  'Материал второго слоя изоляции. Используется в многослойном расчёте при 2 или 3 слоях.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item"
                label={fieldLabel('Толщина 2-го слоя')}
                name="second_insulation_thickness_mm"
                preserve={false}
                rules={[
                  { required: true, message: 'Укажите толщину 2-го слоя' },
                  { type: 'number', min: 0.01, message: 'Минимальная толщина — 0,01 мм' },
                  { type: 'number', max: 500, message: 'Максимальная толщина — 500 мм' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0.01} max={500} addonAfter="мм" />,
                  'Толщина второго слоя изоляции. Диапазон ТНП: 0,01…500 мм.',
                )}
              </Form.Item>
              {secondInsulationMaterial === 'other' && (
                <Form.Item
                  className="numeric-form-item coefficient-form-item helped-form-item"
                  label={fieldLabel('λ 2-го слоя')}
                  name="second_insulation_lambda"
                  preserve={false}
                  rules={[
                    { required: true, message: 'Укажите λ 2-го слоя' },
                    { type: 'number', min: 0.001, message: 'Минимальная λ — 0,001 Вт/мК' },
                    { type: 'number', max: 400, message: 'Максимальная λ — 400 Вт/мК' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={0.001} max={400} step={0.001} addonAfter="Вт/мК" />,
                    'Ручная теплопроводность второго слоя для материала «Другое». Диапазон ТНП: 0,001…400 Вт/(м·К).',
                  )}
                </Form.Item>
              )}
            </>
          )}
          {layerCount >= 3 && (
            <>
              <Form.Item
                className="medium-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item"
                label={fieldLabel('Материал 3-го слоя')}
                name="third_insulation_material"
                preserve={false}
                rules={[{ required: true, message: 'Выберите материал 3-го слоя' }]}
              >
                {withHelp(
                  <Select
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                  />,
                  'Материал третьего слоя изоляции. Используется в многослойном расчёте при 3 слоях.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item short-number-form-item third-layer-thickness-form-item helped-form-item"
                label={fieldLabel('Толщина 3-го слоя')}
                name="third_insulation_thickness_mm"
                preserve={false}
                rules={[
                  { required: true, message: 'Укажите толщину 3-го слоя' },
                  { type: 'number', min: 0.01, message: 'Минимальная толщина — 0,01 мм' },
                  { type: 'number', max: 500, message: 'Максимальная толщина — 500 мм' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0.01} max={500} addonAfter="мм" />,
                  'Толщина третьего слоя изоляции. Диапазон ТНП: 0,01…500 мм.',
                )}
              </Form.Item>
              {thirdInsulationMaterial === 'other' && (
                <Form.Item
                  className="numeric-form-item coefficient-form-item helped-form-item"
                  label={fieldLabel('λ 3-го слоя')}
                  name="third_insulation_lambda"
                  preserve={false}
                  rules={[
                    { required: true, message: 'Укажите λ 3-го слоя' },
                    { type: 'number', min: 0.001, message: 'Минимальная λ — 0,001 Вт/мК' },
                    { type: 'number', max: 400, message: 'Максимальная λ — 400 Вт/мК' },
                  ]}
                >
                  {withHelp(
                    <InputNumber min={0.001} max={400} step={0.001} addonAfter="Вт/мК" />,
                    'Ручная теплопроводность третьего слоя для материала «Другое». Диапазон ТНП: 0,001…400 Вт/(м·К).',
                  )}
                </Form.Item>
              )}
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
            name="process_temperature"
            dependencies={['ambient_temperature']}
            rules={[
              { required: true, message: 'Укажите требуемую температуру объекта' },
              { type: 'number', min: -90, message: 'Минимальная требуемая температура: −90°C' },
              { type: 'number', max: 600, message: 'Максимальная требуемая температура: +600°C' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const ambient = getFieldValue('ambient_temperature');
                  if (value == null || ambient == null) return Promise.resolve();
                  if (value <= ambient) {
                    return Promise.reject(
                      new Error('Требуемая температура объекта должна быть выше температуры среды'),
                    );
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            {withHelp(
              <InputNumber min={-90} max={600} step={0.1} addonAfter="°C" />,
              'Требуемая температура поддержания объекта, °C. Диапазон ТНП: −90…+600 °C. Используется в расчёте теплопотерь и проверке температурного диапазона кабеля.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Макс. T° окр. среды')}
            name="max_ambient_temperature"
            initialValue={30}
            rules={[
              { type: 'number', min: -70, message: 'Минимальная температура среды: −70°C' },
              { type: 'number', max: 70, message: 'Максимальная температура среды: +70°C' },
            ]}
          >
            {withHelp(
              <InputNumber min={-70} max={70} step={0.1} addonAfter="°C" />,
              'Максимальная температура окружающей среды, °C. Сохраняется в параметрах объекта для проверки условий эксплуатации.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Макс. допуст. T° продукта')}
            name="max_process_temperature"
            initialValue={90}
            rules={[
              { type: 'number', min: -90, message: 'Минимальная температура продукта: −90°C' },
              { type: 'number', max: 600, message: 'Максимальная температура продукта: +600°C' },
            ]}
          >
            {withHelp(
              <InputNumber min={-90} max={600} step={0.1} addonAfter="°C" />,
              'Максимально допустимая температура продукта, °C. Сохраняется в параметрах объекта и используется как эксплуатационное ограничение.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item helped-form-item"
            label={fieldLabel('Среда')}
            name="environment"
            initialValue="normal"
          >
            {withHelp(
              <Select options={[{ value: 'normal', label: 'Нормальная' }, { value: 'aggressive', label: 'Агрессивная' }]} />,
              'Условия эксплуатации: нормальная или агрессивная среда. Сохраняется в параметрах объекта для спецификации и отчёта.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item helped-form-item"
            label={fieldLabel('Классификация зоны')}
            name="zone_classification"
            initialValue="safe"
          >
            {withHelp(
              <Select options={[{ value: 'safe', label: 'Безопасная' }, { value: 'explosive', label: 'Взрывоопасная' }]} />,
              'Безопасная или взрывоопасная зона. Сохраняется в параметрах объекта для подбора исполнения и отчёта.',
            )}
          </Form.Item>
          <Form.Item
            className="temperature-group-form-item helped-form-item"
            label={fieldLabel('Температурная группа')}
            name="temperature_group"
            initialValue="T1"
          >
            {withHelp(
              <Select options={['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((v) => ({ value: v, label: v }))} />,
              'Температурная группа T1…T6 для классификации зоны. Сохраняется в параметрах объекта для подбора исполнения и отчёта.',
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
            name="min_switch_temperature"
            initialValue={-20}
            rules={[
              { type: 'number', min: -70, message: 'Минимальная температура включения: −70°C' },
              { type: 'number', max: 70, message: 'Максимальная температура включения: +70°C' },
            ]}
          >
            {withHelp(
              <InputNumber min={-70} max={70} step={0.1} addonAfter="°C" />,
              'Температура включения электрообогрева, °C. Сохраняется в параметрах объекта для электрораздела.',
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Рабочее напряжение')}
            name="supply_voltage"
            initialValue={220}
          >
            {withHelp(
              <Select options={[{ value: 220, label: '220 В' }, { value: 380, label: '380 В' }]} />,
              'Рабочее напряжение питания. Используется при расчёте тока в электротехническом расчёте.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('Kзап')}
            name="safety_factor"
            initialValue={1.2}
            rules={[
              { type: 'number', min: 1.05, message: 'Минимальный коэффициент запаса — 1,05' },
              { type: 'number', max: 1.7, message: 'Максимальный коэффициент запаса — 1,70' },
            ]}
          >
            {withHelp(
              <InputNumber min={1.05} max={1.7} step={0.01} />,
              'Коэффициент запаса Kзап. Диапазон ТНП: 1,05…1,70. Используется в суммарных теплопотерях и при подборе кабеля.',
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Пропарка')}
            name="steam_tracing"
            initialValue="no"
          >
            {withHelp(
              <Select options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]} />,
              'Признак пропарки. Сохраняется в параметрах объекта для проверки эксплуатационных ограничений.',
            )}
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Задвижки')}
                name="valve_count"
                initialValue={2}
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0} max={100} addonAfter="шт" />,
                  'Количество задвижек, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Фланцы')}
                name="flange_count"
                initialValue={2}
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0} max={100} addonAfter="шт" />,
                  'Количество фланцев, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Опоры')}
                name="support_count"
                initialValue={2}
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber min={0} max={100} addonAfter="шт" />,
                  'Количество опор, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
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
