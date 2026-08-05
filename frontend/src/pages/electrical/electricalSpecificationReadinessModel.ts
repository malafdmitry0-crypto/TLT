import type { ElectricalAssignmentCounts } from '@/types/electricalVariant';

export type ElectricalSpecificationReadinessSnapshot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; counts: ElectricalAssignmentCounts };

export type ElectricalSpecificationReadiness = {
  enabled: boolean;
  disabledReason: string | null;
};

const LOADING_REASON = 'Проверяем готовность электрорасчёта';

export function resolveElectricalSpecificationReadiness(
  snapshot: ElectricalSpecificationReadinessSnapshot | null | undefined,
): ElectricalSpecificationReadiness {
  if (!snapshot || snapshot.status === 'loading') {
    return { enabled: false, disabledReason: LOADING_REASON };
  }
  if (snapshot.status === 'error') {
    return {
      enabled: false,
      disabledReason: 'Не удалось проверить готовность электрорасчёта',
    };
  }

  const { total, by_state: byState } = snapshot.counts;
  if (total > 0 && byState.ready === total) {
    return { enabled: true, disabledReason: null };
  }
  if (total <= 0) {
    return {
      enabled: false,
      disabledReason: 'В электрорасчёте нет объектов',
    };
  }
  if (byState.unassigned > 0) {
    return {
      enabled: false,
      disabledReason: 'Сначала распределите все объекты по системам обогрева',
    };
  }
  if (byState.stale > 0) {
    return {
      enabled: false,
      disabledReason: 'Пересчитайте устаревшие объекты',
    };
  }
  if (byState.error > 0) {
    return {
      enabled: false,
      disabledReason: 'Исправьте ошибки электрорасчёта',
    };
  }
  if (byState.unsupported > 0) {
    return {
      enabled: false,
      disabledReason: 'В электрорасчёте есть неподдерживаемые объекты',
    };
  }
  return {
    enabled: false,
    disabledReason: 'Завершите электрорасчёт для всех объектов',
  };
}
