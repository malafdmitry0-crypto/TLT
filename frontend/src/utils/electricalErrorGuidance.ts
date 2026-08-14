export type ElectricalErrorKind =
  | 'missing_tank_layout'
  | 'tank_layout_input_unsupported'
  | 'power_too_high'
  | 'temperature_too_high'
  | 'cable_temperature_limit_exceeded'
  | 'resistive_section_not_found'
  | 'section_current_limit_required'
  | 'unknown';

export type ElectricalErrorCode =
  | 'MISSING_TANK_LAYOUT'
  | 'ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED'
  | 'POWER_TOO_HIGH'
  | 'TEMPERATURE_TOO_HIGH'
  | 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED'
  | 'RESISTIVE_SECTION_NOT_FOUND'
  | 'SECTION_CURRENT_LIMIT_REQUIRED'
  | 'UNKNOWN';

export type ElectricalSuggestedAction =
  | 'SET_HEATING_HEIGHT'
  | 'SET_LAYING_STEP'
  | 'SET_TANK_LAYOUT'
  | 'TRY_2_THREADS'
  | 'TRY_3_THREADS'
  | 'TRY_TT'
  | 'TRY_RESISTIVE'
  | 'TRY_SINGLE_CORE_RESISTIVE'
  | 'TRY_THREE_CORE_RESISTIVE'
  | 'TRY_SELF_REGULATING'
  | 'TRY_OTHER_CONNECTION'
  | 'CHECK_VOLTAGE'
  | 'CHECK_PROCESS_TEMPERATURE'
  | 'CHECK_AMBIENT_TEMPERATURE'
  | 'CHECK_VAPOR_TEMPERATURE'
  | 'CHECK_OBJECT_PARAMS'
  | 'SET_PROJECT_CURRENT_LIMIT'
  | 'TRY_OTHER_CABLE_TYPE';

export type ElectricalErrorGuidance = {
  kind: ElectricalErrorKind;
  errorCode: ElectricalErrorCode;
  label: string;
  message?: string;
  suggestedActions: ElectricalSuggestedAction[];
  suggestions: string[];
  tagColor: string;
};

export type ElectricalErrorGuidanceInput = {
  error?: string | null;
  errorCode?: string | null;
  suggestedActions?: string[] | null;
  cableType?: string | null;
  errorContext?: Record<string, unknown> | null;
};

const ERROR_CODE_BY_KIND: Record<ElectricalErrorKind, ElectricalErrorCode> = {
  missing_tank_layout: 'MISSING_TANK_LAYOUT',
  tank_layout_input_unsupported: 'ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED',
  power_too_high: 'POWER_TOO_HIGH',
  temperature_too_high: 'TEMPERATURE_TOO_HIGH',
  cable_temperature_limit_exceeded: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
  resistive_section_not_found: 'RESISTIVE_SECTION_NOT_FOUND',
  section_current_limit_required: 'SECTION_CURRENT_LIMIT_REQUIRED',
  unknown: 'UNKNOWN',
};

const ERROR_KIND_BY_CODE: Record<ElectricalErrorCode, ElectricalErrorKind> = {
  MISSING_TANK_LAYOUT: 'missing_tank_layout',
  ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED: 'tank_layout_input_unsupported',
  POWER_TOO_HIGH: 'power_too_high',
  TEMPERATURE_TOO_HIGH: 'temperature_too_high',
  ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED: 'cable_temperature_limit_exceeded',
  RESISTIVE_SECTION_NOT_FOUND: 'resistive_section_not_found',
  SECTION_CURRENT_LIMIT_REQUIRED: 'section_current_limit_required',
  UNKNOWN: 'unknown',
};

const ERROR_META: Record<
  ElectricalErrorKind,
  Pick<ElectricalErrorGuidance, 'label' | 'message' | 'tagColor'>
> = {
  missing_tank_layout: {
    label: 'Нет геометрии укладки',
    tagColor: 'volcano',
  },
  tank_layout_input_unsupported: {
    label: 'Неверная укладка резервуара',
    message: 'Для резервуара нельзя задавать трубный шаг намотки',
    tagColor: 'red',
  },
  power_too_high: {
    label: 'Мощность выше линейки',
    tagColor: 'orange',
  },
  temperature_too_high: {
    label: 'Температура вне допуска',
    tagColor: 'red',
  },
  cable_temperature_limit_exceeded: {
    label: 'Температура вне допуска',
    tagColor: 'red',
  },
  resistive_section_not_found: {
    label: 'Нет секции кабеля',
    tagColor: 'magenta',
  },
  section_current_limit_required: {
    label: 'Не задан I доп проекта',
    message: 'Задайте допустимый стартовый ток одной секции в настройках проекта',
    tagColor: 'red',
  },
  unknown: {
    label: 'Ошибка подбора',
    tagColor: 'default',
  },
};

const DEFAULT_ACTIONS_BY_KIND: Record<ElectricalErrorKind, ElectricalSuggestedAction[]> = {
  missing_tank_layout: ['SET_HEATING_HEIGHT', 'SET_LAYING_STEP', 'SET_TANK_LAYOUT'],
  tank_layout_input_unsupported: ['SET_TANK_LAYOUT'],
  power_too_high: ['TRY_OTHER_CABLE_TYPE'],
  temperature_too_high: ['CHECK_PROCESS_TEMPERATURE', 'CHECK_VAPOR_TEMPERATURE', 'TRY_OTHER_CABLE_TYPE'],
  cable_temperature_limit_exceeded: ['CHECK_AMBIENT_TEMPERATURE', 'CHECK_PROCESS_TEMPERATURE', 'TRY_OTHER_CABLE_TYPE'],
  resistive_section_not_found: ['TRY_OTHER_CONNECTION', 'CHECK_VOLTAGE', 'TRY_OTHER_CABLE_TYPE'],
  section_current_limit_required: ['SET_PROJECT_CURRENT_LIMIT'],
  unknown: ['CHECK_OBJECT_PARAMS', 'TRY_OTHER_CABLE_TYPE'],
};

const ACTION_LABELS: Record<ElectricalSuggestedAction, string> = {
  SET_HEATING_HEIGHT: 'Задать высоту обогрева',
  SET_LAYING_STEP: 'Задать шаг укладки',
  SET_TANK_LAYOUT: 'Выбрать геометрию укладки',
  TRY_2_THREADS: 'Попробовать 2 нитки',
  TRY_3_THREADS: 'Попробовать 3 нитки',
  TRY_TT: 'Попробовать ТТН/ТТВ/ТТХ',
  TRY_RESISTIVE: 'Попробовать резистивный',
  TRY_SINGLE_CORE_RESISTIVE: 'Попробовать одножильный резистивный',
  TRY_THREE_CORE_RESISTIVE: 'Попробовать трёхжильный резистивный',
  TRY_SELF_REGULATING: 'Попробовать саморегулирующийся',
  TRY_OTHER_CONNECTION: 'Попробовать другую схему',
  CHECK_VOLTAGE: 'Проверить напряжение',
  CHECK_PROCESS_TEMPERATURE: 'Проверить температуру продукта',
  CHECK_AMBIENT_TEMPERATURE: 'Проверить температуру среды',
  CHECK_VAPOR_TEMPERATURE: 'Проверить температуру пропарки',
  CHECK_OBJECT_PARAMS: 'Проверить параметры объекта',
  SET_PROJECT_CURRENT_LIMIT: 'Задать I доп проекта',
  TRY_OTHER_CABLE_TYPE: 'Попробовать другой тип кабеля',
};

const SUPPORTED_TANK_LAYOUT_SHAPES = new Set(['cylindrical', 'rectangular']);

function normalizeErrorCode(code: string | null | undefined): ElectricalErrorCode | null {
  if (!code) return null;
  const normalized = code.toUpperCase();
  return normalized in ERROR_KIND_BY_CODE ? (normalized as ElectricalErrorCode) : null;
}

function normalizeSuggestedAction(action: string): ElectricalSuggestedAction | null {
  const normalized = action.toUpperCase();
  return normalized in ACTION_LABELS ? (normalized as ElectricalSuggestedAction) : null;
}

function contextValue(input: ElectricalErrorGuidanceInput, key: string): unknown {
  if (key === 'cable_type' && input.cableType) return input.cableType;
  return input.errorContext?.[key];
}

function contextString(input: ElectricalErrorGuidanceInput, key: string): string | null {
  const value = contextValue(input, key);
  return value === null || value === undefined || value === '' ? null : String(value);
}

function contextNumber(input: ElectricalErrorGuidanceInput, key: string): number | null {
  const value = contextValue(input, key);
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function contextStringArray(input: ElectricalErrorGuidanceInput, key: string): string[] {
  const value = contextValue(input, key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

const TEMPERATURE_FORMATTER = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
});

function formatTemperature(value: number): string {
  return `${TEMPERATURE_FORMATTER.format(value)} °C`;
}

function cableTemperatureLimitMessage(input: ElectricalErrorGuidanceInput): string | undefined {
  const ambient = contextNumber(input, 'ambient_temperature_c');
  const minimumAmbient = contextNumber(input, 'minimum_supported_ambient_temperature_c');
  const product = contextNumber(input, 'product_temperature_c');
  const maximumProduct = contextNumber(input, 'maximum_supported_product_temperature_c');
  const violations = contextStringArray(input, 'violations');
  const reasons: string[] = [];

  if (
    violations.includes('ambient_below_minimum')
    && ambient != null
    && minimumAmbient != null
  ) {
    reasons.push(
      `Температура окружающей среды ${formatTemperature(ambient)} ниже допустимой для доступных марок кабеля: минимум ${formatTemperature(minimumAmbient)}.`,
    );
  }
  if (
    violations.includes('product_above_maximum')
    && product != null
    && maximumProduct != null
  ) {
    reasons.push(
      `Температура продукта ${formatTemperature(product)} выше допустимой для доступных марок кабеля: максимум ${formatTemperature(maximumProduct)}.`,
    );
  }
  if (violations.includes('temperature_combination_unsupported')) {
    reasons.push(
      ambient != null && product != null
        ? `Для сочетания температур среды ${formatTemperature(ambient)} и продукта ${formatTemperature(product)} нет подходящей марки кабеля.`
        : 'Для заданного сочетания температур среды и продукта нет подходящей марки кабеля.',
    );
  }
  return reasons.length > 0 ? reasons.join(' ') : undefined;
}

function hasPositiveContextNumber(input: ElectricalErrorGuidanceInput, key: string): boolean {
  const value = contextValue(input, key);
  if (value === null || value === undefined || value === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function appendUnique(actions: ElectricalSuggestedAction[], action: ElectricalSuggestedAction) {
  if (!actions.includes(action)) actions.push(action);
}

function fallbackActionsForKind(
  kind: ElectricalErrorKind,
  input: ElectricalErrorGuidanceInput,
): ElectricalSuggestedAction[] {
  if (kind === 'missing_tank_layout') {
    const shape = contextString(input, 'shape');
    if (shape && !SUPPORTED_TANK_LAYOUT_SHAPES.has(shape)) {
      return ['SET_TANK_LAYOUT'];
    }
    const actions: ElectricalSuggestedAction[] = [];
    if (!hasPositiveContextNumber(input, 'heating_height')) appendUnique(actions, 'SET_HEATING_HEIGHT');
    if (!hasPositiveContextNumber(input, 'laying_step')) appendUnique(actions, 'SET_LAYING_STEP');
    return actions.length ? actions : ['SET_TANK_LAYOUT'];
  }

  if (kind === 'power_too_high') {
    return ['TRY_OTHER_CABLE_TYPE'];
  }

  if (kind === 'temperature_too_high') {
    const actions: ElectricalSuggestedAction[] = [];
    const subject = contextString(input, 'temperature_subject');
    if (subject === 'ambient') appendUnique(actions, 'CHECK_AMBIENT_TEMPERATURE');
    else if (subject === 'vapor') appendUnique(actions, 'CHECK_VAPOR_TEMPERATURE');
    else if (subject === 'product') appendUnique(actions, 'CHECK_PROCESS_TEMPERATURE');
    else {
      appendUnique(actions, 'CHECK_PROCESS_TEMPERATURE');
      appendUnique(actions, 'CHECK_VAPOR_TEMPERATURE');
    }
    appendUnique(actions, 'TRY_OTHER_CABLE_TYPE');
    return actions.length ? actions : ['CHECK_OBJECT_PARAMS'];
  }

  if (kind === 'resistive_section_not_found') {
    const actions: ElectricalSuggestedAction[] = ['TRY_OTHER_CONNECTION', 'CHECK_VOLTAGE'];
    appendUnique(actions, 'TRY_OTHER_CABLE_TYPE');
    return actions;
  }

  if (kind === 'section_current_limit_required') {
    return ['SET_PROJECT_CURRENT_LIMIT'];
  }

  return DEFAULT_ACTIONS_BY_KIND[kind];
}

function guidanceInput(
  input: ElectricalErrorGuidanceInput | string | null | undefined,
): ElectricalErrorGuidanceInput {
  return typeof input === 'string' || input == null
    ? { error: input ?? null }
    : input;
}

export function getElectricalErrorGuidance(
  input: ElectricalErrorGuidanceInput | string | null | undefined,
): ElectricalErrorGuidance | null {
  const normalizedInput = guidanceInput(input);
  const errorCode = normalizeErrorCode(normalizedInput.errorCode);
  const actionsFromBackend = normalizedInput.suggestedActions
    ?.map(normalizeSuggestedAction)
    .filter((action): action is ElectricalSuggestedAction => action != null);
  if (!errorCode && !actionsFromBackend?.length) {
    return null;
  }
  const kind = errorCode ? ERROR_KIND_BY_CODE[errorCode] : 'unknown';
  const resolvedCode = errorCode ?? ERROR_CODE_BY_KIND[kind];
  const suggestedActions = actionsFromBackend?.length
    ? actionsFromBackend
    : fallbackActionsForKind(kind, normalizedInput);
  const contextualMessage = kind === 'cable_temperature_limit_exceeded'
    ? cableTemperatureLimitMessage(normalizedInput)
    : undefined;

  return {
    kind,
    errorCode: resolvedCode,
    ...ERROR_META[kind],
    ...(contextualMessage ? { message: contextualMessage } : {}),
    suggestedActions,
    suggestions: suggestedActions.map((action) => ACTION_LABELS[action]),
  };
}
