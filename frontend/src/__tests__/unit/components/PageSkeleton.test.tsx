import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PageSkeleton from '@/components/common/PageSkeleton';

describe('PageSkeleton', () => {
  it('renders an aria-busy region with active skeleton placeholders', () => {
    const { container } = render(<PageSkeleton />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
  });

  it('renders the requested number of content rows plus the title', () => {
    const { container } = render(<PageSkeleton rows={3} />);
    // 1 title input + 3 row inputs
    expect(container.querySelectorAll('.ant-skeleton-input').length).toBe(4);
  });
});
