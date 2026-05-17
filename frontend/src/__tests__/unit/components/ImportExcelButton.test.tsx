import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ImportExcelButton from '@/components/ImportExcelButton';

vi.mock('@/api/calculations', () => ({
  getCalcTask: vi.fn(),
}));

vi.mock('@/api/projects', () => ({
  downloadImportTemplate: vi.fn(),
  importObjectsExcel: vi.fn().mockResolvedValue({
    created: 0,
    skipped_duplicates: 1,
    skipped_limit: 0,
    mode: 'merge',
    errors: [],
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ImportExcelButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows import mode warning for non-empty project and sends merge mode', async () => {
    const { importObjectsExcel } = await import('@/api/projects');
    const { container } = render(
      <ImportExcelButton projectId="p1" existingObjectCount={50} />,
      { wrapper }
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['Тип;Наименование\n'], 'objects.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText(/В проекте уже есть 50 объектов/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Объединить' }));

    await waitFor(() => {
      expect(importObjectsExcel).toHaveBeenCalledWith('p1', file, 'merge');
    });
  });

  it('shows rows skipped by project limit in import result', async () => {
    const { importObjectsExcel } = await import('@/api/projects');
    (importObjectsExcel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      created: 1,
      skipped_duplicates: 0,
      skipped_limit: 149,
      mode: 'merge',
      errors: [{ sheet: 'Трубопроводы', row: 52, message: 'Достигнут лимит' }],
    });
    const { container } = render(
      <ImportExcelButton projectId="p1" existingObjectCount={0} />,
      { wrapper }
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['Тип;Наименование\n'], 'objects.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText('Пропущено из-за лимита проекта:')
    ).toBeInTheDocument();
    expect(screen.getByText('149')).toBeInTheDocument();
  });
});
