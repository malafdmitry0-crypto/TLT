import { useEffect, useState, type ReactNode } from 'react';
import { Input, InputNumber, Select } from 'antd';
import type { HeatCalcFieldDefinition } from '@/domain/heatCalcFields';

export interface EditableTableCellProps {
  active: boolean;
  dirty?: boolean;
  error?: string;
  field: HeatCalcFieldDefinition;
  step?: number;
  value: unknown;
  children: ReactNode;
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
  dirty = false,
  error,
  field,
  step,
  value,
  children,
  onStartEdit,
  onCommit,
  onCancel,
}: EditableTableCellProps) {
  const [draftValue, setDraftValue] = useState<unknown>(value);
  const [localError, setLocalError] = useState<string | null>(null);
  const displayClassName = [
    'editable-cell-display',
    `editable-cell-display--${field.editor}`,
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStartEdit();
        }}
      >
        {children}
      </button>
    );
  }

  const editorError = localError ?? error;
  const commonProps = {
    className: editorError ? 'editable-cell-editor error' : 'editable-cell-editor',
    autoFocus: true,
    onClick: (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setLocalError(null);
        onCancel();
      }
    },
  };

  const help = editorError ? <div className="editable-cell-error">{editorError}</div> : null;

  if (field.editor === 'select') {
    return (
      <div className="editable-cell-editor-wrap" onClick={(event) => event.stopPropagation()}>
        <Select
          {...commonProps}
          size="small"
          open
          value={draftValue as string | number | undefined}
          options={field.options}
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
      <div className="editable-cell-editor-wrap" onClick={(event) => event.stopPropagation()}>
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
    <div className="editable-cell-editor-wrap" onClick={(event) => event.stopPropagation()}>
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
