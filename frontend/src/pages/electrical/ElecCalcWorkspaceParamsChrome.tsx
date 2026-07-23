/**
 * @module electrical/workspace-params-chrome
 * @owner electrical
 */
import type { ReactNode } from 'react';
import { Alert, Button, Checkbox } from 'antd';

import ElecCalcParamsPanel from '@/pages/electrical/ElecCalcParamsPanel';
import ElecCalcErrorSummary from '@/pages/electrical/ElecCalcErrorSummary';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';

export type ElecCalcWorkspaceParamsChromeProps = {
  canMutate: boolean;
  paramsPanelVisible: boolean;
  toggleParamsPanel: (visible: boolean) => void;
  visibleCableTypeControl: CableTypeKey | null;
  cableTypeOptions: Array<{ label: string; value: CableTypeKey }>;
  onCableTypeChange: (type: CableTypeKey) => void;
  recalc: unknown;
  setRecalc: unknown;
  failedCount: number;
  activeRowId: string | null;
  activeElectricalErrorItem: unknown;
  activeElectricalErrorGuidance: unknown;
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
        className="elec-workspace-chrome"
        data-testid="elec-workspace-chrome"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          minHeight: 28,
        }}
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
          recalc={recalc as never}
          setRecalc={setRecalc as never}
        />
      )}
      <ElecCalcErrorSummary
        failedCount={failedCount}
        activeRowId={activeRowId}
        item={activeElectricalErrorItem as never}
        guidance={activeElectricalErrorGuidance as never}
      />

      {(isElectricalCapabilitiesError || isElectricalPageError) && (
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить данные выбранного ЭР"
          description={(
            electricalPageError instanceof Error
              ? electricalPageError.message
              : electricalCapabilitiesError instanceof Error
                ? electricalCapabilitiesError.message
                : 'Повторите запрос.'
          )}
          action={(
            <Button
              size="small"
              onClick={() => {
                if (isElectricalCapabilitiesError) void retryElectricalCapabilities();
                if (isElectricalPageError) void retryElectricalPage();
              }}
            >
              Повторить
            </Button>
          )}
        />
      )}
    </>
  );
}
