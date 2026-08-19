import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import GuestHelpPage from '@/pages/help/GuestHelpPage';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

const guestProject: Project = {
  id: 'guest-project-1',
  name: 'Гостевой проект',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'guest-session-1',
  status: 'draft',
  owner_email: null,
  object_types: ['pipe'],
  created_at: '2026-08-19T00:00:00Z',
  updated_at: '2026-08-19T00:00:00Z',
};

function RouteLocationProbe() {
  const location = useLocation();
  return <output data-testid="route-location">{location.pathname}{location.search}</output>;
}

function renderHistory(initialEntries: string[]) {
  return render(
    <TestMemoryRouter initialEntries={initialEntries}>
      <RouteLocationProbe />
      <Routes>
        <Route path="/help/guest" element={<GuestHelpPage />} />
        <Route path="/workspace/heat-calc" element={<h1>Расчёт теплопотерь</h1>} />
      </Routes>
    </TestMemoryRouter>,
  );
}

describe('GuestHelpPage navigation', () => {
  beforeEach(() => {
    useProjectStore.getState().setCurrentProject(null);
  });

  it('returns to the same guest heat workspace by keyboard without clearing the project', async () => {
    const user = userEvent.setup();
    useProjectStore.getState().setCurrentProject(guestProject);
    renderHistory(['/workspace/heat-calc', '/help/guest']);

    const backButton = screen.getByRole('button', { name: 'Назад' });
    backButton.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/workspace/heat-calc'));
    expect(screen.getByRole('heading', { name: 'Расчёт теплопотерь' })).toBeInTheDocument();
    expect(useProjectStore.getState().currentProject).toEqual(guestProject);
  });

  it('uses the heat workspace fallback for direct entry without clearing the project', async () => {
    const user = userEvent.setup();
    useProjectStore.getState().setCurrentProject(guestProject);
    renderHistory(['/help/guest']);

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    await waitFor(() => expect(screen.getByTestId('route-location')).toHaveTextContent('/workspace/heat-calc'));
    expect(screen.getByRole('heading', { name: 'Расчёт теплопотерь' })).toBeInTheDocument();
    expect(useProjectStore.getState().currentProject).toEqual(guestProject);
  });
});
