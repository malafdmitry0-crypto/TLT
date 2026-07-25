/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import {
  HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  getDefaultTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
  HEATCALC_TABLE_VIEW_PREF_KEY,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
  HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
} from '@/utils/heatCalcFieldInputSettings';
import { HEATCALC_EXCEL_ENGINE_STORAGE_KEY } from '@/utils/heatCalcExcelEngine';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  mockProject,
  openTableSettingsDialog,
  openTableSettingsOtherTab,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage inline-edit — registered user settings API', () => {
  setupHeatCalcPageTest();
  describe('Inline-редактирование', () => {
    it('для зарегистрированного пользователя без записи очищает кеш и возвращает дефолтный JSON', async () => {
      const { listObjects } = await import('@/api/projects');
      const { getUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (getUserPreference as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        key: HEATCALC_TABLE_COLUMN_PREF_KEY,
        value: null,
        user_id: 'user-test-1',
      });
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: getDefaultTableColumnSettings(),
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 2,
            fontSize: 'large',
            tableLabelFormat: 'short',
            settingsLabelFormat: 'full',
            formPlacement: 'top',
            sideFormWidthPct: 34,
            formSectionWeights: [1.655, 1.35, 1.2],
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 1,
            preset: 'detailed',
            visibleMetrics: ['delta_t', 'thermal_resistance'],
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 1,
            fields: {
              pipe: {
                outer_diameter_mm: { step: 10 },
              },
            },
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await waitFor(() => {
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_COLUMN_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_VIEW_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_CALCULATION_DETAILS_PREF_KEY);
        expect(getUserPreference).not.toHaveBeenCalledWith('heatcalc.fieldInputs.v1');
      });
      await waitFor(() => {
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY)).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
        expect(screen.getByTestId('outer-diameter-input')).toHaveAttribute('step', '1');
      });
    });

    it('для зарегистрированного пользователя сохраняет настройки через API и кеширует только ответ БД', async () => {
      const { listObjects } = await import('@/api/projects');
      const { updateUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (updateUserPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key, value) => ({
        key,
        value,
        user_id: 'user-test-1',
      }));
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      expect(within(dialog).queryByText('Шаг')).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('spinbutton', { name: /^Шаг:/ })).not.toBeInTheDocument();
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getAllByText('Полные')[0]);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_COLUMN_PREF_KEY,
          expect.any(Object),
        );
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_VIEW_PREF_KEY,
          expect.any(Object),
        );
        expect(updateUserPreference).not.toHaveBeenCalledWith('heatcalc.fieldInputs.v1', expect.any(Object));
      });
      const preferencePayload = (updateUserPreference as ReturnType<typeof vi.fn>).mock.calls.find(
        ([key]) => key === HEATCALC_TABLE_COLUMN_PREF_KEY,
      )?.[1];
      expect(preferencePayload).toBeDefined();
      expect(preferencePayload.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const cached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY) ?? '{}');
      expect(cached.userId).toBe('user-test-1');
      expect(cached.settings.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      const viewCached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY) ?? '{}');
      expect(viewCached.userId).toBe('user-test-1');
      expect(viewCached.settings).toEqual({
        version: 2,
        fontSize: 'compact',
        tableLabelFormat: 'full',
        settingsLabelFormat: 'full',
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      });
      expect(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY)).toBeNull();
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});
