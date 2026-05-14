import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { Button, Form, Input, InputNumber, Select, Tag, type FormInstance } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ObjectType } from '@/constants/objectTypes';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import ReferencePicker from './ReferencePicker';
import InsulationTemperatureRangeField from './InsulationTemperatureRangeField';
import { getClimate, getInsulation, getPipeMaterials, getSoilConductivity } from '@/api/references';
import type { ClimateEntry } from '@/types/reference';
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
import {
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import {
  buildInsulationReferenceOptions,
  buildPipeMaterialReferenceOptions,
  buildSoilReferenceOptions,
} from '@/utils/referenceOptions';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
  fieldInputSettings?: HeatCalcFieldInputSettings;
}

const SECTION_RESIZE_HANDLE_WIDTH = 0;
const SECTION_GRID_GAP_WIDTH = 4;
const SECTION_WIDTH_WEIGHTS = [1.095, 1.35, 1.2, 0.56];
const SECTION_FIELD_PAIR_MIN_WIDTHS = [206, 206, 220, 180];
const SECTION_FIELD_GRID =
  'repeat(auto-fit, minmax(min(100%, max(var(--field-pair-min-width), calc((100% - 4px) / 2))), 1fr))';

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

type ClimateBasis = 't_0_92' | 't_0_98' | 't_abs_min';

const CLIMATE_BASIS_OPTIONS: { value: ClimateBasis; label: string }[] = [
  { value: 't_0_92', label: '0,92' },
  { value: 't_0_98', label: '0,98' },
  { value: 't_abs_min', label: 'Абс. мин.' },
];

function climateKey(entry: ClimateEntry) {
  return `${entry.region}|||${entry.city ?? entry.region}`;
}

function climateTemperature(entry: ClimateEntry, basis: ClimateBasis) {
  if (basis === 't_abs_min') return entry.t_abs_min;
  if (basis === 't_0_98') return entry.t_0_98 ?? entry.t_cold_day_0_98;
  return entry.t_0_92 ?? entry.t_cold_fiveday_0_92;
}

function climateWind(entry: ClimateEntry) {
  return entry.wind_avg_cold ?? entry.wind_max_jan;
}

function sourceTag(source: unknown) {
  if (source === 'climate') return <Tag className="field-source-tag">из климата</Tag>;
  if (source === 'manual') return <Tag className="field-source-tag">вручную</Tag>;
  return null;
}

function FieldSourceTag({
  form,
  name,
  fallback,
}: {
  form: FormInstance;
  name: string;
  fallback?: unknown;
}) {
  const source = Form.useWatch(name, form);
  return sourceTag(source ?? fallback);
}

export default function ObjectWizard({
  objectType,
  onClose,
  onSubmit,
  submitting = false,
  initialParams,
  fieldInputSettings,
}: Props) {
  const [form] = Form.useForm();
  const heatCalcObjectType = objectType as HeatCalcObjectType;
  const numberInputProps = (
    fieldId: string,
    options: { includeStep?: boolean } = {},
  ) => heatCalcNumberInputProps(heatCalcObjectType, fieldId, {
    ...options,
    fieldInputSettings,
  });
  const isEditMode = !!initialParams;
  const initialValues = useMemo(() =>
    initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined,
    [initialParams, objectType],
  );
  const formInitialValues = useMemo(
    () => initialValues ?? {},
    [initialValues],
  );
  const values = Form.useWatch([], form);
  const watchedValues = values as Record<string, unknown> | undefined;
  const watchedValue = (name: string, fallback?: unknown) => {
    if (watchedValues && Object.prototype.hasOwnProperty.call(watchedValues, name)) {
      return watchedValues[name];
    }
    return (formInitialValues as Record<string, unknown>)[name] ?? fallback;
  };
  const watchedString = (name: string, fallback = '') => {
    const value = watchedValue(name, fallback);
    return value == null ? fallback : String(value);
  };
  const prevSuggestedRef = useRef<string>('');
  const insulationLayerCount = watchedString('insulation_layer_count');
  const placement = watchedString('placement');
  const pipeLambdaMode = watchedString('pipe_lambda_mode');
  const selectedClimateKey = watchedString('climate_key');
  const climateBasis = watchedString('climate_temperature_basis', 't_0_92') as ClimateBasis;
  const selectedGroundType = watchedString('ground_type');
  const secondInsulationMaterial = watchedString('second_insulation_material');
  const thirdInsulationMaterial = watchedString('third_insulation_material');
  const layerCount = Math.min(Math.max(Number(insulationLayerCount || '1') || 1, 1), 3);
  const hasClimate = selectedClimateKey.length > 0;
  const isUnderground = placement === 'underground';
  const showWindField = placement === 'outdoor' || (objectType === 'tank' && isUnderground);
  const showAlphaField = placement === 'outdoor'
    || placement === 'indoor'
    || (objectType === 'tank' && isUnderground);
  const { data: insulationMaterials = [], isError: insulationMaterialsError, isFetching: isInsulationMaterialsFetching } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    ...referenceQueryOptions,
  });
  const { data: pipeMaterials = [] } = useQuery({
    queryKey: referenceQueryKeys.pipeMaterials,
    queryFn: getPipeMaterials,
    ...referenceQueryOptions,
  });
  const { data: climateEntries = [], isFetching: isClimateFetching } = useQuery({
    queryKey: referenceQueryKeys.climate,
    queryFn: getClimate,
    ...referenceQueryOptions,
  });
  const { data: soilEntries = [], isFetching: isSoilFetching } = useQuery({
    queryKey: referenceQueryKeys.soilConductivity,
    queryFn: getSoilConductivity,
    ...referenceQueryOptions,
  });
  const insulationMaterialOptions = useMemo(
    () => [
      ...buildInsulationReferenceOptions(insulationMaterials),
      { value: 'other', label: 'Другое' },
    ],
    [insulationMaterials],
  );
  const pipeMaterialOptions = useMemo(
    () => pipeMaterials.length > 0
      ? buildPipeMaterialReferenceOptions(pipeMaterials)
      : [{ value: 'carbon_steel', label: 'Углеродистая сталь' }],
    [pipeMaterials],
  );
  const climateOptions = useMemo(
    () => climateEntries.map((entry) => ({
      value: climateKey(entry),
      label: `${entry.city ?? entry.region} · ${entry.region}`,
      group: entry.region,
    })),
    [climateEntries],
  );
  const selectedClimate = climateEntries.find((entry) => climateKey(entry) === selectedClimateKey);
  const soilOptions = useMemo(
    () => buildSoilReferenceOptions(soilEntries),
    [soilEntries],
  );
  const selectedSecondInsulation = insulationMaterials.find((m) => m.material === secondInsulationMaterial);
  const selectedThirdInsulation = insulationMaterials.find((m) => m.material === thirdInsulationMaterial);
  const secondInsulationIsOther = secondInsulationMaterial === 'other';
  const thirdInsulationIsOther = thirdInsulationMaterial === 'other';

  useEffect(() => {
    form.resetFields();
    if (initialValues) form.setFieldsValue(initialValues);
  }, [form, initialValues]);

  useEffect(() => {
    if (!selectedClimate || form.getFieldValue('climate_temperature_basis')) return;
    form.setFieldsValue({ climate_temperature_basis: 't_0_92' });
  }, [form, selectedClimate]);

  useEffect(() => {
    if (!selectedClimate) return;
    const tAmbient = climateTemperature(selectedClimate, climateBasis);
    const wind = climateWind(selectedClimate);
    form.setFieldsValue({
      climate_city: selectedClimate.city ?? selectedClimate.region,
      climate_region: selectedClimate.region,
      ...(tAmbient != null
        ? {
            ambient_temperature: tAmbient,
            ambient_temperature_source: 'climate',
          }
        : {}),
      ...(wind != null
        ? {
            wind_speed: wind,
            wind_speed_source: 'climate',
          }
        : {}),
    });
  }, [climateBasis, form, selectedClimate]);

  useEffect(() => {
    if (!selectedGroundType) return;
    const selectedSoil = soilOptions.find((option) => option.value === selectedGroundType)?.entry;
    if (!selectedSoil) return;
    form.setFieldsValue({ ground_conductivity: selectedSoil.conductivity });
  }, [form, selectedGroundType, soilOptions]);

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

  function handleValuesChange(changed: Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(changed, 'climate_key') && !changed.climate_key) {
      form.setFieldsValue({
        climate_city: undefined,
        climate_region: undefined,
        ambient_temperature_source: form.getFieldValue('ambient_temperature') == null ? undefined : 'manual',
        wind_speed_source: form.getFieldValue('wind_speed') == null ? undefined : 'manual',
      });
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'ambient_temperature')) {
      form.setFieldsValue({ ambient_temperature_source: 'manual' });
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'wind_speed')) {
      form.setFieldsValue({ wind_speed_source: 'manual' });
    }
  }

  function sectionStyle(idx: number): React.CSSProperties {
    const expandedWeight = SECTION_WIDTH_WEIGHTS.reduce(
      (total, weight) => total + weight,
      0,
    );
    const availableWidth = `100% - ${SECTION_RESIZE_HANDLE_WIDTH * 3 + SECTION_GRID_GAP_WIDTH * 6}px`;
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

  function renderSectionTitle(title: string, step: number) {
    return <h4 data-step={step}><span>{title}</span></h4>;
  }
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={formInitialValues}
      className="inline-object-form"
      onValuesChange={handleValuesChange}
    >
      <Form.Item name="climate_city" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="climate_region" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="ambient_temperature_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="wind_speed_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <div className="form-grid-srs">

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара', 1)}
          <Form.Item
            className="name-form-item helped-form-item"
            label={fieldLabel('Наименование')}
            name="name"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'name')}
          >
            {withHelp(
              <Input
                data-testid="object-name-input"
                {...heatCalcTextInputProps(heatCalcObjectType, 'name')}
              />,
              'Автоматически формируется из параметров объекта. Можно изменить вручную; до 200 символов.',
            )}
          </Form.Item>
          {objectType === 'pipe'
            ? <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
            : <TankGeometryStep fieldInputSettings={fieldInputSettings} />}
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="fit-label-form-item short-number-form-item helped-form-item"
                label={fieldLabel('Толщина стенки')}
                name="wall_thickness_mm"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'wall_thickness_mm')}
              >
                {withHelp(
                  <InputNumber
                    data-testid="wall-thickness-input"
                    {...numberInputProps('wall_thickness_mm')}
                    addonAfter="мм"
                  />,
                  'Толщина стенки трубы. Диапазон ТНП: 0,1…40 мм. Используется в расчёте сопротивления стенки.',
                )}
              </Form.Item>
              <Form.Item
                className="compact-select-form-item helped-form-item"
                label={fieldLabel('Режим λ трубы')}
                name="pipe_lambda_mode"
                rules={[{ required: true, message: 'Выберите режим λ трубы' }]}
              >
                {withHelp(
                  <Select
                    data-testid="pipe-lambda-mode-select"
                    placeholder="Выберите режим"
                    options={[
                      { value: 'reference', label: 'Справ.' },
                      { value: 'manual', label: 'Вручн.' },
                    ]}
                  />,
                  'Источник теплопроводности стенки трубы: из справочника материала или ручной ввод λ.',
                )}
              </Form.Item>
              {pipeLambdaMode === 'manual' ? (
                <Form.Item
                  className="fit-label-form-item helped-form-item"
                  label={fieldLabel('λ трубы')}
                  name="pipe_lambda"
                  preserve={false}
                  rules={[
                    { required: true, message: 'Укажите λ трубы' },
                    { type: 'number', min: 0.001, message: 'λ должна быть больше 0' },
                    { type: 'number', max: 400, message: 'Максимальное значение λ — 400 Вт/мК' },
                  ]}
                >
                  {withHelp(
                    <InputNumber data-testid="pipe-lambda-input" min={0.001} max={400} step={0.1} addonAfter="Вт/мК" />,
                    'Ручная теплопроводность трубы, Вт/(м·К). Используется вместо справочника материала.',
                  )}
                </Form.Item>
              ) : pipeLambdaMode === 'reference' ? (
                <Form.Item
                  className="pipe-material-form-item reduced-select-form-item helped-form-item"
                  label={fieldLabel('Материал трубы')}
                  name="pipe_material"
                  preserve={false}
                  rules={[{ required: true, message: 'Выберите материал трубы' }]}
                >
                  {withHelp(
                    <ReferencePicker
                      data-testid="pipe-material-select"
                      options={pipeMaterialOptions}
                      placeholder="Выберите материал"
                      modalTitle="Материал трубы"
                      searchPlaceholder="Поиск материала трубы"
                      required
                    />,
                    'Материал стенки трубопровода. Backend берёт λ из справочника материала трубы.',
                  )}
                </Form.Item>
              ) : null}
            </>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel(objectType === 'pipe' ? 'Размещение трубопровода' : 'Размещение резервуара')}
            name="placement"
            rules={[{ required: true, message: 'Выберите размещение объекта' }]}
          >
            {withHelp(
              <Select
                data-testid="placement-select"
                placeholder="Выберите размещение"
                options={[
                  { value: 'outdoor', label: 'На открытом воздухе' },
                  { value: 'indoor', label: 'В помещении' },
                  { value: 'underground', label: 'Подземно' },
                ]}
              />,
              'Размещение объекта. В помещении меняет коэффициент внешней теплоотдачи; для подземной прокладки используется глубина.',
            )}
          </Form.Item>
          {isUnderground && (
            <>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel(objectType === 'pipe' ? 'Глубина прокладки' : 'Высота подземной части')}
                name="burial_depth"
                preserve={false}
                rules={[
                  { required: true, message: 'Укажите глубину прокладки' },
                  { type: 'number', min: 0, message: 'Минимальная глубина — 0 м' },
                  { type: 'number', max: 200, message: 'Максимальная глубина — 200 м' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="burial-depth-input" min={0} max={200} step={0.1} addonAfter="м" />,
                  objectType === 'pipe'
                    ? 'Используется только для подземной прокладки. Диапазон ТНП: 0…200 м.'
                    : 'Высота подземной части резервуара. Backend делит расчёт на Sвозд и Sгр. Диапазон ТНП: 0…200 м.',
                )}
              </Form.Item>
              <Form.Item
                className="fixed-select-form-item helped-form-item"
                label={fieldLabel('Грунт')}
                name="ground_type"
                preserve={false}
                rules={[{ required: true, message: 'Выберите грунт' }]}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="ground-type-select"
                    loading={isSoilFetching}
                    placeholder="Выберите грунт"
                    modalTitle="Грунт"
                    searchPlaceholder="Поиск грунта"
                    options={[...soilOptions, { value: 'custom', label: 'Другое' }]}
                    required
                  />,
                  'Тип грунта из справочника теплопроводности. При выборе справочного грунта λ грунта заполняется автоматически; можно переопределить вручную.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('λ грунта')}
                name="ground_conductivity"
                preserve={false}
                rules={[
                  { required: true, message: 'Укажите λ грунта' },
                  { type: 'number', min: 0.8, message: 'Минимальная λ грунта — 0,8 Вт/мК' },
                  { type: 'number', max: 3, message: 'Максимальная λ грунта — 3,0 Вт/мК' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="ground-conductivity-input" min={0.8} max={3} step={0.1} addonAfter="Вт/мК" />,
                  'Теплопроводность грунта для подземной прокладки. Диапазон: 0,8…3,0 Вт/(м·К).',
                )}
              </Form.Item>
            </>
          )}
        </div>

        <div className="form-col-resize-handle" />

        {/* ── Теплоизоляция ──────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(1)}
        >
          {renderSectionTitle('Теплоизоляция', 2)}
          <Form.Item
            className="layer-count-form-item insulation-layer-count-form-item helped-form-item"
            label={fieldLabel('Кол-во слоёв ИЗ')}
            name="insulation_layer_count"
            rules={[{ required: true, message: 'Выберите количество слоёв изоляции' }]}
          >
            {withHelp(
              <Select
                data-testid="insulation-layer-count-select"
                options={[{ value: '1', label: '1 слой' }, { value: '2', label: '2 слоя' }, { value: '3', label: '3 слоя' }]}
                placeholder="Выберите"
              />,
              'Количество слоёв изоляции. При 2 или 3 слоях форма добавляет отдельные материал и толщину для каждого дополнительного слоя.',
            )}
          </Form.Item>
          <div className="insulation-layer-group">
            <ThermalStep objectType={heatCalcObjectType} fieldInputSettings={fieldInputSettings} />
          </div>
          {layerCount >= 2 && (
            <div className="insulation-layer-group">
              <Form.Item
                className="medium-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item"
                label={fieldLabel('Материал 2-го слоя')}
                name="second_insulation_material"
                preserve={false}
                rules={[{ required: true, message: 'Выберите материал 2-го слоя' }]}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="second-insulation-material-select"
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    modalTitle="Материал 2-го слоя"
                    searchPlaceholder="Поиск материала"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                    required
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
                  <InputNumber data-testid="second-insulation-thickness-input" min={0.01} max={500} addonAfter="мм" />,
                  'Толщина второго слоя изоляции. Диапазон ТНП: 0,01…500 мм.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('λ 2-го слоя')}
                name={secondInsulationIsOther ? 'second_insulation_lambda' : undefined}
                preserve={false}
                rules={secondInsulationIsOther ? [
                    { required: true, message: 'Укажите λ 2-го слоя' },
                    { type: 'number', min: 0.001, message: 'Минимальная λ — 0,001 Вт/мК' },
                    { type: 'number', max: 400, message: 'Максимальная λ — 400 Вт/мК' },
                  ] : undefined}
              >
                {withHelp(
                  <InputNumber
                    data-testid="second-insulation-lambda-input"
                    disabled={!secondInsulationIsOther}
                    value={secondInsulationIsOther ? undefined : selectedSecondInsulation?.conductivity}
                    min={0.001}
                    max={400}
                    step={0.001}
                    addonAfter="Вт/мК"
                  />,
                  secondInsulationIsOther
                    ? 'Ручная теплопроводность второго слоя для материала «Другое». Диапазон ТНП: 0,001…400 Вт/(м·К).'
                    : 'Справочное значение λ второго слоя из выбранного материала изоляции.',
                )}
              </Form.Item>
              <InsulationTemperatureRangeField
                material={secondInsulationMaterial}
                selectedMaterial={selectedSecondInsulation}
                minName="second_insulation_temperature_min"
                maxName="second_insulation_temperature_max"
                dataTestIdPrefix="second-insulation"
                hint="Температурный диапазон применения материала второго слоя изоляции. Для материала «Другое» задаётся вручную."
              />
            </div>
          )}
          {layerCount >= 3 && (
            <div className="insulation-layer-group">
              <Form.Item
                className="medium-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item"
                label={fieldLabel('Материал 3-го слоя')}
                name="third_insulation_material"
                preserve={false}
                rules={[{ required: true, message: 'Выберите материал 3-го слоя' }]}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="third-insulation-material-select"
                    options={insulationMaterialOptions}
                    placeholder="Выберите материал"
                    modalTitle="Материал 3-го слоя"
                    searchPlaceholder="Поиск материала"
                    loading={isInsulationMaterialsFetching}
                    notFoundContent={insulationMaterialsError ? 'Не удалось загрузить справочник' : 'Нет материалов'}
                    required
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
                  <InputNumber data-testid="third-insulation-thickness-input" min={0.01} max={500} addonAfter="мм" />,
                  'Толщина третьего слоя изоляции. Диапазон ТНП: 0,01…500 мм.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('λ 3-го слоя')}
                name={thirdInsulationIsOther ? 'third_insulation_lambda' : undefined}
                preserve={false}
                rules={thirdInsulationIsOther ? [
                    { required: true, message: 'Укажите λ 3-го слоя' },
                    { type: 'number', min: 0.001, message: 'Минимальная λ — 0,001 Вт/мК' },
                    { type: 'number', max: 400, message: 'Максимальная λ — 400 Вт/мК' },
                  ] : undefined}
              >
                {withHelp(
                  <InputNumber
                    data-testid="third-insulation-lambda-input"
                    disabled={!thirdInsulationIsOther}
                    value={thirdInsulationIsOther ? undefined : selectedThirdInsulation?.conductivity}
                    min={0.001}
                    max={400}
                    step={0.001}
                    addonAfter="Вт/мК"
                  />,
                  thirdInsulationIsOther
                    ? 'Ручная теплопроводность третьего слоя для материала «Другое». Диапазон ТНП: 0,001…400 Вт/(м·К).'
                    : 'Справочное значение λ третьего слоя из выбранного материала изоляции.',
                )}
              </Form.Item>
              <InsulationTemperatureRangeField
                material={thirdInsulationMaterial}
                selectedMaterial={selectedThirdInsulation}
                minName="third_insulation_temperature_min"
                maxName="third_insulation_temperature_max"
                dataTestIdPrefix="third-insulation"
                hint="Температурный диапазон применения материала третьего слоя изоляции. Для материала «Другое» задаётся вручную."
              />
            </div>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item insulation-cover-form-item helped-form-item"
            label={fieldLabel('Материал покрытия')}
            name="insulation_cover_material"
          >
            {withHelp(
              <Select options={[{ value: 'none', label: 'Не указано' }]} placeholder="Не указано" />,
              'Защитное покрытие теплоизоляции. Сохраняется в параметрах объекта для спецификации и отчёта.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" />

        {/* ── Температура и среда ────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(2)}
        >
          {renderSectionTitle('Температура и среда', 3)}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel('Климат')}
            name="climate_key"
          >
            {withHelp(
              <ReferencePicker
                data-testid="climate-select"
                allowClear
                options={climateOptions}
                loading={isClimateFetching}
                placeholder="Выберите город"
                modalTitle="Климат"
                searchPlaceholder="Город или регион"
                groupFilterPlaceholder="Область или край"
              />,
              'Климатический справочник: выбор города заполняет расчётную температуру среды и скорость ветра.',
            )}
          </Form.Item>
          {hasClimate && (
            <Form.Item
              className="compact-select-form-item helped-form-item"
              label={fieldLabel('Обеспеченность климата')}
              name="climate_temperature_basis"
              preserve={false}
            >
              {withHelp(
                <Select data-testid="climate-basis-select" options={CLIMATE_BASIS_OPTIONS} />,
                'Какое значение из климатического справочника использовать для T° окр. среды: 0,92, 0,98 или абсолютный минимум.',
              )}
            </Form.Item>
          )}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('T° окр. среды')}
            name="ambient_temperature"
            extra={
              <FieldSourceTag
                form={form}
                name="ambient_temperature_source"
                fallback={watchedValue('ambient_temperature_source')}
              />
            }
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'ambient_temperature')}
          >
            {withHelp(
              <InputNumber
                data-testid="ambient-temperature-input"
                {...numberInputProps('ambient_temperature')}
                addonAfter="°C"
              />,
              'Расчётная температура окружающей среды. Диапазон ТНП: −70°C … +70°C. Может заполняться из климатического справочника.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Требуемая T° объекта')}
            name="process_temperature"
            dependencies={['ambient_temperature']}
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'process_temperature')}
          >
            {withHelp(
              <InputNumber
                data-testid="process-temperature-input"
                {...numberInputProps('process_temperature')}
                addonAfter="°C"
              />,
              'Требуемая температура поддержания объекта, °C. Диапазон ТНП: −90…+600 °C. Используется в расчёте теплопотерь и проверке температурного диапазона кабеля.',
            )}
          </Form.Item>
          {showWindField && (
            <Form.Item
              className="numeric-form-item short-number-form-item helped-form-item"
              label={fieldLabel('Скорость ветра')}
              name="wind_speed"
              preserve={false}
              extra={
                <FieldSourceTag
                  form={form}
                  name="wind_speed_source"
                  fallback={watchedValue('wind_speed_source')}
                />
              }
              rules={[
                { type: 'number', min: 0, message: 'Минимальная скорость ветра — 0 м/с' },
                { type: 'number', max: 20, message: 'Максимальная скорость ветра — 20 м/с' },
              ]}
            >
              {withHelp(
                <InputNumber data-testid="wind-speed-input" min={0} max={20} step={0.1} addonAfter="м/с" />,
                'Скорость ветра для расчёта внешней теплоотдачи α. Если выбран климатический город, берётся из справочника; можно переопределить вручную.',
              )}
            </Form.Item>
          )}
          {showAlphaField && (
            <Form.Item
              className="numeric-form-item coefficient-form-item alpha-vnesh-form-item helped-form-item"
              label={fieldLabel('α внеш')}
              name="alpha_vnesh"
              preserve={false}
              rules={[
                { type: 'number', min: 7, message: 'Минимальный α — 7 Вт/(м²·К)' },
                { type: 'number', max: 52, message: 'Максимальный α — 52 Вт/(м²·К)' },
              ]}
            >
              {withHelp(
                <InputNumber data-testid="alpha-vnesh-input" min={7} max={52} step={0.1} addonAfter="Вт/м²К" />,
                'Ручное значение коэффициента внешней теплоотдачи. Если пусто, backend рассчитывает α из скорости ветра и размещения.',
              )}
            </Form.Item>
          )}
          <Form.Item
            className="numeric-form-item temperature-number-form-item max-ambient-temperature-form-item helped-form-item"
            label={fieldLabel('Макс. T° окр. среды')}
            name="max_ambient_temperature"
            rules={[
              { type: 'number', min: -70, message: 'Минимальная температура среды: −70°C' },
              { type: 'number', max: 70, message: 'Максимальная температура среды: +70°C' },
            ]}
          >
            {withHelp(
              <InputNumber data-testid="max-ambient-temperature-input" min={-70} max={70} step={0.1} addonAfter="°C" />,
              'Максимальная температура окружающей среды, °C. Сохраняется в параметрах объекта для проверки условий эксплуатации.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Макс. допуст. T° продукта')}
            name="max_process_temperature"
            rules={[
              { type: 'number', min: -90, message: 'Минимальная температура продукта: −90°C' },
              { type: 'number', max: 600, message: 'Максимальная температура продукта: +600°C' },
            ]}
          >
            {withHelp(
              <InputNumber data-testid="max-process-temperature-input" min={-90} max={600} step={0.1} addonAfter="°C" />,
              'Максимально допустимая температура продукта, °C. Сохраняется в параметрах объекта и используется как эксплуатационное ограничение.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item environment-form-item helped-form-item"
            label={fieldLabel('Среда')}
            name="environment"
          >
            {withHelp(
              <Select
                data-testid="environment-select"
                options={[{ value: 'normal', label: 'Нормальная' }, { value: 'aggressive', label: 'Агрессивная' }]}
                placeholder="Выберите среду"
              />,
              'Условия эксплуатации: нормальная или агрессивная среда. Сохраняется в параметрах объекта для спецификации и отчёта.',
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item zone-classification-form-item helped-form-item"
            label={fieldLabel('Классификация зоны')}
            name="zone_classification"
          >
            {withHelp(
              <Select
                data-testid="zone-classification-select"
                options={[{ value: 'safe', label: 'Безопасная' }, { value: 'explosive', label: 'Взрывоопасная' }]}
                placeholder="Выберите зону"
              />,
              'Безопасная или взрывоопасная зона. Сохраняется в параметрах объекта для подбора исполнения и отчёта.',
            )}
          </Form.Item>
          <Form.Item
            className="temperature-group-form-item helped-form-item"
            label={fieldLabel('Температурная группа')}
            name="temperature_group"
          >
            {withHelp(
              <Select
                data-testid="temperature-group-select"
                options={['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((v) => ({ value: v, label: v }))}
                placeholder="Выберите"
              />,
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
          {renderSectionTitle('Электропараметры и арматура', 4)}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('Мин. T° включения')}
            name="min_switch_temperature"
            rules={objectType === 'pipe'
              ? heatCalcFormFieldRules(form, heatCalcObjectType, 'min_switch_temperature')
              : [
                  { type: 'number', min: -70, message: 'Минимальная температура включения: −70°C' },
                  { type: 'number', max: 70, message: 'Максимальная температура включения: +70°C' },
                ]}
          >
            {withHelp(
              <InputNumber
                data-testid="min-switch-temperature-input"
                {...(objectType === 'pipe'
                  ? numberInputProps('min_switch_temperature')
                  : { min: -70, max: 70, step: 0.1 })}
                addonAfter="°C"
              />,
              'Температура включения электрообогрева, °C. Сохраняется в параметрах объекта для электрораздела.',
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Рабочее напряжение')}
            name="supply_voltage"
          >
            {withHelp(
              <Select
                data-testid="supply-voltage-select"
                options={objectType === 'pipe'
                  ? heatCalcSelectOptions(heatCalcObjectType, 'supply_voltage')
                  : [{ value: 220, label: '220 В' }, { value: 380, label: '380 В' }]}
                placeholder="Выберите"
              />,
              'Рабочее напряжение питания. Используется при расчёте тока в электротехническом расчёте.',
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('Kзап')}
            name="safety_factor"
            rules={objectType === 'pipe'
              ? heatCalcFormFieldRules(form, heatCalcObjectType, 'safety_factor')
              : [
                  { type: 'number', min: 1.05, message: 'Минимальный коэффициент запаса — 1,05' },
                  { type: 'number', max: 1.7, message: 'Максимальный коэффициент запаса — 1,70' },
                ]}
          >
            {withHelp(
              <InputNumber
                data-testid="safety-factor-input"
                {...(objectType === 'pipe'
                  ? numberInputProps('safety_factor')
                  : { min: 1.05, max: 1.7, step: 0.01 })}
              />,
              'Коэффициент запаса Kзап. Диапазон ТНП: 1,05…1,70. Используется в суммарных теплопотерях и при подборе кабеля.',
            )}
          </Form.Item>
          {objectType === 'tank' && (
            <Form.Item
              className="numeric-form-item coefficient-form-item helped-form-item"
              label={fieldLabel('Q_доп')}
              name="q_additional"
              preserve={false}
              rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'q_additional')}
            >
              {withHelp(
                <InputNumber
                  data-testid="q-additional-input"
                  {...numberInputProps('q_additional')}
                  addonAfter="Вт"
                />,
                'Дополнительные теплопотери (днище, штуцера и пр.). Прибавляется к суммарным теплопотерям, не влияет на удельные.',
              )}
            </Form.Item>
          )}
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('Пропарка')}
            name="steam_tracing"
          >
            {withHelp(
              <Select
                data-testid="steam-tracing-select"
                options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]}
                placeholder="Выберите"
              />,
              'Признак пропарки. Сохраняется в параметрах объекта для проверки эксплуатационных ограничений.',
            )}
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Задвижки')}
                name="valve_count"
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="valve-count-input" min={0} max={100} addonAfter="шт" />,
                  'Количество задвижек, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Фланцы')}
                name="flange_count"
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="flange-count-input" min={0} max={100} addonAfter="шт" />,
                  'Количество фланцев, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('Опоры')}
                name="support_count"
                rules={[
                  { type: 'number', min: 0, message: 'Минимум — 0 шт' },
                  { type: 'number', max: 100, message: 'Максимум — 100 шт' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="support-count-input" min={0} max={100} addonAfter="шт" />,
                  'Количество опор, шт. Диапазон: 0…100. Сохраняется как локальные элементы объекта.',
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('Lэкв')}
                name="local_element_equiv_length"
                rules={[
                  { type: 'number', min: 0.1, message: 'Минимальная эквивалентная длина — 0,1 м' },
                  { type: 'number', max: 6.9, message: 'Максимальная эквивалентная длина — 6,9 м' },
                ]}
              >
                {withHelp(
                  <InputNumber data-testid="local-element-equiv-length-input" min={0.1} max={6.9} step={0.1} addonAfter="м" />,
                  'Эквивалентная длина одного локального элемента Lэкв. Прибавляется к длине трубы как N × Lэкв.',
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
      el.querySelector<HTMLElement>('input, select, textarea, .reference-picker-control')?.focus();
    }
  }, 0);
}
