/**
 * Counts / mutation / conflict / cleanup / DnD orchestration for
 * ElectricalAssignmentPanel. Does not render panel JSX.
 */
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appMessage, appModal } from '@/feedback/appFeedback';

import {
  assignElectricalVariantObjects,
  electricalAssignmentQueryKeys,
  listElectricalVariantAssignments,
  unassignElectricalVariantObjects,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type { ApiError } from '@/api/client';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';
import type {
  ElectricalAssignmentCounts,
  ElectricalAssignmentMutationResponse,
  ElectricalAssignmentSystemCounts,
  ElectricalVariant,
} from '@/types/electricalVariant';
import type {
  ElectricalSpecificationReadinessSnapshot,
} from '@/pages/electrical/electricalSpecificationReadinessModel';
import {
  ASSIGNMENT_DND_MIME,
  type AssignableSystem,
} from '@/pages/electrical/electricalAssignmentShared';

export type DropTargetId = AssignableSystem | 'unassigned';

type AssignmentMutationVariables =
  | {
    kind: 'assign';
    systemType: AssignableSystem;
    items: Array<{ object_id: string; expected_version: number }>;
  }
  | {
    kind: 'unassign';
    items: Array<{ object_id: string; expected_version: number }>;
  };

const VERSION_CONFLICT_CODE = 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT';
const REASSIGN_REQUIRES_UNASSIGN_CODE = 'ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN';
const CLEANUP_REQUIRED_CODE = 'ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED';

const EMPTY_SYSTEM_COUNTS: ElectricalAssignmentSystemCounts = {
  unassigned: 0,
  self_regulating: 0,
  resistive: 0,
  skin: 0,
  mineral: 0,
};

const UNASSIGN_CONTENT =
  'Удалятся только электрические расчёты, кандидаты, папки кандидатов и секции выбранного ЭР. '
  + 'Теплорасчёт и параметры объекта сохранятся.';

export function countForView(
  counts: ElectricalAssignmentSystemCounts,
  total: number,
  view: ElectricalSystemView,
): number {
  if (view === 'all') return total;
  return counts[view] ?? 0;
}

export function isVersionConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === VERSION_CONFLICT_CODE;
}

export function isReassignConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === REASSIGN_REQUIRES_UNASSIGN_CODE;
}

export function isCleanupRequired(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === CLEANUP_REQUIRED_CODE;
}

export function mutationSuccessMessage(
  variables: AssignmentMutationVariables,
  response: ElectricalAssignmentMutationResponse,
): string {
  if (variables.kind === 'unassign') {
    return `В нераспределённые возвращено: ${response.changed_count}`;
  }
  return `Назначение сохранено для ${response.changed_count} объект(ов). Требуется пересчёт.`;
}

export function parseDragIds(event: ReactDragEvent, mime = ASSIGNMENT_DND_MIME): string[] {
  const raw = event.dataTransfer.getData(mime)
    || event.dataTransfer.getData('text/plain');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // plain id
  }
  return raw.trim() ? [raw.trim()] : [];
}

export type UseElectricalAssignmentControllerOptions = {
  projectId: string;
  electricalVariant: ElectricalVariant;
  canMutate: boolean;
  systemView: ElectricalSystemView;
  selectedObjectIds: string[];
  onSelectedObjectIdsChange?: (ids: string[]) => void;
  versionByObjectId: ReadonlyMap<string, number>;
  onAssignmentsChanged?: () => void;
  onAssignmentReadinessChange?: (
    electricalVariantId: string,
    snapshot: ElectricalSpecificationReadinessSnapshot,
  ) => void;
  onAssignedNeedCalc?: (systemType: AssignableSystem, objectIds: string[]) => void;
};

export function useElectricalAssignmentController({
  projectId,
  electricalVariant,
  canMutate,
  systemView,
  selectedObjectIds,
  onSelectedObjectIdsChange,
  versionByObjectId,
  onAssignmentsChanged,
  onAssignmentReadinessChange,
  onAssignedNeedCalc,
}: UseElectricalAssignmentControllerOptions) {
  const queryClient = useQueryClient();
  const [lastCounts, setLastCounts] = useState<ElectricalAssignmentCounts | null>(null);
  const [overZone, setOverZone] = useState<DropTargetId | null>(null);
  const [conflictNotice, setConflictNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [cleanupRequiredIds, setCleanupRequiredIds] = useState<string[] | null>(null);

  const countsQuery = useQuery({
    queryKey: electricalAssignmentQueryKeys.list(
      projectId,
      electricalVariant.id,
      { view: 'all', page: 1, page_size: 1 },
    ),
    queryFn: () => listElectricalVariantAssignments(
      projectId,
      electricalVariant.id,
      { view: 'all', page: 1, page_size: 1 },
    ),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  useEffect(() => {
    if (countsQuery.data?.counts) setLastCounts(countsQuery.data.counts);
  }, [countsQuery.data?.counts]);

  useEffect(() => {
    if (!onAssignmentReadinessChange) return;
    if (countsQuery.isError) {
      onAssignmentReadinessChange(electricalVariant.id, { status: 'error' });
      return;
    }
    if (countsQuery.isFetching || !countsQuery.data?.counts) {
      onAssignmentReadinessChange(electricalVariant.id, { status: 'loading' });
      return;
    }
    onAssignmentReadinessChange(electricalVariant.id, {
      status: 'loaded',
      counts: countsQuery.data.counts,
    });
  }, [
    countsQuery.data?.counts,
    countsQuery.isError,
    countsQuery.isFetching,
    electricalVariant.id,
    onAssignmentReadinessChange,
  ]);

  const resolveItems = (objectIds: string[]) => {
    const items: Array<{ object_id: string; expected_version: number }> = [];
    const missing: string[] = [];
    for (const objectId of objectIds) {
      const version = versionByObjectId.get(objectId);
      if (version == null || !Number.isFinite(version)) {
        missing.push(objectId);
        continue;
      }
      items.push({ object_id: objectId, expected_version: version });
    }
    return { items, missing };
  };

  const mutation = useMutation({
    mutationFn: (variables: AssignmentMutationVariables) => {
      if (variables.kind === 'unassign') {
        return unassignElectricalVariantObjects(projectId, electricalVariant.id, {
          confirm: true,
          items: variables.items,
        });
      }
      return assignElectricalVariantObjects(projectId, electricalVariant.id, {
        system_type: variables.systemType,
        items: variables.items,
      });
    },
    onMutate: () => {
      setConflictNotice(null);
      setCleanupRequiredIds(null);
    },
    onSuccess: async (response, variables) => {
      onSelectedObjectIdsChange?.([]);
      appMessage.success(mutationSuccessMessage(variables, response));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: electricalDataQueryKeys.variant(projectId, electricalVariant.id),
        }),
        queryClient.invalidateQueries({
          queryKey: electricalAssignmentQueryKeys.root(projectId, electricalVariant.id),
        }),
        queryClient.invalidateQueries({
          queryKey: ['spec', projectId, electricalVariant.id],
        }),
      ]);
      onAssignmentsChanged?.();
      if (variables.kind === 'assign' && response.changed_count > 0) {
        const ids = variables.items.map((item) => item.object_id);
        onAssignedNeedCalc?.(variables.systemType, ids);
      }
    },
    onError: async (error, variables) => {
      if (isCleanupRequired(error) && variables.kind === 'assign') {
        setCleanupRequiredIds(variables.items.map((item) => item.object_id));
        return;
      }
      if (!isVersionConflict(error) && !isReassignConflict(error)) return;
      onSelectedObjectIdsChange?.([]);
      setConflictNotice(isReassignConflict(error) ? {
        title: 'Сначала верните объект в нераспределённые',
        description: 'Для смены типа системы подтвердите возврат в нераспределённые, а затем выполните новое назначение.',
      } : {
        title: 'Список назначений обновлён',
        description: 'Назначения изменились на сервере. Список обновлён — выберите объекты повторно.',
      });
      await queryClient.invalidateQueries({
        queryKey: electricalDataQueryKeys.variant(projectId, electricalVariant.id),
      });
      onAssignmentsChanged?.();
    },
  });

  const counts = lastCounts?.by_system ?? EMPTY_SYSTEM_COUNTS;
  const busy = mutation.isPending;
  const dragEnabled = canMutate && !busy;
  const canDropAssign = dragEnabled && (systemView === 'unassigned' || systemView === 'all');
  const canDropUnassign = dragEnabled && systemView !== 'unassigned';
  const selectedCount = selectedObjectIds.length;
  const actionsDisabled = !canMutate || busy || selectedCount === 0;
  const assignDisabled = actionsDisabled || systemView !== 'unassigned';

  const runAssign = (systemType: AssignableSystem, objectIds: string[]) => {
    if (!canMutate || busy || objectIds.length === 0) return;
    const { items, missing } = resolveItems(objectIds);
    if (missing.length) {
      appMessage.error('Не удалось прочитать версию назначения. Обновите страницу.');
      return;
    }
    mutation.mutate({ kind: 'assign', systemType, items });
  };

  const openUnassignConfirmation = (
    objectIds: string[],
    title: string,
    okText = 'Вернуть',
  ) => {
    const { items, missing } = resolveItems(objectIds);
    if (missing.length) {
      appMessage.error('Не удалось прочитать версию назначения. Обновите страницу.');
      return;
    }
    appModal.confirm({
      title,
      content: UNASSIGN_CONTENT,
      okText,
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => mutation.mutateAsync({ kind: 'unassign', items }).catch(() => undefined),
    });
  };

  const confirmUnassign = (objectIds = selectedObjectIds) => {
    if (!canMutate || busy || objectIds.length === 0) return;
    if (systemView === 'unassigned') return;
    openUnassignConfirmation(objectIds, `Вернуть в нераспределённые: ${objectIds.length}?`);
  };

  const confirmLegacyCleanup = () => {
    if (!cleanupRequiredIds?.length || busy) return;
    openUnassignConfirmation(
      [...cleanupRequiredIds],
      `Очистить legacy-данные: ${cleanupRequiredIds.length}?`,
      'Очистить',
    );
  };

  const handleZoneDragOver = (event: ReactDragEvent, id: DropTargetId) => {
    if (id === 'self_regulating' || id === 'resistive') {
      if (!canDropAssign) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      return;
    }
    if (id === 'unassigned' && canDropUnassign) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleZoneDrop = (event: ReactDragEvent, target: DropTargetId) => {
    event.preventDefault();
    event.stopPropagation();
    setOverZone(null);
    if (!dragEnabled) return;
    const ids = parseDragIds(event);
    if (!ids.length) return;

    if (target === 'self_regulating' || target === 'resistive') {
      if (systemView !== 'unassigned' && systemView !== 'all') {
        appMessage.info(
          'Чтобы сменить систему: перетащите в «Нераспределённые», затем назначьте Самрег/Резистив.',
        );
        return;
      }
      runAssign(target, ids);
      return;
    }
    if (target === 'unassigned') {
      if (systemView === 'unassigned') return;
      confirmUnassign(ids);
    }
  };

  const totalLabel = useMemo(
    () => lastCounts?.total ?? 0,
    [lastCounts?.total],
  );

  const clearNotices = () => {
    setConflictNotice(null);
    setCleanupRequiredIds(null);
    mutation.reset();
  };

  // E1 / FE-28: MVP type menu — Samreg only (no Resistive/Skin).
  const typeMenuItems = [
    {
      key: 'self_regulating',
      label: 'Саморегулирующийся (Самрег)',
      disabled: assignDisabled,
      onClick: () => runAssign('self_regulating', selectedObjectIds),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'unassign',
      label: 'Вернуть в нераспределённые',
      danger: true,
      disabled: actionsDisabled || systemView === 'unassigned',
      onClick: () => confirmUnassign(),
    },
  ];

  return {
    counts,
    totalLabel,
    busy,
    canDropAssign,
    canDropUnassign,
    selectedCount,
    actionsDisabled,
    assignDisabled,
    overZone,
    setOverZone,
    conflictNotice,
    setConflictNotice,
    cleanupRequiredIds,
    countsQuery,
    mutation,
    typeMenuItems,
    runAssign,
    confirmUnassign,
    confirmLegacyCleanup,
    handleZoneDragOver,
    handleZoneDrop,
    clearNotices,
  };
}
