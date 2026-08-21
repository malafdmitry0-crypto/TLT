import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabBadge from '@/components/common/TabBadge';

describe('TabBadge', () => {
  it('рендерит label', () => {
    render(<TabBadge label="Трубопроводы" count={0} />);
    expect(screen.getByText('Трубопроводы')).toBeInTheDocument();
  });

  it('скрывает счётчик если count = 0', () => {
    render(<TabBadge label="Пусто" count={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('показывает счётчик если count > 0', () => {
    render(<TabBadge label="Трубы" count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
