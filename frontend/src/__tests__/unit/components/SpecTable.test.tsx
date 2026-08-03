import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SpecTable from '@/components/specification/SpecTable';

describe('SpecTable', () => {
  it('renders items', () => {
    render(
      <SpecTable
        items={[
          {
            category: 'Кабель',
            name: 'ТЛТ-25',
            article: 'TLT25',
            unit: 'м',
            quantity: 50,
            params: {},
          },
        ]}
      />,
    );
    expect(screen.getByText('ТЛТ-25')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('PDF object_section: columns without Категория, with supplier and sections', () => {
    render(
      <SpecTable
        groupBy="object_section"
        items={[
          {
            category: 'Кабель',
            name: 'Саморегулирующийся кабель',
            article: 'HTL 30-2CR',
            unit: 'м',
            quantity: 1250,
            params: {
              bom_section: 'pipe',
              nomenclature_code: 'TLT.HTL30-2CR',
              supplier: 'Теплолюкс',
            },
          },
          {
            category: 'Коробка',
            name: 'Распределительная коробка',
            article: 'JB-01',
            unit: 'шт.',
            quantity: 5,
            params: {
              bom_section: 'common',
              code: 'TLT.JB-01',
              supplier: 'Теплолюкс',
            },
          },
        ]}
      />,
    );

    expect(screen.getByText('Трубы')).toBeInTheDocument();
    expect(screen.getByText('Бочки')).toBeInTheDocument();
    expect(screen.getByText('Общие материалы')).toBeInTheDocument();
    expect(screen.queryByText('Категория')).not.toBeInTheDocument();
    expect(screen.getAllByText('Поставщик').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Номенклатурный код').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ед. поставки').length).toBeGreaterThan(0);
    expect(screen.getByText('TLT.HTL30-2CR')).toBeInTheDocument();
    expect(screen.getAllByText('Теплолюкс').length).toBe(2);

    const pipeSection = document.querySelector('[data-spec-section="pipe"]')!;
    expect(within(pipeSection as HTMLElement).getByText('Саморегулирующийся кабель')).toBeInTheDocument();

    // Empty tank section shows mockup-style placeholder
    expect(
      screen.getByText(/Расчёт спецификации для данного типа объекта пока недоступен/i),
    ).toBeInTheDocument();
  });

  it('offers delete only for manual rows', () => {
    render(
      <SpecTable
        groupBy="none"
        canDelete
        onDelete={vi.fn()}
        items={[
          {
            category: 'Кабель', name: 'Автоматическая', article: 'AUTO', unit: 'м',
            quantity: '10', params: {}, source: 'auto',
          },
          {
            category: 'Доп.', name: 'Ручная', article: 'MANUAL', unit: 'шт.',
            quantity: '1', params: {}, source: 'manual',
          },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Удалить Автоматическая' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить Ручная' })).toBeInTheDocument();
  });
});
