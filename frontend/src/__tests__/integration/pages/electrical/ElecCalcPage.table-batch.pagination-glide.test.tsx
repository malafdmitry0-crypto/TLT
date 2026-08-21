import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { electricalGlideGridMock, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage table / batch — pagination-glide', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });
  it('пагинирует таблицу электрики, чтобы не рендерить все строки сразу', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects.slice(0, 50),
        [],
        { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
        { total_pages: 2, has_next_page: true },
      ),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1-50 из 80')).toBeInTheDocument();
    });
    expect(screen.getByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByText('Труба-50')).toBeInTheDocument();
    expect(screen.queryByText('Труба-51')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-pagination')).toBeTruthy();
  });
  it('в Glide-режиме догружает следующую cursor-порцию в бесконечный список', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(0, 50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            total_pages: 2,
            has_next_page: true,
            next_cursor: { id: 'o-50', sort_order: 49 },
          },
        ),
      )
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            page: 2,
            offset: 50,
            total_pages: 2,
            has_previous_page: true,
            has_next_page: false,
          },
        ),
      );
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'glide');
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByTestId('electrical-glide-grid-mock');
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 50,
        total: 80,
        hasNextPage: true,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(50);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Догрузить строки' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        page: 2,
        page_size: 50,
        after_sort_order: 49,
        after_id: 'o-50',
      }));
    });
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 80,
        total: 80,
        hasNextPage: false,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(80);
    });
  });
});
