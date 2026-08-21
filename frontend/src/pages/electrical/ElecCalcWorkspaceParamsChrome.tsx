/**
 * @module electrical/workspace-params-chrome
 * @owner electrical
 */
import type { ReactNode } from 'react';
import { Checkbox } from 'antd';
import { TltAlert, TltButton } from '@/components/ui-kit';

import ElecCalcParamsPanel from '@/pages/electrical/ElecCalcParamsPanel';
import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type {
  ElecCalcTypeControlSetters,
  ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';
import type { ElectricalErrorSummaryItem } from '@/pages/electrical/elecCalcErrorSummaryModel';
import type { ElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

export type ElecCalcWorkspaceParamsChromeProps = {
  canMutate: boolean;
  paramsPanelVisible: boolean;
  toggleParamsPanel: (visible: boolean) => void;
  visibleCableTypeControl: CableTypeKey | null;
  cableTypeOptions: Array<{ label: string; value: CableTypeKey }>;
  onCableTypeChange: (type: CableTypeKey) => void;
  recalc: ElecCalcTypeControlValues;
  setRecalc: ElecCalcTypeControlSetters;
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
  canMutate,
  paramsPanelVisible,
  toggleParamsPanel,
  visibleCableTypeControl,
  cableTypeOptions,
  onCableTypeChange,
  recalc,
  setRecalc,
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
      <div
        className="elec-workspace-chrome electrical-params-chrome-end"
        data-testid="elec-workspace-chrome"
      >
        <Checkbox
          className="actionbar-form-toggle"
          checked={paramsPanelVisible}
          onChange={(event) => toggleParamsPanel(event.target.checked)}
        >
          Расширенные параметры
        </Checkbox>
      </div>

      {paramsPanelVisible && (
        <ElecCalcParamsPanel
          disabled={!canMutate}
          cableType={visibleCableTypeControl}
          cableTypeOptions={cableTypeOptions}
          onCableTypeChange={onCableTypeChange}
          recalc={recalc}
          setRecalc={setRecalc}
        />
      )}
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
