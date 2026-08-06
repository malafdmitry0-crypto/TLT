import type { ReactNode } from 'react';
import { TltAlert, TltButton } from '@/components/ui-kit';
import type { SpecificationReadinessBlocker } from '@/api/specifications';
import {
  readinessActionLabel,
  readinessBlockerMessage,
  type SpecificationReadinessViewState,
} from '@/pages/specification/specificationReadinessModel';

export type SpecificationReadinessAlertProps = {
  state: SpecificationReadinessViewState;
  blocker: SpecificationReadinessBlocker | null;
  onRecovery: () => void;
  onRetry: () => void;
};

export function SpecificationReadinessAlert({
  state,
  blocker,
  onRecovery,
  onRetry,
}: SpecificationReadinessAlertProps): ReactNode {
  if (state === 'ready' || state === 'unknown') return null;
  if (state === 'loading' || state === 'calculating') {
    return (
      <TltAlert
        tone="info"
        title={state === 'calculating' ? 'Формируем спецификацию…' : 'Проверяем готовность ЭР…'}
      />
    );
  }
  if (state === 'unavailable') {
    return (
      <TltAlert
        tone="warning"
        title="Не удалось проверить готовность ЭР"
        action={<TltButton size="compact" onClick={onRetry}>Проверить снова</TltButton>}
      >
        Формирование не заблокировано: backend повторно проверит данные перед расчётом.
      </TltAlert>
    );
  }
  if (state === 'failed') {
    return (
      <TltAlert
        tone="danger"
        title="Последняя попытка формирования завершилась ошибкой"
        action={<TltButton size="compact" onClick={onRetry}>Проверить снова</TltButton>}
      />
    );
  }
  if (!blocker) return null;
  return (
    <TltAlert
      tone="danger"
      title="ЭР не готова к формированию спецификации"
      action={(
        <TltButton size="compact" variant="primary" onClick={onRecovery}>
          {readinessActionLabel(blocker)}
        </TltButton>
      )}
    >
      {readinessBlockerMessage(blocker)}
    </TltAlert>
  );
}
