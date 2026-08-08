import { useEffect, useRef, type ReactNode } from 'react';

export function ElectricalVariantSetTaskLockBoundary({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.inert = locked;
  }, [locked]);

  return (
    <div ref={ref} aria-disabled={locked || undefined} data-calculation-locked={locked || undefined}>
      {children}
    </div>
  );
}
