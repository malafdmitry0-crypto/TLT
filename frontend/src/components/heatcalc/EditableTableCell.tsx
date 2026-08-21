import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
import type { HeatCalcFieldDefinition } from '@/domain/heatCalcFields';
import { TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';

export interface EditableTableCellProps {
  rowId?: string;
  columnKey?: string;
  rowIndex?: number;
  columnIndex?: number;
  active: boolean;
  selected?: boolean;
  selectionActive?: boolean;
  excelMode?: boolean;
  dirty?: boolean;
  error?: string;
  field: HeatCalcFieldDefinition;
  options?: HeatCalcFieldDefinition['options'];
  step?: number;
  value: unknown;
  children: ReactNode;
  onSelect?: () => void;
  onSelectionPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onSelectionPointerEnter?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: HeatCalcContextMenuTrigger) => void;
  onStartEdit: () => void;
  onCommit: (value: unknown) => string | null;
  onCancel: () => void;
}

function normalizeInputValue(value: unknown) {
  return value == null ? '' : String(value);
}

function normalizeNumberValue(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function EditableTableCell({
  active,
  selected = false,
  selectionActive = false,
  excelMode = false,
  dirty = false,
  error,
  field,
  options,
  step,
  value,
  children,
  onSelect,
  onSelectionPointerDown,
  onSelectionPointerEnter,
  onContextMenu,
  onStartEdit,
  onCommit,
  onCancel,
}: EditableTableCellProps) {
  const [draftValue, setDraftValue] = useState<unknown>(value);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastExcelPointerDownAtRef = useRef(0);
  const displayClassName = [
    'editable-cell-display',
    `editable-cell-display--${field.editor}`,
    selected ? 'selected' : null,
    selectionActive ? 'active-selection' : null,
    dirty ? 'dirty' : null,
    error ? 'error' : null,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!active) return;
    setDraftValue(value);
    setLocalError(error ?? null);
  }, [active, error, value]);

  function commit() {
    const nextError = onCommit(draftValue);
    setLocalError(nextError);
    return nextError == null;
  }

  if (!active) {
    return (
      <button
        type="button"
        className={displayClassName}
        aria-invalid={error ? true : undefined}
        title={error}
        onPointerDown={(event) => {
          if (!excelMode) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          if (event.button === 2) {
            onContextMenu?.(event);
            return;
          }
          const now = Date.now();
          const repeatedClick = now - lastExcelPointerDownAtRef.current < 450;
          lastExcelPointerDownAtRef.current = now;
          if (event.detail > 1 || repeatedClick) {
            onSelect?.();
            onStartEdit();
            return;
          }
          onSelectionPointerDown?.(event);
        }}
        onMouseDown={(event) => {
          if (!excelMode || event.button !== 2) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenu?.(event);
        }}
        onAuxClick={(event) => {
          if (!excelMode || event.button !== 2) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenu?.(event);
        }}
        onPointerEnter={(event) => {
          if (!excelMode) return;
          onSelectionPointerEnter?.(event);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (excelMode) {
            return;
          }
          onStartEdit();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'F2') return;
          event.preventDefault();
          event.stopPropagation();
          onSelect?.();
          onStartEdit();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect?.();
          onStartEdit();
        }}
        onContextMenu={(event) => {
          if (!excelMode) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenu?.(event);
        }}
      >
        {children}
      </button>
    );
  }

  const editorError = localError ?? error;
  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setLocalError(null);
      onCancel();
    }
  }

  const editorClassName = editorError ? 'editable-cell-editor error' : 'editable-cell-editor';
  const editorWrapProps = {
    className: 'editable-cell-editor-wrap',
    onClick: (event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation(),
    onKeyDownCapture: handleEditorKeyDown,
  };

  const help = editorError ? <div className="editable-cell-error">{editorError}</div> : null;

  if (field.editor === 'select') {
    return (
      <div {...editorWrapProps}>
        <TltSelect
          className={editorClassName}
          value={draftValue as string | number | undefined}
          options={options ?? field.options}
          onChange={(nextValue) => {
            setDraftValue(nextValue);
            setLocalError(null);
            onCommit(nextValue);
          }}
          aria-label="Редактирование ячейки"
        />
        {help}
      </div>
    );
  }

  if (field.editor === 'number') {
    return (
      <div {...editorWrapProps}>
        <TltNumberField
          className={editorClassName}
          min={field.min}
          max={field.max}
          step={step ?? field.step}
          value={normalizeNumberValue(draftValue)}
          onChange={(nextValue) => {
            setDraftValue(nextValue);
            setLocalError(null);
          }}
          onKeyDown={(event) => {
            // Match previous Ant InputNumber keyboard={false}: no step via arrows.
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
            }
          }}
          onBlur={() => commit()}
          aria-label="Редактирование числа"
        />
        {help}
      </div>
    );
  }

  return (
    <div {...editorWrapProps}>
      <TltTextField
        className={editorClassName}
        autoFocus
        maxLength={field.maxLength}
        value={normalizeInputValue(draftValue)}
        onChange={(nextValue) => {
          setDraftValue(nextValue);
          setLocalError(null);
        }}
        onBlur={() => commit()}
        aria-label="Редактирование текста"
      />
      {help}
    </div>
  );
}

function areOptionsEqual(
  previous: HeatCalcFieldDefinition['options'] | undefined,
  next: HeatCalcFieldDefinition['options'] | undefined,
) {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((option, index) => {
    const nextOption = next[index];
    return option.label === nextOption?.label && option.value === nextOption?.value;
  });
}

// eslint-disable-next-line react-refresh/only-export-components -- unit tests cover the memo comparator.
export function areEditableTableCellPropsEqual(
  previous: EditableTableCellProps,
  next: EditableTableCellProps,
) {
  return previous.rowId === next.rowId
    && previous.columnKey === next.columnKey
    && previous.rowIndex === next.rowIndex
    && previous.columnIndex === next.columnIndex
    && previous.active === next.active
    && previous.selected === next.selected
    && previous.selectionActive === next.selectionActive
    && previous.excelMode === next.excelMode
    && previous.dirty === next.dirty
    && previous.error === next.error
    && previous.field === next.field
    && areOptionsEqual(previous.options, next.options)
    && previous.step === next.step
    && previous.value === next.value
    && previous.children === next.children;
}

export default memo(EditableTableCell, areEditableTableCellPropsEqual);
