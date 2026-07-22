import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface CompactFieldGridProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  density?: 'compact' | 'comfortable';
  /** Number of equal columns in the regular grid flow. */
  columns?: number;
  /** Fill a fixed number of rows before creating the next column. */
  flow?: 'rows' | 'columns';
  maxRowsPerColumn?: number;
  /** Content sizing mirrors HeatCalc; equal sizing is useful for wide dashboard forms. */
  sizing?: 'content' | 'equal';
  /** Adapts Ant Design Form.Item markup to the same horizontal field contract. */
  antFormAdapter?: boolean;
}

type CompactFieldGridStyle = CSSProperties & {
  '--tlt-field-grid-columns'?: number;
  '--tlt-field-grid-max-rows'?: number;
};

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

/** Shared responsive layout for compact fields, including legacy Ant Form items. */
export default function CompactFieldGrid({
  children,
  density = 'compact',
  columns = 3,
  flow = 'columns',
  maxRowsPerColumn = 5,
  sizing = 'content',
  antFormAdapter = false,
  className,
  style,
  ...rest
}: CompactFieldGridProps) {
  const gridStyle: CompactFieldGridStyle = {
    ...style,
    '--tlt-field-grid-columns': columns,
    '--tlt-field-grid-max-rows': maxRowsPerColumn,
  };

  return (
    <div
      {...rest}
      className={joinClassNames(
        'tlt-compact-field-grid',
        `tlt-compact-field-grid--${density}`,
        `tlt-compact-field-grid--flow-${flow}`,
        `tlt-compact-field-grid--sizing-${sizing}`,
        antFormAdapter && 'tlt-compact-field-grid--ant-form',
        className,
      )}
      data-density={density}
      style={gridStyle}
    >
      {children}
    </div>
  );
}
