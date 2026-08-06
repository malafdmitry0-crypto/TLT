import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SpecCandidateSelectionPanel } from '@/pages/specification/SpecCandidateSelectionPanel';
import type { SpecificationCandidateGroup } from '@/api/specifications';

const groups: SpecificationCandidateGroup[] = [
  {
    group_key: 'cg_connection',
    electrical_variant_id: 'er-1',
    category: 'connection_kit',
    conditions: { temperature_group: 'MEDIUM_HIGH' },
    candidates: [
      {
        catalog_item_id: 'item-a',
        catalog_id: 'cat-1',
        catalog_version: 'v1',
        category: 'connection_kit',
        name: 'Комплект A',
        mark: 'КСВ-1',
        nomenclature_code: '001',
        supply_unit: 'шт.',
        package_parameters: { sections_per_kit: 2 },
        formula_parameters: { formula_id: 'connection-kit/v1' },
      },
      {
        catalog_item_id: 'item-b',
        catalog_id: 'cat-1',
        catalog_version: 'v1',
        category: 'connection_kit',
        name: 'Комплект B',
        mark: 'КСВ-2',
        nomenclature_code: '002',
        supply_unit: 'шт.',
      },
    ],
    selected_catalog_item_id: null,
  },
  {
    group_key: 'cg_sealant',
    electrical_variant_id: 'er-1',
    category: 'sealant',
    conditions: {},
    candidates: [
      {
        catalog_item_id: 'item-seal',
        catalog_id: 'cat-1',
        catalog_version: 'v1',
        category: 'sealant',
        name: 'Герметик',
        mark: 'S1',
        nomenclature_code: '003',
        supply_unit: 'шт.',
      },
    ],
    selected_catalog_item_id: 'item-seal',
  },
];

describe('SpecCandidateSelectionPanel', () => {
  it('does not preselect first candidate and only lists multi-choice groups', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SpecCandidateSelectionPanel
        groups={groups}
        draftSelections={{}}
        onSelect={onSelect}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Комплект A')).toBeInTheDocument();
    expect(screen.getByText('Комплект B')).toBeInTheDocument();
    expect(screen.getByText('ЭР: er-1')).toBeInTheDocument();
    expect(screen.getByText('поставка: sections_per_kit=2')).toBeInTheDocument();
    expect(screen.getByText('формула: formula_id=connection-kit/v1')).toBeInTheDocument();
    expect(screen.queryByText('Герметик')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Применить выбор/i })).toBeDisabled();

    const candidateA = screen.getByRole('button', { name: /Комплект A/i });
    const candidateB = screen.getByRole('button', { name: /Комплект B/i });
    expect(candidateA).toHaveAttribute('aria-pressed', 'false');
    expect(candidateB).toHaveAttribute('aria-pressed', 'false');
    expect(candidateA).not.toHaveAccessibleName(/Выбрать/i);
    expect(candidateB).not.toHaveAccessibleName(/Выбрать/i);
    expect(within(candidateA).getByText('Выбрать')).toBeInTheDocument();
    expect(within(candidateB).getByText('Выбрать')).toBeInTheDocument();

    await user.click(candidateA);
    expect(onSelect).toHaveBeenCalledWith('cg_connection', 'item-a');
  });

  it('enables confirm only after every multi-group is drafted', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SpecCandidateSelectionPanel
        groups={groups}
        draftSelections={{ cg_connection: 'item-b' }}
        onSelect={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: /Применить выбор/i });
    const candidateA = screen.getByRole('button', { name: /Комплект A/i });
    const candidateB = screen.getByRole('button', { name: /Комплект B/i });

    expect(candidateA).toHaveAttribute('aria-pressed', 'false');
    expect(within(candidateA).getByText('Выбрать')).toBeInTheDocument();
    expect(candidateB).toHaveAttribute('aria-pressed', 'true');
    expect(candidateB).not.toHaveAccessibleName(/Выбрано/i);
    expect(within(candidateB).getByText('✓ Выбрано')).toBeInTheDocument();
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('locks selection and submit while the confirmation request is pending', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SpecCandidateSelectionPanel
        groups={groups}
        draftSelections={{ cg_connection: 'item-b' }}
        onSelect={vi.fn()}
        onConfirm={onConfirm}
        confirming
      />,
    );

    expect(screen.getByRole('button', { name: /Комплект A/i })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: /Применить выбор/i });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
