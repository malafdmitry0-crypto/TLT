import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useElecCalcColumnPersistence } from '@/pages/electrical/useElecCalcColumnPersistence';
import {
  getDefaultElectricalCandidateTableColumnSettings,
  readRegisteredElectricalCandidateTableColumnCache,
  writeRegisteredElectricalCandidateTableColumnCache,
} from '@/utils/electricalCandidateTableColumns';
import {
  getDefaultElectricalTableColumnSettings,
  readGuestElectricalTableColumnSettings,
  readRegisteredElectricalTableColumnCache,
  setElectricalTableColumnWidthPct,
  writeRegisteredElectricalTableColumnCache,
} from '@/utils/electricalTableColumns';
import {
  getDefaultElectricalTableViewSettings,
  readRegisteredElectricalTableViewCache,
  writeRegisteredElectricalTableViewCache,
} from '@/utils/electricalTableViewSettings';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeSpies() {
  return {
    setColumnSettingsOpen: vi.fn(),
    setCandidateColumnSettingsOpen: vi.fn(),
    updateTableColumnPreference: vi.fn(),
    updateCandidateTableColumnPreference: vi.fn(),
    updateTableSettingsPreference: vi.fn(),
  };
}

function useHarness(
  options: { isRegisteredUser?: boolean; registeredUserId?: string | null } = {},
  spies: ReturnType<typeof makeSpies>,
) {
  const [tableColumnSettings, setTableColumnSettings] =
    useState(() => getDefaultElectricalTableColumnSettings());
  const [candidateTableColumnSettings, setCandidateTableColumnSettings] =
    useState(() => getDefaultElectricalCandidateTableColumnSettings());
  const [tableViewSettings, setTableViewSettings] =
    useState(() => getDefaultElectricalTableViewSettings());

  return {
    tableColumnSettings,
    candidateTableColumnSettings,
    tableViewSettings,
    ...useElecCalcColumnPersistence({
      tableColumnSettings,
      candidateTableColumnSettings,
      isRegisteredUser: options.isRegisteredUser ?? false,
      registeredUserId: options.registeredUserId ?? null,
      setTableColumnSettings,
      setCandidateTableColumnSettings,
      setTableViewSettings,
      setColumnSettingsOpen: spies.setColumnSettingsOpen,
      setCandidateColumnSettingsOpen: spies.setCandidateColumnSettingsOpen,
      updateTableColumnPreference: spies.updateTableColumnPreference,
      updateCandidateTableColumnPreference: spies.updateCandidateTableColumnPreference,
      updateTableSettingsPreference: spies.updateTableSettingsPreference,
    }),
  };
}

function setup(options: { isRegisteredUser?: boolean; registeredUserId?: string | null } = {}) {
  const spies = makeSpies();
  return {
    ...spies,
    ...renderHook(() => useHarness(options, spies)),
  };
}

describe('useElecCalcColumnPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('persists guest main table columns to localStorage and closes settings', () => {
    const { result, setColumnSettingsOpen, updateTableColumnPreference } = setup();
    const nextSettings = setElectricalTableColumnWidthPct(
      result.current.tableColumnSettings,
      'total_power',
      14.5,
    );

    act(() => {
      result.current.persistTableColumnSettings(nextSettings, { closeModal: true });
    });

    expect(result.current.tableColumnSettings.columns.total_power.widthPct).toBe(14.5);
    expect(readGuestElectricalTableColumnSettings().columns.total_power.widthPct).toBe(14.5);
    expect(setColumnSettingsOpen).toHaveBeenCalledWith(false);
    expect(message.success).toHaveBeenCalledWith('Настройки таблицы сохранены');
    expect(updateTableColumnPreference).not.toHaveBeenCalled();
  });

  it('delegates registered main table column persistence to API mutation and clears cache', () => {
    writeRegisteredElectricalTableColumnCache('user-1', getDefaultElectricalTableColumnSettings());
    const { result, updateTableColumnPreference } = setup({
      isRegisteredUser: true,
      registeredUserId: 'user-1',
    });

    act(() => {
      result.current.applyColumnWidth('total_power', 18);
    });

    expect(updateTableColumnPreference).toHaveBeenCalledTimes(1);
    expect(updateTableColumnPreference.mock.calls[0][0]).toMatchObject({
      showMessage: false,
    });
    expect(updateTableColumnPreference.mock.calls[0][0].settings.columns.total_power.widthPct)
      .toBe(18);
    expect(readRegisteredElectricalTableColumnCache('user-1')).toBeNull();
  });

  it('persists combined registered table settings through the combined mutation', () => {
    writeRegisteredElectricalTableColumnCache('user-1', getDefaultElectricalTableColumnSettings());
    writeRegisteredElectricalCandidateTableColumnCache(
      'user-1',
      getDefaultElectricalCandidateTableColumnSettings(),
    );
    writeRegisteredElectricalTableViewCache('user-1', getDefaultElectricalTableViewSettings());
    const { result, updateTableSettingsPreference } = setup({
      isRegisteredUser: true,
      registeredUserId: 'user-1',
    });
    const nextColumns = setElectricalTableColumnWidthPct(
      result.current.tableColumnSettings,
      'total_power',
      16,
    );
    const nextView = {
      ...result.current.tableViewSettings,
      tableLabelFormat: 'compact' as const,
    };

    act(() => {
      result.current.persistTableSettings(nextColumns, nextView);
    });

    expect(updateTableSettingsPreference).toHaveBeenCalledWith({
      columnSettings: expect.objectContaining({
        columns: expect.objectContaining({
          total_power: { widthPct: 16 },
        }),
      }),
      viewSettings: expect.objectContaining({
        tableLabelFormat: 'compact',
      }),
    });
    expect(readRegisteredElectricalTableColumnCache('user-1')).toBeNull();
    expect(readRegisteredElectricalTableViewCache('user-1')).toBeNull();
    expect(readRegisteredElectricalCandidateTableColumnCache('user-1')).not.toBeNull();
  });

  it('updates draft width during pointer resize and commits final width', () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    const { result } = setup();

    act(() => {
      result.current.startColumnResize({
        key: 'total_power',
        width: 100,
        widthPct: 10,
      }, {
        clientX: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as ReactPointerEvent<HTMLButtonElement>);
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 150 }));
    });

    expect(result.current.tableColumnSettings.columns.total_power.widthPct).toBe(15);
    expect(readGuestElectricalTableColumnSettings().columns.total_power.widthPct).toBe(15);

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });
});
