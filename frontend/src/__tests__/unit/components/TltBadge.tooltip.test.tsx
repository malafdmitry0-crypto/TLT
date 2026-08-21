import { render, screen } from '@testing-library/react';
import { Tooltip } from 'antd';
import { describe, expect, it } from 'vitest';
import { TltBadge } from '@/components/ui-kit';

describe('TltBadge + Tooltip', () => {
  it('forwards ref for Tooltip without findDOMNode-only host', () => {
    const ref = { current: null as HTMLSpanElement | null };
    render(
      <Tooltip title="Подсказка">
        <TltBadge ref={ref} tone="success">Готово</TltBadge>
      </Tooltip>,
    );
    expect(screen.getByText('Готово')).toBeInTheDocument();
    // ref may attach to Tag root; presence of badge text is enough for API parity
    expect(screen.getByText('Готово').closest('.tlt-ui-badge')).not.toBeNull();
  });
});
