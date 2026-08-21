/**
 * @module heatcalc/visible-selection-model
 * @owner heat
 * Pure selection over visible heat table rows.
 */

export type VisibleTableRowLike = {
  record: { id: string };
};

/**
 * Keep only visible rows whose record id is in the selected key set.
 */
export function filterVisibleRowsBySelectedKeys<T extends VisibleTableRowLike>(
  visibleTableRows: readonly T[],
  selectedRowKeys: readonly string[],
): T[] {
  if (selectedRowKeys.length === 0 || visibleTableRows.length === 0) {
    return [];
  }
  const selected = new Set(selectedRowKeys);
  return visibleTableRows.filter(({ record }) => selected.has(record.id));
}
