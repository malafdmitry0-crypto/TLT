import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
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
});
