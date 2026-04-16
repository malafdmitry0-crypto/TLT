import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DatabasePage from '@/pages/admin/DatabasePage';

describe('DatabasePage', () => {
  it('рендерит карточку и табы Кабели/Аксессуары', () => {
    render(<DatabasePage />);
    expect(screen.getByText('Внешняя база данных')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Кабели/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Аксессуары/i })).toBeInTheDocument();
  });
});
