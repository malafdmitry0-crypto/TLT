/**
 * @module heatcalc/object-reorder
 * @owner heat
 * @depends api/projects, utils/heatCalcObjectReorder
 * @does-not electrical
 *
 * PDF-HEAT-08: persist Glide row DnD via PUT /objects/reorder (full ID list).
 */
import { useCallback, useRef } from 'react';
import { appMessage as antdMessage } from '@/feedback/appFeedback';
import type { QueryClient } from '@tanstack/react-query';

import { listObjects, reorderObjects } from '@/api/projects';
import { rebuildObjectOrderAfterVisibleMove } from '@/utils/heatCalcObjectReorder';

type ReorderableRow = { id: string };

export type UseHeatCalcObjectReorderArgs = {
  projectId: string | null | undefined;
  excelModeEnabled: boolean;
  visibleTableObjects: readonly ReorderableRow[];
  queryClient: QueryClient;
};

export function useHeatCalcObjectReorder({
  projectId,
  excelModeEnabled,
  visibleTableObjects,
  queryClient,
}: UseHeatCalcObjectReorderArgs) {
  const rowReorderPendingRef = useRef(false);

  const handleObjectsRowMoved = useCallback(async (startIndex: number, endIndex: number) => {
    if (!projectId || excelModeEnabled || rowReorderPendingRef.current) return;
    if (startIndex === endIndex) return;
    const visibleIds = visibleTableObjects.map((row) => row.id);
    if (
      startIndex < 0
      || endIndex < 0
      || startIndex >= visibleIds.length
      || endIndex >= visibleIds.length
    ) {
      return;
    }
    rowReorderPendingRef.current = true;
    try {
      const full = await listObjects(projectId);
      const fullIds = full
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((row) => row.id);
      const nextOrder = rebuildObjectOrderAfterVisibleMove(
        fullIds,
        visibleIds,
        startIndex,
        endIndex,
      );
      await reorderObjects(projectId, nextOrder);
      await queryClient.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });
      antdMessage.success('Порядок объектов сохранён');
    } catch (err) {
      antdMessage.error((err as Error).message || 'Не удалось изменить порядок объектов');
    } finally {
      rowReorderPendingRef.current = false;
    }
  }, [excelModeEnabled, projectId, queryClient, visibleTableObjects]);

  return {
    handleObjectsRowMoved,
  };
}
