/**
 * @module electrical/workspace-params-chrome
 * @owner electrical
 */
import type { ReactNode } from 'react';
import { TltAlert, TltButton } from '@/components/ui-kit';

import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import type { ElectricalErrorSummaryItem } from '@/pages/electrical/elecCalcErrorSummaryModel';
import type { ElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

export type ElecCalcWorkspaceParamsChromeProps = {
  failedCount: number;
  activeRowId: string | null;
  activeElectricalErrorItem: ElectricalErrorSummaryItem | null;
  activeElectricalErrorGuidance: ElectricalErrorGuidance | null;
  isElectricalCapabilitiesError: boolean;
  isElectricalPageError: boolean;
  electricalPageError: unknown;
  electricalCapabilitiesError: unknown;
  retryElectricalCapabilities: () => void;
  retryElectricalPage: () => void;
};

export function ElecCalcWorkspaceParamsChrome({
  failedCount,
  activeRowId,
  activeElectricalErrorItem,
  activeElectricalErrorGuidance,
  isElectricalCapabilitiesError,
  isElectricalPageError,
  electricalPageError,
  electricalCapabilitiesError,
  retryElectricalCapabilities,
  retryElectricalPage,
}: ElecCalcWorkspaceParamsChromeProps): ReactNode {
  return (
    <>
      <ElecCalcErrorSummary
        failedCount={failedCount}
        activeRowId={activeRowId}
        item={activeElectricalErrorItem}
        guidance={activeElectricalErrorGuidance}
      />

      {(isElectricalCapabilitiesError || isElectricalPageError) && (
        <TltAlert
          tone="danger"
          title="Не удалось загрузить данные выбранного ЭР"
          action={(
            <TltButton
              size="compact"
              onClick={() => {
                if (isElectricalCapabilitiesError) void retryElectricalCapabilities();
                if (isElectricalPageError) void retryElectricalPage();
              }}
            >
              Повторить
            </TltButton>
          )}
        >
          {electricalPageError instanceof Error
            ? electricalPageError.message
            : electricalCapabilitiesError instanceof Error
              ? electricalCapabilitiesError.message
              : 'Повторите запрос.'}
        </TltAlert>
      )}
    </>
  );
}
