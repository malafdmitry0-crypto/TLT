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
  blockers?: SpecificationReadinessBlocker[];
  onRecovery: () => void;
  onRetry: () => void;
};

export function SpecificationReadinessAlert({
  state,
  blocker,
  blockers = [],
  onRecovery,
  onRetry,
}: SpecificationReadinessAlertProps): ReactNode {
  if (state === 'ready' || state === 'unknown') return null;
  if (state === 'loading' || state === 'calculating') {
    return (
      <TltAlert
        tone="info"
        title={state === 'calculating'
          ? 'Формируем спецификацию…'
          : 'Проверяем готовность к формированию спецификации…'}
      />
    );
  }
  if (state === 'unavailable') {
    return (
      <TltAlert
        tone="warning"
        title="Не удалось проверить готовность к формированию спецификации"
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
  const title = blocker.scope === 'catalog'
    ? 'Каталог не готов к формированию спецификации'
    : blocker.scope === 'electrical_variant'
      ? 'ЭР не готова к формированию спецификации'
      : 'Формирование спецификации заблокировано';
  return (
    <TltAlert
      tone="danger"
      title={title}
      action={(
        <TltButton size="compact" variant="primary" onClick={onRecovery}>
          {readinessActionLabel(blocker)}
        </TltButton>
      )}
    >
      {blockers.length > 1 ? (
        <ul>
          {blockers.map((item) => (
            <li key={`${item.scope}:${item.code}:${item.reason}:${item.scope === 'electrical_variant' ? item.electrical_variant_id : ''}`}>
              {readinessBlockerMessage(item)}
            </li>
          ))}
        </ul>
      ) : readinessBlockerMessage(blocker)}
    </TltAlert>
  );
}
