import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import {
  firstVariant,
  mockProject,
  renderPage,
  setupReportPageTest,
  thirdVariant,
} from '@/__tests__/integration/pages/ReportPage.harness';

describe('ReportPage (integration) — composition / wizard', () => {
  setupReportPageTest();

  it('сотрудник: открывает модалку «Состав отчёта»', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview } = await import('@/api/reports');
    const { listElectricalVariants } = await import('@/api/electricalVariants');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 1,
    });
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null, accessToken: 'a', refreshToken: 'r',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);
    renderPage();
    const reportCompositionButton = await screen.findByRole('button', {
      name: /Состав отчёта/i,
    });
    await waitFor(() => {
      expect(listElectricalVariants).toHaveBeenCalled();
      expect(reportCompositionButton).toBeEnabled();
    });
    // Re-query after enabled: the variants update can replace the Ant button node.
    await user.click(await screen.findByRole('button', { name: /Состав отчёта/i }));
    // Modal mounts async; concurrent suite load can delay portal paint
    expect(
      await screen.findByRole('dialog', {}, { timeout: 8_000 }),
    ).toBeInTheDocument();
  });

  it('passes the exact selected ER UUID to the standalone report wizard URL', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 3,
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null, accessToken: 'a', refreshToken: 'r',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(
      mockProject.id,
      thirdVariant.id,
    );
    const { listElectricalVariants } = await import('@/api/electricalVariants');
    renderPage();

    await waitFor(() => {
      expect(listElectricalVariants).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Мастер в новом окне/i })).toBeEnabled();
    });
    // Re-query after enabled: the variants update can replace the Ant button node.
    await user.click(await screen.findByRole('button', { name: /Мастер в новом окне/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        `/report-wizard?er=${thirdVariant.id}`,
        'tlt-report-wizard',
        'width=1280,height=860,toolbar=no,menubar=no,location=no,status=no',
      );
    });
  });
});
