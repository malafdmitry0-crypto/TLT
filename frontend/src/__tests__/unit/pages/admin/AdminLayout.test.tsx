import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import AdminLayout from '@/pages/admin/AdminLayout';
import { useAuthStore } from '@/store/authStore';

describe('AdminLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      role: 'admin',
      user: { id: 'a', email: 'a@x', full_name: null, role: 'admin', is_active: true },
      sessionId: null,
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('рендерит шапку Администрирование, меню и кнопку Выход', async () => {
    render(
      <TestMemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="users" element={<div>USERS-CONTENT</div>} />
          </Route>
        </Routes>
      </TestMemoryRouter>
    );
    expect(await screen.findByText(/Администрирование/i)).toBeInTheDocument();
    expect(await screen.findByText('USERS-CONTENT')).toBeInTheDocument();
    expect(await screen.findByText('Каталоги спецификации')).toBeInTheDocument();
    expect(await screen.findByText('Выход')).toBeInTheDocument();
  });
});
