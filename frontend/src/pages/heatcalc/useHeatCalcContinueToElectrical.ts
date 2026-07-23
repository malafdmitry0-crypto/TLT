/**
 * @module heatcalc/continue-to-electrical
 * @owner heat
 * @depends api/electricalVariants, heatCalcContinueToElectricalModel
 * @does-not electrical page modules
 *
 * PDF-HEAT-10: first transition may create ЭР1; navigation still proceeds on init failure.
 */
import { useCallback, useMemo } from 'react';
import { message as antdMessage } from 'antd';
import type { NavigateFunction } from 'react-router-dom';

import { initializeElectricalVariants } from '@/api/electricalVariants';
import { ROUTES } from '@/routes/routes';
import {
  getHeatCalcElectricalContinueBlockMessage,
  getHeatCalcElectricalContinueState,
  type HeatCalcElectricalContinueObject,
} from '@/pages/heatcalc/heatCalcContinueToElectricalModel';

export type UseHeatCalcContinueToElectricalArgs = {
  projectId: string | null | undefined;
  objects: readonly HeatCalcElectricalContinueObject[];
  navigate: NavigateFunction;
};

export function useHeatCalcContinueToElectrical({
  projectId,
  objects,
  navigate,
}: UseHeatCalcContinueToElectricalArgs) {
  const continueState = useMemo(
    () => getHeatCalcElectricalContinueState(objects),
    [objects],
  );

  const handleContinueToElectrical = useCallback(() => {
    const block = getHeatCalcElectricalContinueBlockMessage(continueState);
    if (block) {
      if (block.level === 'warning') {
        antdMessage.warning(block.text);
      } else {
        antdMessage.error(block.text);
      }
      return;
    }
    // PDF-HEAT-10: first transition creates ЭР1 with objects unassigned.
    void (async () => {
      if (projectId) {
        try {
          await initializeElectricalVariants(projectId);
        } catch {
          // Already initialized or not ready — still open electrical page.
        }
      }
      navigate(ROUTES.elecCalc);
    })();
  }, [continueState, navigate, projectId]);

  return {
    continueState,
    handleContinueToElectrical,
    continueToElectricalDisabled: continueState.disabled,
    continueToElectricalTooltip: continueState.tooltip,
  };
}
