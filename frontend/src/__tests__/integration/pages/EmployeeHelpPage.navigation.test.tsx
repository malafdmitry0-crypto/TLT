import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import EmployeeHelpPage from '@/pages/help/EmployeeHelpPage';
import { useAuthStore } from '@/store/authStore';

function RouteLocationProbe() {
  const location = useLocation();
  return <output data-testid="route-location">{location.pathname}{location.search}</output>;
}

function renderHistory(initialEntries: string[]) {
  return render(
    <TestMemoryRouter initialEntries={initialEntries}>
      <RouteLocationProbe />
      <Routes>
        <Route path="/help/employee" element={<EmployeeHelpPage />} />
        <Route path="/projects" element={<h1>Проекты</h1>} />
        <Route path="/workspace/:section" element={<h1>Рабочая область</h1>} />
        <Route path="/login" element={<h1>Вход сотрудника</h1>} />
      </Routes>
    </TestMemoryRouter>,
  );
}

function setEmployee() {
  useAuthStore.getState().setEmployee(
    { id: 'e1', email: 'employee@example.com', full_name: null, role: 'employee', is_active: true },
    { access: 'access-token' },
  );
}

describe('EmployeeHelpPage navigation', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('returns an employee to the real previous projects route by keyboard', async () => {
    const user = userEvent.setup();
    setEmployee();
    renderHistory(['/projects', '/help/employee']);

    const backButton = screen.getByRole('button', { name: 'Назад' });
    backButton.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/projects'));
    expect(screen.getByRole('heading', { name: 'Проекты' })).toBeInTheDocument();
    expect(useAuthStore.getState().role).toBe('employee');
  });

  it.each([
    '/workspace/heat-calc?er=variant-1',
    '/workspace/elec-calc?er=variant-2',
  ])('preserves workspace origin %s', async (origin) => {
    const user = userEvent.setup();
    setEmployee();
    renderHistory([origin, '/help/employee']);

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent(origin));
    expect(screen.getByRole('heading', { name: 'Рабочая область' })).toBeInTheDocument();
  });

  it('uses projects as the direct-entry fallback for an employee', async () => {
    const user = userEvent.setup();
    setEmployee();
    renderHistory(['/help/employee']);

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/projects'));
    expect(useAuthStore.getState().role).toBe('employee');
  });

  it('uses login as the direct-entry fallback without an authenticated employee', async () => {
    const user = userEvent.setup();
    renderHistory(['/help/employee']);

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/login'));
  });
});
