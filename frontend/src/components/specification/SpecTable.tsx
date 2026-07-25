import { Collapse, Space, Table } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { TltAlert, TltBadge, TltButton } from '@/components/ui-kit';
import type { SpecificationItem } from '@/types/specification';
import '@/pages/specification/specification-page.css';

export type SpecGroupBy = 'none' | 'category' | 'unit' | 'object_section';

interface Props {
  items: SpecificationItem[];
  groupBy?: SpecGroupBy;
  /** PDL-ER-38: merge rows with same catalog base + code/article after per-type calc. */
  mergeIdentical?: boolean;
  onDelete?: (index: number) => void;
  canDelete?: boolean;
  isStale?: boolean;
  /**
   * When true (default for object_section), always render pipe/tank/common
   * sections even if empty — matches mockup layout.
   */
  alwaysShowSections?: boolean;
}

type Row = SpecificationItem & { __index: number; __section: string };

/** Mockup §Прил.4: Трубы · Бочки · Общие материалы */
const SECTION_LABELS: Record<string, string> = {
  pipe: 'Трубы',
  tank: 'Бочки',
  common: 'Общие материалы',
};

const SECTION_ORDER = ['pipe', 'tank', 'common'] as const;

function bomSectionOf(item: SpecificationItem): string {
  const raw = String(
    (item.params as { bom_section?: string; object_type?: string } | undefined)?.bom_section
      || (item.params as { object_type?: string } | undefined)?.object_type
      || 'common',
  ).toLowerCase();
  if (raw === 'pipe' || raw === 'трубопровод' || raw === 'трубопроводы' || raw === 'трубы') {
    return 'pipe';
  }
  if (
    raw === 'tank'
    || raw === 'ёмкость'
    || raw === 'емкость'
    || raw === 'ёмкости'
    || raw === 'бочки'
    || raw === 'бочка'
  ) {
    return 'tank';
  }
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
  return <span className="spec-table-muted">—</span>;
}

function buildBaseColumns(showCategory: boolean) {
  return [
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
          {row.source === 'manual' && <TltBadge tone="info">ручная</TltBadge>}
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
        <span className="spec-table-tabular">
          {Number.isFinite(v) ? v.toLocaleString('ru-RU') : v}
        </span>
      ),
    },
  ];
}

export default function SpecTable({
  items,
  groupBy = 'object_section',
  mergeIdentical = false,
  onDelete,
  canDelete = false,
  isStale = false,
  alwaysShowSections = true,
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
  const baseColumns = buildBaseColumns(showCategory);

  const actionColumn = canDelete
    ? [
        {
          title: '',
          width: 48,
          render: (_: unknown, row: Row) => (
            <TltButton
              variant="danger"
              size="icon"
              icon={<DeleteOutlined />}
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
        className="spec-table"
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

  if (groupBy === 'object_section' && alwaysShowSections) {
    for (const key of SECTION_ORDER) {
      if (!groups.has(key)) groups.set(key, []);
    }
  }

  const order = groupBy === 'object_section' ? [...SECTION_ORDER] : undefined;
  const entries = [...groups.entries()].sort(([a], [b]) => {
    if (order) {
      const ia = order.indexOf(a as (typeof SECTION_ORDER)[number]);
      const ib = order.indexOf(b as (typeof SECTION_ORDER)[number]);
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

  const defaultOpen = grouped.map((g) => g.key);

  return (
    <div data-testid="spec-table-grouped" className="spec-table-grouped">
      <Collapse
        ghost
        bordered={false}
        defaultActiveKey={defaultOpen}
        className="spec-section-collapse"
        items={grouped.map((g) => ({
          key: g.key,
          label: (
            <span className="spec-section-title">
              {groupBy === 'object_section'
                ? g.label
                : groupBy === 'category'
                  ? `Категория: ${g.groupValue}`
                  : `Ед.: ${g.groupValue}`}
              {g.items.length > 0 && (
                <span className="spec-section-meta">
                  {g.items.length}
                  {groupBy === 'category' ? '' : ''}
                </span>
              )}
            </span>
          ),
          forceRender: true,
          children: (
            <div data-spec-section={g.key}>
              {g.items.length === 0 ? (
                <TltAlert
                  tone="info"
                  className="spec-section-empty"
                  title="Расчёт спецификации для данного типа объекта пока недоступен."
                />
              ) : (
                <Table<Row>
                  className="spec-table"
                  rowKey={(r) => `${r.__index}-${r.category}-${r.name}`}
                  dataSource={g.items}
                  pagination={false}
                  size="small"
                  showHeader
                  rowClassName={isStale ? 'specification-stale-row' : undefined}
                  columns={[...innerColumns, ...actionColumn]}
                />
              )}
            </div>
          ),
        }))}
      />
    </div>
  );
}
