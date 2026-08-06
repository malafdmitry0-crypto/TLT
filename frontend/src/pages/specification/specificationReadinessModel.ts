import type {
  SpecificationDiagnostic,
  SpecificationReadinessBlocker,
  SpecificationReadinessResponse,
} from '@/api/specifications';

export type SpecificationReadinessViewState =
  | 'loading'
  | 'ready'
  | 'blocked'
  | 'calculating'
  | 'failed'
  | 'unavailable'
  | 'unknown';

export type SpecificationReadinessView = {
  state: SpecificationReadinessViewState;
  blockers: SpecificationReadinessBlocker[];
  primaryBlocker: SpecificationReadinessBlocker | null;
};

export function resolveSpecificationReadinessView(args: {
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  generationPending: boolean;
  generationFailed: boolean;
  data?: SpecificationReadinessResponse;
}): SpecificationReadinessView {
  const blockers = args.data?.results.flatMap((result) => result.blockers) ?? [];
  const blocked = args.data?.results.some((result) => result.status === 'blocked') === true;
  if (args.generationPending) return { state: 'calculating', blockers, primaryBlocker: blockers[0] ?? null };
  if (blocked) return { state: 'blocked', blockers, primaryBlocker: blockers[0] ?? null };
  if (args.generationFailed) return { state: 'failed', blockers, primaryBlocker: blockers[0] ?? null };
  if (args.isError) return { state: 'unavailable', blockers: [], primaryBlocker: null };
  if (!args.enabled) return { state: 'unknown', blockers: [], primaryBlocker: null };
  if (args.isLoading || !args.data) return { state: 'loading', blockers: [], primaryBlocker: null };
  return { state: 'ready', blockers, primaryBlocker: blockers[0] ?? null };
}

export function readinessBlockerMessage(blocker: SpecificationReadinessBlocker): string {
  const erName = blocker.electrical_variant_name || 'Выбранная ЭР';
  const objectCount = blocker.count > 1 ? ` Затронуто объектов: ${blocker.count}.` : '';
  if (blocker.source_stage === 'electrical') {
    return `${erName}: электрорасчёт не готов к формированию спецификации.${objectCount}`;
  }
  if (blocker.source_stage === 'heat') {
    return `${erName}: сначала исправьте или пересчитайте тепловые данные.${objectCount}`;
  }
  if (blocker.source_stage === 'catalog') {
    return 'Рабочий каталог спецификации недоступен. Обратитесь к администратору.';
  }
  return `${erName}: ${blocker.message}${objectCount}`;
}

export function readinessActionLabel(blocker: SpecificationReadinessBlocker): string {
  switch (blocker.next_action) {
    case 'recalculate_heat':
      return 'К теплорасчёту';
    case 'open_electrical_variant':
      return 'Пересчитать ЭР';
    case 'configure_specification':
      return 'Проверить настройки';
    case 'select_catalog_items':
      return 'Выбрать комплектующие';
    case 'confirm_unassigned_exclusion':
      return 'Проверить назначения';
    case 'contact_catalog_admin':
      return 'Что делать';
    case 'retry_generation':
      return 'Проверить снова';
  }
}

export function deduplicateSpecificationDiagnostics(
  diagnostics: SpecificationDiagnostic[],
): SpecificationDiagnostic[] {
  const grouped = new Map<string, { diagnostic: SpecificationDiagnostic; objectIds: Set<string>; count: number }>();
  for (const diagnostic of diagnostics) {
    const reason = typeof diagnostic.details.reason === 'string'
      ? diagnostic.details.reason
      : typeof diagnostic.details.assignment_state === 'string'
        ? diagnostic.details.assignment_state
        : '';
    const key = `${diagnostic.kind}:${diagnostic.code}:${reason}:${diagnostic.message}`;
    const group = grouped.get(key) ?? {
      diagnostic,
      objectIds: new Set<string>(),
      count: 0,
    };
    group.count += 1;
    if (typeof diagnostic.details.object_id === 'string') {
      group.objectIds.add(diagnostic.details.object_id);
    }
    grouped.set(key, group);
  }
  return [...grouped.values()].map(({ diagnostic, objectIds, count }) => ({
    ...diagnostic,
    details: {
      ...diagnostic.details,
      count,
      object_ids: [...objectIds],
    },
  }));
}
