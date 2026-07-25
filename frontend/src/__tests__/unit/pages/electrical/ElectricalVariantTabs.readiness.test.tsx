import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ElectricalReadinessResponse } from '@/types/electricalVariant';
import {
  controller,
  ER_1,
  ER_2_ID,
  PROJECT_ID,
  renderTabs,
  tabsTree,
} from './ElectricalVariantTabs.test-harness';

describe('ElectricalVariantTabs — loading / readiness', () => {
  it('renders loading, retryable list error and mutation error without a fabricated ER1', async () => {
    const user = userEvent.setup();
    const retryList = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderTabs(controller({ isLoading: true, variants: [], selectedVariant: null }));
    expect(screen.getByText('Загружаем список ЭР…')).toBeInTheDocument();
    expect(screen.queryByText('ЭР1')).not.toBeInTheDocument();

    rerender(tabsTree(controller({
          isLoading: false,
          isError: true,
          listError: new Error('Список недоступен'),
          variants: [],
          selectedVariant: null,
          retryList,
        })));
    expect(screen.getByText('Список недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку ЭР' }));
    expect(retryList).toHaveBeenCalled();

    rerender(tabsTree(controller({ mutationError: new Error('Имя уже занято') })));
    expect(screen.getByText('Имя уже занято')).toBeInTheDocument();
  });

  it('shows readiness details for an empty project and initializes only when ready', async () => {
    const user = userEvent.setup();
    const blockedReadiness: ElectricalReadinessResponse = {
      project_id: PROJECT_ID,
      ready: false,
      total_objects: 2,
      ready_objects: 1,
      issues: [{
        code: 'HEAT_NOT_READY',
        message: 'Пересчитайте теплопотери ёмкости',
        object_id: ER_2_ID,
        details: {},
      }],
    };
    const { rerender } = renderTabs(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: blockedReadiness,
        }));

    expect(screen.getByText('Пересчитайте теплопотери ёмкости')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать ЭР1/i })).toBeDisabled();

    const initializeVariant = vi.fn().mockResolvedValue(ER_1);
    rerender(tabsTree(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readiness: { ...blockedReadiness, ready: true, ready_objects: 2, issues: [] },
          initializeVariant,
        })));
    await user.click(screen.getByRole('button', { name: /Создать ЭР1/i }));
    expect(initializeVariant).toHaveBeenCalled();
  });

  it('keeps initialize disabled while authoritative readiness is refetching', () => {
    renderTabs(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          isReadinessFetching: true,
          readiness: {
            project_id: PROJECT_ID,
            ready: true,
            total_objects: 1,
            ready_objects: 1,
            issues: [],
          },
        }));

    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });

  it('shows a retryable readiness error for an empty project', async () => {
    const user = userEvent.setup();
    const retryReadiness = vi.fn().mockResolvedValue(undefined);
    renderTabs(controller({
          variants: [],
          selectedVariant: null,
          isEmpty: true,
          readinessError: new Error('Readiness API недоступен'),
          retryReadiness,
        }));

    expect(screen.getByText('Readiness API недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить проверку готовности ЭР' }));
    expect(retryReadiness).toHaveBeenCalled();
  });

  it('does not allow a read-only user to initialize the first ER', () => {
    renderTabs(controller({
      variants: [],
      selectedVariant: null,
      isEmpty: true,
      readiness: {
        project_id: PROJECT_ID,
        ready: true,
        total_objects: 1,
        ready_objects: 1,
        issues: [],
      },
    }), false);

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByText(/Создать первый ЭР может только владелец/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать ЭР1' })).toBeDisabled();
  });

});
