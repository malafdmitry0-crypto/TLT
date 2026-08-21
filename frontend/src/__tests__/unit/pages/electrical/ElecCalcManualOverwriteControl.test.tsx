import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ElecCalcManualOverwriteControl } from '@/pages/electrical/ElecCalcManualOverwriteControl';

describe('ElecCalcManualOverwriteControl', () => {
  it('renders nothing when manualCount is 0', () => {
    const { container } = render(
      <ElecCalcManualOverwriteControl
        manualCount={0}
        canMutate
        overwriteManualChoices={false}
        onOverwriteChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles overwrite when allowed', async () => {
    const user = userEvent.setup();
    const onOverwriteChange = vi.fn();
    render(
      <ElecCalcManualOverwriteControl
        manualCount={2}
        canMutate
        overwriteManualChoices={false}
        onOverwriteChange={onOverwriteChange}
      />,
    );
    expect(screen.getByText(/Найдено ручных выборов: 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    expect(onOverwriteChange).toHaveBeenCalledWith(true);
  });
});
