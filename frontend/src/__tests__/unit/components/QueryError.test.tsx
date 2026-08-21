import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryError from '@/components/common/QueryError';

describe('QueryError', () => {
  it('shows the API error message and default title', () => {
    render(<QueryError error={new Error('Сервер недоступен')} />);
    expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument();
    expect(screen.getByText('Сервер недоступен')).toBeInTheDocument();
  });

  it('uses a custom title and a fallback message for non-Error', () => {
    render(<QueryError error={null} title="Отчёт не загружен" />);
    expect(screen.getByText('Отчёт не загружен')).toBeInTheDocument();
    expect(screen.getByText(/Произошла ошибка/)).toBeInTheDocument();
  });

  it('renders a retry button that calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<QueryError error={new Error('x')} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /Повторить/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when no onRetry is given', () => {
    render(<QueryError error={new Error('x')} />);
    expect(screen.queryByRole('button', { name: /Повторить/ })).toBeNull();
  });
});
