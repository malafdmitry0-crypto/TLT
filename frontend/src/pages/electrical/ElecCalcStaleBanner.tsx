/**
 * Banner when assigned objects need recalculation (E3 / FE-21).
 */
import type { ReactNode } from 'react';
import { TltAlert, TltButton } from '@/components/ui-kit';
import './elec-workspace-stale.css';

export type ElecCalcStaleBannerProps = {
  staleCount: number;
  canMutate: boolean;
  isJobActive?: boolean;
  batchPending?: boolean;
  recalculationBlockedReason?: string | null;
  onRecalculateStale: () => void;
  onSelectStale?: () => void;
};

export function ElecCalcStaleBanner({
  staleCount,
  canMutate,
  isJobActive = false,
  batchPending = false,
  recalculationBlockedReason = null,
  onRecalculateStale,
  onSelectStale,
}: ElecCalcStaleBannerProps): ReactNode {
  if (staleCount <= 0) return null;

  return (
    <TltAlert
      tone="warning"
      className="electrical-alert-gap"
      data-testid="elec-stale-banner"
      title={
        staleCount === 1
          ? '1 объект требует перерасчёта'
          : `${staleCount} объектов требуют перерасчёта`
      }
      action={canMutate ? (
        <>
          {onSelectStale && (
            <TltButton
              size="compact"
              onClick={onSelectStale}
              data-testid="elec-stale-select"
            >
              Выделить
            </TltButton>
          )}
          <TltButton
            size="compact"
            variant="primary"
            loading={batchPending || isJobActive}
            disabled={isJobActive || Boolean(recalculationBlockedReason)}
            title={recalculationBlockedReason ?? undefined}
            onClick={onRecalculateStale}
            data-testid="elec-stale-recalc"
          >
            Пересчитать устаревшие
          </TltButton>
        </>
      ) : undefined}
    >
      Исходные данные или I доп изменились после последнего электрорасчёта.
      Устаревшие значения подсвечены в таблице и не должны использоваться как актуальные
      до пересчёта.
    </TltAlert>
  );
}
