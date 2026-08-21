import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import {
  mockProject,
  renderPage,
  setupReportPageTest,
} from '@/__tests__/integration/pages/ReportPage.harness';

describe('ReportPage (integration) — access / chrome', () => {
  setupReportPageTest();

  it('показывает заглушку без выбранного проекта', () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('сотрудник видит кнопки экспорта PDF / Word / Excel', async () => {
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u-1',
        email: 'e@tlt.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'tok',
      refreshToken: 'tok',
    });
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div class="tlt-report"><h1>Отчёт</h1></div>',
      sections: ['Проект'],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Word/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
    });
  });

  it('FA-09: guest and employee see browser print button', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div class="tlt-report"><h1>Отчёт</h1></div>',
      sections: ['Проект'],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();
    const printBtn = await screen.findByRole('button', { name: /Печать/i });
    await waitFor(() => expect(printBtn).toBeEnabled());
    await user.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('гостю кнопки экспорта не показываются', async () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div></div>',
      sections: [],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Шаг 4. Отчёт по проекту/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excel/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Server export \(PDF\/Word\/Excel\) — только сотрудникам/i)
    ).toBeInTheDocument();
  });
});
