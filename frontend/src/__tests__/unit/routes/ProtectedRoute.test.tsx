import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@/routes/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

function renderRoute(initialPath: string, allow: ('guest' | 'employee' | 'admin')[]) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute allow={allow}>
              <div>Secret</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('без role редиректит на /', () => {
    renderRoute('/secret', ['employee']);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('role не в allow → редирект на /', () => {
    useAuthStore.getState().setGuest('sid-1');
    renderRoute('/secret', ['employee']);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('role в allow → рендерит children', () => {
    useAuthStore.getState().setEmployee(
      { id: 'u', email: 'e', full_name: null, role: 'employee', is_active: true },
      { access: 'a', refresh: 'r' }
    );
    renderRoute('/secret', ['employee', 'admin']);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('admin тоже допускается если в allow', () => {
    useAuthStore.getState().setEmployee(
      { id: 'u', email: 'a', full_name: null, role: 'admin', is_active: true },
      { access: 'a', refresh: 'r' }
    );
    renderRoute('/secret', ['admin']);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});
