import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import {
  fifthVariant,
  firstVariant,
  mockProject,
  renderPage,
  setupReportPageTest,
  thirdVariant,
} from '@/__tests__/integration/pages/ReportPage.harness';

describe('ReportPage (integration) — ER preview / deep-link', () => {
  setupReportPageTest();

  it('использует выбранный именованный ЭР для предпросмотра отчёта', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div></div>',
      sections: [],
      variant_number: 3,
    });
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(
      'p-1',
      thirdVariant.id,
    );

    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        'p-1',
        3,
        thirdVariant.id,
        expect.any(Array),
      );
    });
    expect(screen.getByText('Резервный ЭР')).toBeInTheDocument();
  });

  it('uses the canonical deep-link UUID on direct report entry', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 3,
    });
    useAuthStore.setState({
      role: 'guest', user: null, sessionId: 'sid', accessToken: null, refreshToken: null,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);

    renderPage(`/workspace/report?er=${thirdVariant.id}`);

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        'p-1',
        3,
        thirdVariant.id,
        expect.any(Array),
      );
    });
    expect(screen.getByText('Резервный ЭР')).toBeInTheDocument();
  });

  it('запрашивает отчёт ЭР5 по UUID без legacy-слота и не подставляет данные ЭР1', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      html: '<div>ЭР5 UUID preview</div>',
      sections: [],
      variant_number: null,
      electrical_variant_id: fifthVariant.id,
      electrical_variant_name: fifthVariant.name,
    });
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    useCalculationVariantStore.getState().setSelectedVariantId(
      mockProject.id,
      fifthVariant.id,
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalled();
      const call = (getReportPreview as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[0]).toBe(mockProject.id);
      // UUID-only ER: legacy slot is null; id may be string or single-element list.
      expect(call?.[1]).toBeNull();
      const erArg = call?.[2];
      const erIds = Array.isArray(erArg) ? erArg : [erArg];
      expect(erIds).toContain(fifthVariant.id);
      expect(erIds).not.toContain(firstVariant.id);
    });
  });
});
