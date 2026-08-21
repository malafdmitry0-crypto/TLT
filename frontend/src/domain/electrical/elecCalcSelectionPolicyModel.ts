import type { SelectionPolicy } from '@/api/calculations';

export const SELECTION_POLICY_LABEL: Record<SelectionPolicy, string> = {
  technical_minimum: 'Технический',
  lowest_cost: 'Дешевле',
  fastest_delivery: 'Быстрее',
  in_stock: 'В наличии',
  preferred_supplier: 'Приоритет',
  balanced: 'Баланс',
};

export const SELECTION_POLICY_OPTIONS = (Object.keys(SELECTION_POLICY_LABEL) as SelectionPolicy[]).map(
  (value) => ({
    value,
    label: SELECTION_POLICY_LABEL[value],
  }),
);

export function selectionPolicyText(value: unknown) {
  if (typeof value !== 'string') return '—';
  return SELECTION_POLICY_LABEL[value as SelectionPolicy]
    ?? (value === 'manual_selection' ? 'Ручной' : value);
}
