/** Shared fixtures for ObjectWizardDependencies scenario tests (no tests). */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import ObjectWizard from '@/components/wizard/ObjectWizard';
import {
  basePipeParams,
  climateRows,
  insulationRows,
  pipeMaterialRows,
  soilRows,
} from '@/components/wizard/__fixtures__/wizardReferenceFixtures';
import { vi } from 'vitest';

// Данные переехали в общий модуль фикстур — им пользуются и Storybook-истории.
export { basePipeParams, climateRows, insulationRows, pipeMaterialRows, soilRows };

export async function mockReferences() {
  const refs = await import('@/api/references');
  vi.mocked(refs.getClimate).mockResolvedValue(climateRows);
  vi.mocked(refs.getInsulation).mockResolvedValue(insulationRows);
  vi.mocked(refs.getPipeMaterials).mockResolvedValue(pipeMaterialRows);
  vi.mocked(refs.getSoilConductivity).mockResolvedValue(soilRows);
}

export function renderWizard(
  props: Partial<ComponentProps<typeof ObjectWizard>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ObjectWizard
        objectType="pipe"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

export function spinValue(testId: string) {
  return screen.getByTestId(testId);
}
