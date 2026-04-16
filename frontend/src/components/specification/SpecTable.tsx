import { Button, Space, Table, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { SpecificationItem } from '@/types/specification';

interface Props {
  items: SpecificationItem[];
  groupBy?: 'none' | 'category' | 'unit';
  onDelete?: (index: number) => void;
  canDelete?: boolean;
}

type Row = SpecificationItem & { __index: number };

export default function SpecTable({
  items,
  groupBy = 'none',
  onDelete,
  canDelete = false,
}: Props) {
  const rows: Row[] = items.map((it, idx) => ({ ...it, __index: idx }));

  const baseColumns = [
    {
      title: 'Категория',
      dataIndex: 'category',
      sorter: (a: Row, b: Row) => a.category.localeCompare(b.category),
    },
    {
      title: 'Наименование',
      dataIndex: 'name',
      sorter: (a: Row, b: Row) => a.name.localeCompare(b.name),
      render: (v: string, row: Row) => (
        <Space size={4}>
          <span>{v}</span>
          {row.source === 'manual' && <Tag color="purple">ручная</Tag>}
        </Space>
      ),
    },
    {
      title: 'Артикул',
      dataIndex: 'article',
      sorter: (a: Row, b: Row) =>
        (a.article ?? '').localeCompare(b.article ?? ''),
      render: (v: string | null) =>
        v ? v : <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Ед.',
      dataIndex: 'unit',
      width: 80,
      sorter: (a: Row, b: Row) => a.unit.localeCompare(b.unit),
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      width: 100,
      sorter: (a: Row, b: Row) => a.quantity - b.quantity,
    },
  ];

  const actionColumn = canDelete
    ? [
        {
          title: '',
          width: 48,
          render: (_: unknown, row: Row) => (
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => onDelete?.(row.__index)}
            />
          ),
        },
      ]
    : [];

  if (groupBy === 'none') {
    return (
      <Table<Row>
        rowKey={(r) => `${r.__index}-${r.category}-${r.name}`}
        dataSource={rows}
        pagination={false}
        size="small"
        columns={[...baseColumns, ...actionColumn]}
      />
    );
  }

  // Группировка: отсекаем столбец, по которому группируем
  const groupKey = groupBy;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = String(r[groupKey] ?? '—');
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const grouped = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupValue, groupItems]) => ({
      key: groupValue,
      groupValue,
      items: groupItems,
      total: groupItems.reduce((acc, r) => acc + (r.quantity || 0), 0),
    }));

  const innerColumns = baseColumns.filter((c) => c.dataIndex !== groupKey);

  return (
    <div>
      {grouped.map((g) => (
        <div key={g.key} style={{ marginBottom: 12 }}>
          <div
            style={{
              padding: '6px 10px',
              background: '#f0f5fa',
              borderLeft: '3px solid #1a5276',
              marginBottom: 4,
              fontSize: 13,
            }}
          >
            <strong>
              {groupBy === 'category' ? 'Категория: ' : 'Ед.: '}
              {g.groupValue}
            </strong>
            <span style={{ color: '#888', marginLeft: 8 }}>
              позиций: {g.items.length}
              {groupBy === 'category' ? '' : ` · всего: ${g.total}`}
            </span>
          </div>
          <Table<Row>
            rowKey={(r) => `${r.__index}-${r.category}-${r.name}`}
            dataSource={g.items}
            pagination={false}
            size="small"
            showHeader
            columns={[...innerColumns, ...actionColumn]}
          />
        </div>
      ))}
    </div>
  );
}
