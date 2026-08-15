import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectElectricalSettings } from '@/pages/electrical/useProjectElectricalSettings';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/api/electricalSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/electricalSettings')>();
  return {
    ...actual,
    getProjectElectricalSettings: apiMocks.get,
    patchProjectElectricalSettings: apiMocks.patch,
  };
});

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useProjectElectricalSettings', () => {
  beforeEach(() => {
    apiMocks.get.mockReset();
    apiMocks.patch.mockReset();
    apiMocks.get.mockResolvedValue({
      project_id: 'p1',
      nominal_voltage_v: 230,
      max_section_start_current_a: null,
      version: 1,
      updated_by: null,
      created_at: '2026-08-04T00:00:00Z',
      updated_at: '2026-08-04T00:00:00Z',
    });
  });

  it('loads null I доп as automatic mode without blocking calculation', async () => {
    const { result } = renderHook(
      () => useProjectElectricalSettings('p1', true),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.savedIdop).toBeNull();
    expect(result.current.savedMode).toBe('auto');
    expect(result.current.draftMode).toBe('auto');
    expect(result.current.validationError).toBeNull();
    expect(result.current.calculationBlockedReason).toBeNull();
    expect(result.current.nominalVoltage).toBe(230);
  });

  it('saves draft I доп via PATCH', async () => {
    apiMocks.patch.mockResolvedValue({
      project_id: 'p1',
      nominal_voltage_v: 230,
      max_section_start_current_a: '13.0',
      version: 2,
      updated_by: 'guest',
      created_at: '2026-08-04T00:00:00Z',
      updated_at: '2026-08-04T00:01:00Z',
    });

    const { result } = renderHook(
      () => useProjectElectricalSettings('p1', true),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onModeChange('manual');
      result.current.onDraftChange(13);
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      result.current.save();
    });

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith('p1', {
        expected_version: 1,
        max_section_start_current_a: 13,
      });
    });
    expect(result.current.savedIdop).toBe(13);
    expect(result.current.savedMode).toBe('manual');
    expect(result.current.draftMode).toBe('manual');
  });

  it('opens an existing numeric value in manual mode and saves auto as null', async () => {
    apiMocks.get.mockResolvedValue({
      project_id: 'p1',
      nominal_voltage_v: 230,
      max_section_start_current_a: '13.0',
      version: 1,
      updated_by: null,
      created_at: '2026-08-04T00:00:00Z',
      updated_at: '2026-08-04T00:00:00Z',
    });
    apiMocks.patch.mockResolvedValue({
      project_id: 'p1',
      nominal_voltage_v: 230,
      max_section_start_current_a: null,
      version: 2,
      updated_by: 'guest',
      created_at: '2026-08-04T00:00:00Z',
      updated_at: '2026-08-04T00:01:00Z',
    });
    const { result } = renderHook(
      () => useProjectElectricalSettings('p1', true),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.savedMode).toBe('manual');
    expect(result.current.draftMode).toBe('manual');
    expect(result.current.savedIdop).toBe(13);

    act(() => result.current.onModeChange('auto'));
    expect(result.current.validationError).toBeNull();
    expect(result.current.canSave).toBe(true);
    await act(async () => result.current.save());

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith('p1', {
        expected_version: 1,
        max_section_start_current_a: null,
      });
    });
    await waitFor(() => expect(result.current.savedMode).toBe('auto'));
    expect(result.current.draftMode).toBe('auto');
    expect(result.current.savedIdop).toBeNull();
    expect(result.current.calculationBlockedReason).toBeNull();
  });

  it('requires a positive value only after manual mode is selected', async () => {
    const { result } = renderHook(
      () => useProjectElectricalSettings('p1', true),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.onModeChange('manual'));
    expect(result.current.validationError).toBe('Укажите I доп проекта');
    expect(result.current.canSave).toBe(false);
    expect(result.current.calculationBlockedReason).toBeNull();
    act(() => result.current.save());

    expect(apiMocks.patch).not.toHaveBeenCalled();
  });
});
