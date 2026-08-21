import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

import {
  mockReferences,
  renderWizard,
} from './ObjectWizardDependencies.test-harness';

describe('ObjectWizard dependencies — lazy-references', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('лениво загружает климатический справочник только при открытии выбора климата', async () => {
    const refs = await import('@/api/references');
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => {
      expect(refs.getInsulation).toHaveBeenCalledTimes(1);
    });
    expect(refs.getClimate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('climate-select'));

    await waitFor(() => {
      expect(refs.getClimate).toHaveBeenCalledTimes(1);
    });
  });

  it('лениво загружает справочник грунтов только при открытии выбора грунта', async () => {
    const refs = await import('@/api/references');
    const user = userEvent.setup();
    renderWizard({
      initialFormValues: {
        placement: 'underground'}});

    expect(await screen.findByTestId('ground-type-select')).toBeVisible();
    expect(refs.getSoilConductivity).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('ground-type-select'));

    await waitFor(() => {
      expect(refs.getSoilConductivity).toHaveBeenCalledTimes(1);
    });
  });
});
