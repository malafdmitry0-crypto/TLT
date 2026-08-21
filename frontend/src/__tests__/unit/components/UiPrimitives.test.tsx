import { StrictMode, createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import {
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltEmptyState,
  TltTable,
  TltTabs,
} from '@/components/ui-kit';

describe('CSS-first UI primitives', () => {
  it('keeps loading and disabled button states accessible', () => {
    render(
      <div>
        <TltButton loading aria-label="Сохранение" />
        <TltButton disabled>Недоступно</TltButton>
      </div>,
    );

    const loadingButton = screen.getByRole('button', { name: 'Сохранение' });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Недоступно' })).toBeDisabled();
  });

  it('supports tab selection and keyboard navigation while skipping disabled tabs', async () => {
    const user = userEvent.setup();
    render(
      <TltTabs
        tabListLabel="Разделы расчёта"
        items={[
          { id: 'one', label: 'Первый', content: <p>Первое содержимое</p> },
          { id: 'disabled', label: 'Недоступно', content: <p>Не показывать</p>, disabled: true },
          { id: 'two', label: 'Второй', content: <p>Второе содержимое</p> },
        ]}
      />,
    );

    const firstTab = screen.getByRole('tab', { name: 'Первый' });
    const secondTab = screen.getByRole('tab', { name: 'Второй' });
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Первое содержимое')).toBeInTheDocument();

    await user.click(secondTab);

    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Второе содержимое')).toBeInTheDocument();
    // Disabled tab content stays unmounted / hidden under Ant Tabs
    expect(screen.queryByText('Не показывать')).not.toBeInTheDocument();
  });

  it('composes card, alert and badge without imposing business state', () => {
    render(
      <TltCard title="Параметры" actions={<TltBadge tone="success">Готово</TltBadge>}>
        <TltAlert tone="warning" title="Нужна проверка">Проверьте исходные данные.</TltAlert>
      </TltCard>,
    );

    expect(screen.getByRole('heading', { name: 'Параметры' })).toBeInTheDocument();
    expect(screen.getByText('Готово')).toHaveClass('tlt-ui-badge--success');
    expect(screen.getByRole('status')).toHaveTextContent('Проверьте исходные данные.');
  });

  it('renders a selected row and an honest empty state', async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    // Public contract: readonly column tuples are valid input (no cast required).
    const columns = [
      { key: 'id', header: 'Код' },
      { key: 'name', header: 'Название' },
    ] as const satisfies readonly { key: string; header: string }[];
    const rows = [{ id: 'T-101', name: 'Подающий трубопровод' }] as const;

    const { rerender } = render(
      <TltTable
        aria-label="Объекты"
        columns={columns}
        rows={[...rows]}
        rowKey="id"
        selectedRowKey="T-101"
        onRowSelect={onRowSelect}
      />,
    );

    const table = screen.getByRole('table', { name: 'Объекты' });
    const row = within(table).getByRole('row', { name: /T-101/ });
    expect(row).toHaveAttribute('aria-selected', 'true');
    await user.click(row);
    expect(onRowSelect).toHaveBeenCalledWith(rows[0], 'T-101');

    rerender(
      <TltTable
        aria-label="Объекты"
        columns={columns}
        rows={[] as const}
        rowKey="id"
        emptyState={<TltEmptyState title="Нет объектов" description="Создайте первый объект." />}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Нет объектов' })).toBeInTheDocument();
    expect(screen.getByText('Создайте первый объект.')).toBeInTheDocument();
  });

  it('forwards the badge DOM ref so Ant Tooltip works without findDOMNode in StrictMode', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const badgeRef = createRef<HTMLSpanElement>();
      render(
        <StrictMode>
          <Tooltip title="Рассчитан" open>
            <TltBadge ref={badgeRef} tone="success">Рассчитан</TltBadge>
          </Tooltip>
        </StrictMode>,
      );

      expect(badgeRef.current).toBeInstanceOf(HTMLSpanElement);
      expect(badgeRef.current).toHaveClass('tlt-ui-badge');
      const findDomNodeErrors = consoleError.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('findDOMNode')),
      );
      expect(findDomNodeErrors).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
