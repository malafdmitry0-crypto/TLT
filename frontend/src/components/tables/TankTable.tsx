import { Button, message, Popconfirm, Space, Tooltip, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, WarningFilled } from '@ant-design/icons';

const { Text } = Typography;
import CalcTable from './CalcTable';
import ResultCell from './ResultCell';
import DraggableRow from './DraggableRow';
import { MATERIAL_LABELS, SHAPE_LABELS } from '@/constants/materials';
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteObject } from '@/api/projects';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface Props {
  data: ProjectObject[];
  projectId: string;
  onEdit?: (obj: ProjectObject) => void;
  onReorder?: (newOrder: ProjectObject[]) => void;
}

export default function TankTable({ data, projectId, onEdit, onReorder }: Props) {
  const qc = useQueryClient();
  const delMut = useMutation({
    mutationFn: (id: string) => deleteObject(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId, 'objects'] }),
    onError: (e: Error) => message.error(e.message),
  });

  const hasInvalid = data.some((o) => !o.is_valid);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = data.findIndex((o) => o.id === active.id);
    const newIndex = data.findIndex((o) => o.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(data, oldIndex, newIndex));
  }

  return (
    <>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={data.map((o) => o.id)} strategy={verticalListSortingStrategy}>
    <CalcTable<ProjectObject>
      data-testid="tank-table"
      data={data}
      components={{ body: { row: DraggableRow } }}
      rowClassName={(r) => (r.is_valid ? '' : 'row-invalid')}
      onRow={(record) => ({
        onClick: (event) => {
          if ((event.target as HTMLElement).closest('button,.ant-popover,.ant-tooltip')) return;
          onEdit?.(record);
        },
      })}
      locale={{
        emptyText: (
          <Text type="secondary">
            Резервуары не добавлены. Используйте кнопку «Добавить резервуар».
          </Text>
        ),
      }}
      columns={[
        {
          title: '#',
          render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
          width: 36,
        },
        {
          title: 'Наименование',
          dataIndex: ['params', 'name'],
          width: 160,
          ellipsis: true,
          render: (v: unknown) =>
            v ? (
              <Text style={{ fontSize: 12 }}>{String(v)}</Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
            ),
        },
        {
          title: 'Форма',
          dataIndex: ['params', 'shape'],
          width: 110,
          render: (v: string) => SHAPE_LABELS[v] ?? v,
        },
        {
          title: 'δ, мм',
          dataIndex: ['params', 'insulation_thickness'],
          width: 66,
          render: (v: number) => v != null ? formatNumber(v * 1000, 1) : '—',
        },
        {
          title: 'Материал',
          dataIndex: ['params', 'insulation_material'],
          width: 100,
          render: (v: string) => MATERIAL_LABELS[v] ?? v ?? '—',
        },
        {
          title: 'T₀, °C',
          dataIndex: ['params', 'ambient_temperature'],
          width: 68,
          render: (v: number) => formatNumber(v, 1),
        },
        {
          title: 'Tₚ, °C',
          dataIndex: ['params', 'process_temperature'],
          width: 68,
          render: (v: number) => formatNumber(v, 1),
        },
        {
          title: 'S, м²',
          width: 72,
          render: (_: unknown, r: ProjectObject) => (
            <ResultCell
              value={formatNumber(Number(r.results?.surface_area), 2)}
              obj={r}
            />
          ),
        },
        {
          title: 'q, Вт/м²',
          width: 80,
          render: (_: unknown, r: ProjectObject) => (
            <ResultCell
              value={formatNumber(Number(r.results?.heat_loss_per_m2), 1)}
              obj={r}
            />
          ),
        },
        {
          title: 'Q, Вт',
          width: 80,
          render: (_: unknown, r: ProjectObject) => (
            <ResultCell
              value={r.results ? formatPower(Number(r.results.total_heat_loss)) : '—'}
              obj={r}
            />
          ),
        },
        {
          title: '',
          width: 72,
          render: (_: unknown, r: ProjectObject) => (
            <Space size={4}>
              {onEdit && (
                <Tooltip title="Редактировать">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onEdit(r)}
                  />
                </Tooltip>
              )}
              <Popconfirm
                title="Удалить резервуар?"
                description="Связанные электрорасчёты также будут удалены."
                okText="Удалить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => delMut.mutate(r.id)}
              >
                <Tooltip title="Удалить">
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          ),
        },
      ]}
    />
    </SortableContext>
    </DndContext>
    {hasInvalid && (
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
        <WarningFilled style={{ color: '#d9363e', marginRight: 4 }} />
        Красные строки — объект не рассчитан. Откройте его для исправления параметров.
      </Text>
    )}
    </>
  );
}
