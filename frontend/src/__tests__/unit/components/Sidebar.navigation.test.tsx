import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useLegacyElectricalVariantContext = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useLegacyElectricalVariantContext', () => ({
  useLegacyElectricalVariantContext,
}));

import Sidebar from '@/components/layout/Sidebar';
import { useProjectStore } from '@/store/projectStore';

const ER_ID = '3ff35ec0-4500-4df2-bf63-3bae84819099';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Текущий маршрут">{`${location.pathname}${location.search}`}</output>;
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/workspace/heat-calc?er=${ER_ID}`]}>
        <Sidebar />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().setCurrentProject(null);
    useLegacyElectricalVariantContext.mockReturnValue({
      selectedVariant: { id: ER_ID },
      isLoading: false,
      isError: false,
    });
  });

  it('opens electrical calculation with the selected ER in one route transition', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('menuitem', { name: /Электротехнический расчёт/i }));

    expect(screen.getByLabelText('Текущий маршрут')).toHaveTextContent(
      `/workspace/elec-calc?er=${ER_ID}`,
    );
  });
});
