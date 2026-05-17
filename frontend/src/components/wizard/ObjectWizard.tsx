import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
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
import UnitInputNumber from '@/components/common/UnitInputNumber';
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
  heatCalcCustomControlRequiredProps,
  heatCalcFormFieldRules,
  heatCalcNumberInputProps,
  heatCalcSelectOptions,
  heatCalcTextInputProps,
} from '@/utils/heatCalcWizardFieldRules';
import {
  getHeatCalcFieldDescription,
  getHeatCalcFieldLabel,
} from '@/domain/heatCalcFields';
import {
  buildInsulationReferenceOptions,
  buildPipeMaterialReferenceOptions,
  buildSoilReferenceOptions,
} from '@/utils/referenceOptions';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import {
  HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT,
  normalizeFormSectionWeights,
  type HeatCalcFormSectionWeights,
} from '@/utils/heatCalcTableViewSettings';
import type { HeatCalcObjectType, ProjectObject } from '@/types/project';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
  validationErrors?: ProjectObject['validation_errors'];
  fieldInputSettings?: HeatCalcFieldInputSettings;
  formSectionWeights?: HeatCalcFormSectionWeights;
  sectionResizeEnabled?: boolean;
  onFormSectionWeightsChange?: (weights: HeatCalcFormSectionWeights) => void;
  onFormSectionWeightsCommit?: (weights: HeatCalcFormSectionWeights) => void;
}

const SECTION_RESIZE_HANDLE_WIDTH = 4;
const SECTION_GRID_GAP_WIDTH = 2;
const SECTION_FIELD_PAIR_MIN_WIDTHS = [206, 206, 220, 180];
const SECTION_FIELD_GRID =
  'repeat(auto-fit, minmax(min(100%, max(var(--field-pair-min-width), calc((100% - 4px) / 2))), 1fr))';
const REQUIRED_FIELDS_ERROR_PREFIX = 'Не заполнены обязательные поля объекта:';
const REQUIRED_FIELD_ERROR_MESSAGE = '';

const REQUIRED_FIELD_LABEL_TO_FORM_NAMES: Record<string, string[]> = {
  'Наружный диаметр': ['outer_diameter_mm'],
  'Длина трубопровода': ['pipe_length'],
  'Толщина стенки': ['wall_thickness_mm'],
  'Материал трубы или λ трубы': ['pipe_material', 'pipe_lambda'],
  'Форма резервуара': ['shape'],
  'λ стенки': ['wall_lambda'],
  'Диаметр резервуара': ['diameter_mm'],
  'Высота резервуара': ['height_mm'],
  'Длина резервуара': ['length_mm'],
  'Ширина резервуара': ['width_mm'],
  'Размещение объекта': ['placement'],
  'Температура окружающей среды': ['ambient_temperature'],
  'Требуемая температура объекта': ['process_temperature'],
  'Температура продукта': ['process_temperature'],
  'Глубина/высота подземной части': ['burial_depth'],
  'Тип грунта': ['ground_type'],
  'λ грунта': ['ground_conductivity'],
  'Толщина изоляции': ['insulation_thickness_mm'],
  'Материал изоляции': ['insulation_material'],
  'Толщина 1-го слоя': ['insulation_thickness_mm'],
  'Толщина 1-го слоя изоляции': ['insulation_thickness_mm'],
  'Материал 1-го слоя': ['insulation_material'],
  'Материал 1-го слоя изоляции': ['insulation_material'],
  'λ 1-го слоя изоляции': ['first_insulation_lambda'],
  'Толщина 2-го слоя': ['second_insulation_thickness_mm'],
  'Толщина 2-го слоя изоляции': ['second_insulation_thickness_mm'],
  'Материал 2-го слоя': ['second_insulation_material'],
  'Материал 2-го слоя изоляции': ['second_insulation_material'],
  'λ 2-го слоя изоляции': ['second_insulation_lambda'],
  'Толщина 3-го слоя': ['third_insulation_thickness_mm'],
  'Толщина 3-го слоя изоляции': ['third_insulation_thickness_mm'],
  'Материал 3-го слоя': ['third_insulation_material'],
  'Материал 3-го слоя изоляции': ['third_insulation_material'],
  'λ 3-го слоя изоляции': ['third_insulation_lambda'],
};

const API_FIELD_TO_FORM_NAMES: Record<string, string[]> = {
  outer_diameter: ['outer_diameter_mm'],
  pipe_length: ['pipe_length'],
  wall_thickness: ['wall_thickness_mm'],
  pipe_material: ['pipe_material'],
  pipe_lambda: ['pipe_lambda'],
  shape: ['shape'],
  diameter: ['diameter_mm'],
  height: ['height_mm'],
  length: ['length_mm'],
  width: ['width_mm'],
  wall_lambda: ['wall_lambda'],
  insulation_thickness: ['insulation_thickness_mm'],
  insulation_material: ['insulation_material'],
  ambient_temperature: ['ambient_temperature'],
  process_temperature: ['process_temperature'],
  burial_depth: ['burial_depth'],
  ground_type: ['ground_type'],
  ground_conductivity: ['ground_conductivity'],
  wind_speed: ['wind_speed'],
  alpha_vnesh: ['alpha_vnesh'],
  safety_factor: ['safety_factor'],
  vapor_temperature: ['vapor_temperature'],
  local_element_equiv_length: ['local_element_equiv_length'],
  q_additional: ['q_additional'],
  insulation_layer_count: ['insulation_layer_count'],
};

const RANGE_MESSAGE_TO_FORM_NAMES: Array<[RegExp, string[]]> = [
  [/Температура окружающей среды/i, ['ambient_temperature']],
  [/Температура продукта|Требуемая температура объекта/i, ['process_temperature']],
  [/Наружный диаметр/i, ['outer_diameter_mm']],
  [/Длина трубопровода/i, ['pipe_length']],
  [/Толщина стенки/i, ['wall_thickness_mm']],
  [/Толщина изоляции/i, ['insulation_thickness_mm']],
  [/Глубина|подземной части/i, ['burial_depth']],
  [/λ грунта|теплопроводность грунта/i, ['ground_conductivity']],
  [/Скорость ветра/i, ['wind_speed']],
  [/коэф.*наружной теплоотдачи|alpha/i, ['alpha_vnesh']],
  [/Коэффициент запаса/i, ['safety_factor']],
  [/Температура пропарки|T проп/i, ['vapor_temperature']],
  [/эквивалентн.*длин/i, ['local_element_equiv_length']],
  [/Диаметр резервуара/i, ['diameter_mm']],
  [/Высота резервуара/i, ['height_mm']],
  [/Длина резервуара/i, ['length_mm']],
  [/Ширина резервуара/i, ['width_mm']],
  [/λ стенки/i, ['wall_lambda']],
  [/Максимальное количество слоёв/i, ['insulation_layer_count']],
];

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(fieldId: string, objectType?: HeatCalcObjectType) {
  return <FieldLabel text={getHeatCalcFieldLabel(fieldId, { context: 'form', objectType })} />;
}

function fieldHelp(fieldId: string, objectType?: HeatCalcObjectType, mode?: string) {
  return getHeatCalcFieldDescription(fieldId, { objectType, mode });
}

function validationErrorsText(validationErrors: ProjectObject['validation_errors'] | undefined) {
  if (!validationErrors) return '';
  const message = validationErrors['message'];
  if (typeof message === 'string') return message;
  const error = validationErrors['error'];
  if (typeof error === 'string') return error;
  if (error != null) return String(error);
  try {
    return JSON.stringify(validationErrors);
  } catch {
    return 'Проверьте параметры объекта';
  }
}

function validationRequiredFields(validationErrors: ProjectObject['validation_errors'] | undefined, message: string) {
  const explicitFields = validationErrors?.['missing_fields'];
  if (Array.isArray(explicitFields)) {
    return explicitFields
      .map((field) => String(field).trim())
      .filter(Boolean);
  }

  const prefixIndex = message.indexOf(REQUIRED_FIELDS_ERROR_PREFIX);
  if (prefixIndex < 0) return [];
  return message
    .slice(prefixIndex + REQUIRED_FIELDS_ERROR_PREFIX.length)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function uniqueFieldNames(fieldNames: string[]) {
  return [...new Set(fieldNames.filter(Boolean))];
}

function requiredFieldNamesFromLabels(labels: string[]) {
  return uniqueFieldNames(labels.flatMap((field) => {
    const trimmed = field.trim();
    if (!trimmed) return [];
    if (REQUIRED_FIELD_LABEL_TO_FORM_NAMES[trimmed]) return REQUIRED_FIELD_LABEL_TO_FORM_NAMES[trimmed];
    if (API_FIELD_TO_FORM_NAMES[trimmed]) return API_FIELD_TO_FORM_NAMES[trimmed];
    return /^[a-z][a-z0-9_]*$/i.test(trimmed) ? [trimmed] : [];
  }));
}

function insulationLayerFieldNamesFromMessage(message: string) {
  const matches = [...message.matchAll(/insulation_layers[.\s]+(\d+)[.\s]+(thickness|material|conductivity|temperature_range)/gi)];
  return matches.flatMap((match) => {
    const index = Number(match[1]);
    const field = match[2];
    const prefix = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : null;
    if (!prefix) return [];
    if (field === 'thickness') return [index === 0 ? 'insulation_thickness_mm' : `${prefix}_insulation_thickness_mm`];
    if (field === 'material') return [index === 0 ? 'insulation_material' : `${prefix}_insulation_material`];
    if (field === 'conductivity') return [`${prefix}_insulation_lambda`];
    if (field === 'temperature_range') return [`${prefix}_insulation_temperature_range`];
    return [];
  });
}

function fieldNamesFromValidationMessage(message: string) {
  const fromApiNames = Object.entries(API_FIELD_TO_FORM_NAMES)
    .filter(([apiName]) => new RegExp(`(^|\\n|\\s)${apiName}(\\n|\\s|$)`).test(message))
    .flatMap(([, formNames]) => formNames);
  const fromRangeMessages = RANGE_MESSAGE_TO_FORM_NAMES
    .filter(([pattern]) => pattern.test(message))
    .flatMap(([, formNames]) => formNames);
  return uniqueFieldNames([
    ...fromApiNames,
    ...fromRangeMessages,
    ...insulationLayerFieldNamesFromMessage(message),
  ]);
}

function buildCalculationFieldErrors(
  validationErrors: ProjectObject['validation_errors'] | undefined,
): Record<string, string> {
  const message = validationErrorsText(validationErrors).trim();
  if (!message) return {};
  const requiredFieldNames = requiredFieldNamesFromLabels(validationRequiredFields(validationErrors, message));
  if (requiredFieldNames.length > 0) {
    return Object.fromEntries(requiredFieldNames.map((fieldName) => [fieldName, REQUIRED_FIELD_ERROR_MESSAGE]));
  }
  return Object.fromEntries(fieldNamesFromValidationMessage(message).map((fieldName) => [fieldName, message]));
}

type ClimateBasis = 't_0_92' | 't_0_98' | 't_abs_min';

function climateKey(entry: ClimateEntry) {
  return `${entry.region}|||${entry.city ?? entry.region}`;
}

function isClimateBasis(value: unknown): value is ClimateBasis {
  return value === 't_0_92' || value === 't_0_98' || value === 't_abs_min';
}

function climateBasisLabel(basis: ClimateBasis) {
  if (basis === 't_abs_min') return 'Абс. мин.';
  if (basis === 't_0_98') return '0,98';
  return '0,92';
}

function climateTemperature(entry: ClimateEntry, basis: ClimateBasis) {
  if (basis === 't_abs_min') return entry.t_abs_min;
  if (basis === 't_0_98') return entry.t_0_98 ?? entry.t_cold_day_0_98;
  return entry.t_0_92 ?? entry.t_cold_fiveday_0_92;
}

function climateWind(entry: ClimateEntry) {
  return entry.wind_avg_cold ?? entry.wind_max_jan;
}

function numericFormValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value.replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function climatePolicyBasisForObject(
  objectType: ObjectType,
  outerDiameterMm: number | null,
  fallback: unknown,
): ClimateBasis | undefined {
  if (objectType === 'tank') return 't_0_92';
  if (objectType === 'pipe') {
    if (outerDiameterMm != null && outerDiameterMm > 0) {
      return outerDiameterMm >= 100 ? 't_0_92' : 't_abs_min';
    }
    return isClimateBasis(fallback) ? fallback : undefined;
  }
  return undefined;
}

function climatePolicyBasisReason(objectType: ObjectType, outerDiameterMm: number | null) {
  if (objectType === 'tank') return 'резервуар';
  if (objectType === 'pipe') {
    if (outerDiameterMm == null || outerDiameterMm <= 0) return 'задайте Ø трубы';
    return outerDiameterMm >= 100 ? 'D >= 100 мм' : 'D < 100 мм';
  }
  return 'по алгоритму';
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
  validationErrors,
  fieldInputSettings,
  formSectionWeights,
  sectionResizeEnabled = false,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
}: Props) {
  const [form] = Form.useForm();
  const formGridRef = useRef<HTMLDivElement | null>(null);
  const heatCalcObjectType = objectType as HeatCalcObjectType;
  const resolvedFormSectionWeights = useMemo(
    () => normalizeFormSectionWeights(formSectionWeights ?? HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT),
    [formSectionWeights],
  );
  const formSectionWeightsRef = useRef<HeatCalcFormSectionWeights>(resolvedFormSectionWeights);
  const numberInputProps = (
    fieldId: string,
    options: { includeStep?: boolean } = {},
  ) => heatCalcNumberInputProps(heatCalcObjectType, fieldId, {
    ...options,
    fieldInputSettings,
    form,
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
  const calculationFieldErrors = useMemo(
    () => buildCalculationFieldErrors(validationErrors),
    [validationErrors],
  );
  const calculationFieldErrorNamesRef = useRef<string[]>([]);
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

  useEffect(() => {
    formSectionWeightsRef.current = resolvedFormSectionWeights;
  }, [resolvedFormSectionWeights]);

  const insulationLayerCount = watchedString('insulation_layer_count');
  const placement = watchedString('placement');
  const pipeLambdaMode = watchedString('pipe_lambda_mode');
  const selectedClimateKey = watchedString('climate_key');
  const climateBasisValue = watchedString('climate_temperature_basis');
  const outerDiameterMm = numericFormValue(watchedValue('outer_diameter_mm'));
  const climateBasis = climatePolicyBasisForObject(objectType, outerDiameterMm, climateBasisValue);
  const climateBasisDisplay = climateBasis
    ? `${climateBasisLabel(climateBasis)} · ${climatePolicyBasisReason(objectType, outerDiameterMm)}`
    : climatePolicyBasisReason(objectType, outerDiameterMm);
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
    const timer = window.setTimeout(() => {
      const previousFieldNames = calculationFieldErrorNamesRef.current;
      if (previousFieldNames.length > 0) {
        form.setFields(previousFieldNames.map((fieldName) => ({ name: fieldName, errors: [] })));
      }

      const nextFieldEntries = Object.entries(calculationFieldErrors);
      if (nextFieldEntries.length > 0) {
        form.setFields(nextFieldEntries.map(([fieldName, message]) => ({
          name: fieldName,
          errors: [message],
        })));
        calculationFieldErrorNamesRef.current = nextFieldEntries.map(([fieldName]) => fieldName);
        scrollToFirstError();
      } else {
        calculationFieldErrorNamesRef.current = [];
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calculationFieldErrors, form]);

  useEffect(() => {
    if (!selectedClimate) return;
    const tAmbient = climateBasis ? climateTemperature(selectedClimate, climateBasis) : null;
    const wind = climateWind(selectedClimate);
    form.setFieldsValue({
      climate_city: selectedClimate.city ?? selectedClimate.region,
      climate_region: selectedClimate.region,
      climate_temperature_basis: climateBasis,
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
    clearCalculationFieldErrors(Object.keys(changed));
    if (Object.prototype.hasOwnProperty.call(changed, 'climate_key') && !changed.climate_key) {
      form.setFieldsValue({
        climate_city: undefined,
        climate_region: undefined,
        climate_temperature_basis: undefined,
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

  function clearCalculationFieldErrors(changedFieldNames?: string[]) {
    const currentFieldNames = calculationFieldErrorNamesRef.current;
    if (currentFieldNames.length === 0) return;
    const resetAll = !changedFieldNames
      || changedFieldNames.some((fieldName) => (
        fieldName === 'insulation_layer_count'
        || fieldName === 'placement'
        || fieldName === 'shape'
        || fieldName === 'pipe_lambda_mode'
      ));
    const namesToClear = resetAll
      ? currentFieldNames
      : currentFieldNames.filter((fieldName) => changedFieldNames.includes(fieldName));
    if (namesToClear.length === 0) return;
    form.setFields(namesToClear.map((fieldName) => ({ name: fieldName, errors: [] })));
    calculationFieldErrorNamesRef.current = resetAll
      ? []
      : currentFieldNames.filter((fieldName) => !namesToClear.includes(fieldName));
  }

  function resizedSectionWeights(
    handleIndex: number,
    clientX: number,
    startX: number,
    startWeights: HeatCalcFormSectionWeights,
    availableWidth: number,
  ): HeatCalcFormSectionWeights {
    const totalWeight = startWeights.reduce((total, weight) => total + weight, 0);
    const pxPerWeight = availableWidth / totalWeight;
    if (!Number.isFinite(pxPerWeight) || pxPerWeight <= 0) return startWeights;
    const minWeights = SECTION_FIELD_PAIR_MIN_WIDTHS.map((minWidth) =>
      Math.max(0.35, Math.min(1.1, (minWidth / availableWidth) * totalWeight)),
    );
    const pairTotal = startWeights[handleIndex] + startWeights[handleIndex + 1];
    const minLeft = minWeights[handleIndex] ?? 0.35;
    const minRight = minWeights[handleIndex + 1] ?? 0.35;
    const maxLeft = pairTotal - minRight;
    if (maxLeft <= minLeft) return startWeights;
    const deltaWeight = (clientX - startX) / pxPerWeight;
    const nextLeft = Math.min(maxLeft, Math.max(minLeft, startWeights[handleIndex] + deltaWeight));
    const next = [...startWeights] as HeatCalcFormSectionWeights;
    next[handleIndex] = Math.round(nextLeft * 1000) / 1000;
    next[handleIndex + 1] = Math.round((pairTotal - nextLeft) * 1000) / 1000;
    return normalizeFormSectionWeights(next);
  }

  function startSectionResizeDrag(
    handleIndex: number,
    startX: number,
    moveEventName: 'pointermove' | 'mousemove',
    upEventName: 'pointerup' | 'mouseup',
    cancelEventName?: 'pointercancel',
  ) {
    if (!sectionResizeEnabled || !onFormSectionWeightsChange) return;
    const handleWeightsChange: (weights: HeatCalcFormSectionWeights) => void = onFormSectionWeightsChange;
    const handleWeightsCommit = onFormSectionWeightsCommit;
    const rect = formGridRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const startWeights = formSectionWeightsRef.current;
    const availableWidth = Math.max(
      1,
      rect.width - SECTION_RESIZE_HANDLE_WIDTH * 3 - SECTION_GRID_GAP_WIDTH * 6,
    );
    document.body.classList.add('heatcalc-form-section-resizing');

    const finishResize = (event?: PointerEvent | MouseEvent) => {
      window.removeEventListener(moveEventName, handleMove as EventListener);
      window.removeEventListener(upEventName, handleUp as EventListener);
      if (cancelEventName) window.removeEventListener(cancelEventName, handleCancel as EventListener);
      document.body.classList.remove('heatcalc-form-section-resizing');
      const finalWeights = event
        ? resizedSectionWeights(handleIndex, event.clientX, startX, startWeights, availableWidth)
        : formSectionWeightsRef.current;
      handleWeightsChange(finalWeights);
      handleWeightsCommit?.(finalWeights);
    };

    function handleMove(event: PointerEvent | MouseEvent) {
      const nextWeights = resizedSectionWeights(handleIndex, event.clientX, startX, startWeights, availableWidth);
      formSectionWeightsRef.current = nextWeights;
      handleWeightsChange(nextWeights);
    }

    function handleUp(event: PointerEvent | MouseEvent) {
      finishResize(event);
    }

    function handleCancel() {
      finishResize();
    }

    window.addEventListener(moveEventName, handleMove as EventListener);
    window.addEventListener(upEventName, handleUp as EventListener);
    if (cancelEventName) window.addEventListener(cancelEventName, handleCancel as EventListener);
  }

  function startSectionResize(handleIndex: number, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startSectionResizeDrag(handleIndex, event.clientX, 'pointermove', 'pointerup', 'pointercancel');
  }

  function startSectionMouseResize(handleIndex: number, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    startSectionResizeDrag(handleIndex, event.clientX, 'mousemove', 'mouseup');
  }

  function renderSectionResizeHandle(handleIndex: number) {
    const totalWeight = resolvedFormSectionWeights.reduce((total, weight) => total + weight, 0);
    const leftWeight = resolvedFormSectionWeights
      .slice(0, handleIndex + 1)
      .reduce((total, weight) => total + weight, 0);
    const separatorValue = totalWeight > 0 ? Math.round((leftWeight / totalWeight) * 100) : 0;
    return (
      <div
        className="form-col-resize-handle"
        role={sectionResizeEnabled ? 'separator' : undefined}
        aria-label={sectionResizeEnabled ? 'Изменить ширину областей формы' : undefined}
        aria-orientation={sectionResizeEnabled ? 'vertical' : undefined}
        aria-valuemin={sectionResizeEnabled ? 0 : undefined}
        aria-valuemax={sectionResizeEnabled ? 100 : undefined}
        aria-valuenow={sectionResizeEnabled ? separatorValue : undefined}
        tabIndex={sectionResizeEnabled ? 0 : undefined}
        onPointerDown={sectionResizeEnabled ? (event) => startSectionResize(handleIndex, event) : undefined}
        onMouseDown={sectionResizeEnabled ? (event) => startSectionMouseResize(handleIndex, event) : undefined}
      />
    );
  }

  function sectionStyle(idx: number): React.CSSProperties {
    const expandedWeight = resolvedFormSectionWeights.reduce(
      (total, weight) => total + weight,
      0,
    );
    const availableWidth = `100% - ${SECTION_RESIZE_HANDLE_WIDTH * 3 + SECTION_GRID_GAP_WIDTH * 6}px`;
    const share = expandedWeight > 0 ? resolvedFormSectionWeights[idx] / expandedWeight : 1;

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
      <Form.Item name="climate_temperature_basis" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="ambient_temperature_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name="wind_speed_source" hidden noStyle>
        <Input type="hidden" />
      </Form.Item>
      <div className="form-grid-srs" ref={formGridRef}>

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара', 1)}
          <Form.Item
            className="name-form-item helped-form-item"
            label={fieldLabel('name', heatCalcObjectType)}
            name="name"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'name')}
          >
            {withHelp(
              <Input
                data-testid="object-name-input"
                {...heatCalcTextInputProps(heatCalcObjectType, 'name')}
              />,
              fieldHelp('name', heatCalcObjectType),
            )}
          </Form.Item>
          {objectType === 'pipe'
            ? <PipeGeometryStep fieldInputSettings={fieldInputSettings} />
            : <TankGeometryStep fieldInputSettings={fieldInputSettings} />}
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="fit-label-form-item short-number-form-item helped-form-item"
                label={fieldLabel('wall_thickness_mm', heatCalcObjectType)}
                name="wall_thickness_mm"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'wall_thickness_mm')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="wall-thickness-input"
                    {...numberInputProps('wall_thickness_mm')}
                    unit="мм"
                  />,
                  fieldHelp('wall_thickness_mm', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="compact-select-form-item helped-form-item"
                label={fieldLabel('pipe_lambda_mode', heatCalcObjectType)}
                name="pipe_lambda_mode"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'pipe_lambda_mode')}
              >
                {withHelp(
                  <Select
                    data-testid="pipe-lambda-mode-select"
                    placeholder="Выберите режим"
                    options={heatCalcSelectOptions(heatCalcObjectType, 'pipe_lambda_mode')}
                  />,
                  fieldHelp('pipe_lambda_mode', heatCalcObjectType),
                )}
              </Form.Item>
              {pipeLambdaMode === 'manual' ? (
                <Form.Item
                  className="fit-label-form-item helped-form-item"
                  label={fieldLabel('pipe_lambda', heatCalcObjectType)}
                  name="pipe_lambda"
                  preserve={false}
                  rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'pipe_lambda')}
                >
                  {withHelp(
                    <UnitInputNumber
                      data-testid="pipe-lambda-input"
                      {...numberInputProps('pipe_lambda')}
                    unit="Вт/мК"
                    />,
                    fieldHelp('pipe_lambda', heatCalcObjectType),
                  )}
                </Form.Item>
              ) : pipeLambdaMode === 'reference' ? (
                <Form.Item
                  className="pipe-material-form-item reduced-select-form-item helped-form-item"
                  label={fieldLabel('pipe_material', heatCalcObjectType)}
                  name="pipe_material"
                  preserve={false}
                  rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'pipe_material')}
                >
                  {withHelp(
                    <ReferencePicker
                      data-testid="pipe-material-select"
                      options={pipeMaterialOptions}
                      placeholder="Выберите материал"
                      modalTitle="Материал трубы"
                      searchPlaceholder="Поиск материала трубы"
                      {...heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'pipe_material')}
                    />,
                    fieldHelp('pipe_material', heatCalcObjectType),
                  )}
                </Form.Item>
              ) : null}
            </>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel('placement', heatCalcObjectType)}
            name="placement"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'placement')}
          >
            {withHelp(
              <Select
                data-testid="placement-select"
                placeholder="Выберите размещение"
                options={heatCalcSelectOptions(heatCalcObjectType, 'placement')}
              />,
              fieldHelp('placement', heatCalcObjectType),
            )}
          </Form.Item>
          {isUnderground && (
            <>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel('burial_depth', heatCalcObjectType)}
                name="burial_depth"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'burial_depth')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="burial-depth-input"
                    {...numberInputProps('burial_depth')}
                    unit="м"
                  />,
                  fieldHelp('burial_depth', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="fixed-select-form-item helped-form-item"
                label={fieldLabel('ground_type', heatCalcObjectType)}
                name="ground_type"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'ground_type')}
              >
                {withHelp(
                  <ReferencePicker
                    data-testid="ground-type-select"
                    loading={isSoilFetching}
                    placeholder="Выберите грунт"
                    modalTitle="Грунт"
                    searchPlaceholder="Поиск грунта"
                    options={[...soilOptions, { value: 'custom', label: 'Другое' }]}
                    {...heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'ground_type')}
                  />,
                  fieldHelp('ground_type', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('ground_conductivity', heatCalcObjectType)}
                name="ground_conductivity"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'ground_conductivity')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="ground-conductivity-input"
                    {...numberInputProps('ground_conductivity')}
                    unit="Вт/мК"
                  />,
                  fieldHelp('ground_conductivity', heatCalcObjectType),
                )}
              </Form.Item>
            </>
          )}
        </div>

        {renderSectionResizeHandle(0)}

        {/* ── Теплоизоляция ──────────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(1)}
        >
          {renderSectionTitle('Теплоизоляция', 2)}
          <Form.Item
            className="layer-count-form-item insulation-layer-count-form-item helped-form-item"
            label={fieldLabel('insulation_layer_count', heatCalcObjectType)}
            name="insulation_layer_count"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'insulation_layer_count')}
          >
            {withHelp(
              <Select
                data-testid="insulation-layer-count-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'insulation_layer_count')}
                placeholder="Выберите"
              />,
              fieldHelp('insulation_layer_count', heatCalcObjectType),
            )}
          </Form.Item>
          <div className="insulation-layer-group">
            <ThermalStep objectType={heatCalcObjectType} fieldInputSettings={fieldInputSettings} />
          </div>
          {layerCount >= 2 && (
            <div className="insulation-layer-group">
              <Form.Item
                className="medium-select-form-item layer-material-form-item second-layer-material-form-item helped-form-item"
                label={fieldLabel('second_insulation_material', heatCalcObjectType)}
                name="second_insulation_material"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'second_insulation_material')}
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
                    {...heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'second_insulation_material')}
                  />,
                  fieldHelp('second_insulation_material', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item short-number-form-item second-layer-thickness-form-item helped-form-item"
                label={fieldLabel('second_insulation_thickness_mm', heatCalcObjectType)}
                name="second_insulation_thickness_mm"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'second_insulation_thickness_mm')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="second-insulation-thickness-input"
                    {...numberInputProps('second_insulation_thickness_mm')}
                    unit="мм"
                  />,
                  fieldHelp('second_insulation_thickness_mm', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('second_insulation_lambda', heatCalcObjectType)}
                name={secondInsulationIsOther ? 'second_insulation_lambda' : undefined}
                preserve={false}
                rules={secondInsulationIsOther
                  ? heatCalcFormFieldRules(form, heatCalcObjectType, 'second_insulation_lambda')
                  : undefined}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="second-insulation-lambda-input"
                    disabled={!secondInsulationIsOther}
                    value={secondInsulationIsOther ? undefined : selectedSecondInsulation?.conductivity}
                    {...numberInputProps('second_insulation_lambda')}
                    unit="Вт/мК"
                  />,
                  fieldHelp('second_insulation_lambda', heatCalcObjectType, secondInsulationIsOther ? 'manual' : 'reference'),
                )}
              </Form.Item>
              <InsulationTemperatureRangeField
                material={secondInsulationMaterial}
                selectedMaterial={selectedSecondInsulation}
                minName="second_insulation_temperature_min"
                maxName="second_insulation_temperature_max"
                dataTestIdPrefix="second-insulation"
                objectType={heatCalcObjectType}
                labelFieldId="second_insulation_temperature_range"
                hint={fieldHelp('second_insulation_temperature_range', heatCalcObjectType)}
                required={heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'second_insulation_temperature_range').required}
              />
            </div>
          )}
          {layerCount >= 3 && (
            <div className="insulation-layer-group">
              <Form.Item
                className="medium-select-form-item layer-material-form-item third-layer-material-form-item helped-form-item"
                label={fieldLabel('third_insulation_material', heatCalcObjectType)}
                name="third_insulation_material"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'third_insulation_material')}
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
                    {...heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'third_insulation_material')}
                  />,
                  fieldHelp('third_insulation_material', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item short-number-form-item third-layer-thickness-form-item helped-form-item"
                label={fieldLabel('third_insulation_thickness_mm', heatCalcObjectType)}
                name="third_insulation_thickness_mm"
                preserve={false}
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'third_insulation_thickness_mm')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="third-insulation-thickness-input"
                    {...numberInputProps('third_insulation_thickness_mm')}
                    unit="мм"
                  />,
                  fieldHelp('third_insulation_thickness_mm', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('third_insulation_lambda', heatCalcObjectType)}
                name={thirdInsulationIsOther ? 'third_insulation_lambda' : undefined}
                preserve={false}
                rules={thirdInsulationIsOther
                  ? heatCalcFormFieldRules(form, heatCalcObjectType, 'third_insulation_lambda')
                  : undefined}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="third-insulation-lambda-input"
                    disabled={!thirdInsulationIsOther}
                    value={thirdInsulationIsOther ? undefined : selectedThirdInsulation?.conductivity}
                    {...numberInputProps('third_insulation_lambda')}
                    unit="Вт/мК"
                  />,
                  fieldHelp('third_insulation_lambda', heatCalcObjectType, thirdInsulationIsOther ? 'manual' : 'reference'),
                )}
              </Form.Item>
              <InsulationTemperatureRangeField
                material={thirdInsulationMaterial}
                selectedMaterial={selectedThirdInsulation}
                minName="third_insulation_temperature_min"
                maxName="third_insulation_temperature_max"
                dataTestIdPrefix="third-insulation"
                objectType={heatCalcObjectType}
                labelFieldId="third_insulation_temperature_range"
                hint={fieldHelp('third_insulation_temperature_range', heatCalcObjectType)}
                required={heatCalcCustomControlRequiredProps(form, heatCalcObjectType, 'third_insulation_temperature_range').required}
              />
            </div>
          )}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item insulation-cover-form-item helped-form-item"
            label={fieldLabel('insulation_cover_material', heatCalcObjectType)}
            name="insulation_cover_material"
          >
            {withHelp(
              <Select
                options={heatCalcSelectOptions(heatCalcObjectType, 'insulation_cover_material')}
                placeholder="Не указано"
              />,
              fieldHelp('insulation_cover_material', heatCalcObjectType),
            )}
          </Form.Item>
        </div>

        {renderSectionResizeHandle(1)}

        {/* ── Температура и среда ────────────────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(2)}
        >
          {renderSectionTitle('Температура и среда', 3)}
          <Form.Item
            className="fixed-select-form-item reduced-select-form-item helped-form-item"
            label={fieldLabel('climate_key', heatCalcObjectType)}
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
              fieldHelp('climate_key', heatCalcObjectType),
            )}
          </Form.Item>
          {hasClimate && (
            <Form.Item
              className="compact-select-form-item helped-form-item"
              label={fieldLabel('climate_temperature_basis', heatCalcObjectType)}
            >
              {withHelp(
                <Input
                  data-testid="climate-basis-display"
                  readOnly
                  value={climateBasisDisplay}
                />,
                `${fieldHelp('climate_temperature_basis', heatCalcObjectType)} Значение применяется автоматически по алгоритму климата.`,
              )}
            </Form.Item>
          )}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('ambient_temperature', heatCalcObjectType)}
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
              <UnitInputNumber
                data-testid="ambient-temperature-input"
                {...numberInputProps('ambient_temperature')}
                    unit="°C"
              />,
              fieldHelp('ambient_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('process_temperature', heatCalcObjectType)}
            name="process_temperature"
            dependencies={['ambient_temperature']}
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'process_temperature')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="process-temperature-input"
                {...numberInputProps('process_temperature')}
                    unit="°C"
              />,
              fieldHelp('process_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          {showWindField && (
            <Form.Item
              className="numeric-form-item short-number-form-item helped-form-item"
              label={fieldLabel('wind_speed', heatCalcObjectType)}
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
                ...heatCalcFormFieldRules(form, heatCalcObjectType, 'wind_speed'),
              ]}
            >
              {withHelp(
                <UnitInputNumber
                  data-testid="wind-speed-input"
                  {...numberInputProps('wind_speed')}
                    unit="м/с"
                />,
                fieldHelp('wind_speed', heatCalcObjectType),
              )}
            </Form.Item>
          )}
          {showAlphaField && (
            <Form.Item
              className="numeric-form-item coefficient-form-item alpha-vnesh-form-item helped-form-item"
              label={fieldLabel('alpha_vnesh', heatCalcObjectType)}
              name="alpha_vnesh"
              preserve={false}
              rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'alpha_vnesh')}
            >
              {withHelp(
                <UnitInputNumber
                  data-testid="alpha-vnesh-input"
                  {...numberInputProps('alpha_vnesh')}
                    unit="Вт/м²К"
                />,
                fieldHelp('alpha_vnesh', heatCalcObjectType),
              )}
            </Form.Item>
          )}
          <Form.Item
            className="numeric-form-item temperature-number-form-item max-ambient-temperature-form-item helped-form-item"
            label={fieldLabel('max_ambient_temperature', heatCalcObjectType)}
            name="max_ambient_temperature"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'max_ambient_temperature')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="max-ambient-temperature-input"
                {...numberInputProps('max_ambient_temperature')}
                    unit="°C"
              />,
              fieldHelp('max_ambient_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('max_process_temperature', heatCalcObjectType)}
            name="max_process_temperature"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'max_process_temperature')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="max-process-temperature-input"
                {...numberInputProps('max_process_temperature')}
                    unit="°C"
              />,
              fieldHelp('max_process_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item environment-form-item helped-form-item"
            label={fieldLabel('environment', heatCalcObjectType)}
            name="environment"
          >
            {withHelp(
              <Select
                data-testid="environment-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'environment')}
                placeholder="Выберите среду"
              />,
              fieldHelp('environment', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="medium-select-form-item zone-classification-form-item helped-form-item"
            label={fieldLabel('zone_classification', heatCalcObjectType)}
            name="zone_classification"
          >
            {withHelp(
              <Select
                data-testid="zone-classification-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'zone_classification')}
                placeholder="Выберите зону"
              />,
              fieldHelp('zone_classification', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="temperature-group-form-item helped-form-item"
            label={fieldLabel('temperature_group', heatCalcObjectType)}
            name="temperature_group"
          >
            {withHelp(
              <Select
                data-testid="temperature-group-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'temperature_group')}
                placeholder="Выберите"
              />,
              fieldHelp('temperature_group', heatCalcObjectType),
            )}
          </Form.Item>
        </div>

        {renderSectionResizeHandle(2)}

        {/* ── Электропараметры и арматура ───────────────────────────── */}
        <div
          className="form-col-srs"
          style={sectionStyle(3)}
        >
          {renderSectionTitle('Электропараметры и арматура', 4)}
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('min_switch_temperature', heatCalcObjectType)}
            name="min_switch_temperature"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'min_switch_temperature')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="min-switch-temperature-input"
                {...numberInputProps('min_switch_temperature')}
                    unit="°C"
              />,
              fieldHelp('min_switch_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('supply_voltage', heatCalcObjectType)}
            name="supply_voltage"
          >
            {withHelp(
              <Select
                data-testid="supply-voltage-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'supply_voltage')}
                placeholder="Выберите"
              />,
              fieldHelp('supply_voltage', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item coefficient-form-item helped-form-item"
            label={fieldLabel('safety_factor', heatCalcObjectType)}
            name="safety_factor"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'safety_factor')}
          >
            {withHelp(
              <InputNumber
                data-testid="safety-factor-input"
                {...numberInputProps('safety_factor')}
              />,
              fieldHelp('safety_factor', heatCalcObjectType),
            )}
          </Form.Item>
          {objectType === 'tank' && (
            <Form.Item
              className="numeric-form-item coefficient-form-item helped-form-item"
              label={fieldLabel('q_additional', heatCalcObjectType)}
              name="q_additional"
              preserve={false}
              rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'q_additional')}
            >
              {withHelp(
                <UnitInputNumber
                  data-testid="q-additional-input"
                  {...numberInputProps('q_additional')}
                    unit="Вт"
                />,
                fieldHelp('q_additional', heatCalcObjectType),
              )}
            </Form.Item>
          )}
          <Form.Item
            className="compact-select-form-item helped-form-item"
            label={fieldLabel('steam_tracing', heatCalcObjectType)}
            name="steam_tracing"
          >
            {withHelp(
              <Select
                data-testid="steam-tracing-select"
                options={heatCalcSelectOptions(heatCalcObjectType, 'steam_tracing')}
                placeholder="Выберите"
              />,
              fieldHelp('steam_tracing', heatCalcObjectType),
            )}
          </Form.Item>
          <Form.Item
            className="numeric-form-item temperature-number-form-item helped-form-item"
            label={fieldLabel('vapor_temperature', heatCalcObjectType)}
            name="vapor_temperature"
            rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'vapor_temperature')}
          >
            {withHelp(
              <UnitInputNumber
                data-testid="vapor-temperature-input"
                {...numberInputProps('vapor_temperature')}
                unit="°C"
              />,
              fieldHelp('vapor_temperature', heatCalcObjectType),
            )}
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('valve_count', heatCalcObjectType)}
                name="valve_count"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'valve_count')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="valve-count-input"
                    {...numberInputProps('valve_count')}
                    unit="шт"
                  />,
                  fieldHelp('valve_count', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('flange_count', heatCalcObjectType)}
                name="flange_count"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'flange_count')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="flange-count-input"
                    {...numberInputProps('flange_count')}
                    unit="шт"
                  />,
                  fieldHelp('flange_count', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item fitting-count-form-item helped-form-item"
                label={fieldLabel('support_count', heatCalcObjectType)}
                name="support_count"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'support_count')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="support-count-input"
                    {...numberInputProps('support_count')}
                    unit="шт"
                  />,
                  fieldHelp('support_count', heatCalcObjectType),
                )}
              </Form.Item>
              <Form.Item
                className="numeric-form-item coefficient-form-item helped-form-item"
                label={fieldLabel('local_element_equiv_length', heatCalcObjectType)}
                name="local_element_equiv_length"
                rules={heatCalcFormFieldRules(form, heatCalcObjectType, 'local_element_equiv_length')}
              >
                {withHelp(
                  <UnitInputNumber
                    data-testid="local-element-equiv-length-input"
                    {...numberInputProps('local_element_equiv_length')}
                    unit="м"
                  />,
                  fieldHelp('local_element_equiv_length', heatCalcObjectType),
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
