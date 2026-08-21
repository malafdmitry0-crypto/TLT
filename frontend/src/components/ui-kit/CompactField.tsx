import type { CSSProperties, ReactNode } from 'react';

/**
 * Label / control / hint / error chrome for one form field.
 * Feature code supplies the control (`children`); this owns layout only.
 * Pair with {@link CompactFieldGrid} for multi-field rows.
 */
export interface CompactFieldProps {
  /** Field label shown beside or above the control. */
  label: ReactNode;
  /** Helper text under the control when there is no `error`. */
  hint?: ReactNode;
  /** Marks the field required (amber inset on control; no asterisk). */
  required?: boolean;
  /** Validation message; replaces `hint` when set. */
  error?: ReactNode;
  /** Control node (`TltTextField`, `TltNumberField`, `TltSelect`, …). */
  children: ReactNode;
  className?: string;
  /** `horizontal` = label | control; `vertical` = label above control. */
  layout?: 'horizontal' | 'vertical';
  /** Override default label track width (token: `--tlt-field-label-width`). */
  labelWidth?: CSSProperties['width'];
  /** Control track width (tokens: `--tlt-field-ctrl-num`, `-name`, …). */
  controlWidth?: CSSProperties['width'];
}

type CompactFieldStyle = CSSProperties & {
  '--tlt-compact-label-width'?: CSSProperties['width'];
  '--tlt-compact-control-width'?: CSSProperties['width'];
};

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

/**
 * Canonical compact field composition used by the UI Kit and feature screens.
 * Feature components provide the control and data; this component owns label,
 * spacing, hint and validation-message layout.
 */
export default function CompactField({
  label,
  hint,
  required,
  error,
  children,
  className,
  layout = 'horizontal',
  labelWidth,
  controlWidth,
}: CompactFieldProps) {
  const style: CompactFieldStyle = {
    '--tlt-compact-label-width': labelWidth,
    '--tlt-compact-control-width': controlWidth,
  };

  return (
    <div
      className={joinClassNames(
        'tlt-compact-field',
        `tlt-compact-field--${layout}`,
        required && 'tlt-compact-field--required',
        Boolean(error) && 'tlt-compact-field--error',
        className,
      )}
      style={style}
    >
      {/* HeatCalc contract (requiredMark=false): required = amber inset on the
          control, no asterisk in the label */}
      <span className="tlt-compact-field__label">{label}</span>
      <span className="tlt-compact-field__control">{children}</span>
      {error ? <span className="tlt-compact-field__message">{error}</span> : null}
      {!error && hint ? <span className="tlt-compact-field__hint">{hint}</span> : null}
    </div>
  );
}
