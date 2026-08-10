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

  it('renders the canonical PDF sections and columns without a display grouping mode', () => {
    render(
      <SpecTable
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

    // Empty tank section: honest empty, not "unsupported"
    expect(screen.getByText('Нет позиций в этой секции.')).toBeInTheDocument();
    expect(
      screen.queryByText(/Расчёт спецификации для данного типа объекта пока недоступен/i),
    ).not.toBeInTheDocument();
  });

  it('places BE object_type_section=pipe rows under Трубы (SPEC-P0-a)', () => {
    render(
      <SpecTable
        items={[
          {
            category: 'Кабель',
            name: 'Греющий кабель TT',
            article: '30ТТВ2-СР',
            unit: 'м',
            quantity: 100,
            params: {
              object_type_section: 'pipe',
              object_type: 'common',
              bom_section: 'common',
            },
          },
        ]}
      />,
    );

    const pipeSection = document.querySelector('[data-spec-section="pipe"]')!;
    expect(within(pipeSection as HTMLElement).getByText('Греющий кабель TT')).toBeInTheDocument();
    const commonSection = document.querySelector('[data-spec-section="common"]')!;
    expect(within(commonSection as HTMLElement).queryByText('Греющий кабель TT')).not.toBeInTheDocument();
  });

  it('renders backend rows as-is without client-side merging', () => {
    render(
      <SpecTable
        items={[
          {
            category: 'Комплект', name: 'Комплект A', article: 'KIT-A', unit: 'шт.',
            quantity: 5, params: { object_type_section: 'pipe', nomenclature_code: 'KIT-A' },
          },
          {
            category: 'Комплект', name: 'Комплект A', article: 'KIT-A', unit: 'шт.',
            quantity: 3, params: { object_type_section: 'pipe', nomenclature_code: 'KIT-A' },
          },
        ]}
      />,
    );

    const pipeSection = document.querySelector('[data-spec-section="pipe"]')!;
    expect(within(pipeSection as HTMLElement).getAllByText('Комплект A')).toHaveLength(2);
    expect(within(pipeSection as HTMLElement).getByText('5')).toBeInTheDocument();
    expect(within(pipeSection as HTMLElement).getByText('3')).toBeInTheDocument();
    expect(within(pipeSection as HTMLElement).queryByText('8')).not.toBeInTheDocument();
  });

  it('offers delete only for manual rows', () => {
    render(
      <SpecTable
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
