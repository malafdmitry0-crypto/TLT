/**
 * Admin DatabasePage table column factories (P-BAND-02).
 */
import { Popconfirm, Space, Typography } from 'antd';
import { TltBadge, TltButton } from '@/components/ui-kit';
import type { AccessoryExtended, CableExtended } from '@/types/admin';
import { cableConductorSection } from '@/pages/admin/databasePagePayloadModel';

const { Text } = Typography;

type CableColumnHandlers = {
  onEdit: (row: CableExtended) => void;
  onDelete: (id: string) => void;
};

type AccessoryColumnHandlers = {
  onEdit: (row: AccessoryExtended) => void;
  onDelete: (id: string) => void;
};

export function buildCableColumns({ onEdit, onDelete }: CableColumnHandlers) {
  return [
    {
      title: 'Тип',
      dataIndex: 'cable_type',
      width: 130,
      render: (value: string) => <TltBadge>{value}</TltBadge>,
    },
    { title: 'Марка', dataIndex: 'model', width: 150 },
    { title: 'Бренд', dataIndex: 'brand', width: 120 },
    { title: 'Вт/м', dataIndex: 'power_per_meter', width: 90 },
    { title: 'Ом/м', dataIndex: 'resistance_per_meter', width: 90 },
    {
      title: 'Сечение',
      dataIndex: ['params', 'conductor_section_mm2'],
      width: 90,
      render: (_: unknown, row: CableExtended) =>
        cableConductorSection(row.params)?.toString() ?? '—',
    },
    { title: 'Поставщик', dataIndex: 'supplier_name', width: 150 },
    { title: 'Артикул', dataIndex: 'article', width: 130 },
    { title: 'Цена/м', dataIndex: 'price_per_meter', width: 100 },
    { title: 'Валюта', dataIndex: 'currency', width: 80 },
    { title: 'Остаток, м', dataIndex: 'stock_quantity_m', width: 110 },
    { title: 'Статус', dataIndex: 'stock_status', width: 110 },
    { title: 'Срок, дн.', dataIndex: 'lead_time_days', width: 90 },
    { title: 'Приоритет', dataIndex: 'supplier_priority', width: 100 },
    {
      title: 'Активен',
      dataIndex: 'is_active',
      width: 90,
      render: (value: boolean) => (value ? 'Да' : 'Нет'),
    },
    {
      title: 'Действия',
      key: 'actions',
      fixed: 'right' as const,
      width: 160,
      render: (_: unknown, row: CableExtended) => (
        <Space>
          <TltButton size="compact" onClick={() => onEdit(row)}>
            Изм.
          </TltButton>
          <Popconfirm title="Удалить кабель?" onConfirm={() => onDelete(row.id)}>
            <TltButton size="compact" variant="danger">
              Удалить
            </TltButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

export function buildAccessoryColumns({ onEdit, onDelete }: AccessoryColumnHandlers) {
  return [
    { title: 'Категория', dataIndex: 'category', width: 160 },
    { title: 'Наименование', dataIndex: 'name', width: 240 },
    { title: 'Артикул', dataIndex: 'article', width: 140 },
    {
      title: 'Активен',
      dataIndex: 'is_active',
      width: 90,
      render: (value: boolean) => (value ? 'Да' : 'Нет'),
    },
    {
      title: 'Commercial params',
      dataIndex: 'params',
      render: (value: Record<string, unknown> | null) =>
        value ? <Text code>{Object.keys(value).join(', ')}</Text> : '—',
    },
    {
      title: 'Действия',
      key: 'actions',
      fixed: 'right' as const,
      width: 160,
      render: (_: unknown, row: AccessoryExtended) => (
        <Space>
          <TltButton size="compact" onClick={() => onEdit(row)}>
            Изм.
          </TltButton>
          <Popconfirm title="Удалить аксессуар?" onConfirm={() => onDelete(row.id)}>
            <TltButton size="compact" variant="danger">
              Удалить
            </TltButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
