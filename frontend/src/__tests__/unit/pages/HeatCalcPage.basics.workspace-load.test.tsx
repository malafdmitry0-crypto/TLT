import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  mockProject,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage basics — workspace load', () => {
  setupHeatCalcPageTest();

  describe('Workspace query load state', () => {
    it('shows QueryError with Retry instead of empty table when required summary fails', async () => {
      const { getObjectsSummary, listObjects, queryObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (queryObjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('query failed'));
      (getObjectsSummary as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('summary 500'), { response: { status: 500 } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const errorRegion = await screen.findByTestId('heatcalc-workspace-query-error', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT });
      expect(errorRegion).toBeInTheDocument();
      expect(screen.getByText(/Не удалось загрузить объекты проекта/i)).toBeInTheDocument();
      const retry = screen.getByRole('button', { name: /Повторить/i });
      expect(retry).toBeEnabled();

      (getObjectsSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
        total: 0,
        valid: 0,
        invalid: 0,
        by_type: { pipe: 0, tank: 0 },
        valid_by_type: { pipe: 0, tank: 0 },
        electrical_calculations_total: 0,
        successful_electrical_calculations: 0,
        failed_electrical_calculations: 0,
        objects_with_successful_electrical_calculation: 0,
      });
      await user.click(retry);
      await waitFor(() => {
        expect(screen.queryByTestId('heatcalc-workspace-query-error')).not.toBeInTheDocument();
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});
