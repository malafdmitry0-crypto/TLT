import type { PointerEvent as ReactPointerEvent } from 'react';

interface ResizableColumnTitleProps {
  title: string;
  label: string;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectable?: boolean;
  selected?: boolean;
  selectionActive?: boolean;
  onSelectionPointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  onSelectionPointerEnter?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}

export default function ResizableColumnTitle({
  title,
  label,
  onResizeStart,
  selectable = false,
  selected = false,
  selectionActive = false,
  onSelectionPointerDown,
  onSelectionPointerEnter,
}: ResizableColumnTitleProps) {
  const className = [
    'resizable-column-title',
    selectable ? 'excel-column-title' : null,
    selected ? 'selected' : null,
    selectionActive ? 'active-selection' : null,
  ].filter(Boolean).join(' ');
  return (
    <span
      className={className}
      onPointerDown={(event) => {
        if (!selectable) return;
        event.preventDefault();
        event.stopPropagation();
        onSelectionPointerDown?.(event);
      }}
      onPointerEnter={(event) => {
        if (!selectable) return;
        onSelectionPointerEnter?.(event);
      }}
    >
      <span className="resizable-column-title-text">{title}</span>
      <button
        type="button"
        className="column-resize-handle"
        aria-label={`Изменить ширину: ${label}`}
        tabIndex={-1}
        onPointerDown={onResizeStart}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </span>
  );
}
