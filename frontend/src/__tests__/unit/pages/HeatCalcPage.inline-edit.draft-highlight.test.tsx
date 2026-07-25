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

describe('HeatCalcPage inline-edit — draft field highlight', () => {
  setupHeatCalcPageTest();
  describe('Inline-редактирование', () => {
    it('в обычном режиме подсвечивает поле, указанное в ошибке draft-валидации выбранной строки', async () => {
      const { listObjects } = await import('@/api/projects');
      const source = makeObject({
        params: {
          ...makeObject().params,
          name: 'Подземная труба с indoor tm',
          placement: 'underground',
          burial_depth: 0.4,
          ground_type: 'sand_1480_w5',
          ground_conductivity: 1.11,
          insulation_temperature_basis: 'indoor',
        },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Подземная труба с indoor tm'));
      const lengthInput = await screen.findByTestId('pipe-length-input');
      const basisSelect = screen.getByTestId('insulation-temperature-basis-select');
      expect(basisSelect.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');

      await user.clear(lengthInput);
      await user.type(lengthInput, '26');

      const selectedRowErrors = await screen.findByLabelText('Ошибки выбранной строки');
      expect(selectedRowErrors).toHaveTextContent(
        'Режим температуры изоляции: Режим tm изоляции не соответствует размещению объекта',
      );
      await waitFor(() => {
        expect(screen.getByTestId('insulation-temperature-basis-select').closest('.ant-form-item'))
          .toHaveClass('ant-form-item-has-error');
      });
      expect(screen.getByText('Режим tm изоляции не соответствует размещению объекта')).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

  });
});
