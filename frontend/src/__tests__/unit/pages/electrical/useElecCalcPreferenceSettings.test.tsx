import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appMessage as message } from '@/feedback/appFeedback';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserPreference, updateUserPreference } from '@/api/preferences';
import {
  useElecCalcPreferenceSettings,
} from '@/pages/electrical/useElecCalcPreferenceSettings';
import { useAuthStore } from '@/store/authStore';
import type { CurrentUser } from '@/types/auth';
import {
  ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY,
  getDefaultElectricalCandidateTableColumnSettings,
  setElectricalCandidateTableColumnWidthPct,
} from '@/utils/electricalCandidateTableColumns';
import {
  ELECTRICAL_TABLE_COLUMN_PREF_KEY,
  getDefaultElectricalTableColumnSettings,
  setElectricalTableColumnWidthPct,
  writeGuestElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_TABLE_VIEW_PREF_KEY,
  getDefaultElectricalTableViewSettings,
  writeGuestElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: {

    success: vi.fn(),
    error: vi.fn(),
  
  },
}));

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn(),
  updateUserPreference: vi.fn(),
}));

function employeeUser(): CurrentUser {
  return {
    id: 'user-1',
    email: 'engineer@example.test',
    full_name: 'Engineer',
    role: 'employee',
    is_active: true,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function setup(options: { registered?: boolean } = {}) {
  const setColumnSettingsOpen = vi.fn();
  const setCandidateColumnSettingsOpen = vi.fn();
  const registered = options.registered ?? false;
  return {
    setColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    ...renderHook(
      () => useElecCalcPreferenceSettings({
        isRegisteredUser: registered,
        registeredUserId: registered ? 'user-1' : null,
        setColumnSettingsOpen,
        setCandidateColumnSettingsOpen,
      }),
      { wrapper: createWrapper() },
    ),
  };
}

describe('useElecCalcPreferenceSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'guest-1',
      accessToken: null,
      refreshToken: null,
    });
    vi.mocked(getUserPreference).mockResolvedValue({
      key: 'preference',
      value: null,
      user_id: 'user-1',
    });
    vi.mocked(updateUserPreference).mockImplementation(async (key: string, value: unknown) => ({
      key,
      value,
      user_id: 'user-1',
    }));
  });

  it('initializes guest settings from guest storage without preference queries', () => {
    const guestColumns = setElectricalTableColumnWidthPct(
      getDefaultElectricalTableColumnSettings(),
      'total_power',
      17,
    );
    writeGuestElectricalTableColumnSettings(guestColumns);
    writeGuestElectricalTableViewSettings({
      ...getDefaultElectricalTableViewSettings(),
      fontSize: 'large',
    });

    const { result } = setup();

    expect(result.current.tableColumnSettings.columns.total_power.widthPct).toBe(17);
    expect(result.current.tableViewSettings.fontSize).toBe('large');
    expect(getUserPreference).not.toHaveBeenCalled();
  });

  it('loads registered table, candidate and view preferences', async () => {
    useAuthStore.setState({
      role: 'employee',
      user: employeeUser(),
      sessionId: null,
      accessToken: 'access',
      refreshToken: null,
    });
    const registeredColumns = setElectricalTableColumnWidthPct(
      getDefaultElectricalTableColumnSettings(),
      'total_power',
      19,
    );
    const registeredCandidateColumns = setElectricalCandidateTableColumnWidthPct(
      getDefaultElectricalCandidateTableColumnSettings(),
      'current',
      12,
    );
    vi.mocked(getUserPreference).mockImplementation(async (key: string) => {
      if (key === ELECTRICAL_TABLE_COLUMN_PREF_KEY) {
        return { key, value: registeredColumns, user_id: 'user-1' };
      }
      if (key === ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY) {
        return { key, value: registeredCandidateColumns, user_id: 'user-1' };
      }
      return {
        key,
        value: {
          ...getDefaultElectricalTableViewSettings(),
          tableLabelFormat: 'compact',
        },
        user_id: 'user-1',
      };
    });

    const { result } = setup({ registered: true });

    await waitFor(() => {
      expect(result.current.tableColumnSettings.columns.total_power.widthPct).toBe(19);
    });
    expect(result.current.candidateTableColumnSettings.columns.current.widthPct).toBe(12);
    expect(result.current.tableViewSettings.tableLabelFormat).toBe('compact');
    expect(getUserPreference).toHaveBeenCalledWith(ELECTRICAL_TABLE_COLUMN_PREF_KEY);
    expect(getUserPreference).toHaveBeenCalledWith(ELECTRICAL_CANDIDATE_TABLE_COLUMN_PREF_KEY);
    expect(getUserPreference).toHaveBeenCalledWith(ELECTRICAL_TABLE_VIEW_PREF_KEY);
  });

  it('persists combined table settings through the preference mutation', async () => {
    const { result, setColumnSettingsOpen } = setup();
    const nextColumns = setElectricalTableColumnWidthPct(
      result.current.tableColumnSettings,
      'total_power',
      21,
    );
    const nextView = {
      ...result.current.tableViewSettings,
      settingsLabelFormat: 'compact' as const,
    };

    await act(async () => {
      await result.current.updateTableSettingsPreference.mutateAsync({
        columnSettings: nextColumns,
        viewSettings: nextView,
      });
    });

    expect(updateUserPreference).toHaveBeenCalledWith(
      ELECTRICAL_TABLE_COLUMN_PREF_KEY,
      expect.objectContaining({
        columns: expect.objectContaining({
          total_power: { widthPct: 21 },
        }),
      }),
    );
    expect(updateUserPreference).toHaveBeenCalledWith(
      ELECTRICAL_TABLE_VIEW_PREF_KEY,
      expect.objectContaining({
        settingsLabelFormat: 'compact',
      }),
    );
    expect(result.current.tableColumnSettings.columns.total_power.widthPct).toBe(21);
    expect(result.current.tableViewSettings.settingsLabelFormat).toBe('compact');
    expect(setColumnSettingsOpen).toHaveBeenCalledWith(false);
    expect(message.success).toHaveBeenCalledWith('Настройки таблицы сохранены');
  });
});
