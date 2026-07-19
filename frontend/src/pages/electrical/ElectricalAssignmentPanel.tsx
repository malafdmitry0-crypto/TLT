/**
 * System-scope chrome for electrical page (tabs + DnD zones + assign actions).
 *
 * Architectural contract: this is NOT a second object table. The single object
 * list lives in ElecCalcWorkspace and is filtered by shared `systemView`.
 */
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Modal,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd';

import {
  assignElectricalVariantObjects,
  electricalAssignmentQueryKeys,
  listElectricalVariantAssignments,
  unassignElectricalVariantObjects,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { extractApiErrorMessage, type ApiError } from '@/api/client';
import {
  ELECTRICAL_SYSTEM_VIEWS,
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import type {
  ElectricalAssignmentCounts,
  ElectricalAssignmentMutationResponse,
  ElectricalAssignmentSystemCounts,
  ElectricalVariant,
} from '@/types/electricalVariant';

const VERSION_CONFLICT_CODE = 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT';
const REASSIGN_REQUIRES_UNASSIGN_CODE = 'ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN';
const CLEANUP_REQUIRED_CODE = 'ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED';
export const ASSIGNMENT_DND_MIME = 'application/x-tlt-assignment-ids';

export type AssignableSystem = 'self_regulating' | 'resistive';
type DropTargetId = AssignableSystem | 'unassigned';

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

const EMPTY_SYSTEM_COUNTS: ElectricalAssignmentSystemCounts = {
  unassigned: 0,
  self_regulating: 0,
  resistive: 0,
  skin: 0,
  mineral: 0,
};

function countForView(
  counts: ElectricalAssignmentSystemCounts,
  total: number,
  view: ElectricalSystemView,
): number {
  if (view === 'all') return total;
  return counts[view] ?? 0;
}

function isVersionConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === VERSION_CONFLICT_CODE;
}

function isReassignConflict(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === REASSIGN_REQUIRES_UNASSIGN_CODE;
}

function isCleanupRequired(error: unknown): boolean {
  const apiError = error as ApiError | null;
  return apiError?.status === 409 && apiError.code === CLEANUP_REQUIRED_CODE;
}

function mutationSuccessMessage(
  variables: AssignmentMutationVariables,
  response: ElectricalAssignmentMutationResponse,
): string {
  if (variables.kind === 'unassign') {
    return `В нераспределённые возвращено: ${response.changed_count}`;
  }
  return `Назначение сохранено для ${response.changed_count} объект(ов). Требуется пересчёт.`;
}

function parseDragIds(event: ReactDragEvent): string[] {
  const raw = event.dataTransfer.getData(ASSIGNMENT_DND_MIME)
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

function tabLabel(label: string, count: number): ReactNode {
  return (
    <span>
      {label}
      <span
        aria-label={`${count} объектов`}
        style={{
          marginLeft: 6,
          padding: '0 6px',
          borderRadius: 10,
          fontSize: 11,
          background: '#1677ff',
          color: '#fff',
        }}
      >
        {count}
      </span>
    </span>
  );
}

function DropZone({
  id,
  label,
  hint,
  disabled,
  isOver,
  kind = 'assign',
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  id: DropTargetId;
  label: string;
  hint: string;
  disabled: boolean;
  isOver: boolean;
  kind?: 'assign' | 'unassign';
  onDragEnter: (id: DropTargetId) => void;
  onDragLeave: (id: DropTargetId) => void;
  onDragOver: (event: ReactDragEvent, id: DropTargetId) => void;
  onDrop: (event: ReactDragEvent, id: DropTargetId) => void;
}) {
  return (
    <div
      className="assignment-drop-zone"
      data-testid={`assignment-drop-zone-${id}`}
      data-disabled={disabled ? 'true' : 'false'}
      data-over={!disabled && isOver ? 'true' : 'false'}
      data-kind={kind}
      aria-disabled={disabled}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) onDragEnter(id);
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget as Node | null;
        if (related && event.currentTarget.contains(related)) return;
        onDragLeave(id);
      }}
      onDragOver={(event) => onDragOver(event, id)}
      onDrop={(event) => onDrop(event, id)}
    >
      <div className="assignment-drop-zone__label">{label}</div>
      <div className="assignment-drop-zone__hint">{hint}</div>
    </div>
  );
}

export interface ElectricalAssignmentPanelProps {
  projectId: string;
  electricalVariant: ElectricalVariant;
  canMutate: boolean;
  /** Shared page-level system tab (filters the single calc table). */
  systemView: ElectricalSystemView;
  onSystemViewChange: (view: ElectricalSystemView) => void;
  /** Selection from the unified object table. */
  selectedObjectIds: string[];
  onSelectedObjectIdsChange?: (ids: string[]) => void;
  /** Assignment versions from electrical query projection. */
  versionByObjectId: ReadonlyMap<string, number>;
  onAssignmentsChanged?: () => void;
  /**
   * PDF-ER-08: after assign to Samreg/Resistive, run cable selection + sections.
   * Called with assigned object ids and system type.
   */
  onAssignedNeedCalc?: (
    systemType: AssignableSystem,
    objectIds: string[],
  ) => void;
  /** Visual drag-in-progress from the table below. */
  tableDragging?: boolean;
}

export default function ElectricalAssignmentPanel({
  projectId,
  electricalVariant,
  canMutate,
  systemView,
  onSystemViewChange,
  selectedObjectIds,
  onSelectedObjectIdsChange,
  versionByObjectId,
  onAssignmentsChanged,
  onAssignedNeedCalc,
  tableDragging = false,
}: ElectricalAssignmentPanelProps) {
  const queryClient = useQueryClient();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const [lastCounts, setLastCounts] = useState<ElectricalAssignmentCounts | null>(null);
  const [overZone, setOverZone] = useState<DropTargetId | null>(null);
  const [conflictNotice, setConflictNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [cleanupRequiredIds, setCleanupRequiredIds] = useState<string[] | null>(null);

  // Counts only — object rows live in the calc table.
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
      messageApi.success(mutationSuccessMessage(variables, response));
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
      // PDF §6.11–6.12: assignment into a supported system starts selection/sections.
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
  // Button-assign only on «Нераспределённые»; DnD-assign also from «Все».
  const canDropAssign = dragEnabled && (systemView === 'unassigned' || systemView === 'all');
  const canDropUnassign = dragEnabled && systemView !== 'unassigned';
  const selectedCount = selectedObjectIds.length;
  const actionsDisabled = !canMutate || busy || selectedCount === 0;
  const assignDisabled = actionsDisabled || systemView !== 'unassigned';

  const runAssign = (systemType: AssignableSystem, objectIds: string[]) => {
    if (!canMutate || busy || objectIds.length === 0) return;
    const { items, missing } = resolveItems(objectIds);
    if (missing.length) {
      messageApi.error('Не удалось прочитать версию назначения. Обновите страницу.');
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
      messageApi.error('Не удалось прочитать версию назначения. Обновите страницу.');
      return;
    }
    modalApi.confirm({
      title,
      content: (
        <Space direction="vertical" size={4}>
          <Typography.Text>
            Удалятся только электрические расчёты, кандидаты, папки кандидатов и секции
            выбранного ЭР.
          </Typography.Text>
          <Typography.Text strong>
            Теплорасчёт и параметры объекта сохранятся.
          </Typography.Text>
        </Space>
      ),
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
        messageApi.info(
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

  return (
    <div
      data-testid="electrical-assignment-panel"
      className="electrical-system-scope"
      aria-busy={countsQuery.isFetching || busy}
    >
      {messageContextHolder}
      {modalContextHolder}

      <div className="electrical-system-scope__header">
        <Typography.Text strong>
          Система обогрева · {electricalVariant.name}
        </Typography.Text>
        <Typography.Text type="secondary">Всего объектов: {totalLabel}</Typography.Text>
      </div>

      {!canMutate && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message="Режим просмотра"
          description="Назначения можно смотреть; менять может только владелец проекта или администратор."
        />
      )}
      {conflictNotice && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 8 }}
          onClose={() => setConflictNotice(null)}
          message={conflictNotice.title}
          description={conflictNotice.description}
        />
      )}
      {cleanupRequiredIds && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message="Найдены старые электрические данные"
          description="Перед назначением подтвердите очистку расчётов выбранного ЭР. Теплорасчёт сохранится."
          action={(
            <Button size="small" danger disabled={busy} onClick={confirmLegacyCleanup}>
              Подтвердить очистку
            </Button>
          )}
        />
      )}
      {mutation.isError
        && !isVersionConflict(mutation.error)
        && !isReassignConflict(mutation.error)
        && !isCleanupRequired(mutation.error)
        && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message="Не удалось изменить назначение"
          description={extractApiErrorMessage(mutation.error)}
          action={(
            <Button size="small" loading={countsQuery.isFetching} onClick={() => void countsQuery.refetch()}>
              Обновить
            </Button>
          )}
        />
      )}

      <Tabs
        activeKey={systemView}
        onChange={(nextKey) => {
          if (busy) return;
          onSystemViewChange(nextKey as ElectricalSystemView);
          onSelectedObjectIdsChange?.([]);
          setConflictNotice(null);
          setCleanupRequiredIds(null);
          mutation.reset();
        }}
        items={ELECTRICAL_SYSTEM_VIEWS.map((tab) => ({
          key: tab.key,
          label: tabLabel(tab.label, countForView(counts, totalLabel, tab.key)),
          disabled: busy,
        }))}
      />

      {canMutate && (
        <div
          className={`assignment-drop-zones${tableDragging ? ' assignment-drop-zones--active' : ''}`}
          data-testid="assignment-drop-zones"
          data-dragging={tableDragging ? 'true' : 'false'}
          aria-label="Зоны назначения перетаскиванием"
        >
          <DropZone
            id="self_regulating"
            label="↓ В Самрег"
            hint={canDropAssign ? 'Отпустите строку таблицы' : 'Вкладка «Нераспределённые» / «Все»'}
            disabled={!canDropAssign}
            isOver={overZone === 'self_regulating'}
            onDragEnter={setOverZone}
            onDragLeave={(id) => setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={handleZoneDragOver}
            onDrop={handleZoneDrop}
          />
          <DropZone
            id="resistive"
            label="↓ В Резистив"
            hint={canDropAssign ? 'Отпустите строку таблицы' : 'Вкладка «Нераспределённые» / «Все»'}
            disabled={!canDropAssign}
            isOver={overZone === 'resistive'}
            onDragEnter={setOverZone}
            onDragLeave={(id) => setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={handleZoneDragOver}
            onDrop={handleZoneDrop}
          />
          <DropZone
            id="unassigned"
            label="↓ В нераспределённые"
            hint={canDropUnassign ? 'Отпустите строку таблицы' : 'Вкладка системы / «Все»'}
            kind="unassign"
            disabled={!canDropUnassign}
            isOver={overZone === 'unassigned'}
            onDragEnter={setOverZone}
            onDragLeave={(id) => setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={handleZoneDragOver}
            onDrop={handleZoneDrop}
          />
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Действия с назначениями"
        className="electrical-system-scope__toolbar"
      >
        <Typography.Text>Выбрано: {selectedCount}</Typography.Text>
        <Button
          type="primary"
          disabled={assignDisabled}
          loading={busy && mutation.variables?.kind === 'assign'
            && mutation.variables.systemType === 'self_regulating'}
          onClick={() => runAssign('self_regulating', selectedObjectIds)}
        >
          Назначить: Самрег
        </Button>
        <Button
          disabled={assignDisabled}
          loading={busy && mutation.variables?.kind === 'assign'
            && mutation.variables.systemType === 'resistive'}
          onClick={() => runAssign('resistive', selectedObjectIds)}
        >
          Назначить: Резистив
        </Button>
        <Button
          danger
          disabled={actionsDisabled || systemView === 'unassigned'}
          loading={busy && mutation.variables?.kind === 'unassign'}
          onClick={() => confirmUnassign()}
        >
          Вернуть в нераспределённые
        </Button>
      </div>

      <Typography.Text type="secondary" id="unsupported-electrical-systems-note" style={{ fontSize: 12 }}>
        Одна таблица ниже фильтруется вкладкой. Скин / Минеральный — только просмотр и возврат.
      </Typography.Text>
    </div>
  );
}
