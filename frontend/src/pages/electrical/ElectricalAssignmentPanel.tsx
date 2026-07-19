import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
type AssignmentMutationVariables =
  | {
    kind: 'assign';
    systemType: 'self_regulating' | 'resistive';
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
  const [conflictNotice, setConflictNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [cleanupRequiredAssignments, setCleanupRequiredAssignments] = useState<
    ElectricalAssignment[] | null
  >(null);

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

  const selectedAssignments = useMemo(() => {
    const selected = new Set(selectedObjectIds);
    return (assignmentsQuery.data?.items ?? []).filter((assignment) =>
      selected.has(assignment.object_id));
  }, [assignmentsQuery.data?.items, selectedObjectIds]);

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

  const columns = useMemo<TableColumnsType<ElectricalAssignment>>(() => [
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
  ], [assignmentsQuery.data?.page_info.offset]);

  const startAssignment = (systemType: 'self_regulating' | 'resistive') => {
    if (assignDisabled) return;
    mutation.mutate({
      kind: 'assign',
      systemType,
      assignments: selectedAssignments,
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

  const confirmUnassign = () => {
    if (actionsDisabled || activeTab === 'unassigned') return;
    const assignments = [...selectedAssignments];
    openUnassignConfirmation(
      assignments,
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
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          Выберите объекты и назначьте поддерживаемый тип системы. Назначение сохраняется
          отдельно для каждого ЭР.
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
            label: (
              <span
                data-drop-system={tab.key}
                onDragOver={(event) => {
                  if (!canMutate || busy) return;
                  if (tab.key === 'skin' || tab.key === 'mineral' || tab.key === 'unassigned') {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!canMutate || busy) return;
                  if (tab.key === 'skin' || tab.key === 'mineral') {
                    messageApi.warning(
                      'Нельзя назначать в неподдерживаемую систему (Скин / Минеральный).',
                    );
                    return;
                  }
                  if (tab.key === 'unassigned') return;
                  const raw = event.dataTransfer.getData('application/x-tlt-assignment-ids');
                  let ids: string[] = [];
                  try {
                    ids = raw ? (JSON.parse(raw) as string[]) : [];
                  } catch {
                    ids = [];
                  }
                  if (!ids.length) return;
                  const items = (assignmentsQuery.data?.items ?? []).filter((a) =>
                    ids.includes(a.object_id));
                  if (!items.length) return;
                  if (tab.key === 'self_regulating' || tab.key === 'resistive') {
                    mutation.mutate({
                      kind: 'assign',
                      systemType: tab.key,
                      assignments: items,
                    });
                  }
                }}
              >
                {tabLabel(tab.label, counts[tab.key])}
              </span>
            ),
            disabled: busy,
          }))}
        />

        <Typography.Text type="secondary" id="unsupported-electrical-systems-note">
          Назначать новые объекты в неподдерживаемые системы нельзя.
          Вкладки «Скин» и «Минеральный» показывают сохранённые legacy-назначения,
          чтобы их можно было с подтверждением вернуть в нераспределённые.
          {' '}
          PDF UI-PDF-03: перетащите строки из «Нераспределённые» на вкладку Самрег/Резистив
          (кнопки назначения сохранены).
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
            onClick={confirmUnassign}
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
              dataSource={assignmentsQuery.data?.items ?? []}
              columns={columns}
              scroll={{ x: 900 }}
              onRow={(record) => ({
                draggable: canMutate && !busy && activeTab === 'unassigned',
                onDragStart: (event) => {
                  if (!canMutate || busy || activeTab !== 'unassigned') return;
                  const ids = selectedObjectIds.includes(record.object_id)
                    ? selectedObjectIds
                    : [record.object_id];
                  event.dataTransfer.setData(
                    'application/x-tlt-assignment-ids',
                    JSON.stringify(ids),
                  );
                  event.dataTransfer.effectAllowed = 'move';
                },
                style:
                  canMutate && activeTab === 'unassigned'
                    ? { cursor: 'grab' }
                    : undefined,
              })}
              expandable={
                activeTab === 'self_regulating' || activeTab === 'resistive'
                  ? {
                      expandedRowRender: (record) => (
                        <div
                          data-testid="section-hierarchy-shell"
                          style={{
                            padding: '8px 12px',
                            background: '#fafafa',
                            borderLeft: '3px solid #d9d9d9',
                            fontSize: 12,
                            color: '#595959',
                          }}
                        >
                          <strong>Нагревательные секции</strong>
                          <div style={{ marginTop: 4 }}>
                            Секции появятся после регистрации каталога секционирования
                            (Lмакс, Iдоп, Iст.уд). Сейчас Nсек не вычисляется из сидов
                            (UI-PDF-04 shell).
                          </div>
                          <div style={{ marginTop: 4 }}>
                            Объект: {objectDisplayName(record.object)} · система:{' '}
                            {record.system_type
                              ? SYSTEM_LABELS[record.system_type]
                              : '—'}
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
    </Card>
  );
}
