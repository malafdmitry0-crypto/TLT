import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      />
    );
    expect(screen.getByText('ТЛТ-25')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });
});
