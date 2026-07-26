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

describe('ReportPage (integration) — export', () => {
  setupReportPageTest();

  it('сотрудник: клик по PDF триггерит exportReport', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview, exportReport } = await import('@/api/reports');
    const { listElectricalVariants } = await import('@/api/electricalVariants');
    let resolveExport!: (value: Blob) => void;
    const pendingExport = new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    });
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 1,
    });
    // Deferred mock: under concurrent dual-safe, wait on call/event — not a 15s wall cap.
    (exportReport as ReturnType<typeof vi.fn>).mockReturnValue(pendingExport);
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null, accessToken: 'a', refreshToken: 'r',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    // Prefer selected ER before mount so export has a concrete UUID immediately.
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);
    renderPage();
    // Wait for ER list + enabled PDF (asyncUtilTimeout / suite budget — no nested 15s).
    await waitFor(() => {
      expect(listElectricalVariants).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeEnabled();
    });
    // Re-query after enabled: under concurrent DoD load a stale node can swallow click.
    const pdfButton = await screen.findByRole('button', { name: /PDF/i });
    await user.click(pdfButton);
    // vi.waitFor uses suite testTimeout (60s), not a stricter local wall-clock.
    await vi.waitFor(() => {
      expect(exportReport).toHaveBeenCalledWith(
        'p-1',
        'pdf',
        firstVariant.id,
        expect.any(Array),
      );
    });
    resolveExport(new Blob(['fake'], { type: 'application/pdf' }));
    await pendingExport;
  });

  it('фиксирует UUID и имя ЭР на время экспорта и блокирует смену scope', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview, exportReport } = await import('@/api/reports');
    let resolveExport!: (value: Blob) => void;
    const pendingExport = new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    });
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      html: '<div></div>',
      sections: [],
      variant_number: 3,
    });
    (exportReport as ReturnType<typeof vi.fn>).mockReturnValue(pendingExport);
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureName(
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null,
      accessToken: 'a',
      refreshToken: 'r',
    });
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, thirdVariant.id);
    useProjectStore.getState().setCurrentProject(mockProject);
    const { listElectricalVariants } = await import('@/api/electricalVariants');
    renderPage();

    await waitFor(() => {
      expect(listElectricalVariants).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeEnabled();
    });
    // Re-query after enabled: under concurrent DoD load a stale node can swallow click.
    await user.click(await screen.findByRole('button', { name: /PDF/i }));
    await vi.waitFor(() => {
      expect(exportReport).toHaveBeenCalledWith(
        mockProject.id,
        'pdf',
        thirdVariant.id,
        expect.any(Array),
      );
    });
    // Multi-select ER control (Checkbox.Group) is disabled while export is in flight.
    const erCheckboxes = () => Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '.report-page-er-checkbox-group input[type="checkbox"], .report-page-er-options input[type="checkbox"]',
      ),
    );
    await vi.waitFor(() => {
      const boxes = erCheckboxes();
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every((box) => box.disabled)).toBe(true);
    });

    resolveExport(new Blob(['report'], { type: 'application/pdf' }));
    await pendingExport;
    await vi.waitFor(() => {
      const boxes = erCheckboxes();
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every((box) => box.disabled)).toBe(false);
    });
    expect(downloadedName).toBe(`${mockProject.name}-${thirdVariant.name}.pdf`);
  });
});
