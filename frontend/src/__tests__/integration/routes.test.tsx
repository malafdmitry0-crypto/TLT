/**
 * Smoke-тесты на route-дерево: проверяем что ключевые URL рендерят правильную страницу
 * и role-based protection работает.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from '@/routes';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

// Мокаем все API чтобы страницы не падали на загрузке
vi.mock('@/api/projects', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  listObjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
  exportProjectCsv: vi.fn(),
  importProjectCsv: vi.fn(),
  exportProjectsCsvBulk: vi.fn(),
  importProjectsCsvBulk: vi.fn(),
}));
vi.mock('@/api/calculations', () => ({
  listElectricalCalcs: vi.fn().mockResolvedValue([]),
  batchCalcElectrical: vi.fn(),
  selectCableManual: vi.fn(),
  listCableOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/api/specifications', () => ({
  getSpecification: vi.fn().mockResolvedValue(null),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
}));
vi.mock('@/api/admin', () => ({
  listUsers: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  listCoefficients: vi.fn().mockResolvedValue([]),
  updateCoefficient: vi.fn(),
}));
vi.mock('@/api/references', () => ({
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  listInsulationMaterials: vi.fn().mockResolvedValue([]),
  listClimateCities: vi.fn().mockResolvedValue([]),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
  listCablesExtended: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/api/reports', () => ({
  getReportPreview: vi.fn().mockResolvedValue({ html: '<p>preview</p>', sections: [] }),
  exportReport: vi.fn(),
}));

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('/ показывает HomePage', () => {
    renderAt('/');
    expect(screen.getAllByText(/без регистрации/i)[0]).toBeInTheDocument();
  });

  it('/login показывает форму авторизации', () => {
    renderAt('/login');
    expect(screen.getAllByText(/Войти/i)[0]).toBeInTheDocument();
  });

  it('/help/guest рендерит GuestHelpPage', () => {
    renderAt('/help/guest');
    // Help-страницы — статичный текст
    expect(document.body.textContent?.length).toBeGreaterThan(100);
  });

  it('/help/employee рендерит EmployeeHelpPage', () => {
    renderAt('/help/employee');
    expect(document.body.textContent?.length).toBeGreaterThan(100);
  });

  it('/help/admin рендерит AdminHelpPage', () => {
    renderAt('/help/admin');
    expect(document.body.textContent?.length).toBeGreaterThan(100);
  });

  it('/admin без role редиректит на /', () => {
    renderAt('/admin/users');
    // ProtectedRoute → Navigate("/") → HomePage
    expect(screen.getAllByText(/без регистрации/i)[0]).toBeInTheDocument();
  });

  it('/projects для guest редиректит на /', () => {
    useAuthStore.getState().setGuest('sid-1');
    renderAt('/projects');
    expect(screen.getAllByText(/без регистрации/i)[0]).toBeInTheDocument();
  });

  it('/workspace для admin редиректит на / (admin не работает с проектами)', () => {
    useAuthStore.getState().setEmployee(
      { id: 'a', email: 'a@x', full_name: null, role: 'admin', is_active: true },
      { access: 'a', refresh: 'r' }
    );
    renderAt('/workspace');
    expect(screen.getAllByText(/без регистрации/i)[0]).toBeInTheDocument();
  });
});
