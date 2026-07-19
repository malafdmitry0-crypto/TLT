import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { HolderOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  type TableColumnsType,
} from 'antd';

import {
  assignElectricalVariantObjects,
  electricalAssignmentQueryKeys,
  listElectricalVariantAssignments,
  unassignElectricalVariantObjects,
} from '@/api/electricalVariants';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { extractApiErrorMessage, type ApiError } from '@/api/client';
import { objectDisplayName } from '@/pages/electrical/elecCalcMainTableModel';
import type {
  ElectricalAssignment,
  ElectricalAssignmentCounts,
  ElectricalAssignmentMutationResponse,
  ElectricalAssignmentSystemCounts,
  ElectricalAssignmentView,
  ElectricalSystemType,
  ElectricalVariant,
} from '@/types/electricalVariant';

const PAGE_SIZE = 50;
const VERSION_CONFLICT_CODE = 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT';
const REASSIGN_REQUIRES_UNASSIGN_CODE = 'ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN';
const CLEANUP_REQUIRED_CODE = 'ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED';

type AssignmentTab = Exclude<ElectricalAssignmentView, 'all'>;
type AssignableSystem = 'self_regulating' | 'resistive';
type DropTargetId = AssignableSystem | 'unassigned';

type AssignmentMutationVariables =
  | {
    kind: 'assign';
    systemType: AssignableSystem;
    assignments: ElectricalAssignment[];
  }
  | {
    kind: 'unassign';
    assignments: ElectricalAssignment[];
  };

const SYSTEM_LABELS: Record<ElectricalSystemType, string> = {
  self_regulating: 'Самрег',
  resistive: 'Резистив',
  skin: 'Скин',
  mineral: 'Минеральный',
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  pipe: 'Трубопровод',
  tank: 'Ёмкость',
};

const STATE_LABELS: Record<ElectricalAssignment['assignment_state'], string> = {
  unassigned: 'Не распределён',
  ready: 'Готов',
  unsupported: 'Не поддерживается',
  stale: 'Требуется пересчёт',
  error: 'Ошибка',
};

const STATE_COLORS: Record<ElectricalAssignment['assignment_state'], string> = {
  unassigned: 'default',
  ready: 'success',
  unsupported: 'warning',
  stale: 'gold',
  error: 'error',
};

const EMPTY_SYSTEM_COUNTS: ElectricalAssignmentSystemCounts = {
  unassigned: 0,
  self_regulating: 0,
  resistive: 0,
  skin: 0,
  mineral: 0,
};

const ASSIGNMENT_TABS: Array<{
  key: AssignmentTab;
  label: string;
}> = [
  { key: 'unassigned', label: 'Нераспределённые' },
  { key: 'self_regulating', label: 'Самрег' },
  { key: 'resistive', label: 'Резистив' },
  { key: 'skin', label: 'Скин' },
  { key: 'mineral', label: 'Минеральный' },
];

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

function assignmentDiagnosticsText(assignment: ElectricalAssignment): string {
  const messageValue = assignment.diagnostics.message;
  if (typeof messageValue === 'string' && messageValue.trim()) return messageValue;
  const errorCode = assignment.diagnostics.error_code;
  if (typeof errorCode === 'string' && errorCode.trim()) return errorCode;
  return '—';
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

function assignmentItems(assignments: readonly ElectricalAssignment[]) {
  return assignments.map((assignment) => ({
    object_id: assignment.object_id,
    expected_version: assignment.version,
  }));
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

function DragHandle({
  id,
  disabled,
}: {
  id: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <span
      ref={setNodeRef}
      className="assignment-drag-handle"
      data-disabled={disabled ? 'true' : 'false'}
      data-testid={`assignment-drag-handle-${id}`}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      aria-label={disabled ? 'Перетаскивание недоступно' : 'Перетащить объект'}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <HolderOutlined />
    </span>
  );
}

function DropZone({
  id,
  label,
  disabled,
  kind = 'assign',
}: {
  id: DropTargetId;
  label: string;
  disabled: boolean;
  kind?: 'assign' | 'unassign';
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className="assignment-drop-zone"
      data-testid={`assignment-drop-zone-${id}`}
      data-disabled={disabled ? 'true' : 'false'}
      data-over={!disabled && isOver ? 'true' : 'false'}
      data-kind={kind}
      aria-disabled={disabled}
    >
      {label}
    </div>
  );
}

export interface ElectricalAssignmentPanelProps {
  projectId: string;
  electricalVariant: ElectricalVariant;
  canMutate: boolean;
  onAssignmentsChanged?: () => void;
}

export default function ElectricalAssignmentPanel({
  projectId,
  electricalVariant,
  canMutate,
  onAssignmentsChanged,
}: ElectricalAssignmentPanelProps) {
  const queryClient = useQueryClient();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const [activeTab, setActiveTab] = useState<AssignmentTab>('unassigned');
  const [page, setPage] = useState(1);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [lastCounts, setLastCounts] = useState<ElectricalAssignmentCounts | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [cleanupRequiredAssignments, setCleanupRequiredAssignments] = useState<
    ElectricalAssignment[] | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const listParams = useMemo(() => ({
    view: activeTab,
    page,
    page_size: PAGE_SIZE,
  }), [activeTab, page]);
  const assignmentsQuery = useQuery({
    queryKey: electricalAssignmentQueryKeys.list(
      projectId,
      electricalVariant.id,
      listParams,
    ),
    queryFn: () => listElectricalVariantAssignments(
      projectId,
      electricalVariant.id,
      listParams,
    ),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  useEffect(() => {
    if (assignmentsQuery.data?.counts) setLastCounts(assignmentsQuery.data.counts);
  }, [assignmentsQuery.data?.counts]);

  const items = assignmentsQuery.data?.items ?? [];
  const selectedAssignments = useMemo(() => {
    const selected = new Set(selectedObjectIds);
    return items.filter((assignment) => selected.has(assignment.object_id));
  }, [items, selectedObjectIds]);

  const mutation = useMutation({
    mutationFn: (variables: AssignmentMutationVariables) => {
      if (variables.kind === 'unassign') {
        return unassignElectricalVariantObjects(projectId, electricalVariant.id, {
          confirm: true,
          items: assignmentItems(variables.assignments),
        });
      }
      return assignElectricalVariantObjects(projectId, electricalVariant.id, {
        system_type: variables.systemType,
        items: assignmentItems(variables.assignments),
      });
    },
    onMutate: () => {
      setConflictNotice(null);
      setCleanupRequiredAssignments(null);
    },
    onSuccess: async (response, variables) => {
      setSelectedObjectIds([]);
      setPage(1);
      messageApi.success(mutationSuccessMessage(variables, response));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: electricalDataQueryKeys.variant(projectId, electricalVariant.id),
        }),
        queryClient.invalidateQueries({
          queryKey: ['spec', projectId, electricalVariant.id],
        }),
      ]);
      onAssignmentsChanged?.();
    },
    onError: async (error, variables) => {
      if (isCleanupRequired(error) && variables.kind === 'assign') {
        setCleanupRequiredAssignments([...variables.assignments]);
        return;
      }
      if (!isVersionConflict(error) && !isReassignConflict(error)) return;
      setSelectedObjectIds([]);
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
  const actionsDisabled = !canMutate || busy || selectedAssignments.length === 0;
  const assignDisabled = actionsDisabled || activeTab !== 'unassigned';
  const dragEnabled = canMutate && !busy;

  const resolveDragAssignments = (objectId: string): ElectricalAssignment[] => {
    if (selectedObjectIds.includes(objectId) && selectedObjectIds.length > 0) {
      const selected = new Set(selectedObjectIds);
      return items.filter((a) => selected.has(a.object_id));
    }
    const one = items.find((a) => a.object_id === objectId);
    return one ? [one] : [];
  };

  const startAssignment = (systemType: AssignableSystem, assignments = selectedAssignments) => {
    if (!canMutate || busy || assignments.length === 0) return;
    if (activeTab !== 'unassigned' && assignments.every((a) => a.system_type != null)) {
      // reassign path: backend may require unassign first
    }
    mutation.mutate({
      kind: 'assign',
      systemType,
      assignments,
    });
  };

  const openUnassignConfirmation = (
    assignments: ElectricalAssignment[],
    title: string,
    okText = 'Вернуть',
  ) => {
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
      onOk: () => mutation.mutateAsync({ kind: 'unassign', assignments }).catch(() => undefined),
    });
  };

  const confirmUnassign = (assignments = selectedAssignments) => {
    if (!canMutate || busy || assignments.length === 0) return;
    if (activeTab === 'unassigned' && assignments.every((a) => a.system_type == null)) return;
    openUnassignConfirmation(
      [...assignments],
      `Вернуть в нераспределённые: ${assignments.length}?`,
    );
  };

  const confirmLegacyCleanup = () => {
    if (!cleanupRequiredAssignments?.length || busy) return;
    openUnassignConfirmation(
      [...cleanupRequiredAssignments],
      `Очистить legacy-данные: ${cleanupRequiredAssignments.length}?`,
      'Очистить',
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const overId = event.over?.id;
    if (!overId || !dragEnabled) return;

    const objectId = String(event.active.id);
    const target = String(overId) as DropTargetId | 'skin' | 'mineral';
    const dragged = resolveDragAssignments(objectId);
    if (!dragged.length) return;

    if (target === 'skin' || target === 'mineral') {
      messageApi.warning(
        'Нельзя назначать в неподдерживаемую систему (Скин / Минеральный).',
      );
      return;
    }

    if (target === 'self_regulating' || target === 'resistive') {
      if (activeTab !== 'unassigned') {
        messageApi.info('Сначала верните объект в нераспределённые, затем назначьте систему.');
        return;
      }
      startAssignment(target, dragged);
      return;
    }

    if (target === 'unassigned') {
      if (activeTab === 'unassigned') return;
      confirmUnassign(dragged);
    }
  };

  const columns = useMemo<TableColumnsType<ElectricalAssignment>>(() => {
    const dragColumn = {
      title: '',
      key: 'drag',
      width: 36,
      render: (_value: unknown, assignment: ElectricalAssignment) => (
        <DragHandle
          id={assignment.object_id}
          disabled={!dragEnabled || activeTab !== 'unassigned'}
        />
      ),
    };

    const base: TableColumnsType<ElectricalAssignment> = [
      {
        title: '№',
        width: 52,
        render: (_value, _assignment, index) =>
          (assignmentsQuery.data?.page_info.offset ?? 0) + index + 1,
      },
      {
        title: 'Объект',
        dataIndex: ['object', 'params', 'name'],
        width: 260,
        render: (_value, assignment) => (
          <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>
            {objectDisplayName(assignment.object)}
          </Typography.Text>
        ),
      },
      {
        title: 'Тип объекта',
        width: 140,
        render: (_value, assignment) =>
          OBJECT_TYPE_LABELS[assignment.object.object_type] ?? assignment.object.object_type,
      },
      {
        title: 'Система',
        width: 130,
        render: (_value, assignment) =>
          assignment.system_type ? SYSTEM_LABELS[assignment.system_type] : '—',
      },
      {
        title: 'Состояние',
        width: 165,
        render: (_value, assignment) => (
          <Tag color={STATE_COLORS[assignment.assignment_state]}>
            {STATE_LABELS[assignment.assignment_state]}
          </Tag>
        ),
      },
      {
        title: 'Диагностика',
        render: (_value, assignment) => (
          <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
            {assignmentDiagnosticsText(assignment)}
          </Typography.Text>
        ),
      },
    ];

    return dragEnabled ? [dragColumn, ...base] : base;
  }, [activeTab, assignmentsQuery.data?.page_info.offset, dragEnabled]);

  const activeDragLabel = (() => {
    if (!activeDragId) return null;
    const found = items.find((a) => a.object_id === activeDragId)?.object;
    if (found) return objectDisplayName(found);
    return 'Объект';
  })();

  const overlayStyle: CSSProperties = {
    padding: '6px 12px',
    background: '#fff',
    border: '1px solid #91caff',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    fontSize: 13,
    fontWeight: 500,
  };

  return (
    <Card
      size="small"
      data-testid="electrical-assignment-panel"
      aria-busy={assignmentsQuery.isFetching || busy}
      title={(
        <span style={{ overflowWrap: 'anywhere' }}>
          Назначение объектов · {electricalVariant.name}
        </span>
      )}
      extra={(
        <Typography.Text type="secondary">
          Всего: {lastCounts?.total ?? 0}
        </Typography.Text>
      )}
    >
      {messageContextHolder}
      {modalContextHolder}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Выберите объекты и назначьте систему кнопками или перетащите за ⋮⋮
            на зону Самрег / Резистив. Назначение хранится отдельно для каждого ЭР.
          </Typography.Text>

          {!canMutate && (
            <Alert
              type="info"
              showIcon
              message="Режим просмотра"
              description="Назначения доступны для просмотра, но изменять их может только владелец проекта или администратор."
            />
          )}
          {conflictNotice && (
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setConflictNotice(null)}
              message={conflictNotice.title}
              description={conflictNotice.description}
            />
          )}
          {cleanupRequiredAssignments && (
            <Alert
              type="warning"
              showIcon
              message="Найдены старые электрические данные"
              description="Перед назначением нужно явно подтвердить очистку расчётов, кандидатов, папок и секций только выбранного ЭР. Теплорасчёт сохранится."
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
              message="Не удалось изменить назначение"
              description={extractApiErrorMessage(mutation.error)}
              action={(
                <Button
                  size="small"
                  loading={assignmentsQuery.isFetching}
                  onClick={() => void assignmentsQuery.refetch()}
                >
                  Обновить список
                </Button>
              )}
            />
          )}

          <Tabs
            activeKey={activeTab}
            onChange={(nextKey) => {
              if (busy) return;
              setActiveTab(nextKey as AssignmentTab);
              setPage(1);
              setSelectedObjectIds([]);
              setConflictNotice(null);
              setCleanupRequiredAssignments(null);
              mutation.reset();
            }}
            items={ASSIGNMENT_TABS.map((tab) => ({
              key: tab.key,
              label: tabLabel(tab.label, counts[tab.key]),
              disabled: busy,
            }))}
          />

          {canMutate && (
            <div
              className="assignment-drop-zones"
              data-testid="assignment-drop-zones"
              aria-label="Зоны назначения перетаскиванием"
            >
              <DropZone
                id="self_regulating"
                label="↓ Самрег"
                disabled={!dragEnabled || activeTab !== 'unassigned'}
              />
              <DropZone
                id="resistive"
                label="↓ Резистив"
                disabled={!dragEnabled || activeTab !== 'unassigned'}
              />
              <DropZone
                id="unassigned"
                label="↓ Нераспределённые"
                kind="unassign"
                disabled={!dragEnabled || activeTab === 'unassigned'}
              />
            </div>
          )}

          <Typography.Text type="secondary" id="unsupported-electrical-systems-note">
            Назначать в «Скин» и «Минеральный» нельзя — вкладки только для просмотра
            legacy-назначений и возврата в нераспределённые.
          </Typography.Text>

          <div
            role="toolbar"
            aria-label="Действия с назначениями"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
          >
            <Typography.Text>Выбрано: {selectedAssignments.length}</Typography.Text>
            <Button
              type="primary"
              disabled={assignDisabled}
              loading={busy && mutation.variables?.kind === 'assign'
                && mutation.variables.systemType === 'self_regulating'}
              onClick={() => startAssignment('self_regulating')}
            >
              Назначить: Самрег
            </Button>
            <Button
              disabled={assignDisabled}
              loading={busy && mutation.variables?.kind === 'assign'
                && mutation.variables.systemType === 'resistive'}
              onClick={() => startAssignment('resistive')}
            >
              Назначить: Резистив
            </Button>
            <Button
              danger
              disabled={actionsDisabled || activeTab === 'unassigned'}
              loading={busy && mutation.variables?.kind === 'unassign'}
              onClick={() => confirmUnassign()}
            >
              Вернуть в нераспределённые
            </Button>
          </div>

          {assignmentsQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="Не удалось загрузить назначения выбранного ЭР"
              description={extractApiErrorMessage(assignmentsQuery.error)}
              action={(
                <Button
                  size="small"
                  loading={assignmentsQuery.isFetching}
                  onClick={() => void assignmentsQuery.refetch()}
                >
                  Повторить
                </Button>
              )}
            />
          ) : (
            <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table<ElectricalAssignment>
                rowKey="object_id"
                size="small"
                loading={assignmentsQuery.isFetching}
                dataSource={items}
                columns={columns}
                scroll={{ x: 900 }}
                expandable={
                  activeTab === 'self_regulating' || activeTab === 'resistive'
                    ? {
                        expandedRowRender: (record) => (
                          <div
                            className="section-hierarchy-shell"
                            data-testid="section-hierarchy-shell"
                          >
                            <strong>Нагревательные секции</strong>
                            <div>
                              Секции появятся после подбора кабеля и заполнения каталога
                              секционирования (Lмакс, допустимые токи). Пока каталог пуст —
                              число секций недоступно.
                            </div>
                            <div style={{ marginTop: 6, color: '#8c8c8c' }}>
                              {objectDisplayName(record.object)}
                              {record.system_type
                                ? ` · ${SYSTEM_LABELS[record.system_type]}`
                                : ''}
                            </div>
                          </div>
                        ),
                        rowExpandable: () => true,
                      }
                    : undefined
                }
                rowSelection={canMutate ? {
                  type: 'checkbox',
                  selectedRowKeys: selectedObjectIds,
                  onChange: (keys) => setSelectedObjectIds(keys as string[]),
                  getCheckboxProps: () => ({ disabled: busy }),
                  columnWidth: 40,
                } : undefined}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total: assignmentsQuery.data?.counts.filtered ?? 0,
                  showSizeChanger: false,
                  hideOnSinglePage: true,
                  onChange: (nextPage) => {
                    setPage(nextPage);
                    setSelectedObjectIds([]);
                  },
                }}
                locale={{
                  emptyText: assignmentsQuery.isLoading
                    ? 'Загружаем назначения…'
                    : `В разделе «${ASSIGNMENT_TABS.find((tab) => tab.key === activeTab)?.label}» объектов нет`,
                }}
              />
            </div>
          )}
        </Space>

        <DragOverlay dropAnimation={null}>
          {activeDragLabel ? (
            <div style={overlayStyle}>
              {selectedObjectIds.includes(activeDragId ?? '') && selectedObjectIds.length > 1
                ? `${selectedObjectIds.length} объекта`
                : activeDragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Card>
  );
}
