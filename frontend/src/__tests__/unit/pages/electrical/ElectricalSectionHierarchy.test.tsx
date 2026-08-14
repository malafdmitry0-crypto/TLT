import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ElectricalSectionHierarchy } from '@/pages/electrical/ElectricalSectionHierarchy';

describe('ElectricalSectionHierarchy', () => {
  it('shows placeholder without sections', () => {
    render(<ElectricalSectionHierarchy calc={undefined} />);
    expect(screen.getByTestId('section-hierarchy-shell')).toHaveTextContent(
      'Секции появятся после успешного электрорасчёта',
    );
    expect(screen.getByTestId('section-hierarchy-shell')).toHaveTextContent(
      'Lмакс / I доп / Iст.уд',
    );
  });

  it('renders section rows from results', () => {
    render(
      <ElectricalSectionHierarchy
        calc={{
          results: {
            section_count: 1,
            sections: [
              {
                index: 1,
                length_m: 10,
                power_w: 100,
                working_current_a: 1.2,
                start_current_a: 3.4,
              },
            ],
          },
        } as never}
      />,
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
