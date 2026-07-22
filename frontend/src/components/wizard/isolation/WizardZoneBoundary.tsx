/**
 * React boundary for one wizard island zone.
 * - ErrorBoundary so a crash in one island does not wipe the dual-form shell
 * - Dev-time DOM isolation checks that surface WizardIsolationError with FIX
 */

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  WIZARD_ISLAND_BY_ID,
  WIZARD_ISLANDS,
  WizardIsolationError,
  type WizardIslandId,
} from './wizardIslands';

export interface WizardZoneBoundaryProps {
  islandId: WizardIslandId;
  children: ReactNode;
  className?: string;
  zone?: string;
  as?: 'div' | 'section';
  'aria-label'?: string;
  'data-form-column'?: string;
  'data-testid'?: string;
}

interface BoundaryState {
  error: Error | null;
}

function IsolationErrorPanel({
  islandId,
  error,
}: {
  islandId: WizardIslandId;
  error: Error;
}) {
  const island = WIZARD_ISLAND_BY_ID[islandId];
  const isIsolation = error instanceof WizardIsolationError;
  return (
    <div
      role="alert"
      data-testid={`wizard-zone-error-${islandId}`}
      data-wizard-isolation-error={isIsolation ? error.code : 'REACT_CRASH'}
      style={{
        margin: 8,
        padding: 10,
        border: '2px solid #cf1322',
        borderRadius: 6,
        background: '#fff1f0',
        color: '#a8071a',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <strong>[WizardIsolation] {island.label} broken</strong>
      {'\n'}
      {error.message}
      {isIsolation
        ? `\n\nFIX: ${error.fix}`
        : '\n\nFIX: Check React tree of this island only; do not “fix” sibling islands.'}
    </div>
  );
}

class WizardZoneErrorBoundary extends Component<
  { islandId: WizardIslandId; children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `[WizardZoneBoundary] crash in island "${this.props.islandId}"`,
      error,
      info.componentStack,
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <IsolationErrorPanel
          islandId={this.props.islandId}
          error={this.state.error}
        />
      );
    }
    return this.props.children;
  }
}

/** Throws during render when set — must be child of ErrorBoundary. */
function ThrowIsolationError({ error }: { error: Error | null }) {
  if (error) throw error;
  return null;
}

/**
 * Dev-only DOM guard. Surfaces WizardIsolationError via ErrorBoundary.
 */
function useWizardZoneDomGuard(
  islandId: WizardIslandId,
  rootRef: React.RefObject<HTMLElement | null>,
): Error | null {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = rootRef.current;
    if (!el) return;

    const island = WIZARD_ISLAND_BY_ID[islandId];
    for (const other of WIZARD_ISLANDS) {
      if (other.id === islandId) continue;
      const hit = el.querySelector(`.${other.rootClass}`);
      if (hit) {
        setError(
          new WizardIsolationError({
            code: 'DOM_FOREIGN_ISLAND',
            island: islandId,
            message:
              `Zone "${islandId}" (.${island.rootClass}) contains foreign island ` +
              `"${other.id}" (.${other.rootClass}). DOM isolation broken.`,
            fix:
              `Render .${other.rootClass} only inside its own WizardZoneBoundary / shell slot. ` +
              `Do not nest ${other.componentFile} under ${island.componentFile}.`,
          }),
        );
        return;
      }
    }
    setError(null);
  }, [islandId, rootRef]);

  return error;
}

export default function WizardZoneBoundary({
  islandId,
  children,
  className,
  zone,
  as = 'div',
  'aria-label': ariaLabel,
  'data-form-column': dataFormColumn,
  'data-testid': dataTestId,
}: WizardZoneBoundaryProps) {
  const island = WIZARD_ISLAND_BY_ID[islandId];
  const rootRef = useRef<HTMLElement | null>(null);
  const guardError = useWizardZoneDomGuard(islandId, rootRef);

  const Tag = as;
  const zoneValue = zone ?? island.zoneAttr ?? islandId;

  return (
    <WizardZoneErrorBoundary islandId={islandId}>
      <Tag
        ref={rootRef as never}
        className={className}
        data-wizard-zone={zoneValue}
        data-wizard-island={islandId}
        data-protected-zone={island.protected ? island.dataProtected : undefined}
        aria-label={ariaLabel}
        data-form-column={dataFormColumn}
        data-testid={dataTestId}
      >
        <ThrowIsolationError error={guardError} />
        {children}
      </Tag>
    </WizardZoneErrorBoundary>
  );
}
