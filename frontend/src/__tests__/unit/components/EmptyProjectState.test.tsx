import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import EmptyProjectState from '@/components/common/EmptyProjectState';

function renderWithRouter(ui: React.ReactElement) {
  return render(<TestMemoryRouter>{ui}</TestMemoryRouter>);
}

describe('EmptyProjectState', () => {
  it('рендерит заголовок, описание и кнопку «Открыть проект»', () => {
    renderWithRouter(
      <EmptyProjectState
        icon={<span data-testid="icon" />}
        title="Тестовая страница"
        description="Описание пустого состояния."
      />,
    );
    expect(screen.getByText('Тестовая страница')).toBeInTheDocument();
    expect(screen.getByText('Описание пустого состояния.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /открыть проект/i })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('показывает предупреждение «Проект не выбран»', () => {
    renderWithRouter(
      <EmptyProjectState icon={null} title="Заголовок" description="Описание" />,
    );
    expect(screen.getByText('Проект не выбран')).toBeInTheDocument();
  });
});
