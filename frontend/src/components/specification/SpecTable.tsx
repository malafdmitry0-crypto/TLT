import { Collapse, Space, Table } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { TltAlert, TltBadge, TltButton } from '@/components/ui-kit';
import type { SpecificationItem } from '@/types/specification';
import {
  bomSectionOf,
  specSectionEmptyTitle,
  type SpecSectionEmptyKind,
} from '@/domain/specification/specTableSectionModel';

interface Props {
  items: SpecificationItem[];
  onDelete?: (index: number) => void;
  canDelete?: boolean;
  isStale?: boolean;
  /**
   * When true (default for object_section), always render pipe/tank/common
   * sections even if empty — matches mockup layout.
   */
  alwaysShowSections?: boolean;
  /**
   * How to explain empty always-shown sections.
   * Default `no_items` — do not claim the object type is unsupported.
   */
  sectionEmptyKind?: SpecSectionEmptyKind;
}

type Row = SpecificationItem & { __index: number; __section: string };

/** Mockup §Прил.4: Трубы · Бочки · Общие материалы */
const SECTION_LABELS: Record<string, string> = {
  pipe: 'Трубы',
  tank: 'Бочки',
  common: 'Общие материалы',
};

const SECTION_ORDER = ['pipe', 'tank', 'common'] as const;

function EmptyCell() {
  return <span className="spec-table-muted">—</span>;
}

function buildBaseColumns() {
  return [
    {
      title: '№',
      key: 'row_num',
      width: 48,
      render: (_: unknown, __: Row, index: number) => index + 1,
    },
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
      sorter: (a: Row, b: Row) => Number(a.quantity || 0) - Number(b.quantity || 0),
      render: (v: number | string) => {
        const n = Number(v);
        return (
          <span className="spec-table-tabular">
            {Number.isFinite(n) ? n.toLocaleString('ru-RU') : String(v ?? '')}
          </span>
        );
      },
    },
  ];
}

export default function SpecTable({
  items,
  onDelete,
  canDelete = false,
  isStale = false,
  alwaysShowSections = true,
  sectionEmptyKind = 'no_items',
}: Props) {
  const rows: Row[] = items.map((it, idx) => ({
    ...it,
    __index: idx,
    __section: bomSectionOf(it),
  }));
  // PDF §7.1 / UI-PDF-05: № · Наименование · Марка · Код · Поставщик · Ед. поставки · Кол-во
  const baseColumns = buildBaseColumns();

  const actionColumn = canDelete
    ? [
        {
          title: '',
          width: 48,
          render: (_: unknown, row: Row) => row.source === 'manual'
            ? (
                <TltButton
                  variant="danger"
                  size="icon"
                  icon={<DeleteOutlined />}
                  aria-label={`Удалить ${row.name}`}
                  onClick={() => onDelete?.(row.__index)}
                />
              )
            : null,
        },
      ]
    : [];

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.__section;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  if (alwaysShowSections) {
    for (const key of SECTION_ORDER) {
      if (!groups.has(key)) groups.set(key, []);
    }
  }

  const order = [...SECTION_ORDER];
  const entries = [...groups.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a as (typeof SECTION_ORDER)[number]);
    const ib = order.indexOf(b as (typeof SECTION_ORDER)[number]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  const grouped = entries.map(([groupValue, groupItems]) => ({
    key: groupValue,
    groupValue,
    label: SECTION_LABELS[groupValue] || groupValue,
    items: groupItems,
    total: groupItems.reduce((acc, r) => acc + Number(r.quantity || 0), 0),
  }));

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
              {g.label}
              {g.items.length > 0 && (
                <span className="spec-section-meta">
                  {g.items.length}
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
                  data-testid={`spec-section-empty-${g.key}`}
                  title={specSectionEmptyTitle(sectionEmptyKind)}
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
                  columns={[...baseColumns, ...actionColumn]}
                />
              )}
            </div>
          ),
        }))}
      />
    </div>
  );
}
