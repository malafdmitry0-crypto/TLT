import { useCallback, useEffect, useState } from 'react';

import {
  filterVisibleSelectedRowKeys,
} from '@/pages/electrical/elecCalcSelectionModel';
import type { ProjectObject } from '@/types/project';

type UseElecCalcRowSelectionStateOptions = {
  projectId?: string;
  variant: string | number;
  tablePage: number;
  tablePageSize: number;
  objects: readonly ProjectObject[];
};

export function useElecCalcRowSelectionState({
  projectId,
  variant,
  tablePage,
  tablePageSize,
  objects,
}: UseElecCalcRowSelectionStateOptions) {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  useEffect(() => {
    setActiveRowId(null);
  }, [projectId, variant, tablePage, tablePageSize]);

  useEffect(() => {
    setSelectedRowKeys([]);
  }, [projectId, variant]);

  useEffect(() => {
    setSelectedRowKeys((keys) => filterVisibleSelectedRowKeys(keys, objects) as string[]);
  }, [objects]);

  const activateRowId = useCallback((objectId: string) => {
    setActiveRowId(objectId);
  }, []);

  const openElectricalRow = useCallback((record: Pick<ProjectObject, 'id'>) => {
    setActiveRowId(record.id);
  }, []);

  const clearActiveRow = useCallback(() => {
    setActiveRowId(null);
  }, []);

  const clearSelectedRows = useCallback(() => {
    setSelectedRowKeys([]);
  }, []);

  return {
    activeRowId,
    selectedRowKeys,
    setSelectedRowKeys,
    activateRowId,
    openElectricalRow,
    clearActiveRow,
    clearSelectedRows,
  };
}
