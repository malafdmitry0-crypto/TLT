/**
 * System-scope chrome for electrical page (tabs + DnD zones + assign actions).
 *
 * Architectural contract: this is NOT a second object table. The single object
 * list lives in ElecCalcWorkspace and is filtered by shared `systemView`.
 */
import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Space,
  Tabs,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

import { extractApiErrorMessage } from '@/api/client';
import {
  ELECTRICAL_SYSTEM_VIEWS,
  type ElectricalSystemView,
} from '@/pages/electrical/elecCalcSystemViewModel';
import type { AssignableSystem } from '@/pages/electrical/electricalAssignmentShared';
import {
  countForView,
  isCleanupRequired,
  isReassignConflict,
  isVersionConflict,
  useElectricalAssignmentController,
  type DropTargetId,
} from '@/pages/electrical/useElectricalAssignmentController';
import type { ElectricalVariant } from '@/types/electricalVariant';

export { ASSIGNMENT_DND_MIME, type AssignableSystem } from '@/pages/electrical/electricalAssignmentShared';

function tabLabel(label: string, count: number): ReactNode {
  return (
    <span className="electrical-system-tab-label">
      {label}
      {count > 0 && (
        <span
          className="electrical-system-tab-count"
          aria-label={`${count} объектов`}
        >
          {count}
        </span>
      )}
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
  const c = useElectricalAssignmentController({
    projectId,
    electricalVariant,
    canMutate,
    systemView,
    selectedObjectIds,
    onSelectedObjectIdsChange,
    versionByObjectId,
    onAssignmentsChanged,
    onAssignedNeedCalc,
  });

  const visibleTabs = ELECTRICAL_SYSTEM_VIEWS.filter(
    (tab) => tab.key === 'unassigned'
      || tab.key === 'self_regulating'
      || tab.key === 'resistive'
      || tab.key === 'skin',
  );

  return (
    <div
      data-testid="electrical-assignment-panel"
      className="electrical-system-scope"
      aria-busy={c.countsQuery.isFetching || c.busy}
    >
      {c.messageContextHolder}
      {c.modalContextHolder}

      {!canMutate && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message="Режим просмотра"
          description="Назначения можно смотреть; менять может только владелец проекта или администратор."
        />
      )}
      {c.conflictNotice && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 8 }}
          onClose={() => c.setConflictNotice(null)}
          message={c.conflictNotice.title}
          description={c.conflictNotice.description}
        />
      )}
      {c.cleanupRequiredIds && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message="Найдены старые электрические данные"
          description="Перед назначением подтвердите очистку расчётов выбранного ЭР. Теплорасчёт сохранится."
          action={(
            <Button size="small" danger disabled={c.busy} onClick={c.confirmLegacyCleanup}>
              Подтвердить очистку
            </Button>
          )}
        />
      )}
      {c.mutation.isError
        && !isVersionConflict(c.mutation.error)
        && !isReassignConflict(c.mutation.error)
        && !isCleanupRequired(c.mutation.error)
        && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message="Не удалось изменить назначение"
          description={extractApiErrorMessage(c.mutation.error)}
          action={(
            <Button size="small" loading={c.countsQuery.isFetching} onClick={() => void c.countsQuery.refetch()}>
              Обновить
            </Button>
          )}
        />
      )}

      <div className="electrical-system-scope__tabs-row">
        <Tabs
          className="electrical-system-scope__tabs"
          type="card"
          size="small"
          activeKey={systemView === 'all' || systemView === 'mineral' ? 'unassigned' : systemView}
          onChange={(nextKey) => {
            if (c.busy) return;
            onSystemViewChange(nextKey as ElectricalSystemView);
            onSelectedObjectIdsChange?.([]);
            c.clearNotices();
          }}
          items={visibleTabs.map((tab) => ({
            key: tab.key,
            label: tabLabel(tab.label, countForView(c.counts, c.totalLabel, tab.key)),
            disabled: c.busy || (tab.key === 'skin' && false),
          }))}
          tabBarExtraContent={canMutate ? (
            <Space size={8} className="electrical-system-scope__actions" wrap>
              <Button
                size="small"
                icon={<ApartmentOutlined />}
                disabled={c.assignDisabled}
                loading={c.busy && c.mutation.variables?.kind === 'assign'
                  && c.mutation.variables.systemType === 'self_regulating'}
                onClick={() => c.runAssign('self_regulating', selectedObjectIds)}
                aria-label="Применить правило к группе"
              >
                Применить правило к группе
              </Button>
              <Dropdown
                menu={{ items: c.typeMenuItems }}
                disabled={c.actionsDisabled && systemView === 'unassigned' && c.selectedCount === 0}
                trigger={['click']}
              >
                <Button
                  size="small"
                  icon={<AppstoreOutlined />}
                  disabled={c.actionsDisabled && c.selectedCount === 0}
                  loading={c.busy && c.mutation.variables?.kind === 'assign'
                    && c.mutation.variables.systemType === 'resistive'}
                  aria-label="Выбрать тип"
                >
                  Выбрать тип
                </Button>
              </Dropdown>
            </Space>
          ) : undefined}
        />
      </div>

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
            hint={c.canDropAssign ? 'Отпустите строку таблицы' : 'Вкладка «Нераспределённые объекты»'}
            disabled={!c.canDropAssign}
            isOver={c.overZone === 'self_regulating'}
            onDragEnter={c.setOverZone}
            onDragLeave={(id) => c.setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={c.handleZoneDragOver}
            onDrop={c.handleZoneDrop}
          />
          <DropZone
            id="resistive"
            label="↓ В Резистив"
            hint={c.canDropAssign ? 'Отпустите строку таблицы' : 'Вкладка «Нераспределённые объекты»'}
            disabled={!c.canDropAssign}
            isOver={c.overZone === 'resistive'}
            onDragEnter={c.setOverZone}
            onDragLeave={(id) => c.setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={c.handleZoneDragOver}
            onDrop={c.handleZoneDrop}
          />
          <DropZone
            id="unassigned"
            label="↓ В нераспределённые"
            hint={c.canDropUnassign ? 'Отпустите строку таблицы' : 'Вкладка системы'}
            kind="unassign"
            disabled={!c.canDropUnassign}
            isOver={c.overZone === 'unassigned'}
            onDragEnter={c.setOverZone}
            onDragLeave={(id) => c.setOverZone((cur) => (cur === id ? null : cur))}
            onDragOver={c.handleZoneDragOver}
            onDrop={c.handleZoneDrop}
          />
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Действия с назначениями"
        className="electrical-system-scope__toolbar"
      >
        <Typography.Text>Выбрано: {c.selectedCount}</Typography.Text>
        <Button
          type="primary"
          disabled={c.assignDisabled}
          loading={c.busy && c.mutation.variables?.kind === 'assign'
            && c.mutation.variables.systemType === 'self_regulating'}
          onClick={() => c.runAssign('self_regulating', selectedObjectIds)}
        >
          Назначить: Самрег
        </Button>
        <Button
          disabled={c.assignDisabled}
          loading={c.busy && c.mutation.variables?.kind === 'assign'
            && c.mutation.variables.systemType === 'resistive'}
          onClick={() => c.runAssign('resistive', selectedObjectIds)}
        >
          Назначить: Резистив
        </Button>
        <Button
          danger
          disabled={c.actionsDisabled || systemView === 'unassigned'}
          loading={c.busy && c.mutation.variables?.kind === 'unassign'}
          onClick={() => c.confirmUnassign()}
        >
          Вернуть в нераспределённые
        </Button>
      </div>

      <Typography.Text type="secondary" id="unsupported-electrical-systems-note" className="electrical-system-scope__note">
        В текущей версии активен тип «Саморегулирующийся». «Резистив» и «Скин» — для будущего расширения.
      </Typography.Text>
    </div>
  );
}
