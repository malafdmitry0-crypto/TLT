import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input, InputNumber, Select } from 'antd';
import type { HeatCalcFieldDefinition } from '@/domain/heatCalcFields';

export interface EditableTableCellProps {
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
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
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

export default function EditableTableCell({
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
            onContextMenu?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
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

  const commonProps = {
    className: editorError ? 'editable-cell-editor error' : 'editable-cell-editor',
    autoFocus: true,
    onClick: (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
  };
  const editorWrapProps = {
    className: 'editable-cell-editor-wrap',
    onClick: (event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation(),
    onKeyDownCapture: handleEditorKeyDown,
  };

  const help = editorError ? <div className="editable-cell-error">{editorError}</div> : null;

  if (field.editor === 'select') {
    return (
      <div {...editorWrapProps}>
        <Select
          {...commonProps}
          size="small"
          open
          value={draftValue as string | number | undefined}
          options={options ?? field.options}
          onChange={(nextValue) => {
            setDraftValue(nextValue);
            setLocalError(null);
            onCommit(nextValue);
          }}
          onBlur={() => {
            if (draftValue != null && draftValue !== '') commit();
          }}
        />
        {help}
      </div>
    );
  }

  if (field.editor === 'number') {
    return (
      <div {...editorWrapProps}>
        <InputNumber
          {...commonProps}
          size="small"
          controls={false}
          keyboard={false}
          min={field.min}
          max={field.max}
          step={step ?? field.step}
          value={normalizeNumberValue(draftValue)}
          onChange={(nextValue) => {
            setDraftValue(nextValue);
            setLocalError(null);
          }}
          onBlur={() => commit()}
        />
        {help}
      </div>
    );
  }

  return (
    <div {...editorWrapProps}>
      <Input
        {...commonProps}
        size="small"
        maxLength={field.maxLength}
        value={normalizeInputValue(draftValue)}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setLocalError(null);
        }}
        onBlur={() => commit()}
      />
      {help}
    </div>
  );
}
