import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

  it('рендерит шапку Администрирование, меню и кнопку Выход', () => {
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="users" element={<div>USERS-CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Администрирование/i)).toBeInTheDocument();
    expect(screen.getByText('USERS-CONTENT')).toBeInTheDocument();
    expect(screen.getByText('Выход')).toBeInTheDocument();
  });
});
