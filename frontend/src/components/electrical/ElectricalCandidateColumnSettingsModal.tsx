import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Modal, Space, Typography } from 'antd';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import {
  getAllElectricalCandidateTableColumnMetas,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import type { ElectricalTableLabelFormat } from '@/utils/electricalTableViewSettings';
import { TltButton } from '@/components/ui-kit';
import {
  CandidateColumnRow,
  SortableCandidateColumnRow,
} from '@/components/electrical/ElectricalCandidateColumnSettingsModalRows';

const { Text } = Typography;

interface DragOffset {
  x: number;
  y: number;
}

interface DragState extends DragOffset {
  startX: number;
  startY: number;
}

interface CandidateColumnSettingsModalProps {
  open: boolean;
  settings: ElectricalCandidateTableColumnSettings;
  settingsLabelFormat: ElectricalTableLabelFormat;
  confirmLoading?: boolean;
  onOk: () => void;
  onCancel: () => void;
  onSelectAllColumns: () => void;
  onResetColumns: () => void;
  onVisibleChange: (key: ElectricalCandidateColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalCandidateColumnKey, order: number) => void;
  onColumnReorder: (
    activeKey: ElectricalCandidateColumnKey,
    overKey: ElectricalCandidateColumnKey,
  ) => void;
  onWidthChange: (key: ElectricalCandidateColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalCandidateColumnKey) => void;
}

export default function ElectricalCandidateColumnSettingsModal({
  open,
  settings,
  settingsLabelFormat,
  confirmLoading,
  onOk,
  onCancel,
  onSelectAllColumns,
  onResetColumns,
  onVisibleChange,
  onOrderChange,
  onColumnReorder,
  onWidthChange,
  onResetWidth,
}: CandidateColumnSettingsModalProps) {
  const columns = getAllElectricalCandidateTableColumnMetas(settings, settingsLabelFormat);
  const visibleColumns = columns.filter((column) => column.visible);
  const hiddenColumns = columns.filter((column) => !column.visible);
  const visibleCount = visibleColumns.length;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) {
      dragStateRef.current = null;
      setDragOffset({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    function handleDocumentMouseMove(event: MouseEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      setDragOffset({
        x: dragState.x + event.clientX - dragState.startX,
        y: dragState.y + event.clientY - dragState.startY,
      });
    }

    function handleDocumentMouseUp() {
      dragStateRef.current = null;
    }

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, []);

  const draggableWindowStyle: CSSProperties = {
    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
  };

  function handleWindowDragStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: dragOffset.x,
      y: dragOffset.y,
    };
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeKey = String(event.active.id);
    const overKey = event.over?.id ? String(event.over.id) : null;
    if (overKey && activeKey !== overKey) onColumnReorder(activeKey, overKey);
  }

  const modalTitle = (
    <div
      className="electrical-column-settings-title"
      onMouseDown={handleWindowDragStart}
    >
      Настройки таблицы подбора кабеля
    </div>
  );

  return (
    <Modal
      open={open}
      width={1040}
      className="electrical-column-settings-dialog electrical-candidate-column-settings-dialog"
      style={{ top: 24 }}
      title={modalTitle}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnHidden
      modalRender={(modal) => (
        <div className="electrical-column-settings-window" style={draggableWindowStyle}>
          {modal}
        </div>
      )}
    >
      <div className="column-settings-modal">
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary">
              Показано колонок: {visibleCount}/{columns.length}
            </Text>
            <Space>
              <TltButton size="compact" onClick={onSelectAllColumns}>Все поля</TltButton>
              <TltButton size="compact" onClick={onResetColumns}>Сбросить</TltButton>
            </Space>
          </Space>
          <div
            className="column-layout-list column-layout-list--candidate"
            role="list"
            aria-label="Настройки таблицы подбора кабеля"
          >
            <div className="column-layout-header column-layout-header--candidate" aria-hidden="true">
              <span />
              <span>Вид</span>
              <span>№</span>
              <span>Поле</span>
              <span>Ширина</span>
              <span />
              <span />
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleColumns.map((column) => column.key)}
                strategy={verticalListSortingStrategy}
              >
                {visibleColumns.map((column) => (
                  <SortableCandidateColumnRow
                    key={column.key}
                    column={column}
                    rowCount={visibleColumns.length}
                    onVisibleChange={onVisibleChange}
                    onOrderChange={onOrderChange}
                    onWidthChange={onWidthChange}
                    onResetWidth={onResetWidth}
                  />
                ))}
              </SortableContext>
              {hiddenColumns.length > 0 && (
                <div className="column-layout-section" aria-hidden="true">
                  Скрытые поля
                </div>
              )}
              {hiddenColumns.map((column) => (
                <CandidateColumnRow
                  key={column.key}
                  column={column}
                  rowCount={visibleColumns.length}
                  onVisibleChange={onVisibleChange}
                  onOrderChange={onOrderChange}
                  onWidthChange={onWidthChange}
                  onResetWidth={onResetWidth}
                />
              ))}
            </DndContext>
          </div>
        </Space>
      </div>
    </Modal>
  );
}
