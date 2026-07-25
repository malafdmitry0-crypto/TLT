import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage table-batch — permissions', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('сохраняет таблицы и настройки, но блокирует project-write действия для чужого employee', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const {
      createElectricalCandidate,
      getElectricalPage,
      selectCableForVariants,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()]),
    );
    useAuthStore.getState().setEmployee({
      id: 'viewer-1',
      email: 'viewer@example.test',
      full_name: null,
      role: 'employee',
      is_active: true,
    }, { access: 'token' });
    useProjectStore.getState().setCurrentProject({
      ...mockProject,
      user_id: 'owner-2',
      session_id: null,
    });

    renderPage();

    expect(await screen.findByText('Режим просмотра')).toBeInTheDocument();
    expect(await screen.findByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки' })).not.toBeDisabled();
    // Default: wide params panel off — compact controls in action bar.
    // TltSelect (Ant): aria-label on root + combobox; disabled via data-disabled / ant-select-disabled.
    const isTltSelectDisabled = (el: HTMLElement) =>
      el.getAttribute('data-disabled') === 'true'
      || el.getAttribute('aria-disabled') === 'true'
      || el.classList.contains('ant-select-disabled')
      || el.closest('.ant-select')?.classList.contains('ant-select-disabled') === true
      || el.closest('[data-disabled="true"]') != null
      || el.hasAttribute('disabled')
      || (el as HTMLButtonElement | HTMLInputElement).disabled === true;
    const cableTypeForRecalc = screen.getAllByLabelText('Тип кабеля для пересчёта')[0];
    expect(isTltSelectDisabled(cableTypeForRecalc)).toBeTruthy();
    expect(screen.getAllByLabelText('Напряжение питания')[0]).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Расширенные параметры' }));
    const cableTypeWide = screen.getAllByLabelText('Тип кабеля')[0];
    expect(isTltSelectDisabled(cableTypeWide)).toBeTruthy();
    expect(screen.getAllByLabelText('Напряжение питания')[0]).toBeDisabled();

    await user.click(screen.getByText('Труба-1'));
    expect(await screen.findByRole('button', { name: 'Выбор' })).toBeDisabled();
    const sizing = screen.getByRole('button', { name: 'Подбор' });
    expect(sizing).not.toBeDisabled();
    await user.click(sizing);

    expect(await screen.findByRole('dialog', { name: /Подбор кабеля для Труба-1/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить авторасчёт' })).toBeDisabled();
    expect(screen.getByLabelText('Комментарий к выбранному кандидату')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки таблицы' })).not.toBeDisabled();

    expect(apiMocks.enqueueVariantBatch).not.toHaveBeenCalled();
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(createElectricalCandidate).not.toHaveBeenCalled();
  });

});
