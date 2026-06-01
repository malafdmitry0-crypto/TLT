import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';
import type { ProjectObject } from '@/types/project';
import {
  isDraftRowDirty,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import { isExcelNewRowId } from '@/utils/heatCalcExcelMode';
import {
  type ExcelLocalProjectObject,
} from '@/utils/heatCalcExcelRows';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

type WizardObjectType = HeatCalcObjectType;

export interface WizardState {
  type: WizardObjectType;
  editingObject?: ProjectObject;
}

interface UseHeatCalcObjectEditorOptions {
  projectId?: string;
  activeObjectScope: ActiveObjectScope;
  activeTableObjectType: HeatCalcObjectType;
  formBlockVisible: boolean;
  excelModeEnabled: boolean;
  projectObjectCount: number;
  draftRowsById: DraftRowsById;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  onScopeChanged: () => void;
  onDirtyEditBlocked: (obj: ProjectObject) => void;
}

export function canOpenObjectWizard(
  record: ProjectObject,
): record is ProjectObject & { object_type: HeatCalcObjectType } {
  return record.object_type === 'pipe' || record.object_type === 'tank';
}

export function useHeatCalcObjectEditor({
  projectId,
  activeObjectScope,
  activeTableObjectType,
  formBlockVisible,
  excelModeEnabled,
  projectObjectCount,
  draftRowsById,
  setDraftRowsById,
  setExcelLocalRows,
  onScopeChanged,
  onDirtyEditBlocked,
}: UseHeatCalcObjectEditorOptions) {
  const [wizardState, setWizardState] = useState<WizardState | null>({ type: 'pipe' });
  const [newWizardRevision, setNewWizardRevision] = useState(0);
  const [lastSavedObject, setLastSavedObject] = useState<ProjectObject | null>(null);
  const draftRowsByIdRef = useRef(draftRowsById);

  useEffect(() => {
    draftRowsByIdRef.current = draftRowsById;
  }, [draftRowsById]);

  useEffect(() => {
    onScopeChanged();
    setWizardState((current) => {
      if (activeObjectScope === 'all' || !current || current.type === activeObjectScope) return current;
      return null;
    });
  }, [activeObjectScope, onScopeChanged]);

  const resetNewWizard = useCallback((type: WizardObjectType) => {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState({ type });
  }, []);

  const clearWizard = useCallback(() => {
    setNewWizardRevision((revision) => revision + 1);
    setWizardState(null);
  }, []);

  const closeWizard = useCallback(() => {
    if (formBlockVisible) {
      resetNewWizard(wizardState?.type ?? activeTableObjectType);
      return;
    }
    clearWizard();
  }, [activeTableObjectType, clearWizard, formBlockVisible, resetNewWizard, wizardState?.type]);

  const openNewObjectMode = useCallback((obj?: ProjectObject) => {
    const type =
      obj?.object_type === 'pipe' || obj?.object_type === 'tank'
        ? obj.object_type
        : wizardState?.type ?? activeTableObjectType;
    if (type !== 'pipe' && type !== 'tank') return;
    if (formBlockVisible) {
      resetNewWizard(type);
      return;
    }
    clearWizard();
  }, [activeTableObjectType, clearWizard, formBlockVisible, resetNewWizard, wizardState?.type]);

  const handleObjectAdded = useCallback((obj: ProjectObject) => {
    setLastSavedObject(obj);
    if (!obj.is_valid && (obj.object_type === 'pipe' || obj.object_type === 'tank')) {
      setWizardState({ type: obj.object_type, editingObject: obj });
      return;
    }
    openNewObjectMode(obj);
  }, [openNewObjectMode]);

  const handleObjectEdited = useCallback((obj: ProjectObject) => {
    setLastSavedObject(obj);
    if (obj.object_type !== 'pipe' && obj.object_type !== 'tank') return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }, []);

  const { add, edit, remove } = useHeatCalcMutations(
    projectId,
    handleObjectAdded,
    handleObjectEdited,
    closeWizard,
  );

  const openAddWizard = useCallback((type: WizardObjectType = wizardState?.type ?? activeTableObjectType) => {
    resetNewWizard(type);
  }, [activeTableObjectType, resetNewWizard, wizardState?.type]);

  const openEditWizard = useCallback((obj: ProjectObject) => {
    if (!canOpenObjectWizard(obj)) return;
    if (!excelModeEnabled && isDraftRowDirty(draftRowsByIdRef.current[obj.id])) {
      onDirtyEditBlocked(obj);
      return;
    }
    setWizardState({ type: obj.object_type, editingObject: obj });
  }, [excelModeEnabled, onDirtyEditBlocked]);

  const forceOpenEditWizard = useCallback((obj: ProjectObject) => {
    if (!canOpenObjectWizard(obj)) return;
    setWizardState({ type: obj.object_type, editingObject: obj });
  }, []);

  const handleWizardSubmit = useCallback((params: Record<string, unknown>) => {
    if (wizardState?.editingObject) {
      const currentState = wizardState;
      const editingObject = currentState.editingObject!;
      const optimisticObject: ProjectObject = {
        ...editingObject,
        params,
      };
      setWizardState({ type: currentState.type, editingObject: optimisticObject });
      if (isExcelNewRowId(editingObject.id)) {
        add.mutate({
          object_type: currentState.type,
          params,
          sort_order: projectObjectCount,
        }, {
          onSuccess: (createdObject) => {
            setExcelLocalRows((current) => current.filter((row) => row.id !== editingObject.id));
            setDraftRowsById((current) => {
              const next = { ...current };
              delete next[editingObject.id];
              return next;
            });
            if (createdObject.object_type === 'pipe' || createdObject.object_type === 'tank') {
              setWizardState({ type: createdObject.object_type, editingObject: createdObject });
            }
          },
        });
        return;
      }
      edit.mutate(
        { objectId: editingObject.id, version: editingObject.version, params },
        {
          onSuccess: () => {
            setDraftRowsById((current) => {
              if (!current[editingObject.id]) return current;
              const next = { ...current };
              delete next[editingObject.id];
              return next;
            });
          },
        },
      );
    } else if (wizardState) {
      add.mutate({
        object_type: wizardState.type,
        params,
        sort_order: projectObjectCount,
      });
    }
  }, [add, edit, projectObjectCount, setDraftRowsById, setExcelLocalRows, wizardState]);

  const syncWizardWithRecord = useCallback((record: ProjectObject) => {
    if (!canOpenObjectWizard(record)) return;
    setWizardState((current) => {
      if (current?.editingObject?.id === record.id) return current;
      return { type: record.object_type, editingObject: record };
    });
  }, []);

  const clearLastSavedObject = useCallback(() => {
    setLastSavedObject(null);
  }, []);

  const selectedRowId = wizardState?.editingObject?.id;
  const selectedObject = wizardState?.editingObject ?? null;
  const formCaptionMode = wizardState?.editingObject ? 'edit' : wizardState ? 'new' : 'idle';
  const formCaptionModeLabel =
    formCaptionMode === 'edit'
      ? 'Режим: изменение'
      : formCaptionMode === 'new'
        ? 'Режим: добавление'
        : 'Режим: ожидание';
  const hasWizard = !!wizardState;
  const submittingObject = add.isPending || edit.isPending;

  return {
    add,
    remove,
    wizardState,
    newWizardRevision,
    lastSavedObject,
    resetNewWizard,
    clearWizard,
    closeWizard,
    openAddWizard,
    openEditWizard,
    forceOpenEditWizard,
    handleWizardSubmit,
    syncWizardWithRecord,
    clearLastSavedObject,
    selectedRowId,
    selectedObject,
    formCaptionMode,
    formCaptionModeLabel,
    hasWizard,
    submittingObject,
  };
}
