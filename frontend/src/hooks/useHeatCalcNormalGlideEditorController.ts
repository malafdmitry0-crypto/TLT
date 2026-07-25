/**
 * Cell editor open/commit/key handlers for HeatCalc normal Glide grid.
 */
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import type { DataEditorRef, Item } from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  selectedOptionValue,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';

export type NormalGlideEditingCell = {
  cell: Item;
  value: string;
  bounds: { x: number; y: number; width: number; height: number };
  editor?: HeatCalcGlideGridCellState['editor'];
  options?: HeatCalcGlideGridCellState['options'];
  step?: number;
  error?: string | null;
};

type ModelCell = {
  column: HeatCalcGlideGridColumn;
  record: ProjectObject;
  state: HeatCalcGlideGridCellState;
} | null;

export function useHeatCalcNormalGlideEditorController({
  editorRef,
  getModelCell,
  onStartCellEdit,
  onCommitCell,
}: {
  editorRef: RefObject<DataEditorRef | null>;
  getModelCell: (columnIndex: number, rowIndex: number) => ModelCell;
  onStartCellEdit: (record: ProjectObject, columnKey: string) => void;
  onCommitCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
}) {
  const [editingCell, setEditingCell] = useState<NormalGlideEditingCell | null>(null);
  const cellEditorElementRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const setCellEditorElement = useCallback((element: HTMLInputElement | HTMLSelectElement | null) => {
    cellEditorElementRef.current = element;
  }, []);

  const openEditorForCell = useCallback((cell: Item, fallbackBounds?: NormalGlideEditingCell['bounds']) => {
    const modelCell = getModelCell(cell[0], cell[1]);
    if (!modelCell?.state.editable) return false;
    onStartCellEdit(modelCell.record, modelCell.column.key);
    const bounds = editorRef.current?.getBounds(cell[0], cell[1]) ?? fallbackBounds;
    if (!bounds) return true;
    setEditingCell({
      cell,
      value: modelCell.state.displayValue,
      bounds,
      editor: modelCell.state.editor,
      options: modelCell.state.options,
      step: modelCell.state.step,
      error: modelCell.state.error ?? null,
    });
    return true;
  }, [editorRef, getModelCell, onStartCellEdit]);

  const commitNormalEditor = useCallback(() => {
    if (!editingCell) return;
    const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
    if (!modelCell?.state.editable) {
      setEditingCell(null);
      return;
    }
    const value = editingCell.editor === 'select'
      ? selectedOptionValue(editingCell.value, editingCell.options)
      : editingCell.value;
    const error = onCommitCell(modelCell.record, modelCell.column.key, value);
    if (error) {
      setEditingCell((current) => (current ? { ...current, error } : current));
      return;
    }
    setEditingCell(null);
  }, [editingCell, getModelCell, onCommitCell]);

  const handleSelectEditorChange = useCallback((value: string) => {
    setEditingCell((current) => (current ? { ...current, value, error: null } : current));
    if (!editingCell) return;
    const modelCell = getModelCell(editingCell.cell[0], editingCell.cell[1]);
    if (!modelCell?.state.editable) return;
    const error = onCommitCell(
      modelCell.record,
      modelCell.column.key,
      selectedOptionValue(value, editingCell.options),
    );
    setEditingCell((current) => (current ? { ...current, error } : current));
  }, [editingCell, getModelCell, onCommitCell]);

  const handleTextEditorChange = useCallback((value: string) => {
    setEditingCell((current) => (current ? { ...current, value, error: null } : current));
  }, []);

  const handleEditorKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitNormalEditor();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setEditingCell(null);
    }
  }, [commitNormalEditor]);

  return {
    editingCell,
    setEditingCell,
    cellEditorElementRef,
    setCellEditorElement,
    openEditorForCell,
    commitNormalEditor,
    handleSelectEditorChange,
    handleTextEditorChange,
    handleEditorKeyDown,
  };
}
