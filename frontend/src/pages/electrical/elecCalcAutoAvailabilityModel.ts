import type { CableOptionOut } from '@/api/calculations';

const TEMPERATURE_REASON = 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED';
const CATALOG_REASON = 'ELECTRICAL_POWER_CATALOG_PROVISIONAL';
const CATALOG_ROW_REASON = 'ELECTRICAL_CATALOG_ROW_INVALID';

const REASON_MESSAGES: Record<string, string> = {
  [TEMPERATURE_REASON]: 'температурные пределы марок не подходят',
  [CATALOG_REASON]: 'каталог не подтверждён для рабочего расчёта',
  [CATALOG_ROW_REASON]: 'данные марок в каталоге некорректны',
};

export type ElecCalcAutoAvailabilityKind =
  | 'available'
  | 'loading'
  | 'request_error'
  | 'catalog_empty'
  | 'temperature'
  | 'catalog'
  | 'mixed'
  | 'unknown';

export type ElecCalcAutoAvailability = {
  kind: ElecCalcAutoAvailabilityKind;
  blocked: boolean;
  message: string | null;
  tone: 'info' | 'warning' | 'danger';
  canRetry: boolean;
};

type AutoAvailabilityInput = {
  enabled: boolean;
  status: 'pending' | 'error' | 'success';
  options?: readonly CableOptionOut[];
};

const AVAILABLE: ElecCalcAutoAvailability = {
  kind: 'available',
  blocked: false,
  message: null,
  tone: 'info',
  canRetry: false,
};

function blocked(
  kind: Exclude<ElecCalcAutoAvailabilityKind, 'available'>,
  message: string,
  options: Pick<ElecCalcAutoAvailability, 'tone' | 'canRetry'> = {
    tone: 'warning',
    canRetry: false,
  },
): ElecCalcAutoAvailability {
  return { kind, blocked: true, message, ...options };
}

function temperatureMessage(options: readonly CableOptionOut[]): string {
  const sample = options[0];
  const ambient = sample?.object_ambient_temperature_c;
  const product = sample?.object_product_temperature_c;
  const supportedAmbient = options
    .map((option) => option.min_ambient_temperature_c)
    .filter((value): value is number => typeof value === 'number');
  const supportedProduct = options
    .map((option) => option.max_product_temperature_c)
    .filter((value): value is number => typeof value === 'number');
  const facts = [
    typeof ambient === 'number' ? `среда ${ambient.toLocaleString('ru-RU')} °C` : null,
    typeof product === 'number' ? `продукт ${product.toLocaleString('ru-RU')} °C` : null,
    supportedAmbient.length > 0
      ? `минимально допустимая среда ${Math.min(...supportedAmbient).toLocaleString('ru-RU')} °C`
      : null,
    supportedProduct.length > 0
      ? `максимально допустимый продукт ${Math.max(...supportedProduct).toLocaleString('ru-RU')} °C`
      : null,
  ].filter((fact): fact is string => fact != null);

  return `Автоподбор недоступен: нет марки, подходящей по температурам${
    facts.length > 0 ? ` (${facts.join('; ')})` : ''
  }.`;
}

export function buildElecCalcAutoAvailability({
  enabled,
  status,
  options,
}: AutoAvailabilityInput): ElecCalcAutoAvailability {
  if (!enabled) return AVAILABLE;
  if (status === 'pending') {
    return blocked('loading', 'Проверяем допустимые марки кабеля…', {
      tone: 'info',
      canRetry: false,
    });
  }
  if (status === 'error') {
    return blocked(
      'request_error',
      'Не удалось проверить допустимые марки. Повторите проверку.',
      { tone: 'danger', canRetry: true },
    );
  }

  const resolvedOptions = options ?? [];
  if (resolvedOptions.some((option) => option.eligible)) return AVAILABLE;
  if (resolvedOptions.length === 0) {
    return blocked(
      'catalog_empty',
      'Автоподбор недоступен: в каталоге нет марок кабеля для этого объекта.',
    );
  }

  const reasons = [...new Set(resolvedOptions.map((option) => option.unavailable_reason))];
  if (reasons.length === 1 && reasons[0] === TEMPERATURE_REASON) {
    return blocked('temperature', temperatureMessage(resolvedOptions));
  }
  if (reasons.length === 1 && (reasons[0] === CATALOG_REASON || reasons[0] === CATALOG_ROW_REASON)) {
    return blocked('catalog', `Автоподбор недоступен: ${REASON_MESSAGES[reasons[0]]}.`);
  }

  const knownReasons = [...new Set(reasons.flatMap((reason) => (
    reason && REASON_MESSAGES[reason] ? [REASON_MESSAGES[reason]] : []
  )))];
  const hasUnknownReason = reasons.some((reason) => !reason || !REASON_MESSAGES[reason]);
  if (knownReasons.length > 0 && (knownReasons.length > 1 || hasUnknownReason)) {
    const descriptions = hasUnknownReason
      ? [...knownReasons, 'другая причина, определённая сервером расчёта']
      : knownReasons;
    return blocked(
      'mixed',
      `Автоподбор недоступен. Причины: ${descriptions.join('; ')}.`,
    );
  }

  return blocked(
    'unknown',
    'Автоподбор недоступен: сервер расчёта не разрешил ни одну марку. Выберите марку вручную или проверьте каталог.',
  );
}
