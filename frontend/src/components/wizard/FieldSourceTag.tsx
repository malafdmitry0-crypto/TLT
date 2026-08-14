import type { ReactNode } from 'react';
import type { FieldSource } from './fieldSourceModel';

export function FieldSourceTag({ source }: { source: FieldSource }) {
  return (
    <span className="field-source-tag">
      {source === 'climate' ? 'из климата' : 'вручную'}
    </span>
  );
}

export function FieldSourceExtra({
  source,
  children,
}: {
  source?: FieldSource;
  children?: ReactNode;
}) {
  return (
    <>
      {source ? <FieldSourceTag source={source} /> : null}
      {source && children != null ? ' · ' : null}
      {children}
    </>
  );
}
