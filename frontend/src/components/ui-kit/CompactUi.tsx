import type { ReactNode } from 'react';

interface CompactSectionProps {
  id: string;
  index: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function CompactSection({
  id,
  index,
  title,
  description,
  children,
}: CompactSectionProps) {
  return (
    <section className="uikit-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="uikit-section__heading">
        <span className="uikit-section__index" aria-hidden="true">{index}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

interface CompactFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

export function CompactField({ label, hint, required, error, children }: CompactFieldProps) {
  return (
    <div className={`uikit-field${error ? ' uikit-field--error' : ''}`}>
      <span className="uikit-field__label">
        {label}
        {required ? <span className="uikit-field__required" aria-hidden="true">*</span> : null}
      </span>
      {children}
      {error ? <span className="uikit-field__message">{error}</span> : null}
      {!error && hint ? <span className="uikit-field__hint">{hint}</span> : null}
    </div>
  );
}

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface StatusChipProps {
  tone?: StatusTone;
  children: ReactNode;
}

export function StatusChip({ tone = 'neutral', children }: StatusChipProps) {
  return <span className={`uikit-status uikit-status--${tone}`}>{children}</span>;
}

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}

export function CompactMetric({ label, value, unit, accent }: MetricProps) {
  return (
    <div className={`uikit-metric${accent ? ' uikit-metric--accent' : ''}`}>
      <span className="uikit-metric__label">{label}</span>
      <strong>{value}</strong>
      {unit ? <span className="uikit-metric__unit">{unit}</span> : null}
    </div>
  );
}
