export type ElectricalErrorKind =
  | 'missing_tank_layout'
  | 'power_too_high'
  | 'temperature_too_high'
  | 'resistive_section_not_found'
  | 'unknown';

export type ElectricalErrorCode =
  | 'MISSING_TANK_LAYOUT'
  | 'POWER_TOO_HIGH'
  | 'TEMPERATURE_TOO_HIGH'
  | 'RESISTIVE_SECTION_NOT_FOUND'
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
  | 'TRY_OTHER_CABLE_TYPE';

export type ElectricalErrorGuidance = {
  kind: ElectricalErrorKind;
  errorCode: ElectricalErrorCode;
  label: string;
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
  power_too_high: 'POWER_TOO_HIGH',
  temperature_too_high: 'TEMPERATURE_TOO_HIGH',
  resistive_section_not_found: 'RESISTIVE_SECTION_NOT_FOUND',
  unknown: 'UNKNOWN',
};

const ERROR_KIND_BY_CODE: Record<ElectricalErrorCode, ElectricalErrorKind> = {
  MISSING_TANK_LAYOUT: 'missing_tank_layout',
  POWER_TOO_HIGH: 'power_too_high',
  TEMPERATURE_TOO_HIGH: 'temperature_too_high',
  RESISTIVE_SECTION_NOT_FOUND: 'resistive_section_not_found',
  UNKNOWN: 'unknown',
};

const ERROR_META: Record<ElectricalErrorKind, Pick<ElectricalErrorGuidance, 'label' | 'tagColor'>> = {
  missing_tank_layout: {
    label: 'Нет геометрии укладки',
    tagColor: 'volcano',
  },
  power_too_high: {
    label: 'Мощность выше линейки',
    tagColor: 'orange',
  },
  temperature_too_high: {
    label: 'Температура вне допуска',
    tagColor: 'red',
  },
  resistive_section_not_found: {
    label: 'Нет секции кабеля',
    tagColor: 'magenta',
  },
  unknown: {
    label: 'Ошибка подбора',
    tagColor: 'default',
  },
};

const DEFAULT_ACTIONS_BY_KIND: Record<ElectricalErrorKind, ElectricalSuggestedAction[]> = {
  missing_tank_layout: ['SET_HEATING_HEIGHT', 'SET_LAYING_STEP', 'SET_TANK_LAYOUT'],
  power_too_high: ['TRY_OTHER_CABLE_TYPE'],
  temperature_too_high: ['CHECK_PROCESS_TEMPERATURE', 'CHECK_VAPOR_TEMPERATURE', 'TRY_OTHER_CABLE_TYPE'],
  resistive_section_not_found: ['TRY_OTHER_CONNECTION', 'CHECK_VOLTAGE', 'TRY_OTHER_CABLE_TYPE'],
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
  CHECK_PROCESS_TEMPERATURE: 'Проверить T продукта',
  CHECK_AMBIENT_TEMPERATURE: 'Проверить T среды',
  CHECK_VAPOR_TEMPERATURE: 'Проверить T проп.',
  CHECK_OBJECT_PARAMS: 'Проверить параметры объекта',
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

  return {
    kind,
    errorCode: resolvedCode,
    ...ERROR_META[kind],
    suggestedActions,
    suggestions: suggestedActions.map((action) => ACTION_LABELS[action]),
  };
}
