import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Modal, Segmented, Space, Tabs, Tooltip, Typography } from 'antd';
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
  getAllElectricalTableColumnMetas,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_TABLE_FONT_SIZE_OPTIONS,
  ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS,
  type ElectricalTableFontSize,
  type ElectricalTableLabelFormat,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';
import { TltButton } from '@/components/ui-kit';
import {
  ColumnSettingsRow,
  SortableColumnSettingsRow,
} from './ElectricalColumnSettingsModalRows';

const { Text } = Typography;

interface DragOffset {
  x: number;
  y: number;
}

interface DragState extends DragOffset {
  startX: number;
  startY: number;
}

interface ElectricalColumnSettingsModalProps {
  open: boolean;
  settings: ElectricalTableColumnSettings;
  viewSettings: ElectricalTableViewSettings;
  confirmLoading?: boolean;
  onOk: () => void;
  onCancel: () => void;
  onSelectAllColumns: () => void;
  onResetColumns: () => void;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onColumnReorder: (activeKey: ElectricalColumnKey, overKey: ElectricalColumnKey) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
  onFontSizeChange: (fontSize: ElectricalTableFontSize) => void;
  onTableLabelFormatChange: (format: ElectricalTableLabelFormat) => void;
  onSettingsLabelFormatChange: (format: ElectricalTableLabelFormat) => void;
  onResetFontSize: () => void;
  onResetLabelFormats: () => void;
  recalculationSettings?: ReactNode;
}

export default function ElectricalColumnSettingsModal({
  open,
  settings,
  viewSettings,
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
  onFontSizeChange,
  onTableLabelFormatChange,
  onSettingsLabelFormatChange,
  onResetFontSize,
  onResetLabelFormats,
  recalculationSettings,
}: ElectricalColumnSettingsModalProps) {
  const columns = getAllElectricalTableColumnMetas(settings, viewSettings.settingsLabelFormat);
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
      Настройки таблицы электрорасчёта
    </div>
  );

  return (
    <Modal
      open={open}
      width={1040}
      className="electrical-column-settings-dialog"
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
        <Tabs
          className="column-settings-tabs"
          defaultActiveKey="columns"
          items={[
            {
              key: 'columns',
              label: 'Настройки колонок',
              children: (
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
                  <div className="column-layout-list column-layout-list--electrical" role="list" aria-label="Настройки таблицы электрорасчёта">
                    <div className="column-layout-header column-layout-header--electrical" aria-hidden="true">
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
                          <SortableColumnSettingsRow
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
                        <ColumnSettingsRow
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
              ),
            },
            {
              key: 'other',
              label: 'Остальное',
              children: (
                <div className="column-settings-modal column-settings-modal--other">
                  {recalculationSettings}
                  <div className="table-view-settings-panel">
                    <Text className="table-view-settings-label">Размер текста таблицы</Text>
                    <Segmented<ElectricalTableFontSize>
                      aria-label="Размер текста таблицы"
                      value={viewSettings.fontSize}
                      onChange={onFontSizeChange}
                      options={ELECTRICAL_TABLE_FONT_SIZE_OPTIONS.map((option) => ({
                        value: option.key,
                        label: (
                          <Tooltip title={`${option.fontSizePx}px`}>
                            <span>{option.label}</span>
                          </Tooltip>
                        ),
                      }))}
                    />
                    <TltButton size="compact" onClick={onResetFontSize}>
                      Сбросить размер
                    </TltButton>
                  </div>
                  <div className="table-view-settings-panel table-label-format-settings-panel">
                    <Text className="table-view-settings-label">Формат названий</Text>
                    <Space size={8} wrap>
                      <Text type="secondary">Таблица</Text>
                      <Segmented<ElectricalTableLabelFormat>
                        aria-label="Формат названий в таблице"
                        value={viewSettings.tableLabelFormat}
                        onChange={onTableLabelFormatChange}
                        options={ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                          value: option.key,
                          label: option.label,
                        }))}
                      />
                      <Text type="secondary">Настройки</Text>
                      <Segmented<ElectricalTableLabelFormat>
                        aria-label="Формат названий в настройках"
                        value={viewSettings.settingsLabelFormat}
                        onChange={onSettingsLabelFormatChange}
                        options={ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                          value: option.key,
                          label: option.label,
                        }))}
                      />
                      <TltButton size="compact" onClick={onResetLabelFormats}>
                        Сбросить названия
                      </TltButton>
                    </Space>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}
