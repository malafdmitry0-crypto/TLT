import { describe, expect, it } from 'vitest';
import {
  activeTableFilterCount,
  applyColumnFilters,
  applyTableSort,
  hasActiveTableViewState,
  removeHiddenTableViewState,
  type HeatCalcColumnValueAccessors,
  type HeatCalcIndexedTableRow,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

interface Row {
  id: string;
  name: string;
  diameter: number | null;
  material?: string | null;
}

const rows: HeatCalcIndexedTableRow<Row>[] = [
  { sourceIndex: 0, record: { id: '1', name: 'Труба Север', diameter: 219, material: 'Минеральная вата' } },
  { sourceIndex: 1, record: { id: '2', name: 'pipe south', diameter: 60, material: 'Пеностекло' } },
  { sourceIndex: 2, record: { id: '3', name: 'Труба Восток', diameter: null, material: null } },
  { sourceIndex: 3, record: { id: '4', name: 'Труба Запад', diameter: 60, material: 'Пеностекло' } },
];

const accessors: HeatCalcColumnValueAccessors<Row> = {
  name: (row) => row.name,
  diameter: (row) => row.diameter,
  material: (row) => row.material,
};

describe('heatCalcTableFindability', () => {
  it('фильтрует текст без учёта регистра, пробелов и алфавита', () => {
    const result = applyColumnFilters(
      rows,
      { name: { kind: 'text', value: '  труба ' } },
      accessors,
    );

    expect(result.map((row) => row.record.id)).toEqual(['1', '3', '4']);

    const latin = applyColumnFilters(rows, { name: { kind: 'text', value: 'PIPE' } }, accessors);
    expect(latin.map((row) => row.record.id)).toEqual(['2']);
  });

  it('фильтрует числовой диапазон и не пропускает пустые значения без includeEmpty', () => {
    expect(
      applyColumnFilters(rows, { diameter: { kind: 'numberRange', min: 100 } }, accessors)
        .map((row) => row.record.id),
    ).toEqual(['1']);

    expect(
      applyColumnFilters(rows, { diameter: { kind: 'numberRange', max: 60 } }, accessors)
        .map((row) => row.record.id),
    ).toEqual(['2', '4']);

    expect(
      applyColumnFilters(
        rows,
        { diameter: { kind: 'numberRange', min: 300, max: 100 } },
        accessors,
      ).map((row) => row.record.id),
    ).toEqual(['1', '2', '3', '4']);
  });

  it('поддерживает enum multi-select и пустые значения', () => {
    expect(
      applyColumnFilters(
        rows,
        { material: { kind: 'enum', values: ['Пеностекло'] } },
        accessors,
      ).map((row) => row.record.id),
    ).toEqual(['2', '4']);

    expect(
      applyColumnFilters(
        rows,
        { material: { kind: 'enum', values: [], includeEmpty: true } },
        accessors,
      ).map((row) => row.record.id),
    ).toEqual(['3']);
  });

  it('сортирует числа стабильно и оставляет пустые значения в конце', () => {
    expect(
      applyTableSort(rows, { columnKey: 'diameter', direction: 'asc' }, accessors)
        .map((row) => row.record.id),
    ).toEqual(['2', '4', '1', '3']);

    expect(
      applyTableSort(rows, { columnKey: 'diameter', direction: 'desc' }, accessors)
        .map((row) => row.record.id),
    ).toEqual(['1', '2', '4', '3']);
  });

  it('очищает фильтры и сортировку по скрытым колонкам', () => {
    const state: HeatCalcTableViewState = {
      filters: {
        name: { kind: 'text', value: 'труба' },
        material: { kind: 'enum', values: ['Пеностекло'] },
      },
      sort: { columnKey: 'material', direction: 'asc' },
    };

    const cleaned = removeHiddenTableViewState(state, ['name']);

    expect(cleaned).toEqual({
      filters: { name: { kind: 'text', value: 'труба' } },
      sort: undefined,
    });
    expect(activeTableFilterCount(cleaned)).toBe(1);
    expect(hasActiveTableViewState(cleaned)).toBe(true);
  });
});
