import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SpecificationCatalogsPage from '@/pages/admin/SpecificationCatalogsPage';

const feedback = vi.hoisted(() => ({
  confirm: vi.fn((options: { onOk?: () => unknown }) => options.onOk?.()),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: { error: feedback.error, success: feedback.success },
  appModal: { confirm: feedback.confirm },
}));

vi.mock('@/api/admin', () => ({
  activateSpecificationCatalog: vi.fn(),
  getSpecificationCatalog: vi.fn(),
  importSpecificationCatalog: vi.fn(),
  listSpecificationCatalogs: vi.fn(),
}));

const completeCatalog = {
  id: 'catalog-1',
  catalog_key: 'builtin-specification',
  version: '2026.08',
  status: 'draft' as const,
  authority: 'approved' as const,
  source: 'Реестр владельца',
  source_checksum: `sha256:${'a'.repeat(64)}`,
  payload_checksum: `sha256:${'b'.repeat(64)}`,
  schema_version: 1,
  item_count: 1,
  is_complete: true,
  validation_issues: [],
  items: [{
    id: 'item-1',
    item_key: 'cable-1',
    category: 'cable' as const,
    name: 'Кабель',
    mark: '30ТТВ2',
    nomenclature_code: '001-002-002',
    supply_unit: 'м',
    source_ref: 'registry:very-long-source-reference',
    position: 1,
    applicability: {},
    package_parameters: {},
    formula_parameters: {},
  }],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SpecificationCatalogsPage />
    </QueryClientProvider>,
  );
}

describe('SpecificationCatalogsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await import('@/api/admin');
    vi.mocked(api.listSpecificationCatalogs).mockResolvedValue([completeCatalog]);
    vi.mocked(api.getSpecificationCatalog).mockResolvedValue(completeCatalog);
    vi.mocked(api.activateSpecificationCatalog).mockResolvedValue({
      catalog: { ...completeCatalog, status: 'active' },
      stale_specification_count: 3,
    });
  });

  it('показывает версии и активирует только approved complete после подтверждения', async () => {
    const api = await import('@/api/admin');
    renderPage();

    expect(await screen.findByText('2026.08')).toBeInTheDocument();
    expect(await screen.findByText('001-002-002')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Активировать версию' }));

    expect(feedback.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Активировать каталог 2026.08?',
    }));
    await waitFor(() => expect(api.activateSpecificationCatalog).toHaveBeenCalled());
    expect(vi.mocked(api.activateSpecificationCatalog).mock.calls[0][0]).toBe('catalog-1');
    expect(feedback.success).toHaveBeenCalledWith(
      'Каталог активирован. Устаревших спецификаций: 3',
    );
  });

  it('показывает typed issues и блокирует активацию неполного draft', async () => {
    const api = await import('@/api/admin');
    const incomplete = {
      ...completeCatalog,
      is_complete: false,
      validation_issues: [{
        code: 'SPEC_ACCESSORY_CATALOG_ITEM_MISSING',
        reason: 'sealant_catalog_missing',
        category: 'sealant' as const,
        details: { missing_groups: ['low-with-a-very-long-identifier'] },
      }],
    };
    vi.mocked(api.listSpecificationCatalogs).mockResolvedValue([incomplete]);
    vi.mocked(api.getSpecificationCatalog).mockResolvedValue(incomplete);

    renderPage();

    expect(await screen.findByText('SPEC_ACCESSORY_CATALOG_ITEM_MISSING')).toBeInTheDocument();
    expect(screen.getByText('sealant_catalog_missing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Активировать версию' })).toBeDisabled();
    expect(screen.getByText(/каталог неполный/i)).toBeInTheDocument();
  });

  it('импортирует JSON как новый draft и показывает серверный результат', async () => {
    const api = await import('@/api/admin');
    vi.mocked(api.importSpecificationCatalog).mockResolvedValue(completeCatalog);
    renderPage();
    await screen.findByText('2026.08');

    fireEvent.change(
      screen.getByRole('textbox', { name: 'JSON документа каталога' }),
      {
        target: {
          value: JSON.stringify({
            catalog_key: 'builtin-specification',
            version: '2026.08',
            authority: 'approved',
            source: 'Реестр владельца',
            source_checksum: `sha256:${'a'.repeat(64)}`,
            schema_version: 1,
            items: [completeCatalog.items[0]],
          }),
        },
      },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Импортировать draft' }));

    await waitFor(() => expect(api.importSpecificationCatalog).toHaveBeenCalledOnce());
    expect(feedback.success).toHaveBeenCalledWith('Draft 2026.08 импортирован');
  });
});
