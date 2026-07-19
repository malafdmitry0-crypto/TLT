import { Button, Space, Table, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { SpecificationItem } from '@/types/specification';

export type SpecGroupBy = 'none' | 'category' | 'unit' | 'object_section';

interface Props {
  items: SpecificationItem[];
  groupBy?: SpecGroupBy;
  /** PDL-ER-38: merge rows with same catalog base + code/article after per-type calc. */
  mergeIdentical?: boolean;
  onDelete?: (index: number) => void;
  canDelete?: boolean;
  isStale?: boolean;
}

type Row = SpecificationItem & { __index: number; __section: string };

const SECTION_LABELS: Record<string, string> = {
  pipe: 'Трубопроводы',
  tank: 'Ёмкости',
  common: 'Общие материалы',
};

function bomSectionOf(item: SpecificationItem): string {
  const raw = String(
    (item.params as { bom_section?: string; object_type?: string } | undefined)?.bom_section
      || (item.params as { object_type?: string } | undefined)?.object_type
      || 'common',
  ).toLowerCase();
  if (raw === 'pipe' || raw === 'трубопровод' || raw === 'трубопроводы') return 'pipe';
  if (raw === 'tank' || raw === 'ёмкость' || raw === 'емкость' || raw === 'ёмкости') return 'tank';
  return 'common';
}

function mergeRows(rows: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const code = String(
      row.article
      || (row.params as { code?: string } | undefined)?.code
      || '',
    );
    const base = String(
      (row.params as { catalog_base?: string } | undefined)?.catalog_base
      || row.name,
    );
    // PDL-ER-38: merge only when both base and nomenclature code match.
    if (!code) {
      map.set(`no-code-${row.__index}`, row);
      continue;
    }
    const key = `${row.__section}|${base}|${code}|${row.unit}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }
    existing.quantity = Number(existing.quantity || 0) + Number(row.quantity || 0);
  }
  return [...map.values()];
}

function EmptyCell() {
  return <span style={{ color: '#bbb' }}>—</span>;
}

export default function SpecTable({
  items,
  groupBy = 'object_section',
  mergeIdentical = false,
  onDelete,
  canDelete = false,
  isStale = false,
}: Props) {
  let rows: Row[] = items.map((it, idx) => ({
    ...it,
    __index: idx,
    __section: bomSectionOf(it),
  }));
  if (mergeIdentical) {
    rows = mergeRows(rows);
  }

  // PDF §7.1 / UI-PDF-05: № · Наименование · Марка · Код · Поставщик · Ед. поставки · Кол-во
  // «Категория» — только вне группировки по разделам object_section.
  const showCategory = groupBy !== 'object_section';

  const baseColumns = [
    {
      title: '№',
      key: 'row_num',
      width: 48,
      render: (_: unknown, __: Row, index: number) => index + 1,
    },
    ...(showCategory
      ? [{
          title: 'Категория',
          dataIndex: 'category' as const,
          width: 120,
          sorter: (a: Row, b: Row) => a.category.localeCompare(b.category),
        }]
      : []),
    {
      title: 'Наименование',
      dataIndex: 'name' as const,
      sorter: (a: Row, b: Row) => a.name.localeCompare(b.name),
      render: (v: string, row: Row) => (
        <Space size={4}>
          <span>{v}</span>
          {row.source === 'manual' && <Tag color="purple">ручная</Tag>}
        </Space>
      ),
    },
    {
      title: 'Марка',
      dataIndex: 'article' as const,
      width: 120,
      sorter: (a: Row, b: Row) =>
        (a.article ?? '').localeCompare(b.article ?? ''),
      render: (v: string | null, row: Row) => {
        const mark = String(
          (row.params as { mark?: string } | undefined)?.mark || v || '',
        );
        return mark || <EmptyCell />;
      },
    },
    {
      title: 'Номенклатурный код',
      key: 'nomenclature_code',
      width: 150,
      sorter: (a: Row, b: Row) => {
        const ac = String(
          (a.params as { nomenclature_code?: string; code?: string } | undefined)
            ?.nomenclature_code
            || (a.params as { code?: string } | undefined)?.code
            || a.article
            || '',
        );
        const bc = String(
          (b.params as { nomenclature_code?: string; code?: string } | undefined)
            ?.nomenclature_code
            || (b.params as { code?: string } | undefined)?.code
            || b.article
            || '',
        );
        return ac.localeCompare(bc);
      },
      render: (_: unknown, row: Row) => {
        const code = String(
          (row.params as { nomenclature_code?: string; code?: string } | undefined)
            ?.nomenclature_code
            || (row.params as { code?: string } | undefined)?.code
            || '',
        );
        return code || <EmptyCell />;
      },
    },
    {
      title: 'Поставщик',
      key: 'supplier',
      width: 140,
      render: (_: unknown, row: Row) => {
        const supplier = String(
          (row.params as { supplier?: string } | undefined)?.supplier || '',
        ).trim();
        return supplier || <EmptyCell />;
      },
    },
    {
      title: 'Ед. поставки',
      dataIndex: 'unit' as const,
      width: 100,
      sorter: (a: Row, b: Row) => a.unit.localeCompare(b.unit),
      render: (v: string, row: Row) => {
        const supply = String(
          (row.params as { supply_unit?: string } | undefined)?.supply_unit || v || '',
        );
        return supply || <EmptyCell />;
      },
    },
    {
      title: 'Количество',
      dataIndex: 'quantity' as const,
      width: 100,
      align: 'right' as const,
      sorter: (a: Row, b: Row) => a.quantity - b.quantity,
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Number.isFinite(v) ? v.toLocaleString('ru-RU') : v}
        </span>
      ),
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
              aria-label={`Удалить ${row.name}`}
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
        rowClassName={isStale ? 'specification-stale-row' : undefined}
        columns={[...baseColumns, ...actionColumn]}
      />
    );
  }

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    let key: string;
    if (groupBy === 'object_section') {
      key = r.__section;
    } else if (groupBy === 'category') {
      key = r.category;
    } else {
      key = r.unit;
    }
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const order = groupBy === 'object_section' ? ['pipe', 'tank', 'common'] : undefined;
  const entries = [...groups.entries()].sort(([a], [b]) => {
    if (order) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return a.localeCompare(b);
  });

  const grouped = entries.map(([groupValue, groupItems]) => ({
    key: groupValue,
    groupValue,
    label:
      groupBy === 'object_section'
        ? (SECTION_LABELS[groupValue] || groupValue)
        : groupValue,
    items: groupItems,
    total: groupItems.reduce((acc, r) => acc + (r.quantity || 0), 0),
  }));

  const innerColumns =
    groupBy === 'category'
      ? baseColumns.filter((c) => !('dataIndex' in c && c.dataIndex === 'category'))
      : groupBy === 'unit'
        ? baseColumns.filter((c) => !('dataIndex' in c && c.dataIndex === 'unit'))
        : baseColumns;

  return (
    <div data-testid="spec-table-grouped">
      {grouped.map((g) => (
        <div key={g.key} style={{ marginBottom: 14 }} data-spec-section={g.key}>
          <div
            style={{
              padding: '7px 12px',
              background: '#f5f8fb',
              borderLeft: '3px solid #1a5276',
              borderRadius: '0 6px 6px 0',
              marginBottom: 6,
              fontSize: 13,
            }}
          >
            <strong>
              {groupBy === 'object_section'
                ? g.label
                : groupBy === 'category'
                  ? `Категория: ${g.groupValue}`
                  : `Ед.: ${g.groupValue}`}
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
            rowClassName={isStale ? 'specification-stale-row' : undefined}
            columns={[...innerColumns, ...actionColumn]}
          />
        </div>
      ))}
    </div>
  );
}
